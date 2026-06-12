/** Deteksi foto HEIC/HEIF dari iPhone (MIME sering kosong di iOS). */
export function isHeicFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return (
    ext === "heic" ||
    ext === "heif" ||
    file.type === "image/heic" ||
    file.type === "image/heif"
  );
}

export function isRasterImageFile(file: File): boolean {
  if (isHeicFile(file)) return true;
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name);
}

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** Bukti bayar: JPG, PNG, HEIC, PDF */
export function acceptsBillReceipt(file: File): boolean {
  return isRasterImageFile(file) || isPdfFile(file);
}

/** Foto lingkungan: JPG, PNG, HEIC */
export function acceptsEnvPhoto(file: File): boolean {
  return isRasterImageFile(file) && !isPdfFile(file);
}

export const ACCEPT_IMAGES =
  ".jpg,.jpeg,.png,.heic,.heif,image/jpeg,image/png,image/heic,image/heif";

export const ACCEPT_BILL_RECEIPT = `${ACCEPT_IMAGES},.pdf,application/pdf`;
