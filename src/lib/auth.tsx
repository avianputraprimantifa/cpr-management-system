import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  clearSessionTracking,
  removeLegacyAuthLocalStorage,
  resetSessionTracking,
  SESSION_ACTIVITY_THROTTLE_MS,
  SESSION_CHECK_INTERVAL_MS,
  sessionExpirationMessage,
  sessionExpirationReason,
  startSessionTracking,
  touchSessionActivity,
} from "@/lib/session-security";

export type AppRole = "admin" | "pengurus" | "penghuni" | "satpam";

export interface Profile {
  id: string;
  user_id: string;
  avatar_url: string | null;
  full_name: string | null;
  block_unit: string | null;
  phone: string | null;
  email: string | null;
  status: "aktif" | "nonaktif";
  must_reset_password: boolean;
  password_setup_completed_at: string | null;
  default_password_kept_at: string | null;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (...roles: AppRole[]) => boolean;
  refreshProfile: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const AUTH_TIMEOUT_MS = 20_000;

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const lastActivityWriteRef = useRef(0);

  const clearAuthState = useCallback(() => {
    setSession(null);
    setUser(null);
    setProfile(null);
    setRoles([]);
  }, []);

  const signOutSafely = useCallback(async () => {
    clearSessionTracking();
    clearAuthState();
    await supabase.auth.signOut();
  }, [clearAuthState]);

  const expireSession = useCallback(async (reason: "idle" | "max_age") => {
    toast.info(sessionExpirationMessage(reason));
    await signOutSafely();
  }, [signOutSafely]);

  async function loadProfileAndRoles(uid: string) {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((p as Profile | null) ?? null);
    setRoles(((r ?? []) as { role: AppRole }[]).map((x) => x.role));
  }

  useEffect(() => {
    let mounted = true;
    removeLegacyAuthLocalStorage();

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (data.session) {
        startSessionTracking(data.session);
        const reason = sessionExpirationReason();
        if (reason) {
          await expireSession(reason);
          if (mounted) setIsLoading(false);
          return;
        }
      }
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) await loadProfileAndRoles(data.session.user.id);
      setIsLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (s) {
        if (event === "SIGNED_IN") resetSessionTracking(s);
        else startSessionTracking(s);
      } else {
        clearSessionTracking();
      }
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => {
          void loadProfileAndRoles(s.user.id);
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [expireSession]);

  useEffect(() => {
    if (!session) return undefined;

    const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    const recordActivity = () => {
      const now = Date.now();
      if (now - lastActivityWriteRef.current < SESSION_ACTIVITY_THROTTLE_MS) return;
      lastActivityWriteRef.current = now;
      touchSessionActivity();
    };
    const recordVisibleActivity = () => {
      if (document.visibilityState === "visible") recordActivity();
    };

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, recordActivity, { passive: true });
    });
    window.addEventListener("focus", recordActivity);
    document.addEventListener("visibilitychange", recordVisibleActivity);

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, recordActivity);
      });
      window.removeEventListener("focus", recordActivity);
      document.removeEventListener("visibilitychange", recordVisibleActivity);
    };
  }, [session]);

  useEffect(() => {
    if (!session) return undefined;

    const checkSession = () => {
      const reason = sessionExpirationReason();
      if (reason) void expireSession(reason);
    };

    checkSession();
    const intervalId = window.setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [expireSession, session]);

  useEffect(() => {
    if (profile?.status !== "nonaktif") return undefined;
    const timeoutId = window.setTimeout(() => {
      toast.error("Akun Anda sedang nonaktif. Hubungi admin untuk mengaktifkan kembali.");
      void signOutSafely();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [profile?.status, signOutSafely]);

  const value = useMemo<AuthCtx>(() => ({
    user, session, profile, roles, isLoading,
    signIn: async (email, password) => {
      try {
        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          "Login memakan waktu terlalu lama. Periksa koneksi internet lalu coba lagi."
        );
        return { error: error?.message ?? null };
      } catch (error) {
        return {
          error: error instanceof Error
            ? error.message
            : "Login gagal. Silakan coba lagi.",
        };
      }
    },
    signOut: signOutSafely,
    hasRole: (...rs) => rs.some((r) => roles.includes(r)),
    refreshProfile: async () => { if (user) await loadProfileAndRoles(user.id); },
  }), [user, session, profile, roles, isLoading, signOutSafely]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
