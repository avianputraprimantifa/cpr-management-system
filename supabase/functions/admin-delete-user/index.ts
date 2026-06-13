import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, x-supabase-api-version, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type DeleteUserPayload = {
  user_id?: unknown;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    const requestedHeaders = req.headers.get("Access-Control-Request-Headers");
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        ...(requestedHeaders ? { "Access-Control-Allow-Headers": requestedHeaders } : {}),
      },
    });
  }
  if (req.method !== "POST") return json({ error: "Metode tidak didukung." }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Konfigurasi Edge Function belum lengkap." }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Tidak terautentikasi." }, 401);

    const jwt = authHeader.replace("Bearer ", "");
    const { data: caller, error: callerError } = await admin.auth.getUser(jwt);
    if (callerError || !caller.user) return json({ error: "Sesi tidak valid." }, 401);

    const { data: adminRole, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) return json({ error: `Gagal memeriksa peran: ${roleError.message}` }, 500);
    if (!adminRole) return json({ error: "Hanya Admin yang dapat menghapus akun." }, 403);

    const body = await req.json().catch(() => ({})) as DeleteUserPayload;
    const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    if (!userId) return json({ error: "user_id wajib diisi." }, 400);
    if (userId === caller.user.id) return json({ error: "Admin tidak dapat menghapus akun sendiri." }, 400);

    const { data: targetRoles, error: targetRoleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (targetRoleError) {
      return json({ error: `Gagal memeriksa peran akun target: ${targetRoleError.message}` }, 500);
    }
    if ((targetRoles ?? []).some((row: { role: string }) => row.role === "admin")) {
      return json({ error: "Akun Admin tidak dapat dihapus." }, 400);
    }

    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError && authError.status !== 404) {
      return json({ error: authError.message }, 400);
    }

    const cleanup = await Promise.all([
      admin.from("user_roles").delete().eq("user_id", userId),
      admin.from("profiles").delete().eq("user_id", userId),
      admin.from("notifications").delete().eq("user_id", userId),
      admin.from("guard_shifts").delete().eq("guard_user_id", userId),
    ]);

    const cleanupError = cleanup.find((result) => result.error)?.error;
    if (cleanupError) {
      return json({ error: `Akun Auth terhapus, tetapi pembersihan data profil gagal: ${cleanupError.message}` }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    return json({ error: (error as Error).message ?? "Kesalahan tidak diketahui." }, 500);
  }
});
