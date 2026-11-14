import type { Metadata } from "sharp";

export function orientedDimensions(metadata: Pick<Metadata, "width" | "height" | "orientation">) {
  return metadata.orientation && metadata.orientation >= 5 && metadata.orientation <= 8
    ? { width: metadata.height, height: metadata.width }
    : { width: metadata.width, height: metadata.height };
}
