import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    // WuzAPI sends webhook as form-urlencoded (default) or JSON
    let eventData: any;
    let token = "";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      const jsonDataStr = formData.get("jsonData") as string;
      token = (formData.get("token") as string) || "";
      eventData = jsonDataStr ? JSON.parse(jsonDataStr) : null;
    } else if (contentType.includes("application/json")) {
      eventData = await req.json();
      token = eventData?.token || "";
    } else {
      const rawText = await req.text();
      try {
        eventData = JSON.parse(rawText);
        token = eventData?.token || "";
      } catch {
        // Try form-urlencoded parsing
        const params = new URLSearchParams(rawText);
        const jsonDataStr = params.get("jsonData");
        token = params.get("token") || "";
        eventData = jsonDataStr ? JSON.parse(jsonDataStr) : null;
      }
    }

    if (!eventData) {
      return new Response(JSON.stringify({ error: "No event data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find instance by token
    const { data: instance, error: instError } = await supabase
      .from("instances")
      .select("id, user_id")
      .eq("token", token)
      .single();

    if (instError || !instance) {
      console.error("Instance not found for token:", token?.substring(0, 5) + "...");
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { id: instanceId, user_id: userId } = instance;

    // Parse the event - WuzAPI sends events with different structures
    const event = eventData.event || eventData;
    const info = event?.Info || event?.info || {};
    const message = event?.Message || event?.message || {};

    // Determine message details
    const msgId = info?.ID || info?.Id || info?.id || "";
    const fromMe = info?.IsFromMe ?? info?.FromMe ?? info?.fromMe ?? false;
    const remoteJid = info?.RemoteJid || info?.Chat || (info?.Sender?.User ? `${info.Sender.User}@s.whatsapp.net` : "");
    const pushName = info?.PushName || info?.pushName || "";
    const timestamp = info?.Timestamp
      ? new Date(info.Timestamp * 1000).toISOString()
      : new Date().toISOString();

    // Extract message body based on type
    let body = "";
    let msgType = "text";
    let mediaUrl = "";
    let mediaMime = "";

    if (message?.Conversation || message?.conversation) {
      body = message.Conversation || message.conversation;
      msgType = "text";
    } else if (message?.ExtendedTextMessage) {
      body = message.ExtendedTextMessage.Text || "";
      msgType = "text";
    } else if (message?.ImageMessage) {
      body = message.ImageMessage.Caption || "📷 Imagem";
      msgType = "image";
      mediaMime = message.ImageMessage.Mimetype || "image/jpeg";
    } else if (message?.VideoMessage) {
      body = message.VideoMessage.Caption || "🎥 Vídeo";
      msgType = "video";
      mediaMime = message.VideoMessage.Mimetype || "video/mp4";
    } else if (message?.AudioMessage) {
      body = "🎵 Áudio";
      msgType = "audio";
      mediaMime = message.AudioMessage.Mimetype || "audio/ogg";
    } else if (message?.DocumentMessage) {
      body = message.DocumentMessage.FileName || "📄 Documento";
      msgType = "document";
      mediaMime = message.DocumentMessage.Mimetype || "";
    } else if (message?.StickerMessage) {
      body = "🏷️ Sticker";
      msgType = "sticker";
    }

    // Handle base64 media from webhook
    if (eventData.base64) {
      mediaUrl = `data:${eventData.mimeType || mediaMime};base64,${eventData.base64}`;
    }
    if (eventData.s3?.url) {
      mediaUrl = eventData.s3.url;
    }

    if (!remoteJid || !body) {
      // Non-message event (ReadReceipt, Presence, etc.) - just acknowledge
      return new Response(JSON.stringify({ ok: true, type: "non-message" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert conversation
    const contactName = pushName || remoteJid.split("@")[0];
    const { data: conversation } = await supabase
      .from("conversations")
      .upsert(
        {
          user_id: userId,
          instance_id: instanceId,
          jid: remoteJid,
          contact_name: contactName,
          last_message: body.substring(0, 200),
          last_message_at: timestamp,
          unread_count: fromMe ? 0 : 1,
        },
        { onConflict: "instance_id,jid" }
      )
      .select("id")
      .single();

    if (!conversation) {
      console.error("Failed to upsert conversation");
      return new Response(JSON.stringify({ error: "Failed to create conversation" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If not from me, increment unread count
    if (!fromMe) {
      await supabase.rpc("increment_unread", {
        conv_id: conversation.id,
      }).then(() => {}).catch(() => {
        // Fallback: direct update if RPC doesn't exist
        supabase
          .from("conversations")
          .update({ unread_count: 1 })
          .eq("id", conversation.id);
      });
    }

    // Insert message
    await supabase.from("messages").insert({
      user_id: userId,
      instance_id: instanceId,
      conversation_id: conversation.id,
      message_id: msgId,
      jid: remoteJid,
      from_me: fromMe,
      body,
      msg_type: msgType,
      media_url: mediaUrl,
      media_mime: mediaMime,
      timestamp,
    });

    // Upsert contact
    await supabase.from("contacts").upsert(
      {
        user_id: userId,
        instance_id: instanceId,
        jid: remoteJid,
        push_name: pushName,
        name: contactName,
        phone: remoteJid.split("@")[0],
      },
      { onConflict: "instance_id,jid" }
    );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
