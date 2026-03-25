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

    // WuzAPI may send webhook as form-urlencoded, JSON, or plain text
    let eventData: any = null;
    const requestUrl = new URL(req.url);
    const queryToken = requestUrl.searchParams.get("token") || "";
    let bodyToken = "";

    const headerToken = req.headers.get("token") || req.headers.get("x-token") || "";
    const authHeader = req.headers.get("authorization") || "";
    const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      const jsonDataStr = (formData.get("jsonData") as string) || (formData.get("data") as string) || "";
      bodyToken = (formData.get("token") as string) || "";

      if (jsonDataStr) {
        try {
          eventData = JSON.parse(jsonDataStr);
        } catch {
          eventData = { raw: jsonDataStr };
        }
      } else {
        eventData = Object.fromEntries(formData.entries());
      }
    } else if (contentType.includes("application/json")) {
      eventData = await req.json();
      bodyToken = eventData?.token || eventData?.Token || "";
    } else {
      const rawText = await req.text();
      try {
        eventData = JSON.parse(rawText);
        bodyToken = eventData?.token || eventData?.Token || "";
      } catch {
        const params = new URLSearchParams(rawText);
        const jsonDataStr = params.get("jsonData") || params.get("data");
        bodyToken = params.get("token") || "";

        if (jsonDataStr) {
          try {
            eventData = JSON.parse(jsonDataStr);
          } catch {
            eventData = { raw: jsonDataStr };
          }
        } else {
          eventData = Object.fromEntries(params.entries());
        }
      }
    }

    if (!eventData) {
      return new Response(JSON.stringify({ error: "No event data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenCandidates = [
      queryToken,
      bodyToken,
      eventData?.token,
      eventData?.Token,
      eventData?.data?.token,
      eventData?.data?.Token,
      eventData?.auth?.token,
      headerToken,
      bearerToken,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    const token = tokenCandidates[0] || "";

    let instance: { id: string; user_id: string } | null = null;

    if (token) {
      const { data } = await supabase
        .from("instances")
        .select("id, user_id")
        .eq("token", token)
        .maybeSingle();

      if (data) {
        instance = data;
      }
    }

    if (!instance) {
      const instanceIdCandidate = [
        eventData?.instanceId,
        eventData?.instance_id,
        eventData?.data?.instanceId,
        eventData?.data?.instance_id,
      ]
        .map((value) => String(value || "").trim())
        .find(Boolean);

      if (instanceIdCandidate) {
        const { data } = await supabase
          .from("instances")
          .select("id, user_id")
          .eq("id", instanceIdCandidate)
          .maybeSingle();

        if (data) {
          instance = data;
        }
      }
    }

    if (!instance) {
      const { data: fallbackInstances } = await supabase
        .from("instances")
        .select("id, user_id")
        .limit(2);

      if ((fallbackInstances || []).length === 1) {
        instance = fallbackInstances![0];
        console.warn("Webhook sem token mapeado para a única instância disponível");
      }
    }

    if (!instance) {
      console.error("Instance not found for token:", token?.substring(0, 5) + "...");
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { id: instanceId, user_id: userId } = instance;

    // Parse event with compatibility for multiple payload shapes
    const event = eventData.event || eventData.data || eventData;
    const info = event?.Info || event?.info || eventData?.info || {};
    const message = event?.Message || event?.message || eventData?.message || {};
    const key = event?.Key || event?.key || {};

    // Determine message details
    const msgId = info?.ID || info?.Id || info?.id || key?.id || eventData?.id || "";
    const fromMe = info?.IsFromMe ?? info?.FromMe ?? info?.fromMe ?? key?.fromMe ?? false;

    const senderUser = info?.Sender?.User || info?.sender?.user || "";
    const remoteJid =
      info?.RemoteJid ||
      info?.remoteJid ||
      info?.Chat ||
      info?.chat ||
      key?.RemoteJid ||
      key?.remoteJid ||
      (senderUser ? `${senderUser}@s.whatsapp.net` : "");

    const pushName = info?.PushName || info?.pushName || eventData?.pushName || "";

    const rawTimestamp = info?.Timestamp ?? info?.timestamp ?? eventData?.timestamp;
    const parsedTimestamp = Number(rawTimestamp);
    const timestamp = Number.isFinite(parsedTimestamp)
      ? new Date(parsedTimestamp > 1e12 ? parsedTimestamp : parsedTimestamp * 1000).toISOString()
      : new Date().toISOString();

    // Extract message body based on type
    let body = "";
    let msgType = "text";
    let mediaUrl = "";
    let mediaMime = "";

    if (message?.Conversation || message?.conversation || message?.text) {
      body = message.Conversation || message.conversation || message.text || "";
      msgType = "text";
    } else if (message?.ExtendedTextMessage || message?.extendedTextMessage) {
      const extendedText = message.ExtendedTextMessage || message.extendedTextMessage;
      body = extendedText?.Text || extendedText?.text || "";
      msgType = "text";
    } else if (message?.ImageMessage || message?.imageMessage) {
      const imageMessage = message.ImageMessage || message.imageMessage;
      body = imageMessage?.Caption || imageMessage?.caption || "📷 Imagem";
      msgType = "image";
      mediaMime = imageMessage?.Mimetype || imageMessage?.mimetype || "image/jpeg";
    } else if (message?.VideoMessage || message?.videoMessage) {
      const videoMessage = message.VideoMessage || message.videoMessage;
      body = videoMessage?.Caption || videoMessage?.caption || "🎥 Vídeo";
      msgType = "video";
      mediaMime = videoMessage?.Mimetype || videoMessage?.mimetype || "video/mp4";
    } else if (message?.AudioMessage || message?.audioMessage) {
      const audioMessage = message.AudioMessage || message.audioMessage;
      body = "🎵 Áudio";
      msgType = "audio";
      mediaMime = audioMessage?.Mimetype || audioMessage?.mimetype || "audio/ogg";
    } else if (message?.DocumentMessage || message?.documentMessage) {
      const documentMessage = message.DocumentMessage || message.documentMessage;
      body = documentMessage?.FileName || documentMessage?.fileName || "📄 Documento";
      msgType = "document";
      mediaMime = documentMessage?.Mimetype || documentMessage?.mimetype || "";
    } else if (message?.StickerMessage || message?.stickerMessage) {
      body = "🏷️ Sticker";
      msgType = "sticker";
    }

    const webhookBase64 = eventData?.base64 || eventData?.data?.base64;
    if (webhookBase64) {
      mediaUrl = `data:${eventData?.mimeType || eventData?.data?.mimeType || mediaMime};base64,${webhookBase64}`;
    }

    if (eventData?.s3?.url || eventData?.data?.s3?.url) {
      mediaUrl = eventData?.s3?.url || eventData?.data?.s3?.url;
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
