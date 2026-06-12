import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Tidak terautentikasi" }, 401);

    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData.user?.email) return json({ error: "Sesi tidak valid" }, 401);

    const { redirectTo } = await req.json().catch(() => ({}));
    if (!redirectTo || typeof redirectTo !== "string") {
      return json({ error: "redirectTo wajib diisi" }, 400);
    }

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: userData.user.email,
      options: { redirectTo },
    });

    if (error || !data?.properties?.action_link) {
      return json({ error: error?.message ?? "Gagal membuat tautan reset" }, 500);
    }

    return json({
      action_link: data.properties.action_link,
      email: userData.user.email,
    });
  } catch (err) {
    return json({ error: (err as Error).message ?? "Kesalahan tidak diketahui" }, 500);
  }
});
