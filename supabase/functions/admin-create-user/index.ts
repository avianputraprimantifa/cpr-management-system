import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = ["admin", "pengurus", "penghuni", "satpam"] as const;
type AppRole = typeof ROLES[number];

type CreateUserPayload = {
  email?: unknown;
  password?: unknown;
  full_name?: unknown;
  block_unit?: unknown;
  phone?: unknown;
  role?: unknown;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function valueOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parsePayload(payload: CreateUserPayload) {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const fullName = typeof payload.full_name === "string" ? payload.full_name.trim() : "";
  const role = typeof payload.role === "string" && ROLES.includes(payload.role as AppRole)
    ? payload.role as AppRole
    : null;

  if (!email || !email.includes("@")) return { error: "Email tidak valid." };
  if (password.length < 8) return { error: "Password minimal 8 karakter." };
  if (!fullName) return { error: "Nama lengkap wajib diisi." };
  if (!role) return { error: "Peran tidak valid." };

  return {
    data: {
      email,
      password,
      full_name: fullName,
      block_unit: role === "satpam" ? null : valueOrNull(payload.block_unit),
      phone: valueOrNull(payload.phone),
      role,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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
    if (!adminRole) return json({ error: "Hanya Admin yang dapat membuat akun." }, 403);

    const parsed = parsePayload(await req.json().catch(() => ({})));
    if ("error" in parsed) return json({ error: parsed.error }, 400);

    const payload = parsed.data;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.full_name,
        role: payload.role,
      },
    });

    if (createError || !created.user) {
      return json({ error: createError?.message ?? "Gagal membuat akun." }, 400);
    }

    const userId = created.user.id;

    const rollbackAuthUser = async () => {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    };

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({
        user_id: userId,
        email: payload.email,
        full_name: payload.full_name,
        block_unit: payload.block_unit,
        phone: payload.phone,
        status: "aktif",
      }, { onConflict: "user_id" });

    if (profileError) {
      await rollbackAuthUser();
      return json({ error: `Akun dibuat, tetapi profil gagal disimpan: ${profileError.message}` }, 500);
    }

    const { error: clearRolesError } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    if (clearRolesError) {
      await rollbackAuthUser();
      return json({ error: `Akun dibuat, tetapi peran lama gagal dibersihkan: ${clearRolesError.message}` }, 500);
    }

    const { error: roleInsertError } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: payload.role });

    if (roleInsertError) {
      await rollbackAuthUser();
      return json({ error: `Akun dibuat, tetapi peran gagal disimpan: ${roleInsertError.message}` }, 500);
    }

    return json({
      user_id: userId,
      email: payload.email,
      role: payload.role,
    });
  } catch (error) {
    return json({ error: (error as Error).message ?? "Kesalahan tidak diketahui." }, 500);
  }
});
