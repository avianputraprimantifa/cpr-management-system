import { createAdminClient, isStaff, rolesForUser } from "../_shared/auth.ts";
import { handleOptions, json } from "../_shared/http.ts";

type Payload = {
  bill_id?: unknown;
  kind?: unknown;
  expires_in?: unknown;
};

type ReceiptKind = "receipt" | "thumbnail";

function readPayload(payload: Payload) {
  const billId = typeof payload.bill_id === "string" ? payload.bill_id : "";
  const kind = payload.kind === "thumbnail" ? "thumbnail" : "receipt";
  const expiresIn = typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
    ? Math.min(Math.max(Math.round(payload.expires_in), 60), 60 * 60)
    : 300;

  if (!billId) return { error: "bill_id wajib diisi." };
  return { data: { billId, kind: kind as ReceiptKind, expiresIn } };
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
      .select("id, resident_user_id, receipt_path, receipt_thumbnail_path")
      .eq("id", payload.billId)
      .maybeSingle();
    if (billError) throw billError;
    if (!bill) return json({ error: "Tagihan tidak ditemukan." }, 404);

    const callerRoles = await rolesForUser(admin, caller.user.id);
    const canOpenReceipt = isStaff(callerRoles) || bill.resident_user_id === caller.user.id;
    if (!canOpenReceipt) return json({ error: "Anda tidak berhak membuka bukti pembayaran ini." }, 403);

    const path = payload.kind === "thumbnail" ? bill.receipt_thumbnail_path : bill.receipt_path;
    if (!path) return json({ error: "Bukti pembayaran belum tersedia." }, 404);

    const { data, error } = await admin.storage
      .from("payment-receipts")
      .createSignedUrl(path, payload.expiresIn);
    if (error || !data?.signedUrl) {
      return json({ error: error?.message ?? "Gagal membuat tautan bukti pembayaran." }, 400);
    }

    return json({
      signed_url: data.signedUrl,
      path,
      expires_in: payload.expiresIn,
    });
  } catch (error) {
    return json({ error: (error as Error).message ?? "Kesalahan tidak diketahui." }, 500);
  }
});
