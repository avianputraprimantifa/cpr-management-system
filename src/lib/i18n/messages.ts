export const M = {
  required: "Wajib diisi",
  email: "Format email tidak valid",
  minPassword: "Password minimal 8 karakter",
  passwordMismatch: "Konfirmasi password tidak cocok",
  emailChangeNotice:
    "Perubahan email mungkin memerlukan konfirmasi melalui tautan di kotak masuk Anda.",
  passwordResetEmailSent:
    "Email berisi tautan ubah password telah dikirim. Periksa kotak masuk dan folder spam.",
  passwordResetSuccess: "Password baru berhasil disimpan.",
  minAmount: "Jumlah minimal 0",
  fileTooLarge: "Ukuran file maksimal 5MB",
  fileCompressed: (fromMb: string, toKb: string) =>
    `Gambar dikompres dari ${fromMb} MB menjadi ${toKb} KB agar memenuhi batas 5MB.`,
  fileCompressFailed: "Gagal mengompres gambar. Coba file lain atau kurangi ukuran.",
  fileTypeInvalid: "Hanya file JPG, PNG, HEIC, atau PDF yang diperbolehkan",
  fileHeicConverted: "Foto HEIC dikonversi ke JPEG untuk diunggah.",
  fileHeicConvertFailed:
    "Gagal mengonversi foto HEIC. Di iPhone: Foto → Bagikan → Simpan sebagai JPEG, lalu unggah lagi.",
  loginFailed: "Email atau password salah",
  loginSuccess: "Berhasil masuk",
  logoutSuccess: "Berhasil keluar",
  saveSuccess: "Data berhasil disimpan",
  saveFailed: "Gagal menyimpan data",
  deleteSuccess: "Data berhasil dihapus",
  deleteFailed: "Gagal menghapus data",
  uploadSuccess: "Bukti pembayaran berhasil diunggah",
  uploadFailed: "Gagal mengunggah file",
  confirmSuccess: "Pembayaran berhasil dikonfirmasi",
  rejectSuccess: "Pembayaran ditolak",
  duplicatePeriod: "Tagihan untuk periode ini sudah ada untuk penghuni tersebut",
  noData: "Belum ada data",
  loading: "Memuat...",
  unauthorized: "Anda tidak memiliki akses ke halaman ini",
  generic: "Terjadi kesalahan, silakan coba lagi",
} as const;

export const ROLE_LABELS = {
  admin: "Admin",
  pengurus: "Pengurus",
  penghuni: "Penghuni",
  satpam: "Satpam",
} as const;

export const BILL_STATUS_LABELS = {
  belum_dibayar: "Belum Dibayar",
  dalam_pengecekan: "Dalam Pengecekan",
  lunas: "Lunas",
} as const;

export const ENV_STATUS_LABELS = {
  baik: "Baik",
  perlu_perhatian: "Perlu Perhatian",
  bermasalah: "Bermasalah",
} as const;

export const ENV_CATEGORY_LABELS = {
  sampah: "Sampah",
  kolam_renang: "Kolam Renang",
  lainnya: "Lainnya",
} as const;
