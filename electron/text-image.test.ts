import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { renderTextImage } from "./text-image";

describe("text image", () => {
  it("renders multiline text with transparent background", async () => {
    const result = await renderTextImage({ text: "Hallo\nAMS", fontFamily: "Helvetica", bold: true, alignment: "center" });
    const metadata = await sharp(result.png).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(1600);
    expect(metadata.height).toBeGreaterThan(420);
    expect(metadata.hasAlpha).toBe(true);
  });

  it("safely renders XML characters and rejects empty text", async () => {
    await expect(renderTextImage({ text: "<Text & Farbe>", italic: true })).resolves.toMatchObject({ text: "<Text & Farbe>" });
    await expect(renderTextImage({ text: "   " })).rejects.toThrow("zwischen 1 und 240");
  });
});
