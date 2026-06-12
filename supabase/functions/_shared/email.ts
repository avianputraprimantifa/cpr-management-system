import type { createAdminClient } from "./auth.ts";

type AdminClient = ReturnType<typeof createAdminClient>;

export type EmailAttachment = {
  filename: string;
  content: string;
  content_type?: string;
};

export type EmailPayload = {
  eventType: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  recipientUserId?: string | null;
  relatedBillId?: string | null;
  triggeredBy?: string | null;
  metadata?: Record<string, unknown>;
  attachments?: EmailAttachment[];
  idempotencyKey?: string;
};

function resendConfig() {
  return {
    apiKey: Deno.env.get("RESEND_API_KEY") ?? "",
    from: Deno.env.get("EMAIL_FROM") ?? "",
    appOrigin: Deno.env.get("APP_ORIGIN") ?? "",
  };
}

export function appOrigin(req?: Request) {
  const configured = resendConfig().appOrigin;
  if (configured) return configured.replace(/\/$/, "");
  const origin = req?.headers.get("origin") ?? "";
  return origin.replace(/\/$/, "");
}

export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatIDR(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

async function logEmailEvent(
  admin: AdminClient,
  payload: EmailPayload,
  status: "sent" | "failed" | "skipped",
  details: { resendId?: string | null; errorMessage?: string | null } = {},
) {
  await admin.from("email_events").insert({
    event_type: payload.eventType,
    recipient_email: payload.to,
    recipient_user_id: payload.recipientUserId ?? null,
    subject: payload.subject,
    status,
    resend_id: details.resendId ?? null,
    error_message: details.errorMessage ?? null,
    related_bill_id: payload.relatedBillId ?? null,
    triggered_by: payload.triggeredBy ?? null,
    metadata: payload.metadata ?? {},
  });
}

export async function sendEmail(admin: AdminClient, payload: EmailPayload) {
  const { apiKey, from } = resendConfig();

  if (!apiKey || !from) {
    await logEmailEvent(admin, payload, "skipped", {
      errorMessage: "RESEND_API_KEY atau EMAIL_FROM belum diatur.",
    }).catch(() => undefined);
    return { ok: false, skipped: true, error: "Email secret belum diatur." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(payload.idempotencyKey ? { "Idempotency-Key": payload.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        attachments: payload.attachments,
      }),
    });
    const body = await res.json().catch(() => ({})) as { id?: string; message?: string; error?: string };
    if (!res.ok) {
      const message = body.message ?? body.error ?? `Resend gagal (${res.status})`;
      await logEmailEvent(admin, payload, "failed", { errorMessage: message }).catch(() => undefined);
      return { ok: false, error: message };
    }
    await logEmailEvent(admin, payload, "sent", { resendId: body.id ?? null }).catch(() => undefined);
    return { ok: true, id: body.id ?? null };
  } catch (error) {
    const message = (error as Error).message;
    await logEmailEvent(admin, payload, "failed", { errorMessage: message }).catch(() => undefined);
    return { ok: false, error: message };
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function storageAttachment(
  admin: AdminClient,
  bucket: string,
  path: string | null | undefined,
  filename: string,
) {
  if (!path) return null;
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) return null;
  return {
    filename,
    content: arrayBufferToBase64(await data.arrayBuffer()),
    content_type: data.type || "application/octet-stream",
  } satisfies EmailAttachment;
}

