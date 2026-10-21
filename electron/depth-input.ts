import sharp from "sharp";

// Vision cannot decode SVG. Normalize every supported source to an opaque,
// oriented RGB PNG before passing it to the native depth worker.
export async function prepareDepthInput(source: string, destination: string): Promise<void> {
  await sharp(source)
    .rotate()
    .resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .removeAlpha()
    .png()
    .toFile(destination);
}
