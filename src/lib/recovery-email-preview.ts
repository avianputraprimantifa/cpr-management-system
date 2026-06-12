export type RecoveryEmailPreview = {
  to: string;
  subject: string;
  bodyText: string;
  actionLink: string;
};

export function buildRecoveryEmailPreview(
  email: string,
  actionLink: string,
): RecoveryEmailPreview {
  return {
    to: email,
    subject: "Ubah password — Carlton Management System",
    bodyText: [
      "Halo,",
      "",
      "Kami menerima permintaan untuk mengubah password akun Carlton Management System Anda.",
      "",
      "Klik tombol di bawah ini untuk menetapkan password baru. Tautan ini berlaku terbatas.",
      "",
      "Jika Anda tidak meminta perubahan ini, abaikan email ini.",
      "",
      "Salam,",
      "Carlton Private Residence",
    ].join("\n"),
    actionLink,
  };
}
