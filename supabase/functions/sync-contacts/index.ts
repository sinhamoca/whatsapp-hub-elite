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
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { instanceId } = body;

    if (!instanceId) {
      return new Response(JSON.stringify({ error: "instanceId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get instance
    const { data: instance } = await supabaseAuth
      .from("instances")
      .select("id, api_url, token, user_id")
      .eq("id", instanceId)
      .single();

    if (!instance) {
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiUrl = instance.api_url.replace(/\/+$/, "");
    const headers = {
      Authorization: `Bearer ${instance.token}`,
      Token: instance.token,
      "Content-Type": "application/json",
    };

    // 1. Fetch all contacts from WuzAPI
    console.log("Fetching contacts from WuzAPI:", `${apiUrl}/user/contacts`);
    const contactsRes = await fetch(`${apiUrl}/user/contacts`, {
      method: "GET",
      headers,
    });

    if (!contactsRes.ok) {
      const errText = await contactsRes.text();
      console.error("Failed to fetch contacts:", contactsRes.status, errText);
      return new Response(JSON.stringify({ error: "Failed to fetch contacts from WuzAPI", status: contactsRes.status }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contactsData = await contactsRes.json();
    console.log("Contacts response type:", typeof contactsData, "keys:", Object.keys(contactsData || {}).slice(0, 5));

    // WuzAPI may return contacts in different formats
    let contacts: Record<string, any> = {};
    if (contactsData && typeof contactsData === "object") {
      // Could be { data: {...} } or direct map
      if (contactsData.data && typeof contactsData.data === "object" && !Array.isArray(contactsData.data)) {
        contacts = contactsData.data;
      } else if (contactsData.Data && typeof contactsData.Data === "object") {
        contacts = contactsData.Data;
      } else if (Array.isArray(contactsData)) {
        // Array format: convert to map
        for (const c of contactsData) {
          const jid = c.Jid || c.jid || c.Id || c.id;
          if (jid) contacts[jid] = c;
        }
      } else if (Array.isArray(contactsData.data)) {
        for (const c of contactsData.data) {
          const jid = c.Jid || c.jid || c.Id || c.id;
          if (jid) contacts[jid] = c;
        }
      } else {
        // Assume it's already a JID -> info map
        contacts = contactsData;
      }
    }

    console.log("Total contacts found:", Object.keys(contacts).length);
    // Log first 3 contacts for debugging
    const sampleKeys = Object.keys(contacts).slice(0, 3);
    for (const k of sampleKeys) {
      console.log("Sample contact:", k, JSON.stringify(contacts[k]).slice(0, 200));
    }

    let synced = 0;

    // Process each contact
    const entries = Object.entries(contacts);
    for (const [jid, info] of entries) {
      if (!jid || !jid.includes("@") || jid.endsWith("@g.us") || jid === "status@broadcast") continue;

      const contactInfo = info as any;
      const fullName = contactInfo?.FullName || contactInfo?.fullName || contactInfo?.Name || contactInfo?.name || "";
      const firstName = contactInfo?.FirstName || contactInfo?.firstName || "";
      const pushName = contactInfo?.PushName || contactInfo?.pushName || "";
      const businessName = contactInfo?.BusinessName || contactInfo?.businessName || "";
      const displayName = fullName || firstName || businessName || pushName || "";

      // Extract phone from JID
      const phone = jid.includes("@s.whatsapp.net") ? jid.split("@")[0] : 
                     jid.includes("@lid") ? "" : jid.split("@")[0];

      // Upsert contact
      const { error: upsertErr } = await supabase.from("contacts").upsert(
        {
          user_id: user.id,
          instance_id: instanceId,
          jid,
          name: displayName || phone || jid.split("@")[0],
          push_name: pushName || displayName || "",
          phone: phone || "",
        },
        { onConflict: "instance_id,jid" }
      );

      if (upsertErr) {
        console.warn("Upsert error for", jid, upsertErr.message);
        continue;
      }

      // Update conversation name if exists
      if (displayName || phone) {
        await supabase
          .from("conversations")
          .update({ contact_name: displayName || phone || jid.split("@")[0] })
          .eq("instance_id", instanceId)
          .eq("jid", jid);
      }

      synced++;
    }

    console.log(`Synced ${synced} contacts`);

    // 2. Fetch avatars for top 10 conversations only (to avoid timeout)
    let avatarsSynced = 0;
    const { data: conversations } = await supabase
      .from("conversations")
      .select("jid")
      .eq("instance_id", instanceId)
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(10);

    if (conversations && conversations.length > 0) {
      for (const conv of conversations) {
        try {
          const phoneForAvatar = conv.jid.split("@")[0];
          
          // Use POST for avatar endpoint (GET with body is not standard)
          const avatarRes = await fetch(`${apiUrl}/user/avatar`, {
            method: "POST",
            headers,
            body: JSON.stringify({ Phone: phoneForAvatar, Preview: true }),
          });

          if (!avatarRes.ok) continue;

          const avatarData = await avatarRes.json();
          const avatarUrl =
            avatarData?.data?.URL || avatarData?.data?.Url || avatarData?.data?.url ||
            avatarData?.URL || avatarData?.Url || avatarData?.url || "";

          if (!avatarUrl) continue;

          // Download and upload to storage
          const imgRes = await fetch(avatarUrl);
          if (!imgRes.ok) continue;

          const imgBuffer = await imgRes.arrayBuffer();
          const filePath = `${instanceId}/${phoneForAvatar}.jpg`;

          await supabase.storage.from("avatars").upload(filePath, imgBuffer, {
            contentType: "image/jpeg",
            upsert: true,
          });

          const { data: pubUrl } = supabase.storage.from("avatars").getPublicUrl(filePath);
          const storedUrl = pubUrl?.publicUrl || "";

          if (storedUrl) {
            await supabase.from("contacts").update({ avatar_url: storedUrl }).eq("instance_id", instanceId).eq("jid", conv.jid);
            await supabase.from("conversations").update({ avatar_url: storedUrl }).eq("instance_id", instanceId).eq("jid", conv.jid);
            avatarsSynced++;
          }
        } catch (err) {
          console.warn("Avatar error for", conv.jid, err);
        }
      }
    }

    console.log(`Synced ${avatarsSynced} avatars. Done.`);

    return new Response(
      JSON.stringify({ ok: true, contactsSynced: synced, avatarsSynced }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
