import heic2any from "heic2any";
import { isHeicFile, isRasterImageFile } from "@/lib/upload-file";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("LOAD_FAILED"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("BLOB_FAILED"))),
      mime,
      quality,
    );
  });
}

function toOutputFile(blob: Blob, originalName: string, mime: string): File {
  const base = originalName.replace(/\.[^.]+$/i, "") || "upload";
  const ext = mime === "image/png" ? ".png" : ".jpg";
  return new File([blob], `${base}${ext}`, { type: mime, lastModified: Date.now() });
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  const base = file.name.replace(/\.(heic|heif)$/i, "") || "foto";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

async function compressImage(file: File, maxBytes: number): Promise<File> {
  const img = await loadImage(file);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_FAILED");

  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  let scale = 1;
  let best: Blob | null = null;

  while (scale >= 0.15) {
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    if (mime === "image/png") {
      const blob = await canvasToBlob(canvas, mime, 1);
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= maxBytes) return toOutputFile(blob, file.name, mime);
    } else {
      for (const q of [0.92, 0.85, 0.78, 0.7, 0.62, 0.55, 0.48, 0.4, 0.32, 0.25, 0.18, 0.12]) {
        const blob = await canvasToBlob(canvas, mime, q);
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= maxBytes) return toOutputFile(blob, file.name, mime);
      }
    }
    scale *= 0.82;
  }

  if (best && best.size <= maxBytes) return toOutputFile(best, file.name, mime);

  if (mime === "image/png") {
    let scale = 1;
    while (scale >= 0.15) {
      const w = Math.max(1, Math.round(srcW * scale));
      const h = Math.max(1, Math.round(srcH * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      for (const q of [0.85, 0.7, 0.55, 0.4, 0.28, 0.18, 0.12]) {
        const blob = await canvasToBlob(canvas, "image/jpeg", q);
        if (blob.size <= maxBytes) return toOutputFile(blob, file.name, "image/jpeg");
      }
      scale *= 0.82;
    }
  }

  throw new Error("COMPRESS_FAILED");
}

export type PrepareUploadResult = {
  file: File;
  convertedFromHeic: boolean;
  compressed: boolean;
  originalSize: number;
};

/** Konversi HEIC → JPEG, lalu kompres gambar hingga ≤ maxBytes (default 5MB). */
export async function prepareUploadFile(
  file: File,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<PrepareUploadResult> {
  const originalSize = file.size;
  let working = file;
  let convertedFromHeic = false;

  if (isHeicFile(working)) {
    try {
      working = await convertHeicToJpeg(working);
      convertedFromHeic = true;
    } catch {
      throw new Error("HEIC_CONVERT_FAILED");
    }
  }

  if (!isRasterImageFile(working)) {
    if (working.size > maxBytes) throw new Error("FILE_TOO_LARGE_NON_IMAGE");
    return { file: working, convertedFromHeic, compressed: false, originalSize };
  }

  if (working.size <= maxBytes) {
    return { file: working, convertedFromHeic, compressed: false, originalSize };
  }

  const compressed = await compressImage(working, maxBytes);
  return { file: compressed, convertedFromHeic, compressed: true, originalSize };
}
