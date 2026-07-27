const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ImageValidationResult =
  | { valid: true }
  | { valid: false; message: string };

export function validateImageFile(file: Pick<File, "size" | "type">): ImageValidationResult {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { valid: false, message: "Bitte verwende ein PNG-, JPG- oder WEBP-Bild." };
  }
  if (file.size === 0) {
    return { valid: false, message: "Die ausgewählte Datei ist leer." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { valid: false, message: "Das Bild darf höchstens 25 MB groß sein." };
  }
  return { valid: true };
}
