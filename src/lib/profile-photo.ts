import heic2any from "heic2any";
import { isHeicFile } from "@/lib/upload-file";

const PROFILE_PHOTO_SIZE = 256;

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

function loadPhoto(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Foto profil tidak bisa dibaca."));
    };
    img.src = url;
  });
}

export async function toProfilePhotoDataUrl(file: File): Promise<string> {
  const photoFile = isHeicFile(file) ? await convertHeicToJpeg(file) : file;
  const img = await loadPhoto(photoFile);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Foto profil tidak bisa diproses.");

  canvas.width = PROFILE_PHOTO_SIZE;
  canvas.height = PROFILE_PHOTO_SIZE;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PROFILE_PHOTO_SIZE, PROFILE_PHOTO_SIZE);
  const scale = Math.max(PROFILE_PHOTO_SIZE / img.naturalWidth, PROFILE_PHOTO_SIZE / img.naturalHeight);
  const width = img.naturalWidth * scale;
  const height = img.naturalHeight * scale;
  ctx.drawImage(
    img,
    (PROFILE_PHOTO_SIZE - width) / 2,
    (PROFILE_PHOTO_SIZE - height) / 2,
    width,
    height,
  );
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  if (dataUrl === "data:,") throw new Error("Foto profil tidak bisa diproses.");
  return dataUrl;
}
