import { supabase } from "@/integrations/supabase/client";
import { isEdgeFunctionReachabilityError } from "@/lib/edge-function-error";

const ALL_VALUE = "__all__";

type BillStatus = "belum_dibayar" | "dalam_pengecekan" | "lunas";

export type CreateIplBillsPayload = {
  resident_user_id: string;
  name: string;
  amount: number;
  due_date: string;
  period: string;
  status: BillStatus;
};

export type CreateIplBillsResponse = {
  created?: number;
  skipped?: number;
  failed?: number;
  errors?: string[];
  period?: string;
  error?: string;
  notificationSkipped?: boolean;
};
export type SubmitIplPaymentPayload = {
  bill_id: string;
  receipt_path: string;
  receipt_thumbnail_path: string | null;
};
export type SubmitIplPaymentResponse = {
  error?: string;
};
export type UpdateIplBillStatusPayload = {
  bill_id: string;
  status: BillStatus;
  clear_receipt?: boolean;
};
export type UpdateIplBillStatusResponse = {
  error?: string;
};

type BillableProfile = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

async function billableProfiles() {
  const { data: roleRows, error: roleError } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "pengurus", "penghuni", "satpam"]);
  if (roleError) throw roleError;

  const byUser = new Map<string, Set<string>>();
  for (const row of roleRows ?? []) {
    const roles = byUser.get(row.user_id) ?? new Set<string>();
    roles.add(row.role);
    byUser.set(row.user_id, roles);
  }

  const ids = Array.from(byUser.entries())
    .filter(([, roles]) => (roles.has("penghuni") || roles.has("pengurus")) && !roles.has("admin") && !roles.has("satpam"))
    .map(([id]) => id);

  if (ids.length === 0) return [] as BillableProfile[];

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, email, full_name")
    .in("user_id", ids)
    .eq("status", "aktif")
    .order("full_name");
  if (error) throw error;

  return (data ?? []) as BillableProfile[];
}

async function createIplBillsDirect(payload: CreateIplBillsPayload): Promise<CreateIplBillsResponse> {
  const { data: caller, error: callerError } = await supabase.auth.getUser();
  if (callerError || !caller.user) return { error: "Sesi tidak valid." };

  const profiles = await billableProfiles();
  const targets = payload.resident_user_id === ALL_VALUE
    ? profiles
    : profiles.filter((profile) => profile.user_id === payload.resident_user_id);

  if (targets.length === 0) return { error: "Tidak ada penghuni aktif yang dapat ditagih." };

  let created = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const target of targets) {
    const { data: existing, error: existingError } = await supabase
      .from("ipl_bills")
      .select("id")
      .eq("resident_user_id", target.user_id)
      .eq("period", payload.period)
      .maybeSingle();

    if (existing) {
      skipped += 1;
      continue;
    }

    if (existingError) {
      failed += 1;
      errors.push(`${target.email ?? target.user_id}: ${existingError.message}`);
      continue;
    }

    const { error } = await supabase
      .from("ipl_bills")
      .insert({
        resident_user_id: target.user_id,
        name: payload.name,
        amount: payload.amount,
        due_date: payload.due_date,
        period: payload.period,
        status: payload.status,
        created_by: caller.user.id,
      });

    if (error) {
      if (error.code === "23505") {
        skipped += 1;
      } else {
        failed += 1;
        errors.push(`${target.email ?? target.user_id}: ${error.message}`);
      }
      continue;
    }

    created += 1;
  }

  return {
    created,
    skipped,
    failed,
    errors,
    period: payload.period,
    notificationSkipped: created > 0,
  };
}

export async function createIplBills(payload: CreateIplBillsPayload) {
  const { data, error } = await supabase.functions.invoke("create-ipl-bills", {
    body: payload,
  });

  if (error && isEdgeFunctionReachabilityError(error)) {
    console.warn("[create-ipl-bills] Edge Function unreachable, using direct database fallback.", error);
    return {
      data: await createIplBillsDirect(payload),
      error: null,
    };
  }

  if (error) {
    console.error("[create-ipl-bills] Edge Function invoke failed.", error);
  }

  return {
    data: data as CreateIplBillsResponse | null,
    error,
  };
}

