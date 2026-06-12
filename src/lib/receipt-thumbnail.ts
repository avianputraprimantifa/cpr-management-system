import { isPdfFile, isRasterImageFile } from "@/lib/upload-file";

const MAX_THUMBNAIL_SIZE = 420;
const THUMBNAIL_QUALITY = 0.72;

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bukti pembayaran tidak bisa dipratinjau."));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", THUMBNAIL_QUALITY);
  });
}

export async function createReceiptThumbnailFile(file: File) {
  if (isPdfFile(file) || !isRasterImageFile(file)) return null;

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const ratio = Math.min(
      1,
      MAX_THUMBNAIL_SIZE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);

    const blob = await canvasToBlob(canvas);
    if (!blob) return null;
    return new File([blob], "receipt-thumbnail.jpg", { type: "image/jpeg" });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
