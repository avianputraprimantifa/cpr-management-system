import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const passed = [];

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function check(name, fn) {
  try {
    fn();
    passed.push(name);
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

function includes(source, expected) {
  assert.ok(
    source.includes(expected),
    `Expected source to include:\n${expected}`,
  );
}

function excludes(source, unexpected) {
  assert.ok(
    !source.includes(unexpected),
    `Expected source not to include:\n${unexpected}`,
  );
}

function order(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `Missing first marker:\n${first}`);
  assert.notEqual(secondIndex, -1, `Missing second marker:\n${second}`);
  assert.ok(
    firstIndex < secondIndex,
    `Expected marker order:\n${first}\n... before ...\n${second}`,
  );
}

const emailHelper = read("supabase/functions/_shared/email.ts");
const migration = read("supabase/migrations/20260613090000_secure_onboarding_ipl_email.sql");
const adminCreateUser = read("supabase/functions/admin-create-user/index.ts");
const createIplBills = read("supabase/functions/create-ipl-bills/index.ts");
const submitIplPayment = read("supabase/functions/submit-ipl-payment/index.ts");
const updateIplBillStatus = read("supabase/functions/update-ipl-bill-status/index.ts");
const billPayDialog = read("src/components/ipl/BillPayDialog.tsx");
const billReceiptDialog = read("src/components/ipl/BillReceiptDialog.tsx");
const billFormDialog = read("src/components/ipl/BillFormDialog.tsx");
const billImportDialog = read("src/components/ipl/BillCsvImportDialog.tsx");
const iplPage = read("src/pages/Ipl.tsx");
const residentFormDialog = read("src/components/residents/ResidentFormDialog.tsx");

check("email helper skips missing Resend secrets without throwing", () => {
  includes(emailHelper, "if (!apiKey || !from)");
  includes(emailHelper, 'logEmailEvent(admin, payload, "skipped"');
  includes(emailHelper, "return { ok: false, skipped: true");
  includes(emailHelper, "RESEND_API_KEY atau EMAIL_FROM belum diatur.");
});

check("email helper logs sent and failed attempts", () => {
  includes(emailHelper, 'logEmailEvent(admin, payload, "failed"');
  includes(emailHelper, 'logEmailEvent(admin, payload, "sent"');
  includes(emailHelper, "resend_id: details.resendId ?? null");
});

check("email_events migration records skipped/sent/failed states", () => {
  includes(migration, "create table if not exists public.email_events");
  includes(migration, "status text not null check (status in ('sent', 'failed', 'skipped'))");
  includes(migration, "public.has_role(_user_id => auth.uid(), _role => 'admin'::public.app_role)");
  includes(migration, "public.has_role(_user_id => auth.uid(), _role => 'pengurus'::public.app_role)");
});

check("account creation succeeds independently of welcome email delivery", () => {
  includes(adminCreateUser, 'const ROLES = ["pengurus", "penghuni", "satpam"] as const;');
  includes(adminCreateUser, "if (!isStaff(callerRoles))");
  includes(adminCreateUser, "must_reset_password: true");
  order(adminCreateUser, "must_reset_password: true", "await sendEmail(admin");
  order(adminCreateUser, "await sendEmail(admin", "return json({\n      user_id: userId");
  excludes(adminCreateUser, 'const ROLES = ["admin"');
});

check("bill creation records bills before sending notification email", () => {
  includes(createIplBills, 'payload.residentUserId === ALL_VALUE');
  includes(createIplBills, 'roles.has("penghuni") || roles.has("pengurus")');
  includes(createIplBills, '!roles.has("admin")');
  includes(createIplBills, '!roles.has("satpam")');
  order(createIplBills, "created += 1;", "await sendEmail(admin");
  order(createIplBills, "await sendEmail(admin", "return json({ created, skipped, failed, errors");
});

check("payment upload updates bill before payer and staff email attempts", () => {
  order(submitIplPayment, 'status: "dalam_pengecekan"', "if (payer?.email)");
  order(submitIplPayment, "if (payer?.email)", "const attachment = await storageAttachment");
  order(submitIplPayment, "await Promise.all(staff.map", "return json({ ok: true })");
  includes(submitIplPayment, 'receipt_thumbnail_path: payload.receiptThumbnailPath');
});

check("status verification updates bill before payer email attempt", () => {
  order(updateIplBillStatus, ".update(patch)", "if (payer?.email && bill.status !== payload.status)");
  order(updateIplBillStatus, "if (payer?.email && bill.status !== payload.status)", "return json({ ok: true })");
  includes(updateIplBillStatus, "verified_by: payload.status === \"lunas\" ? caller.user.id : null");
  includes(updateIplBillStatus, "verified_at: payload.status === \"lunas\" ? now : null");
});

check("payment UI uses submit-ipl-payment instead of direct bill status update", () => {
  includes(billPayDialog, 'supabase.functions.invoke("submit-ipl-payment"');
  includes(billPayDialog, "createReceiptThumbnailFile(file)");
  excludes(billPayDialog, '.from("ipl_bills")\n        .update');
});

check("receipt verification UI uses update-ipl-bill-status instead of direct bill status update", () => {
  includes(billReceiptDialog, 'supabase.functions.invoke("update-ipl-bill-status"');
  excludes(billReceiptDialog, '.from("ipl_bills")\n      .update');
  includes(billReceiptDialog, "clear_receipt: options.clearReceipt ?? false");
});

check("IPL management UI creates/imports bills through email-aware Edge Function", () => {
  includes(billFormDialog, 'supabase.functions.invoke("create-ipl-bills"');
  includes(billFormDialog, 'supabase.functions.invoke("update-ipl-bill-status"');
  includes(billImportDialog, 'supabase.functions.invoke("create-ipl-bills"');
  includes(iplPage, 'supabase.functions.invoke("update-ipl-bill-status"');
});

check("account creation UI excludes Admin while allowing Admin/Pengurus creators", () => {
  includes(residentFormDialog, 'role: z.enum(["pengurus", "penghuni", "satpam"])');
  includes(residentFormDialog, 'const CREATABLE_ROLES: CreatableResidentRole[] = ["pengurus", "penghuni", "satpam"];');
  includes(residentFormDialog, 'const canCreateAccounts = hasRole("admin", "pengurus");');
});

console.log(`Email workflow regression passed (${passed.length} checks).`);
