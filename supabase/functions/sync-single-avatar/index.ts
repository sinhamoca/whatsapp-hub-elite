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
    const { instanceId, jid, avatarUrl } = body;

    if (!instanceId || !jid || !avatarUrl) {
      return new Response(JSON.stringify({ error: "instanceId, jid, avatarUrl required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user owns the instance
    const { data: inst } = await supabaseAuth
      .from("instances")
      .select("id")
      .eq("id", instanceId)
      .single();

    if (!inst) {
      return new Response(JSON.stringify({ error: "Instance not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download avatar image
    const imageRes = await fetch(avatarUrl);
    if (!imageRes.ok) {
      return new Response(JSON.stringify({ error: "Failed to download avatar" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const fileId = jid.replace(/[^a-zA-Z0-9@._-]/g, "_");
    const filePath = `${instanceId}/${fileId}.jpg`;

    await supabase.storage.from("avatars").upload(filePath, imageBuffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

    const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const storedUrl = publicUrlData?.publicUrl || "";

    if (!storedUrl) {
      return new Response(JSON.stringify({ error: "Failed to get public URL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update contacts and conversations
    await supabase
      .from("contacts")
      .update({ avatar_url: storedUrl })
      .eq("instance_id", instanceId)
      .eq("jid", jid);

    await supabase
      .from("conversations")
      .update({ avatar_url: storedUrl })
      .eq("instance_id", instanceId)
      .eq("jid", jid);

    return new Response(JSON.stringify({ ok: true, avatar_url: storedUrl }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
