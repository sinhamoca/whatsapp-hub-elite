import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
};

const extractPhone = (value: unknown) => String(value || "").replace(/\D/g, "").trim();

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

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

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
      .select("id, api_url, token")
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

    // Limit to active conversations so we don't timeout on huge contact lists.
    const { data: conversations } = await supabase
      .from("conversations")
      .select("jid")
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

    console.log(`Found ${conversations.length} conversations to sync`);

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

    let allContacts: Record<string, any> = {};
    if (contactsData?.data && typeof contactsData.data === "object" && !Array.isArray(contactsData.data)) {
      allContacts = contactsData.data;
    } else if (contactsData?.Data && typeof contactsData.Data === "object" && !Array.isArray(contactsData.Data)) {
      allContacts = contactsData.Data;
    } else if (Array.isArray(contactsData?.data)) {
      for (const c of contactsData.data) {
        const jid = pickFirstString(c?.Jid, c?.jid, c?.Id, c?.id);
        if (jid) allContacts[jid] = c;
      }
    } else if (Array.isArray(contactsData)) {
      for (const c of contactsData) {
        const jid = pickFirstString(c?.Jid, c?.jid, c?.Id, c?.id);
        if (jid) allContacts[jid] = c;
      }
    }

    console.log(`Total contacts from WuzAPI: ${Object.keys(allContacts).length}`);

    // Build lookup by local part (for @s.whatsapp.net fallbacks)
    const localPartLookup: Record<string, { jid: string; info: any }> = {};
    // Build name→phone lookup from @s.whatsapp.net contacts for LID cross-reference
    const nameToPhoneLookup: Record<string, string[]> = {};
    for (const [jid, info] of Object.entries(allContacts)) {
      const local = jid.split("@")[0] || "";
      if (local) localPartLookup[local] = { jid, info };

      if (jid.endsWith("@s.whatsapp.net") && local) {
        const fullName = String((info as any)?.FullName || "").trim().toLowerCase();
        if (fullName) {
          if (!nameToPhoneLookup[fullName]) nameToPhoneLookup[fullName] = [];
          nameToPhoneLookup[fullName].push(local);
        }
      }
    }

    console.log(`Name-to-phone lookup entries: ${Object.keys(nameToPhoneLookup).length}`);

    let synced = 0;

    for (const conv of conversations) {
      const convJid = conv.jid;
      const jidLocalPart = convJid.split("@")[0] || "";
      const isLidJid = convJid.endsWith("@lid");

      const exactMatch = allContacts[convJid];
      const fallbackByPhone = allContacts[`${jidLocalPart}@s.whatsapp.net`];
      const fallbackByLocal = localPartLookup[jidLocalPart]?.info;
      const contactInfo = exactMatch || fallbackByPhone || fallbackByLocal || null;

      if (!contactInfo) continue;

      const displayName = pickFirstString(
        contactInfo?.FullName,
        contactInfo?.fullName,
        contactInfo?.Name,
        contactInfo?.name,
        contactInfo?.BusinessName,
        contactInfo?.businessName,
        contactInfo?.FirstName,
        contactInfo?.firstName,
        contactInfo?.PushName,
        contactInfo?.pushName,
      );

      if (!displayName) continue;

      const reliablePhone = extractPhone(
        pickFirstString(
          contactInfo?.Phone,
          contactInfo?.phone,
          contactInfo?.RedactedPhone,
          contactInfo?.redactedPhone,
        )
      );

      const payload: Record<string, any> = {
        user_id: user.id,
        instance_id: instanceId,
        jid: convJid,
        name: displayName,
        push_name: pickFirstString(contactInfo?.PushName, contactInfo?.pushName, displayName),
      };

      if (reliablePhone) {
        payload.phone = reliablePhone;
      } else if (isLidJid) {
        // Avoid storing the @lid internal ID as if it were a real phone number.
        payload.phone = "";
      }

      const { error: upsertError } = await supabase
        .from("contacts")
        .upsert(payload, { onConflict: "instance_id,jid" });

      if (upsertError) {
        console.warn("Contact upsert failed for", convJid, upsertError.message);
        continue;
      }

      await supabase
        .from("conversations")
        .update({ contact_name: displayName })
        .eq("instance_id", instanceId)
        .eq("jid", convJid);

      synced++;
    }

    console.log(`Synced ${synced} contact names`);

    let avatarsSynced = 0;
    const topConversations = conversations.slice(0, 20);

    for (const conv of topConversations) {
      try {
        // WuzAPI expects full @lid JID for LID contacts and plain phone for regular contacts.
        const avatarTarget = conv.jid.endsWith("@lid")
          ? conv.jid
          : (conv.jid.split("@")[0] || "");

        if (!avatarTarget || conv.jid.endsWith("@newsletter")) continue;

        const avatarRes = await fetch(`${apiUrl}/user/avatar`, {
          method: "POST",
          headers,
          body: JSON.stringify({ Phone: avatarTarget, Preview: true }),
        });

        if (!avatarRes.ok) {
          await avatarRes.text();
          continue;
        }

        const avatarData = await avatarRes.json();
        const avatarUrl = pickFirstString(
          avatarData?.data?.URL,
          avatarData?.data?.Url,
          avatarData?.data?.url,
          avatarData?.URL,
          avatarData?.Url,
          avatarData?.url,
        );

        if (!avatarUrl) continue;

        const imageRes = await fetch(avatarUrl);
        if (!imageRes.ok) {
          await imageRes.text();
          continue;
        }

        const imageBuffer = await imageRes.arrayBuffer();
        const fileId = conv.jid.replace(/[^a-zA-Z0-9@._-]/g, "_");
        const filePath = `${instanceId}/${fileId}.jpg`;

        await supabase.storage.from("avatars").upload(filePath, imageBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

        const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
        const storedUrl = publicUrlData?.publicUrl || "";

        if (!storedUrl) continue;

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
      } catch (error) {
        console.warn("Avatar sync error for", conv.jid, error);
      }
    }

    console.log(`Synced ${avatarsSynced} avatars. Done.`);

    return new Response(
      JSON.stringify({ ok: true, contactsSynced: synced, avatarsSynced }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
