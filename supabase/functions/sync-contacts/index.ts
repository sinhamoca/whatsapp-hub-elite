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

    // 1. Get existing conversations to know which contacts we care about
    const { data: conversations } = await supabase
      .from("conversations")
      .select("jid, contact_name")
      .eq("instance_id", instanceId)
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false })
      .limit(200);

    if (!conversations || conversations.length === 0) {
      console.log("No conversations found, skipping sync");
      return new Response(
        JSON.stringify({ ok: true, contactsSynced: 0, avatarsSynced: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const conversationJids = new Set(conversations.map(c => c.jid));
    console.log(`Found ${conversations.length} conversations to sync`);

    // 2. Fetch contacts from WuzAPI
    console.log("Fetching contacts from WuzAPI...");
    const contactsRes = await fetch(`${apiUrl}/user/contacts`, {
      method: "GET",
      headers,
    });

    if (!contactsRes.ok) {
      const errText = await contactsRes.text();
      console.error("Failed to fetch contacts:", contactsRes.status, errText);
      return new Response(JSON.stringify({ error: "Failed to fetch contacts" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contactsData = await contactsRes.json();

    // Parse contacts map from various WuzAPI response formats
    let allContacts: Record<string, any> = {};
    if (contactsData?.data && typeof contactsData.data === "object" && !Array.isArray(contactsData.data)) {
      allContacts = contactsData.data;
    } else if (Array.isArray(contactsData?.data)) {
      for (const c of contactsData.data) {
        const jid = c.Jid || c.jid || c.Id || c.id;
        if (jid) allContacts[jid] = c;
      }
    } else if (contactsData?.Data && typeof contactsData.Data === "object") {
      allContacts = contactsData.Data;
    }

    console.log(`Total contacts from WuzAPI: ${Object.keys(allContacts).length}`);

    // 3. Match contacts to conversations (handle @lid vs @s.whatsapp.net)
    // Build a phone-to-contact lookup for cross-referencing
    const phoneToContact: Record<string, { jid: string; info: any }> = {};
    for (const [jid, info] of Object.entries(allContacts)) {
      // Extract phone from any JID format
      const phone = jid.split("@")[0];
      phoneToContact[phone] = { jid, info };
    }

    let synced = 0;

    for (const conv of conversations) {
      const convPhone = conv.jid.split("@")[0];
      
      // Try to find contact by exact JID or by phone number
      let contactInfo: any = allContacts[conv.jid];
      if (!contactInfo) {
        // Try with @s.whatsapp.net suffix
        contactInfo = allContacts[`${convPhone}@s.whatsapp.net`];
      }
      if (!contactInfo) {
        // Try phone lookup (handles @lid JIDs)
        const match = phoneToContact[convPhone];
        if (match) contactInfo = match.info;
      }

      // Extract display name
      let displayName = "";
      if (contactInfo) {
        displayName =
          contactInfo.FullName || contactInfo.fullName ||
          contactInfo.Name || contactInfo.name ||
          contactInfo.FirstName || contactInfo.firstName ||
          contactInfo.BusinessName || contactInfo.businessName ||
          contactInfo.PushName || contactInfo.pushName || "";
      }

      if (!displayName) continue;

      // Upsert contact record
      await supabase.from("contacts").upsert(
        {
          user_id: user.id,
          instance_id: instanceId,
          jid: conv.jid,
          name: displayName,
          push_name: contactInfo?.PushName || contactInfo?.pushName || displayName,
          phone: convPhone || "",
        },
        { onConflict: "instance_id,jid" }
      );

      // Update conversation contact_name
      await supabase
        .from("conversations")
        .update({ contact_name: displayName })
        .eq("instance_id", instanceId)
        .eq("jid", conv.jid);

      synced++;
    }

    console.log(`Synced ${synced} contact names`);

    // 4. Fetch avatars for top 10 conversations
    let avatarsSynced = 0;
    const topConversations = conversations.slice(0, 10);

    for (const conv of topConversations) {
      try {
        const phoneForAvatar = conv.jid.split("@")[0];

        const avatarRes = await fetch(`${apiUrl}/user/avatar`, {
          method: "POST",
          headers,
          body: JSON.stringify({ Phone: phoneForAvatar, Preview: true }),
        });

        if (!avatarRes.ok) {
          await avatarRes.text(); // consume body
          continue;
        }

        const avatarData = await avatarRes.json();
        const avatarUrl =
          avatarData?.data?.URL || avatarData?.data?.Url || avatarData?.data?.url ||
          avatarData?.URL || avatarData?.Url || avatarData?.url || "";

        if (!avatarUrl) continue;

        const imgRes = await fetch(avatarUrl);
        if (!imgRes.ok) {
          await imgRes.text();
          continue;
        }

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
