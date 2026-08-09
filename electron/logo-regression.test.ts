import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createRelief, reliefInternals } from "./relief";

describe("real-world logo regression fixtures", () => {
  it("keeps raster wordmark vectorization parameters locked", () => {
    expect(reliefInternals.wordmarkRasterTracePreset).toMatchObject({
      minimumTraceWidthPx: 256,
      maximumTraceWidthPx: 1200,
      resolutionScale: 2,
      sampleTargetPixels: 20_000,
      alphaCutoff: 24,
      maximumColorClusters: 6,
      kMeansIterations: 9,
      minimumComponentAreaRatio: 0.00008,
      backgroundTraceSmoothing: 2,
      motifTraceSmoothing: 3
    });
  });

  it("extrudes SVG wordmark paths directly instead of rasterizing them first", async () => {
    const directory = await mkdtemp(join(tmpdir(), "logo-svg-direct-"));
    try {
      const result = await createRelief(resolve("test-fixtures/logos/counters.svg"), directory, {
        pipelineKind: "wordmark", processingMode: "wordmark", profile: "logo", resolution: 512,
        widthMm: 120, minimumFeatureMm: 0.3, includeBackground: false
      });
      expect(result.geometryValidation.valid).toBe(true);
      expect(result.printability.issues).toContain("SVG-Pfade direkt extrudiert – keine Raster-Vektorisierung nötig.");
      expect(result.triangleCount).toBeLessThan(250_000);
      expect(result.fileBytes.stl).toBeLessThan(25_000_000);
      expect(result.fileBytes.threeMf).toBeLessThan(25_000_000);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 20_000);

  it("vectorizes raster wordmarks to SVG before extrusion", async () => {
    const directory = await mkdtemp(join(tmpdir(), "logo-raster-wordmark-vectorized-"));
    try {
      const imagePath = join(directory, "wordmark.png");
      const sourceSvg = Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="360" height="180">
          <rect width="360" height="180" fill="white"/>
          <text x="34" y="116" font-family="Arial" font-size="86" font-weight="700" fill="#4b1168">AI Print</text>
        </svg>
      `);
      await writeFile(imagePath, await sharp(sourceSvg).png().toBuffer());
      const result = await createRelief(imagePath, directory, {
        pipelineKind: "wordmark", processingMode: "wordmark", profile: "logo", resolution: 512,
        widthMm: 100, minimumFeatureMm: 0.3, includeBackground: false
      });
      expect(result.geometryValidation.valid).toBe(true);
      expect(result.printability.issues).toContain("PNG/JPG wurde lokal vektorisiert und anschließend als SVG-Pfad extrudiert.");
      expect(result.triangleCount).toBeGreaterThan(500);
      expect(result.fileBytes.stl).toBeLessThan(25_000_000);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 20_000);

  it("reduces SVG wordmark tessellation when export limits require a smaller mesh", async () => {
    const directory = await mkdtemp(join(tmpdir(), "logo-svg-tessellation-reduction-"));
    try {
      const high = await createRelief(resolve("test-fixtures/logos/thin-script.svg"), directory, {
        pipelineKind: "wordmark", processingMode: "wordmark", profile: "logo", resolution: 512,
        widthMm: 120, minimumFeatureMm: 0.8, includeBackground: false
      });
      const reduced = await createRelief(resolve("test-fixtures/logos/thin-script.svg"), directory, {
        pipelineKind: "wordmark", processingMode: "wordmark", profile: "logo", resolution: 128,
        widthMm: 120, minimumFeatureMm: 0.8, includeBackground: false
      });
      expect(reduced.geometryValidation.valid).toBe(true);
      expect(reduced.triangleCount).toBeLessThan(high.triangleCount);
      expect(reduced.triangleCount).toBeLessThan(250_000);
      expect(reduced.fileBytes.stl).toBeLessThan(25_000_000);
      expect(reduced.fileBytes.threeMf).toBeLessThan(25_000_000);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 20_000);

  it("removes isolated needle artifacts from SVG wordmarks", async () => {
    const directory = await mkdtemp(join(tmpdir(), "logo-svg-needle-cleanup-"));
    try {
      const imagePath = join(directory, "needle.svg");
      await writeFile(imagePath, `
        <svg xmlns="http://www.w3.org/2000/svg" width="400" height="180" viewBox="0 0 400 180">
          <path fill="#111111" d="M40 40h120v60h-120z"/>
          <path fill="#111111" d="M230 30h120v65h-120z"/>
          <path fill="#111111" d="M200 8h0.6v80h-0.6z"/>
        </svg>
      `);
      const result = await createRelief(imagePath, directory, {
        pipelineKind: "wordmark", processingMode: "wordmark", profile: "logo", resolution: 512,
        widthMm: 100, minimumFeatureMm: 0.3, includeBackground: false
      });
      const topVertices = result.preview.positions.filter((_, index) => index % 3 === 1);
      expect(Math.max(...topVertices)).toBe(4);
      let needleVertices = 0;
      for (let index = 0; index < result.preview.positions.length; index += 3) {
        const x = result.preview.positions[index];
        const y = result.preview.positions[index + 1];
        if (Math.abs(x - 1.6) < 0.4 && y > 0) needleVertices += 1;
      }
      expect(needleVertices).toBe(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 20_000);

  it("keeps small enclosed counters open", async () => {
    const directory = await mkdtemp(join(tmpdir(), "logo-counters-"));
    try {
      const result = await createRelief(resolve("test-fixtures/logos/counters.svg"), directory, {
        pipelineKind: "wordmark", processingMode: "wordmark", profile: "logo", resolution: 320,
        widthMm: 100, minimumFeatureMm: 0.8, includeBackground: false
      });
      expect(result.geometryValidation.valid).toBe(true);
      expect(result.geometryValidation.stats.connectedComponents).toBeGreaterThanOrEqual(3);
      expect(result.contourQuality.score).toBeGreaterThanOrEqual(60);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 20_000);

  it("preserves thin script without spikes or disappearing strokes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "logo-script-"));
    try {
      const result = await createRelief(resolve("test-fixtures/logos/thin-script.svg"), directory, {
        pipelineKind: "wordmark", processingMode: "wordmark", profile: "logo", resolution: 384,
        widthMm: 120, minimumFeatureMm: 0.8, includeBackground: false
      });
      expect(result.geometryValidation.valid).toBe(true);
      expect(result.triangleCount).toBeGreaterThan(500);
      expect(result.printability.score).toBeGreaterThanOrEqual(70);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 20_000);

  it("keeps a dark gradient as a flat printable background", async () => {
    const directory = await mkdtemp(join(tmpdir(), "logo-gradient-"));
    try {
      const result = await createRelief(resolve("test-fixtures/logos/dark-gradient.svg"), directory, {
        pipelineKind: "wordmark", processingMode: "wordmark", profile: "logo", resolution: 256,
        widthMm: 90, includeBackground: true
      });
      expect(result.geometryValidation.valid).toBe(true);
      expect(new Set(result.preview.positions.filter((_, index) => index % 3 === 1).map((height) => height.toFixed(3))).size).toBeLessThanOrEqual(3);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 20_000);

  it("keeps four source colors available as editable regions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "logo-multicolor-"));
    const palette = ["#F7F7F5", "#EF233C", "#FFD400", "#111111"];
    try {
      const result = await createRelief(resolve("test-fixtures/logos/multicolor.svg"), directory, {
        pipelineKind: "emblem", processingMode: "vector", profile: "logo", resolution: 256,
        widthMm: 100, sourceColors: palette, colors: palette, colorMapping: [0, 1, 2, 3], sideColorIndex: 3
      });
      expect(result.geometryValidation.valid).toBe(true);
      expect(result.colorRegions).toHaveLength(4);
      expect(result.colorRegions.reduce((sum, region) => sum + region.coveragePercent, 0)).toBeCloseTo(100, 1);
      expect(result.preview.colorParts.length).toBeGreaterThanOrEqual(3);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 20_000);

  it("remaps a detected motif region to a different AMS slot", async () => {
    const directory = await mkdtemp(join(tmpdir(), "logo-remap-"));
    const palette = ["#F7F7F5", "#EF233C", "#FFD400", "#111111"];
    try {
      const result = await createRelief(resolve("test-fixtures/logos/multicolor.svg"), directory, {
        pipelineKind: "emblem", processingMode: "vector", profile: "logo", resolution: 192,
        widthMm: 100, sourceColors: palette, colors: palette, colorMapping: [1, 1, 2, 3], sideColorIndex: 3
      });
      expect(result.colorRegions[0].targetIndex).toBe(1);
      expect(result.preview.colorParts.some((part) => part.color === palette[0])).toBe(false);
      expect(result.preview.colorParts.some((part) => part.color === palette[1])).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 20_000);
});
