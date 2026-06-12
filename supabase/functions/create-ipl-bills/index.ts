import { createAdminClient, isStaff, rolesForUser } from "../_shared/auth.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { escapeHtml, formatIDR, sendEmail } from "../_shared/email.ts";

const ALL_VALUE = "__all__";
const STATUSES = ["belum_dibayar", "dalam_pengecekan", "lunas"] as const;
type BillStatus = typeof STATUSES[number];

type Payload = {
  resident_user_id?: unknown;
  name?: unknown;
  amount?: unknown;
  due_date?: unknown;
  period?: unknown;
  status?: unknown;
};

type BillableProfile = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  block_unit: string | null;
};

function parsePayload(payload: Payload) {
  const residentUserId = typeof payload.resident_user_id === "string" ? payload.resident_user_id : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const amount = Number(payload.amount);
  const dueDate = typeof payload.due_date === "string" ? payload.due_date : "";
  const period = typeof payload.period === "string" ? payload.period : "";
  const status = STATUSES.includes(payload.status as BillStatus) ? payload.status as BillStatus : "belum_dibayar";

  if (!residentUserId) return { error: "Penghuni wajib dipilih." };
  if (!name) return { error: "Nama tagihan wajib diisi." };
  if (!Number.isFinite(amount) || amount < 0) return { error: "Jumlah tagihan tidak valid." };
  if (!dueDate) return { error: "Tanggal jatuh tempo wajib diisi." };
  if (!/^\d{4}-\d{2}$/.test(period)) return { error: "Periode tidak valid." };

  return { data: { residentUserId, name, amount, dueDate, period, status } };
}

async function billableProfiles(admin: ReturnType<typeof createAdminClient>) {
  const { data: roleRows, error: roleError } = await admin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "pengurus", "penghuni", "satpam"]);
  if (roleError) throw roleError;

  const byUser = new Map<string, Set<string>>();
  for (const row of roleRows ?? []) {
    const set = byUser.get(row.user_id) ?? new Set<string>();
    set.add(row.role);
    byUser.set(row.user_id, set);
  }

  const ids = Array.from(byUser.entries())
    .filter(([, roles]) => (roles.has("penghuni") || roles.has("pengurus")) && !roles.has("admin") && !roles.has("satpam"))
    .map(([id]) => id);

  if (ids.length === 0) return [] as BillableProfile[];

  const { data, error } = await admin
    .from("profiles")
    .select("user_id, email, full_name, block_unit")
    .in("user_id", ids)
    .eq("status", "aktif")
    .order("full_name");
  if (error) throw error;
  return (data ?? []) as BillableProfile[];
}

function billEmailHtml(profile: BillableProfile, bill: { name: string; period: string; amount: number; due_date: string }) {
  return `
    <p>Halo ${escapeHtml(profile.full_name ?? "Penghuni")},</p>
    <p>Tagihan IPL baru sudah dibuat:</p>
    <ul>
      <li>Nama: <strong>${escapeHtml(bill.name)}</strong></li>
      <li>Periode: <strong>${escapeHtml(bill.period)}</strong></li>
      <li>Jumlah: <strong>${escapeHtml(formatIDR(bill.amount))}</strong></li>
      <li>Jatuh tempo: <strong>${escapeHtml(bill.due_date)}</strong></li>
    </ul>
    <p>Silakan masuk ke aplikasi untuk melihat detail dan melakukan pembayaran.</p>
  `;
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
    if (!isStaff(callerRoles)) return json({ error: "Hanya Admin atau Pengurus yang dapat membuat tagihan." }, 403);

    const parsed = parsePayload(await req.json().catch(() => ({})));
    if ("error" in parsed) return json({ error: parsed.error }, 400);
    const payload = parsed.data;

    const targets = payload.residentUserId === ALL_VALUE
      ? await billableProfiles(admin)
      : (await billableProfiles(admin)).filter((profile) => profile.user_id === payload.residentUserId);

    if (targets.length === 0) return json({ error: "Tidak ada penghuni aktif yang dapat ditagih." }, 400);

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const target of targets) {
      const { data: bill, error } = await admin
        .from("ipl_bills")
        .insert({
          resident_user_id: target.user_id,
          name: payload.name,
          amount: payload.amount,
          due_date: payload.dueDate,
          period: payload.period,
          status: payload.status,
          created_by: caller.user.id,
        })
        .select("id, name, period, amount, due_date")
        .single();

      if (error?.code === "23505") {
        skipped += 1;
        continue;
      }
      if (error || !bill) {
        failed += 1;
        errors.push(`${target.email ?? target.user_id}: ${error?.message ?? "Gagal membuat tagihan"}`);
        continue;
      }

      created += 1;
      if (target.email) {
        await sendEmail(admin, {
          eventType: "ipl_bill_created",
          to: target.email,
          recipientUserId: target.user_id,
          relatedBillId: bill.id,
          triggeredBy: caller.user.id,
          subject: `Tagihan IPL ${payload.period}`,
          idempotencyKey: `bill-created:${bill.id}`,
          metadata: { period: payload.period },
          html: billEmailHtml(target, bill),
          text: `Tagihan IPL ${payload.period}: ${formatIDR(payload.amount)}, jatuh tempo ${payload.dueDate}.`,
        });
      }
    }

    return json({ created, skipped, failed, errors, period: payload.period });
  } catch (error) {
    return json({ error: (error as Error).message ?? "Kesalahan tidak diketahui." }, 500);
  }
});

