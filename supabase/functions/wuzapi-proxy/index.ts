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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { instanceId, endpoint, method = "GET", payload } = body;

    if (!instanceId || !endpoint) {
      return new Response(
        JSON.stringify({ error: "instanceId and endpoint are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch instance credentials from DB
    const { data: instance, error: instError } = await supabase
      .from("instances")
      .select("api_url, token")
      .eq("id", instanceId)
      .single();

    if (instError || !instance) {
      return new Response(
        JSON.stringify({ error: "Instance not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Proxy request to WuzAPI (with endpoint fallbacks for compatibility)
    const baseUrl = instance.api_url.replace(/\/$/, "");
    const requestedEndpoint = `/${String(endpoint).replace(/^\//, "")}`;

    const isStatusEndpoint = ["/api/status", "/session/status", "/status"].includes(requestedEndpoint);
    const isQrEndpoint = ["/api/qrcode", "/session/qr", "/qrcode"].includes(requestedEndpoint);
    const isDeleteEndpoint = ["/chat/delete", "/chat/revokemessage"].includes(requestedEndpoint);
    const isEditEndpoint = ["/chat/send/edit", "/chat/editmessage"].includes(requestedEndpoint);

    const endpointCandidates = isStatusEndpoint
      ? [requestedEndpoint, "/session/status", "/status", "/api/status"]
      : isQrEndpoint
      ? [requestedEndpoint, "/session/qr", "/qrcode", "/api/qrcode"]
      : isDeleteEndpoint
      ? [requestedEndpoint, "/chat/delete", "/chat/revokemessage"]
      : isEditEndpoint
      ? [requestedEndpoint, "/chat/send/edit", "/chat/editmessage"]
      : [requestedEndpoint];

    const uniqueCandidates = [...new Set(endpointCandidates)];

    let wuzResponse: Response | null = null;
    let rawText = "";

    for (const candidate of uniqueCandidates) {
      const url = `${baseUrl}${candidate}`;
      const fetchOptions: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${instance.token}`,
          Token: instance.token,
          "Content-Type": "application/json",
        },
      };

      if (method !== "GET" && payload) {
        fetchOptions.body = JSON.stringify(payload);
      }

      const response = await fetch(url, fetchOptions);
      const responseText = await response.text();

      wuzResponse = response;
      rawText = responseText;

      if (response.status !== 404) {
        break;
      }
    }

    let wuzData: Record<string, unknown>;
    try {
      wuzData = JSON.parse(rawText);
    } catch {
      wuzData = {
        raw: rawText,
        status: wuzResponse?.status ?? 500,
      };
    }

    if ((wuzResponse?.status ?? 500) === 404) {
      wuzData.attemptedEndpoints = uniqueCandidates;
    }

    return new Response(JSON.stringify(wuzData), {
      status: wuzResponse?.status ?? 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
