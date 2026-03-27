import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get all active scheduled messages
    const { data: scheduledMessages, error: smError } = await supabase
      .from("label_scheduled_messages")
      .select("*")
      .eq("is_active", true);

    if (smError || !scheduledMessages || scheduledMessages.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: "No active scheduled messages" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSent = 0;
    let totalErrors = 0;

    for (const sm of scheduledMessages) {
      // 2. Find contact_labels for this label that are old enough
      const cutoffTime = new Date(Date.now() - sm.delay_minutes * 60 * 1000).toISOString();

      const { data: contactLabels } = await supabase
        .from("contact_labels")
        .select("id, contact_id, created_at")
        .eq("label_id", sm.label_id)
        .lte("created_at", cutoffTime);

      if (!contactLabels || contactLabels.length === 0) continue;

      // 3. Check which ones already have a send record
      const clIds = contactLabels.map(cl => cl.id);
      const { data: existingSends } = await supabase
        .from("label_scheduled_sends")
        .select("contact_label_id")
        .eq("scheduled_message_id", sm.id)
        .in("contact_label_id", clIds);

      const sentClIds = new Set((existingSends || []).map(s => s.contact_label_id));
      const pendingCLs = contactLabels.filter(cl => !sentClIds.has(cl.id));

      if (pendingCLs.length === 0) continue;

      // 4. For each pending, verify label still assigned and send
      for (const cl of pendingCLs) {
        try {
          // Verify contact still has the label
          const { data: stillLabeled } = await supabase
            .from("contact_labels")
            .select("id")
            .eq("id", cl.id)
            .maybeSingle();

          if (!stillLabeled) {
            // Label was removed, record as cancelled
            await supabase.from("label_scheduled_sends").insert({
              scheduled_message_id: sm.id,
              contact_id: cl.contact_id,
              contact_label_id: cl.id,
              status: "cancelled",
              scheduled_for: new Date(new Date(cl.created_at).getTime() + sm.delay_minutes * 60 * 1000).toISOString(),
            });
            continue;
          }

          // Get contact details
          const { data: contact } = await supabase
            .from("contacts")
            .select("jid, instance_id")
            .eq("id", cl.contact_id)
            .single();

          if (!contact) continue;

          // Get instance
          const { data: instance } = await supabase
            .from("instances")
            .select("api_url, token")
            .eq("id", contact.instance_id)
            .single();

          if (!instance) continue;

          const baseUrl = instance.api_url.replace(/\/$/, "");

          // Build recipient
          const recipient = contact.jid.endsWith("@lid")
            ? { Phone: contact.jid }
            : { Phone: contact.jid.split("@")[0] };

          // Pick random message variation
          const variations = [sm.message_1, sm.message_2, sm.message_3, sm.message_4].filter(
            (m: string | null) => m && m.trim()
          );
          const msgText = variations.length > 0
            ? variations[Math.floor(Math.random() * variations.length)]
            : "";

          const headers = {
            Authorization: `Bearer ${instance.token}`,
            Token: instance.token,
            "Content-Type": "application/json",
          };

          // Send text
          if (msgText) {
            await fetch(`${baseUrl}/chat/send/text`, {
              method: "POST",
              headers,
              body: JSON.stringify({ ...recipient, Body: msgText }),
            });
          }

          // Send media
          if (sm.media_type && sm.media_type !== "none" && sm.media_url) {
            // Download media and convert to base64
            const mediaResponse = await fetch(sm.media_url);
            const arrayBuffer = await mediaResponse.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            let binary = "";
            for (let i = 0; i < uint8Array.length; i++) {
              binary += String.fromCharCode(uint8Array[i]);
            }
            const base64 = btoa(binary);
            const contentType = mediaResponse.headers.get("content-type") || (sm.media_type === "image" ? "image/jpeg" : "video/mp4");
            const dataUrl = `data:${contentType};base64,${base64}`;

            const endpoint = sm.media_type === "image" ? "/chat/send/image" : "/chat/send/video";
            const mediaKey = sm.media_type === "image" ? "Image" : "Video";

            await fetch(`${baseUrl}${endpoint}`, {
              method: "POST",
              headers,
              body: JSON.stringify({ ...recipient, [mediaKey]: dataUrl, Caption: sm.caption || "" }),
            });
          }

          // Record as sent
          await supabase.from("label_scheduled_sends").insert({
            scheduled_message_id: sm.id,
            contact_id: cl.contact_id,
            contact_label_id: cl.id,
            status: "sent",
            scheduled_for: new Date(new Date(cl.created_at).getTime() + sm.delay_minutes * 60 * 1000).toISOString(),
            sent_at: new Date().toISOString(),
          });

          totalSent++;
        } catch (err) {
          console.error(`Error sending to contact ${cl.contact_id}:`, err);
          totalErrors++;

          // Record as error
          try {
            await supabase.from("label_scheduled_sends").insert({
              scheduled_message_id: sm.id,
              contact_id: cl.contact_id,
              contact_label_id: cl.id,
              status: "error",
              scheduled_for: new Date(new Date(cl.created_at).getTime() + sm.delay_minutes * 60 * 1000).toISOString(),
            });
          } catch (_) { /* ignore */ }
        }
      }
    }

    return new Response(
      JSON.stringify({ processed: totalSent, errors: totalErrors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Process scheduled messages error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
