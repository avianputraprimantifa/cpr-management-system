import { createAdminClient, isStaff, rolesForUser } from "../_shared/auth.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { appOrigin, escapeHtml, sendEmail } from "../_shared/email.ts";

const ROLES = ["pengurus", "penghuni", "satpam"] as const;
type CreatableRole = typeof ROLES[number];

type CreateUserPayload = {
  email?: unknown;
  password?: unknown;
  full_name?: unknown;
  block_unit?: unknown;
  phone?: unknown;
  role?: unknown;
};

function valueOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeBlockUnit(value: unknown) {
  if (typeof value !== "string") return null;
  const prefixed = value.trim().match(/^CPR-(\d{2})$/i);
  if (prefixed) return `CPR-${prefixed[1]}`;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 2 ? `CPR-${digits.slice(-2)}` : null;
}

function parsePayload(payload: CreateUserPayload) {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const fullName = typeof payload.full_name === "string" ? payload.full_name.trim() : "";
  const role = typeof payload.role === "string" && ROLES.includes(payload.role as CreatableRole)
    ? payload.role as CreatableRole
    : null;

  if (!email || !email.includes("@")) return { error: "Email tidak valid." };
  if (password.length < 8) return { error: "Password minimal 8 karakter." };
  if (!fullName) return { error: "Nama lengkap wajib diisi." };
  if (!role) return { error: "Peran tidak valid. Admin tidak dapat dibuat dari aplikasi." };
  const blockUnit = role === "satpam" ? null : normalizeBlockUnit(payload.block_unit);
  if (role !== "satpam" && !blockUnit) return { error: "Blok / Unit wajib berupa CPR- diikuti 2 digit nomor." };

  return {
    data: {
      email,
      password,
      full_name: fullName,
      block_unit: blockUnit,
      phone: valueOrNull(payload.phone),
      role,
    },
  };
}

function rolesForCreatedAccount(role: CreatableRole) {
  return role === "pengurus" ? ["pengurus", "penghuni"] : [role];
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

    const jwt = authHeader.replace("Bearer ", "");
    const { data: caller, error: callerError } = await admin.auth.getUser(jwt);
    if (callerError || !caller.user) return json({ error: "Sesi tidak valid." }, 401);

    const callerRoles = await rolesForUser(admin, caller.user.id);
    if (!isStaff(callerRoles)) {
      return json({ error: "Hanya Admin atau Pengurus yang dapat membuat akun." }, 403);
    }

    const parsed = parsePayload(await req.json().catch(() => ({})));
    if ("error" in parsed) return json({ error: parsed.error }, 400);

    const payload = parsed.data;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        full_name: payload.full_name,
        role: payload.role,
      },
    });

    if (createError || !created.user) {
      return json({ error: createError?.message ?? "Gagal membuat akun." }, 400);
    }

    const userId = created.user.id;
    const rollbackAuthUser = async () => {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    };

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({
        user_id: userId,
        email: payload.email,
        full_name: payload.full_name,
        block_unit: payload.block_unit,
        phone: payload.phone,
        status: "aktif",
        must_reset_password: true,
        password_setup_completed_at: null,
        default_password_kept_at: null,
      }, { onConflict: "user_id" });

    if (profileError) {
      await rollbackAuthUser();
      return json({ error: `Akun dibuat, tetapi profil gagal disimpan: ${profileError.message}` }, 500);
    }

    const { error: clearRolesError } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    if (clearRolesError) {
      await rollbackAuthUser();
      return json({ error: `Akun dibuat, tetapi peran lama gagal dibersihkan: ${clearRolesError.message}` }, 500);
    }

    const roleRows = rolesForCreatedAccount(payload.role).map((role) => ({ user_id: userId, role }));
    const { error: roleInsertError } = await admin.from("user_roles").insert(roleRows);

    if (roleInsertError) {
      await rollbackAuthUser();
      return json({ error: `Akun dibuat, tetapi peran gagal disimpan: ${roleInsertError.message}` }, 500);
    }

    const redirectTo = `${appOrigin(req)}/reset-password`;
    const { data: recovery, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: payload.email,
      options: { redirectTo },
    });

    if (!linkError && recovery?.properties?.action_link) {
      const setupLink = recovery.properties.action_link;
      await sendEmail(admin, {
        eventType: "welcome_account",
        to: payload.email,
        recipientUserId: userId,
        triggeredBy: caller.user.id,
        subject: "Selamat datang di Carlton Private Residence",
        idempotencyKey: `welcome:${userId}`,
        metadata: { role: payload.role },
        html: `
          <p>Halo ${escapeHtml(payload.full_name)},</p>
          <p>Akun Carlton Private Residence Anda sudah dibuat.</p>
          <p>Silakan masuk dengan password awal dari pengurus, lalu buat password baru dari tautan berikut:</p>
          <p><a href="${setupLink}">Atur password akun</a></p>
          <p>Jika tombol tidak bisa dibuka, salin tautan ini ke browser:<br>${escapeHtml(setupLink)}</p>
        `,
        text: `Halo ${payload.full_name}, akun Carlton Private Residence Anda sudah dibuat. Atur password: ${setupLink}`,
      });
    } else {
      await sendEmail(admin, {
        eventType: "welcome_account",
        to: payload.email,
        recipientUserId: userId,
        triggeredBy: caller.user.id,
        subject: "Selamat datang di Carlton Private Residence",
        idempotencyKey: `welcome-link-failed:${userId}`,
        metadata: { role: payload.role, link_error: linkError?.message ?? "missing action link" },
        html: `<p>Akun ${escapeHtml(payload.full_name)} sudah dibuat, tetapi tautan setup password gagal dibuat.</p>`,
        text: `Akun ${payload.full_name} sudah dibuat, tetapi tautan setup password gagal dibuat.`,
      });
    }

    return json({
      user_id: userId,
      email: payload.email,
      role: payload.role,
    });
  } catch (error) {
    return json({ error: (error as Error).message ?? "Kesalahan tidak diketahui." }, 500);
  }
});
