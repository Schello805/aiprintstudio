import { describe, expect, it } from "vitest";
import { extractColorPalette } from "./color-palette";

const pixels = (colors: Array<readonly [number, number, number, number]>) =>
  new Uint8ClampedArray(colors.flat());

describe("color palette", () => {
  it("extracts the requested dominant opaque colors", () => {
    const palette = extractColorPalette(pixels([
      [250, 10, 10, 255], [248, 12, 12, 255], [5, 20, 245, 255], [255, 0, 0, 0]
    ]), 2);
    expect(palette).toHaveLength(2);
    expect(palette.some((color) => color.startsWith("#F8") || color.startsWith("#FA"))).toBe(true);
    expect(palette.some((color) => color.endsWith("F8") || color.endsWith("F5"))).toBe(true);
  });

  it("clamps the palette to AMS-compatible limits", () => {
    expect(extractColorPalette(pixels([[10, 20, 30, 255]]), 1)).toHaveLength(2);
    expect(extractColorPalette(pixels([[10, 20, 30, 255]]), 30)).toHaveLength(16);
  });
});
