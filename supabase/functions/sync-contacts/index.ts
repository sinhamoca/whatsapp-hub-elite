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

    // Service role client for storage uploads
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
    console.log("Fetching contacts from WuzAPI...");
    const contactsRes = await fetch(`${apiUrl}/user/contacts`, {
      method: "GET",
      headers,
    });

    if (!contactsRes.ok) {
      console.error("Failed to fetch contacts:", contactsRes.status);
      return new Response(JSON.stringify({ error: "Failed to fetch contacts from WuzAPI" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contactsData = await contactsRes.json();
    const contacts = contactsData?.data || contactsData?.Data || contactsData || {};

    let synced = 0;
    let avatarsSynced = 0;

    // Process each contact
    for (const [jid, info] of Object.entries(contacts)) {
      if (!jid || !jid.includes("@") || jid.endsWith("@g.us") || jid === "status@broadcast") continue;

      const contactInfo = info as any;
      const fullName = contactInfo?.FullName || contactInfo?.fullName || "";
      const firstName = contactInfo?.FirstName || contactInfo?.firstName || "";
      const pushName = contactInfo?.PushName || contactInfo?.pushName || "";
      const businessName = contactInfo?.BusinessName || contactInfo?.businessName || "";
      const displayName = fullName || firstName || businessName || pushName || "";

      if (!displayName) continue;

      const phone = jid.endsWith("@s.whatsapp.net") ? jid.split("@")[0] : "";

      // Upsert contact
      await supabase.from("contacts").upsert(
        {
          user_id: user.id,
          instance_id: instanceId,
          jid,
          name: displayName,
          push_name: pushName || displayName,
          phone: phone || undefined,
        },
        { onConflict: "instance_id,jid" }
      );

      // Update conversation name if exists
      await supabase
        .from("conversations")
        .update({ contact_name: displayName })
        .eq("instance_id", instanceId)
        .eq("jid", jid);

      synced++;
    }

    console.log(`Synced ${synced} contacts`);

    // 2. Fetch avatars for conversations (limited to active conversations)
    const { data: conversations } = await supabase
      .from("conversations")
      .select("jid")
      .eq("instance_id", instanceId)
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(50);

    if (conversations && conversations.length > 0) {
      for (const conv of conversations) {
        try {
          const phoneForAvatar = conv.jid.split("@")[0];
          const avatarRes = await fetch(`${apiUrl}/user/avatar`, {
            method: "GET",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ Phone: phoneForAvatar, Preview: true }),
          });

          // Some APIs don't allow body on GET, try POST
          let avatarData: any = null;
          if (avatarRes.ok) {
            avatarData = await avatarRes.json();
          }

          if (!avatarData) {
            const avatarRes2 = await fetch(`${apiUrl}/user/avatar`, {
              method: "POST",
              headers,
              body: JSON.stringify({ Phone: phoneForAvatar, Preview: true }),
            });
            if (avatarRes2.ok) {
              avatarData = await avatarRes2.json();
            }
          }

          const avatarUrl =
            avatarData?.data?.URL ||
            avatarData?.data?.Url ||
            avatarData?.data?.url ||
            avatarData?.URL ||
            avatarData?.Url ||
            avatarData?.url ||
            "";

          if (avatarUrl) {
            // Download and upload to storage
            try {
              const imgRes = await fetch(avatarUrl);
              if (imgRes.ok) {
                const imgBuffer = await imgRes.arrayBuffer();
                const filePath = `${instanceId}/${phoneForAvatar}.jpg`;

                await supabase.storage
                  .from("avatars")
                  .upload(filePath, imgBuffer, {
                    contentType: "image/jpeg",
                    upsert: true,
                  });

                const { data: pubUrl } = supabase.storage
                  .from("avatars")
                  .getPublicUrl(filePath);

                const storedUrl = pubUrl?.publicUrl || "";

                if (storedUrl) {
                  await supabase
                    .from("contacts")
                    .update({ avatar_url: storedUrl })
                    .eq("instance_id", instanceId)
                    .eq("jid", conv.jid);

                  await supabase
                    .from("conversations")
                    .update({ avatar_url: storedUrl })
                    .eq("instance_id", instanceId)
                    .eq("jid", conv.jid);

                  avatarsSynced++;
                }
              }
            } catch (imgErr) {
              console.warn("Avatar download error for", conv.jid, imgErr);
            }
          }
        } catch (err) {
          console.warn("Avatar fetch error for", conv.jid, err);
        }
      }
    }

    console.log(`Synced ${avatarsSynced} avatars`);

    return new Response(
      JSON.stringify({ ok: true, contactsSynced: synced, avatarsSynced }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
