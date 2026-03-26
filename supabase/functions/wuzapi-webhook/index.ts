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
    console.log("Webhook received:", req.method, new Date().toISOString());

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

    let instance: { id: string; user_id: string; api_url: string; token: string } | null = null;

    if (token) {
      const { data } = await supabase
        .from("instances")
        .select("id, user_id, api_url, token")
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
          .select("id, user_id, api_url, token")
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
        .select("id, user_id, api_url, token")
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

    const { id: instanceId, user_id: userId, api_url: instanceApiUrl } = instance;

    const pickFirstString = (...values: unknown[]) => {
      for (const value of values) {
        const text = String(value || "").trim();
        if (text) return text;
      }
      return "";
    };

    const normalizeMediaUrl = (value: unknown) => {
      const raw = String(value || "").trim();
      if (!raw) return "";

      if (raw.startsWith("//")) {
        return `https:${raw}`;
      }

      if (raw.startsWith("/")) {
        try {
          return new URL(raw, instanceApiUrl).toString();
        } catch {
          return raw;
        }
      }

      return raw;
    };

    const isEncryptedWhatsappMediaUrl = (value: unknown) => {
      const raw = String(value || "").trim();
      if (!raw) return false;

      try {
        const parsed = new URL(raw);
        return parsed.hostname.includes("mmg.whatsapp.net") || parsed.pathname.endsWith(".enc");
      } catch {
        return raw.includes("mmg.whatsapp.net") || raw.includes(".enc");
      }
    };

    const cleanBase64 = (value: unknown) => {
      const raw = String(value || "").trim();
      if (!raw) return "";
      const withoutPrefix = raw.includes("base64,") ? raw.split("base64,")[1] : raw;
      return withoutPrefix.replace(/\s/g, "");
    };

    const extractBase64FromDownloadResponse = (data: any) => {
      const candidates = [
        data,
        data?.data,
        data?.Data,
        data?.base64,
        data?.Base64,
        data?.data?.base64,
        data?.data?.Base64,
        data?.data?.Data,
        data?.media,
        data?.data?.media,
      ];

      for (const candidate of candidates) {
        if (typeof candidate === "string") {
          const cleaned = cleanBase64(candidate);
          if (cleaned) return cleaned;
        }
      }

      return "";
    };

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

    // Extract real phone number (especially for @lid JIDs)
    const participantJid = pickFirstString(
      info?.Sender?.User,
      info?.sender?.user,
      info?.Participant,
      info?.participant,
      eventData?.participant,
      eventData?.data?.participant,
    ).replace(/\D/g, "");

    const jidLocalPart = remoteJid.split("@")[0] || "";
    const isLidJid = remoteJid.endsWith("@lid");
    const realPhone = isLidJid
      ? (participantJid && participantJid !== jidLocalPart ? participantJid : "")
      : jidLocalPart;

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
      mediaUrl = normalizeMediaUrl(
        pickFirstString(
          imageMessage?.URL,
          imageMessage?.Url,
          imageMessage?.url,
          imageMessage?.DownloadURL,
          imageMessage?.downloadURL,
          imageMessage?.downloadUrl,
          imageMessage?.DirectPath,
          imageMessage?.directPath,
          eventData?.url,
          eventData?.mediaUrl,
          eventData?.data?.url,
          eventData?.data?.mediaUrl,
          eventData?.data?.fileUrl,
          eventData?.fileUrl,
        ),
      );
    } else if (message?.VideoMessage || message?.videoMessage) {
      const videoMessage = message.VideoMessage || message.videoMessage;
      body = videoMessage?.Caption || videoMessage?.caption || "🎥 Vídeo";
      msgType = "video";
      mediaMime = videoMessage?.Mimetype || videoMessage?.mimetype || "video/mp4";
      mediaUrl = normalizeMediaUrl(
        pickFirstString(
          videoMessage?.URL,
          videoMessage?.Url,
          videoMessage?.url,
          videoMessage?.DownloadURL,
          videoMessage?.downloadURL,
          videoMessage?.downloadUrl,
          videoMessage?.DirectPath,
          videoMessage?.directPath,
          eventData?.url,
          eventData?.mediaUrl,
          eventData?.data?.url,
          eventData?.data?.mediaUrl,
          eventData?.data?.fileUrl,
          eventData?.fileUrl,
        ),
      );
    } else if (message?.AudioMessage || message?.audioMessage) {
      const audioMessage = message.AudioMessage || message.audioMessage;
      body = "🎵 Áudio";
      msgType = "audio";
      mediaMime = audioMessage?.Mimetype || audioMessage?.mimetype || "audio/ogg";
      mediaUrl = normalizeMediaUrl(
        pickFirstString(
          audioMessage?.URL,
          audioMessage?.Url,
          audioMessage?.url,
          audioMessage?.DownloadURL,
          audioMessage?.downloadURL,
          audioMessage?.downloadUrl,
          eventData?.url,
          eventData?.mediaUrl,
          eventData?.data?.url,
          eventData?.data?.mediaUrl,
        ),
      );
    } else if (message?.DocumentMessage || message?.documentMessage) {
      const documentMessage = message.DocumentMessage || message.documentMessage;
      body = documentMessage?.FileName || documentMessage?.fileName || "📄 Documento";
      msgType = "document";
      mediaMime = documentMessage?.Mimetype || documentMessage?.mimetype || "";
      mediaUrl = normalizeMediaUrl(
        pickFirstString(
          documentMessage?.URL,
          documentMessage?.Url,
          documentMessage?.url,
          documentMessage?.DownloadURL,
          documentMessage?.downloadURL,
          documentMessage?.downloadUrl,
          eventData?.url,
          eventData?.mediaUrl,
          eventData?.data?.url,
          eventData?.data?.mediaUrl,
        ),
      );
    } else if (message?.StickerMessage || message?.stickerMessage) {
      body = "🏷️ Sticker";
      msgType = "sticker";
      const stickerMessage = message.StickerMessage || message.stickerMessage;
      mediaUrl = normalizeMediaUrl(
        pickFirstString(
          stickerMessage?.URL,
          stickerMessage?.Url,
          stickerMessage?.url,
          stickerMessage?.DownloadURL,
          stickerMessage?.downloadURL,
          stickerMessage?.downloadUrl,
          eventData?.url,
          eventData?.mediaUrl,
          eventData?.data?.url,
          eventData?.data?.mediaUrl,
        ),
      );
    }

    // Upload base64 media to storage bucket (skip if too large to avoid timeouts)
    const rawBase64 = pickFirstString(
      eventData?.base64,
      eventData?.data?.base64,
      message?.ImageMessage?.Base64,
      message?.imageMessage?.base64,
      message?.VideoMessage?.Base64,
      message?.videoMessage?.base64,
      message?.AudioMessage?.Base64,
      message?.audioMessage?.base64,
      message?.DocumentMessage?.Base64,
      message?.documentMessage?.base64,
    );

    if (rawBase64) {
      const base64Data = rawBase64.includes("base64,")
        ? rawBase64.split("base64,")[1]
        : rawBase64;
      const sizeEstimate = base64Data.length * 0.75; // approximate bytes
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit

      if (sizeEstimate <= MAX_SIZE) {
        try {
          const dataUriMime = rawBase64.match(/^data:([^;]+);base64,/i)?.[1] || "";
          const mime =
            eventData?.mimeType ||
            eventData?.data?.mimeType ||
            mediaMime ||
            dataUriMime ||
            "application/octet-stream";
          const ext = mime.split("/")[1]?.split(";")[0] || "bin";
          const filePath = `${instanceId}/${Date.now()}_${msgId || crypto.randomUUID()}.${ext}`;

          const binaryStr = atob(base64Data);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }

          const { error: uploadError } = await supabase.storage
            .from("media")
            .upload(filePath, bytes.buffer, { contentType: mime, upsert: true });

          if (!uploadError) {
            const { data: publicUrlData } = supabase.storage.from("media").getPublicUrl(filePath);
            mediaUrl = publicUrlData?.publicUrl || "";
            console.log("Media uploaded:", filePath);
          } else {
            console.error("Media upload error:", uploadError.message);
          }
        } catch (e) {
          console.error("Base64 processing error:", e);
        }
      } else {
        console.warn("Media too large, skipping upload:", Math.round(sizeEstimate / 1024), "KB");
      }
    }

    if (eventData?.s3?.url || eventData?.data?.s3?.url) {
      mediaUrl = normalizeMediaUrl(eventData?.s3?.url || eventData?.data?.s3?.url);
    }

    if (!mediaUrl) {
      mediaUrl = normalizeMediaUrl(
        pickFirstString(
          eventData?.media,
          eventData?.data?.media,
          eventData?.file,
          eventData?.data?.file,
        ),
      );
    }

    if (mediaUrl && isEncryptedWhatsappMediaUrl(mediaUrl)) {
      console.log("Encrypted/temporary WhatsApp URL detected, switching to download flow");
      mediaUrl = "";
    }

    if (["image", "video", "audio", "document", "sticker"].includes(msgType) && !mediaUrl) {
      const mediaMessage =
        message?.ImageMessage || message?.imageMessage ||
        message?.VideoMessage || message?.videoMessage ||
        message?.AudioMessage || message?.audioMessage ||
        message?.DocumentMessage || message?.documentMessage ||
        message?.StickerMessage || message?.stickerMessage ||
        null;

      const mediaPublicUrl = pickFirstString(
        mediaMessage?.URL,
        mediaMessage?.Url,
        mediaMessage?.url,
      );
      const directPath = pickFirstString(
        mediaMessage?.DirectPath,
        mediaMessage?.directPath,
      );
      const mediaKey = pickFirstString(mediaMessage?.MediaKey, mediaMessage?.mediaKey);
      const fileSHA256 = pickFirstString(mediaMessage?.FileSHA256, mediaMessage?.fileSHA256, mediaMessage?.fileSha256);
      const fileEncSHA256 = pickFirstString(mediaMessage?.FileEncSHA256, mediaMessage?.fileEncSHA256, mediaMessage?.fileEncSha256);
      const fileLength = Number(mediaMessage?.FileLength || mediaMessage?.fileLength || 0);

      if (mediaPublicUrl || directPath) {
        const endpointMap: Record<string, string> = {
          image: "/chat/downloadimage",
          video: "/chat/downloadvideo",
          audio: "/chat/downloadaudio",
          document: "/chat/downloaddocument",
          sticker: "/chat/downloadimage",
        };
        const dlEndpoint = endpointMap[msgType] || "/chat/downloadimage";
        const apiUrl = instanceApiUrl.replace(/\/+$/, "");

        const payloadAttempts: Record<string, unknown>[] = [
          {
            Url: mediaPublicUrl || directPath,
            MediaKey: mediaKey,
            Mimetype: mediaMime || "application/octet-stream",
            FileSHA256: fileSHA256,
            FileEncSHA256: fileEncSHA256,
            FileLength: fileLength || undefined,
            DirectPath: directPath || undefined,
          },
          {
            Url: mediaPublicUrl || directPath,
            Mimetype: mediaMime || "application/octet-stream",
            FileLength: fileLength || undefined,
            DirectPath: directPath || undefined,
          },
          {
            Url: mediaPublicUrl || directPath,
            Mimetype: mediaMime || "application/octet-stream",
            DirectPath: directPath || undefined,
          },
        ];

        let downloadedBase64 = "";

        for (const [index, attemptPayloadRaw] of payloadAttempts.entries()) {
          if (downloadedBase64) break;

          const attemptPayload = Object.fromEntries(
            Object.entries(attemptPayloadRaw).filter(([, value]) => {
              const text = String(value ?? "").trim();
              return text.length > 0;
            }),
          );

          try {
            console.log("Downloading media from WuzAPI:", dlEndpoint, "attempt", index + 1);

            const dlResp = await fetch(`${apiUrl}${dlEndpoint}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Token: instance.token,
                Authorization: instance.token,
              },
              body: JSON.stringify(attemptPayload),
            });

            const respText = await dlResp.text();
            let parsed: any = null;
            try {
              parsed = respText ? JSON.parse(respText) : null;
            } catch {
              parsed = respText;
            }

            if (!dlResp.ok) {
              console.error("WuzAPI download failed:", dlResp.status, respText.slice(0, 300));
              continue;
            }

            const apiCode = Number(parsed?.code || 200);
            const apiSuccess = parsed?.success;
            if (apiCode >= 400 || apiSuccess === false || parsed?.error) {
              console.warn("WuzAPI download returned error payload", {
                apiCode,
                apiSuccess,
                error: parsed?.error || parsed?.message || "",
              });
              continue;
            }

            downloadedBase64 = extractBase64FromDownloadResponse(parsed || respText);

            if (!downloadedBase64) {
              console.warn("WuzAPI download without base64 payload", {
                responseType: typeof parsed,
                responseKeys: parsed && typeof parsed === "object" ? Object.keys(parsed) : [],
              });
            }
          } catch (dlErr) {
            console.error("Media download error:", dlErr);
          }
        }

        if (downloadedBase64) {
          const sizeEst = downloadedBase64.length * 0.75;
          if (sizeEst <= 12 * 1024 * 1024) {
            try {
              const mime = mediaMime || "application/octet-stream";
              const ext = mime.split("/")[1]?.split(";")[0] || "bin";
              const fp = `${instanceId}/${Date.now()}_${msgId || crypto.randomUUID()}.${ext}`;
              const bin = atob(downloadedBase64);
              const u8 = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
              const { error: upErr } = await supabase.storage.from("media").upload(fp, u8.buffer, {
                contentType: mime,
                upsert: true,
              });

              if (!upErr) {
                const { data: pubUrl } = supabase.storage.from("media").getPublicUrl(fp);
                mediaUrl = pubUrl?.publicUrl || "";
                console.log("Media downloaded & uploaded:", fp);
              } else {
                console.error("Storage upload error:", upErr.message);
              }
            } catch (uploadErr) {
              console.error("Downloaded media upload error:", uploadErr);
            }
          } else {
            console.warn("Downloaded media too large:", Math.round(sizeEst / 1024), "KB");
          }
        }
      } else {
        console.warn("Media sem URL/base64", {
          msgType,
          eventKeys: Object.keys(eventData || {}),
          messageKeys: Object.keys(message || {}),
          mediaMessageKeys: Object.keys(mediaMessage || {}),
        });
      }
    }

    console.log("Processing:", { remoteJid, msgType, fromMe, bodyLen: body?.length, hasMedia: !!mediaUrl });

    // Filter out groups and status broadcasts
    if (remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast") {
      console.log("Filtered:", remoteJid);
      return new Response(JSON.stringify({ ok: true, type: "filtered" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!remoteJid || !body) {
      // Non-message event (ReadReceipt, Presence, etc.) - just acknowledge
      return new Response(JSON.stringify({ ok: true, type: "non-message" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert conversation
    // Only use pushName for contact_name when the message is NOT from me,
    // otherwise it would overwrite the contact's name with our own name.
    const contactName = fromMe ? "" : (pushName || remoteJid.split("@")[0]);

    // Check if conversation already exists to avoid overwriting contact_name with empty string
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id, contact_name")
      .eq("instance_id", instanceId)
      .eq("jid", remoteJid)
      .maybeSingle();

    const upsertPayload: Record<string, any> = {
      user_id: userId,
      instance_id: instanceId,
      jid: remoteJid,
      last_message: body.substring(0, 200),
      last_message_at: timestamp,
      unread_count: fromMe ? 0 : 1,
    };

    // Only set contact_name if we have a real name (not from ourselves)
    if (contactName) {
      upsertPayload.contact_name = contactName;
    } else if (!existingConv) {
      // New conversation from our own message — use JID as fallback
      upsertPayload.contact_name = remoteJid.split("@")[0];
    }

    const { data: conversation } = await supabase
      .from("conversations")
      .upsert(upsertPayload, { onConflict: "instance_id,jid" })
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

    // Upsert contact — skip when fromMe to avoid overwriting with our own info
    if (!fromMe) {
      const contactUpsert: Record<string, any> = {
        user_id: userId,
        instance_id: instanceId,
        jid: remoteJid,
        phone: realPhone,
      };
      if (pushName) contactUpsert.push_name = pushName;
      if (contactName) contactUpsert.name = contactName;

      await supabase.from("contacts").upsert(contactUpsert, { onConflict: "instance_id,jid" });
    }

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
