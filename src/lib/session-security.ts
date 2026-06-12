import type { Session } from "@supabase/supabase-js";

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
export const SESSION_CHECK_INTERVAL_MS = 60 * 1000;
export const SESSION_ACTIVITY_THROTTLE_MS = 15 * 1000;

const SESSION_STARTED_AT_KEY = "carlton.session.startedAt";
const SESSION_LAST_ACTIVE_AT_KEY = "carlton.session.lastActiveAt";
const LEGACY_SUPABASE_AUTH_KEY = /^sb-.+-auth-token$/;

export type SessionExpirationReason = "idle" | "max_age";

function browserStorage(storage: "localStorage" | "sessionStorage") {
  if (typeof window === "undefined") return null;
  try {
    return window[storage];
  } catch {
    return null;
  }
}

function readNumber(key: string) {
  const raw = browserStorage("sessionStorage")?.getItem(key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function writeNumber(key: string, value: number) {
  browserStorage("sessionStorage")?.setItem(key, String(value));
}

export function sessionStartTime(session: Session) {
  const signedInAt = session.user.last_sign_in_at
    ? Date.parse(session.user.last_sign_in_at)
    : NaN;
  return Number.isFinite(signedInAt) ? signedInAt : Date.now();
}

export function startSessionTracking(session: Session) {
  const now = Date.now();
  if (!readNumber(SESSION_STARTED_AT_KEY)) {
    writeNumber(SESSION_STARTED_AT_KEY, sessionStartTime(session));
  }
  if (!readNumber(SESSION_LAST_ACTIVE_AT_KEY)) {
    writeNumber(SESSION_LAST_ACTIVE_AT_KEY, now);
  }
}

export function resetSessionTracking(session: Session) {
  const now = Date.now();
  writeNumber(SESSION_STARTED_AT_KEY, sessionStartTime(session));
  writeNumber(SESSION_LAST_ACTIVE_AT_KEY, now);
}

export function touchSessionActivity() {
  writeNumber(SESSION_LAST_ACTIVE_AT_KEY, Date.now());
}

export function clearSessionTracking() {
  const storage = browserStorage("sessionStorage");
  storage?.removeItem(SESSION_STARTED_AT_KEY);
  storage?.removeItem(SESSION_LAST_ACTIVE_AT_KEY);
}

export function removeLegacyAuthLocalStorage() {
  const storage = browserStorage("localStorage");
  if (!storage) return;
  for (let i = storage.length - 1; i >= 0; i -= 1) {
    const key = storage.key(i);
    if (key && LEGACY_SUPABASE_AUTH_KEY.test(key)) {
      storage.removeItem(key);
    }
  }
}

export function sessionExpirationReason(): SessionExpirationReason | null {
  const now = Date.now();
  const startedAt = readNumber(SESSION_STARTED_AT_KEY);
  const lastActiveAt = readNumber(SESSION_LAST_ACTIVE_AT_KEY);

  if (startedAt && now - startedAt >= SESSION_MAX_AGE_MS) return "max_age";
  if (lastActiveAt && now - lastActiveAt >= SESSION_IDLE_TIMEOUT_MS) return "idle";

  return null;
}

export function sessionExpirationMessage(reason: SessionExpirationReason) {
  if (reason === "idle") {
    return "Sesi berakhir karena tidak ada aktivitas. Silakan masuk kembali.";
  }
  return "Sesi berakhir demi keamanan. Silakan masuk kembali.";
}
