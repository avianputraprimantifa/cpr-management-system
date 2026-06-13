export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, x-supabase-api-version, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function handleOptions(req: Request) {
  if (req.method !== "OPTIONS") return null;

  const requestedHeaders = req.headers.get("Access-Control-Request-Headers");
  return new Response("ok", {
    headers: {
      ...corsHeaders,
      ...(requestedHeaders ? { "Access-Control-Allow-Headers": requestedHeaders } : {}),
    },
  });
}
