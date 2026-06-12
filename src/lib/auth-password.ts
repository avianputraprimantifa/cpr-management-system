import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Result = { ok: true } | { ok: false; error: string };
type PasswordSetupMode = "changed" | "kept";

/**
 * Update password via GoTrue HTTP API (avoids supabase-js updateUser occasionally hanging).
 */
export async function setUserPassword(password: string): Promise<Result> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: "Sesi tidak valid. Buka ulang tautan reset dari email." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
      signal: controller.signal,
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, string>;

    if (!res.ok) {
      return {
        ok: false,
        error: body.msg ?? body.error_description ?? body.message ?? `Gagal (${res.status})`,
      };
    }

    if (body.access_token && body.refresh_token) {
      await supabase.auth.setSession({
        access_token: body.access_token,
        refresh_token: body.refresh_token,
      });
    }

    return { ok: true };
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      return { ok: false, error: "Permintaan timeout. Periksa koneksi dan coba lagi." };
    }
    return { ok: false, error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export function redirectAfterPasswordChange() {
  window.location.replace(`${window.location.origin}/account?passwordChanged=1`);
}

export async function markPasswordSetupComplete(mode: PasswordSetupMode): Promise<Result> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesi tidak valid." };

  const { error } = await supabase
    .from("profiles")
    .update({
      must_reset_password: false,
      password_setup_completed_at: mode === "changed" ? new Date().toISOString() : null,
      default_password_kept_at: mode === "kept" ? new Date().toISOString() : null,
    })
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
