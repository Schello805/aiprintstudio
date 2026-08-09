import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRelief } from "./relief";

describe("real-world logo regression fixtures", () => {
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
