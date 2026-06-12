import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json } from "./http.ts";

export type AppRole = "admin" | "pengurus" | "penghuni" | "satpam";

export function createAdminClient() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    throw new Error("Konfigurasi Edge Function belum lengkap.");
  }

  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireCaller(admin: ReturnType<typeof createAdminClient>, req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { response: json({ error: "Tidak terautentikasi." }, 401) };

  const jwt = authHeader.replace("Bearer ", "");
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return { response: json({ error: "Sesi tidak valid." }, 401) };

  return { user: data.user };
}

export async function rolesForUser(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) throw error;
  return new Set((data ?? []).map((row: { role: AppRole }) => row.role));
}

export function hasAnyRole(roleSet: Set<AppRole>, roles: AppRole[]) {
  return roles.some((role) => roleSet.has(role));
}

export function isStaff(roleSet: Set<AppRole>) {
  return hasAnyRole(roleSet, ["admin", "pengurus"]);
}

