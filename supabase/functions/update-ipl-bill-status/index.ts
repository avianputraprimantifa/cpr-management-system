import { createAdminClient, isStaff, rolesForUser } from "../_shared/auth.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { escapeHtml, formatIDR, sendEmail } from "../_shared/email.ts";

const STATUSES = ["belum_dibayar", "dalam_pengecekan", "lunas"] as const;
type BillStatus = typeof STATUSES[number];

type Payload = {
  bill_id?: unknown;
  status?: unknown;
  clear_receipt?: unknown;
};

function readPayload(payload: Payload) {
  const billId = typeof payload.bill_id === "string" ? payload.bill_id : "";
  const status = STATUSES.includes(payload.status as BillStatus) ? payload.status as BillStatus : null;
  const clearReceipt = payload.clear_receipt === true;
  if (!billId) return { error: "bill_id wajib diisi." };
  if (!status) return { error: "Status tidak valid." };
  return { data: { billId, status, clearReceipt } };
}

function payerSubject(status: BillStatus, period: string) {
  if (status === "lunas") return `Tagihan IPL ${period} sudah Lunas`;
  if (status === "dalam_pengecekan") return `Tagihan IPL ${period} dalam pengecekan`;
  return `Tagihan IPL ${period} perlu dibayar`;
}

function statusLabel(status: BillStatus) {
  if (status === "lunas") return "Lunas";
  if (status === "dalam_pengecekan") return "Dalam Pengecekan";
  return "Belum Dibayar";
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

    const callerRoles = await rolesForUser(admin, caller.user.id);
    if (!isStaff(callerRoles)) return json({ error: "Hanya Admin atau Pengurus yang dapat mengubah status tagihan." }, 403);

    const parsed = readPayload(await req.json().catch(() => ({})));
    if ("error" in parsed) return json({ error: parsed.error }, 400);
    const payload = parsed.data;

    const { data: bill, error: billError } = await admin
      .from("ipl_bills")
      .select("id, resident_user_id, name, period, amount, status, receipt_path")
      .eq("id", payload.billId)
      .maybeSingle();
    if (billError) throw billError;
    if (!bill) return json({ error: "Tagihan tidak ditemukan." }, 404);

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: payload.status,
      paid_at: payload.status === "lunas" ? now : null,
      verified_by: payload.status === "lunas" ? caller.user.id : null,
      verified_at: payload.status === "lunas" ? now : null,
    };
    if (payload.clearReceipt) {
      patch.receipt_path = null;
      patch.receipt_thumbnail_path = null;
      patch.payment_submitted_at = null;
    }

    const { error: updateError } = await admin
      .from("ipl_bills")
      .update(patch)
      .eq("id", bill.id);
    if (updateError) throw updateError;

    const { data: payer } = await admin
      .from("profiles")
      .select("user_id, email, full_name")
      .eq("user_id", bill.resident_user_id)
      .maybeSingle();

    if (payer?.email && bill.status !== payload.status) {
      await sendEmail(admin, {
        eventType: "ipl_bill_status_changed",
        to: payer.email,
        recipientUserId: payer.user_id,
        relatedBillId: bill.id,
        triggeredBy: caller.user.id,
        subject: payerSubject(payload.status, bill.period),
        idempotencyKey: `status:${bill.id}:${payload.status}:${now}`,
        metadata: { previous_status: bill.status, next_status: payload.status, period: bill.period },
        html: `
          <p>Halo ${escapeHtml(payer.full_name ?? "Penghuni")},</p>
          <p>Status tagihan <strong>${escapeHtml(bill.name)}</strong> berubah menjadi <strong>${escapeHtml(statusLabel(payload.status))}</strong>.</p>
          <p>Jumlah tagihan: <strong>${escapeHtml(formatIDR(Number(bill.amount)))}</strong></p>
        `,
        text: `Status tagihan ${bill.name} berubah menjadi ${statusLabel(payload.status)}.`,
      });
    }

    if (payload.status === "lunas") {
      await admin.from("notifications").insert({
        user_id: bill.resident_user_id,
        title: "Pembayaran Dikonfirmasi",
        body: `${bill.name} sebesar ${formatIDR(Number(bill.amount))} telah dikonfirmasi lunas.`,
        type: "bill_confirmed",
      });
    } else if (payload.clearReceipt || (bill.status === "lunas" && payload.status !== "lunas")) {
      await admin.from("notifications").insert({
        user_id: bill.resident_user_id,
        title: "Status Tagihan Diperbarui",
        body: `${bill.name} perlu ditindaklanjuti kembali.`,
        type: "bill_status_changed",
      });
    }

    return json({ ok: true });
  } catch (error) {
    return json({ error: (error as Error).message ?? "Kesalahan tidak diketahui." }, 500);
  }
});