async function isCurrentUserStaff(userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "pengurus"]);
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function updateIplBillStatusDirect(payload: UpdateIplBillStatusPayload): Promise<UpdateIplBillStatusResponse> {
  const { data: caller, error: callerError } = await supabase.auth.getUser();
  if (callerError || !caller.user) return { error: "Sesi tidak valid." };
  if (!await isCurrentUserStaff(caller.user.id)) {
    return { error: "Hanya Admin atau Pengurus yang dapat mengubah status tagihan." };
  }

  const { data: bill, error: billError } = await supabase
    .from("ipl_bills")
    .select("id")
    .eq("id", payload.bill_id)
    .maybeSingle();
  if (billError) return { error: billError.message };
  if (!bill) return { error: "Tagihan tidak ditemukan." };

  const now = new Date().toISOString();
  const patch = {
    status: payload.status,
    paid_at: payload.status === "lunas" ? now : null,
    verified_by: payload.status === "lunas" ? caller.user.id : null,
    verified_at: payload.status === "lunas" ? now : null,
    ...(payload.clear_receipt ? {
      receipt_path: null,
      receipt_thumbnail_path: null,
      payment_submitted_at: null,
    } : {}),
  };

  const { error } = await supabase
    .from("ipl_bills")
    .update(patch)
    .eq("id", payload.bill_id);

  return error ? { error: error.message } : {};
}

export async function updateIplBillStatus(payload: UpdateIplBillStatusPayload) {
  const { data, error } = await supabase.functions.invoke("update-ipl-bill-status", {
    body: payload,
  });

  if (error && isEdgeFunctionReachabilityError(error)) {
    console.warn("[update-ipl-bill-status] Edge Function unreachable, using direct database fallback.", error);
    return {
      data: await updateIplBillStatusDirect(payload),
      error: null,
    };
  }

  if (error) {
    console.error("[update-ipl-bill-status] Edge Function invoke failed.", error);
  }

  return {
    data: data as UpdateIplBillStatusResponse | null,
    error,
  };
}

async function submitIplPaymentDirect(payload: SubmitIplPaymentPayload): Promise<SubmitIplPaymentResponse> {
  const { data: caller, error: callerError } = await supabase.auth.getUser();
  if (callerError || !caller.user) return { error: "Sesi tidak valid." };

  const { data: bill, error: billError } = await supabase
    .from("ipl_bills")
    .select("id, resident_user_id")
    .eq("id", payload.bill_id)
    .maybeSingle();
  if (billError) return { error: billError.message };
  if (!bill) return { error: "Tagihan tidak ditemukan." };
  if (bill.resident_user_id !== caller.user.id) {
    return { error: "Tagihan ini bukan milik akun Anda." };
  }

  const { error } = await supabase
    .from("ipl_bills")
    .update({
      status: "dalam_pengecekan",
      receipt_path: payload.receipt_path,
      receipt_thumbnail_path: payload.receipt_thumbnail_path,
      payment_submitted_at: new Date().toISOString(),
      paid_at: null,
      verified_by: null,
      verified_at: null,
    })
    .eq("id", payload.bill_id);

  return error ? { error: error.message } : {};
}

export async function submitIplPayment(payload: SubmitIplPaymentPayload) {
  const { data, error } = await supabase.functions.invoke("submit-ipl-payment", {
    body: payload,
  });

  if (error && isEdgeFunctionReachabilityError(error)) {
    console.warn("[submit-ipl-payment] Edge Function unreachable, using direct database fallback.", error);
    return {
      data: await submitIplPaymentDirect(payload),
      error: null,
    };
  }

  if (error) {
    console.error("[submit-ipl-payment] Edge Function invoke failed.", error);
  }

  return {
    data: data as SubmitIplPaymentResponse | null,
    error,
  };
}
