// Solo servidor. Fotos de propiedades: se re-codifican a WebP (máx. 1600 px
// por lado, sin metadatos EXIF — quita GPS y datos de la cámara) y se
// guardan en la base. Ver docs/realty.md: cuando el repo tenga
// almacenamiento de objetos, este archivo es el único que cambia.

import sharp from "sharp";
import { UserError } from "@/lib/user-error";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const MAX_PHOTOS_PER_PROPERTY = 12;
const MAX_SIDE = 1600;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"];

export interface ProcessedImage {
  data: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
}

export async function processPropertyImage(input: Buffer, declaredType: string): Promise<ProcessedImage> {
  if (input.byteLength === 0) throw new UserError("La imagen está vacía.");
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new UserError("La imagen pesa más de 12 MB.");
  if (declaredType && !ACCEPTED.includes(declaredType)) throw new UserError("Formato no compatible: usa JPG, PNG o WebP.");
  try {
    const { data, info } = await sharp(input, { limitInputPixels: 60_000_000 })
      .rotate() // respeta la orientación de la cámara antes de quitar EXIF
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { data, mimeType: "image/webp", width: info.width, height: info.height };
  } catch {
    throw new UserError("No se pudo leer la imagen.");
  }
}
