import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderTextImage } from "./text-image";
import { createRelief } from "./relief";
import { simplifyTextRing } from "./relief-meshing";

describe("text image", () => {
  it("renders multiline text with transparent background", async () => {
    const result = await renderTextImage({ text: "Hallo\nAMS", fontFamily: "Helvetica", bold: true, alignment: "center" });
    const metadata = await sharp(result.png).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBeGreaterThan(300);
    expect(metadata.width).toBeLessThan(1600);
    expect(metadata.height).toBeGreaterThan(300);
    expect(metadata.hasAlpha).toBe(true);
    expect(result.width).toBe(metadata.width);
    const { data } = await sharp(result.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const visiblePixels: number[] = [];
    let visiblePixelCount = 0;
    const alphaValues = new Set<number>();
    for (let offset = 0; offset < data.length; offset += 4) {
      alphaValues.add(data[offset + 3]);
      if (data[offset + 3]) {
        visiblePixelCount += 1;
        visiblePixels.push(data[offset], data[offset + 1], data[offset + 2]);
      }
    }
    expect(new Set(visiblePixels)).toEqual(new Set([255]));
    expect(alphaValues).toEqual(new Set([0, 255]));
    expect(visiblePixelCount).toBeLessThan(data.length / 4 * 0.5);
  });

  it("safely renders XML characters and rejects empty text", async () => {
    await expect(renderTextImage({ text: "<Text & Farbe>", italic: true })).resolves.toMatchObject({ text: "<Text & Farbe>" });
    await expect(renderTextImage({ text: "   " })).rejects.toThrow("zwischen 1 und 240");
  });

  it("turns thin letters into a non-empty printable mesh without eroding them away", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-print-text-test-"));
    try {
      const rendered = await renderTextImage({ text: "Mein Text", fontFamily: "Helvetica", bold: true, alignment: "center" });
      const imagePath = join(directory, "text.png");
      await writeFile(imagePath, rendered.png);
      const relief = await createRelief(imagePath, directory, {
        widthMm: 100, baseMm: 1.6, reliefMm: 4, resolution: 256, invert: false,
        profile: "logo", smoothing: 1, detail: 1, processingMode: "vector",
        sourceColors: [], colors: [], sideColorIndex: 0
      });
      expect(relief.triangleCount).toBeGreaterThan(1_000);
      expect(relief.printability.checks.some((check) => check.label === "Mindestbreite")).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("builds a smooth vector-extruded mesh with a baseplate when includeBackground is true", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-print-text-vector-"));
    try {
      const rendered = await renderTextImage({ text: "DRUCK", fontFamily: "Helvetica", bold: true, alignment: "center" });
      const imagePath = join(directory, "text-vector.png");
      await writeFile(imagePath, rendered.png);
      const relief = await createRelief(imagePath, directory, {
        widthMm: 100, baseMm: 1.6, reliefMm: 4, resolution: 256, invert: false,
        profile: "logo", pipelineKind: "text", smoothing: 1, detail: 1, processingMode: "vector",
        includeBackground: true, shape: "rounded", cornerRadiusMm: 6,
        sourceColors: [], colors: [], sideColorIndex: 0
      });
      expect(relief.geometryValidation.valid).toBe(true);
      expect(relief.geometryValidation.stats.degenerateTriangles).toBe(0);
      expect(relief.geometryValidation.stats.boundaryEdges).toBe(0);
      expect(relief.preview.positions.length).toBeGreaterThan(0);
      expect(relief.preview.indices.length).toBe(relief.triangleCount * 3);
      let maxZ = 0;
      for (let i = 1; i < relief.preview.positions.length; i += 3) {
        maxZ = Math.max(maxZ, relief.preview.positions[i]);
      }
      // Die Gesamthöhe mit Grundplatte beträgt baseMm + reliefMm = 5.6 mm
      expect(maxZ).toBeCloseTo(5.6, 1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("builds freestanding letters without a baseplate when includeBackground is false", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-print-text-freestanding-"));
    try {
      const rendered = await renderTextImage({ text: "TEST", fontFamily: "Helvetica", bold: true, alignment: "center" });
      const imagePath = join(directory, "text-freestanding.png");
      await writeFile(imagePath, rendered.png);
      const relief = await createRelief(imagePath, directory, {
        widthMm: 100, baseMm: 1.6, reliefMm: 3, resolution: 256, invert: false,
        profile: "logo", pipelineKind: "text", smoothing: 1, detail: 1, processingMode: "vector",
        includeBackground: false, shape: "source",
        sourceColors: [], colors: [], sideColorIndex: 0
      });
      expect(relief.geometryValidation.valid).toBe(true);
      expect(relief.geometryValidation.stats.degenerateTriangles).toBe(0);
      expect(relief.geometryValidation.stats.boundaryEdges).toBe(0);
      let maxZ = 0;
      for (let i = 1; i < relief.preview.positions.length; i += 3) {
        maxZ = Math.max(maxZ, relief.preview.positions[i]);
      }
      // Freistehende Buchstaben: Höhe entspricht exakt der Reliefhöhe (3 mm)
      expect(maxZ).toBeCloseTo(3.0, 1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("straightens raster staircases on letter stems via simplifyTextRing", () => {
    // Simulierte Treppenpunkte entlang eines senkrechten Buchstabenschafts
    const jitteredStem: Array<[number, number]> = [
      [10, 10],
      [10.1, 15],
      [9.9, 20],
      [10.05, 25],
      [10, 30],
      [20, 30],
      [20.1, 25],
      [19.9, 20],
      [20.05, 15],
      [20, 10],
      [10, 10]
    ];
    const simplified = simplifyTextRing(jitteredStem, 0.35);
    // Treppenpunkte auf den Geraden müssen zu geraden Linien zusammengefasst sein
    expect(simplified.length).toBeLessThan(jitteredStem.length);
    // Das Ergebnis muss geschlossen sein
    expect(simplified[0]).toEqual(simplified[simplified.length - 1]);
  });
});
