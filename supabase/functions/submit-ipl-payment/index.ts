import { createAdminClient } from "../_shared/auth.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { appOrigin, escapeHtml, formatIDR, sendEmail, storageAttachment } from "../_shared/email.ts";

type Payload = {
  bill_id?: unknown;
  receipt_path?: unknown;
  receipt_thumbnail_path?: unknown;
};

function readPayload(payload: Payload) {
  const billId = typeof payload.bill_id === "string" ? payload.bill_id : "";
  const receiptPath = typeof payload.receipt_path === "string" ? payload.receipt_path : "";
  const receiptThumbnailPath = typeof payload.receipt_thumbnail_path === "string" ? payload.receipt_thumbnail_path : null;
  if (!billId) return { error: "bill_id wajib diisi." };
  if (!receiptPath) return { error: "receipt_path wajib diisi." };
  return { data: { billId, receiptPath, receiptThumbnailPath } };
}

async function activeStaff(admin: ReturnType<typeof createAdminClient>) {
  const { data: roleRows, error: roleError } = await admin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "pengurus"]);
  if (roleError) throw roleError;
  const ids = Array.from(new Set((roleRows ?? []).map((row) => row.user_id)));
  if (ids.length === 0) return [];
  const { data, error } = await admin
    .from("profiles")
    .select("user_id, email, full_name")
    .in("user_id", ids)
    .eq("status", "aktif");
  if (error) throw error;
  return (data ?? []).filter((profile) => profile.email);
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "Metode tidak didukung." }, 405);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Tidak terautentikasi." }, 401);
    const { data: caller, error: callerError } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (callerError || !caller.user) return json({ error: "Sesi tidak valid." }, 401);

    const parsed = readPayload(await req.json().catch(() => ({})));
    if ("error" in parsed) return json({ error: parsed.error }, 400);
    const payload = parsed.data;

    const { data: bill, error: billError } = await admin
      .from("ipl_bills")
      .select("id, resident_user_id, name, period, amount, due_date, status")
      .eq("id", payload.billId)
      .maybeSingle();
    if (billError) throw billError;
    if (!bill) return json({ error: "Tagihan tidak ditemukan." }, 404);
    if (bill.resident_user_id !== caller.user.id) return json({ error: "Tagihan ini bukan milik akun Anda." }, 403);

    const submittedAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("ipl_bills")
      .update({
        status: "dalam_pengecekan",
        receipt_path: payload.receiptPath,
        receipt_thumbnail_path: payload.receiptThumbnailPath,
        payment_submitted_at: submittedAt,
        paid_at: null,
      })
      .eq("id", bill.id);
    if (updateError) throw updateError;

    const { data: payer } = await admin
      .from("profiles")
      .select("user_id, email, full_name, block_unit")
      .eq("user_id", bill.resident_user_id)
      .maybeSingle();

    if (payer?.email) {
      await sendEmail(admin, {
        eventType: "ipl_payment_submitted_payer",
        to: payer.email,
        recipientUserId: payer.user_id,
        relatedBillId: bill.id,
        triggeredBy: caller.user.id,
        subject: `Pembayaran ${bill.period} sedang diverifikasi`,
        idempotencyKey: `payment-submitted-payer:${bill.id}:${submittedAt}`,
        metadata: { period: bill.period },
        html: `
          <p>Halo ${escapeHtml(payer.full_name ?? "Penghuni")},</p>
          <p>Bukti pembayaran untuk <strong>${escapeHtml(bill.name)}</strong> sudah diterima dan sedang diverifikasi.</p>
          <p>Jumlah: <strong>${escapeHtml(formatIDR(Number(bill.amount)))}</strong></p>
        `,
        text: `Bukti pembayaran ${bill.name} sudah diterima dan sedang diverifikasi.`,
      });
    }

    const attachment = await storageAttachment(
      admin,
      "payment-receipts",
      payload.receiptThumbnailPath,
      `thumbnail-${bill.period}.jpg`,
    );
    const verifyUrl = `${appOrigin(req)}/ipl/verify/${bill.id}`;
    const staff = await activeStaff(admin);
    await Promise.all(staff.map((recipient) => sendEmail(admin, {
      eventType: "ipl_payment_submitted_staff",
      to: recipient.email,
      recipientUserId: recipient.user_id,
      relatedBillId: bill.id,
      triggeredBy: caller.user.id,
      subject: `Pembayaran perlu diverifikasi: ${bill.period}`,
      idempotencyKey: `payment-submitted-staff:${bill.id}:${recipient.user_id}:${submittedAt}`,
      metadata: { period: bill.period, payer_user_id: bill.resident_user_id },
      attachments: attachment ? [attachment] : undefined,
      html: `
        <p>Pembayaran IPL perlu diverifikasi.</p>
        <ul>
          <li>Penghuni: <strong>${escapeHtml(payer?.full_name ?? "-")}</strong></li>
          <li>Unit: <strong>${escapeHtml(payer?.block_unit ?? "-")}</strong></li>
          <li>Tagihan: <strong>${escapeHtml(bill.name)}</strong></li>
          <li>Jumlah: <strong>${escapeHtml(formatIDR(Number(bill.amount)))}</strong></li>
        </ul>
        <p><a href="${verifyUrl}">Buka halaman verifikasi</a></p>
      `,
      text: `Pembayaran ${bill.name} perlu diverifikasi: ${verifyUrl}`,
    })));

    return json({ ok: true });
  } catch (error) {
    return json({ error: (error as Error).message ?? "Kesalahan tidak diketahui." }, 500);
  }
});

