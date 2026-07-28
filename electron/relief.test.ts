import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createRelief } from "./relief";
import { reliefInternals } from "./relief";

describe("relief mesh", () => {
  it("creates a closed manifold surface", () => {
    const mesh = reliefInternals.buildWatertightHeightMesh(
      3,
      3,
      30,
      30,
      [2, 3, 2, 3, 4, 3, 2, 3, 2]
    );
    const edges = new Map<string, number>();
    for (const triangle of mesh.triangles) {
      for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every((uses) => uses === 2)).toBe(true);
  });

  it("writes the declared triangle count into binary STL", () => {
    const mesh = reliefInternals.buildWatertightHeightMesh(2, 2, 10, 10, [2, 2, 2, 2]);
    const stl = reliefInternals.encodeBinaryStl(mesh, "test");
    expect(stl.readUInt32LE(80)).toBe(mesh.triangles.length);
    expect(stl.length).toBe(84 + mesh.triangles.length * 50);
  });

  it("keeps an irregular masked outline watertight", () => {
    const cellMask = [
      false, true, false,
      true, true, true,
      false, true, false
    ];
    const mesh = reliefInternals.buildWatertightHeightMesh(4, 4, 30, 30, Array(16).fill(3), cellMask);
    const edges = new Map<string, number>();
    for (const triangle of mesh.triangles) {
      for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every((uses) => uses === 2)).toBe(true);
    expect(mesh.triangles.length).toBeGreaterThan(0);
  });

  it("smooths noise while preserving the field dimensions", () => {
    const values = [0, 0, 0, 0, 1, 0, 0, 0, 0];
    const smoothed = reliefInternals.smoothHeightField(values, 3, 3, 2);
    expect(smoothed).toHaveLength(values.length);
    expect(smoothed[4]).toBeLessThan(1);
    expect(smoothed[4]).toBeGreaterThan(0);
  });

  it("warns when the base plate is too thin", () => {
    const mesh = reliefInternals.buildWatertightHeightMesh(3, 3, 20, 20, Array(9).fill(1));
    const report = reliefInternals.analysePrintability(
      mesh,
      Array(9).fill(1),
      { widthMm: 20, baseMm: 0.8, reliefMm: 2, resolution: 32, invert: false, profile: "balanced", smoothing: 2, detail: 1, processingMode: "height" },
      Array(4).fill(true),
      3
    );
    expect(report.score).toBeLessThan(100);
    expect(report.issues.join(" ")).toContain("Grundplatte");
  });

  it("uses Sharp-compatible blur values for every quality profile", () => {
    for (const profile of ["fast", "balanced", "fine", "photo", "logo"] as const) {
      expect(reliefInternals.profileSettings(profile).inputBlur).toBeGreaterThanOrEqual(0.3);
    }
  });

  it("cleans isolated mask noise and creates a flat boundary rim", () => {
    const noisyMask = Array(49).fill(false) as boolean[];
    for (let y = 1; y <= 5; y += 1) for (let x = 1; x <= 5; x += 1) noisyMask[y * 7 + x] = true;
    noisyMask[48] = true;
    const cleaned = reliefInternals.cleanSubjectPixelMask(noisyMask, 7, 7);
    expect(cleaned[48]).toBe(false);
    const rimmed = reliefInternals.applyBoundaryRim(Array(49).fill(1), cleaned, 7, 7, 1);
    expect(rimmed[24]).toBe(1);
    expect(rimmed[8]).toBe(0);
  });

  it("turns flat logo colors into stable discrete height levels", () => {
    const rgba = Buffer.from([
      0, 0, 0, 255, 0, 0, 0, 255,
      255, 255, 255, 255, 255, 255, 255, 255
    ]);
    const levels = reliefInternals.buildVectorLevels(rgba, Array(4).fill(true), 2, 2, false);
    expect(new Set(levels).size).toBe(2);
    expect(levels[0]).toBeGreaterThan(levels[3]);
  });

  it("raises enclosed logo components above large background regions", () => {
    const width = 20, height = 20;
    const rgba = Buffer.alloc(width * height * 4);
    for (let index = 0; index < width * height; index += 1) rgba[index * 4 + 3] = 255;
    const paintWhite = (indices: number[]) => {
      for (const index of indices) {
        rgba[index * 4] = 255;
        rgba[index * 4 + 1] = 255;
        rgba[index * 4 + 2] = 255;
      }
    };
    const large = Array.from({ length: 40 }, (_, index) => 21 + Math.floor(index / 8) * width + index % 8);
    const medium = Array.from({ length: 10 }, (_, index) => 250 + Math.floor(index / 5) * width + index % 5);
    const tiny = [378];
    paintWhite([...large, ...medium, ...tiny]);

    const levels = reliefInternals.buildVectorLevels(rgba, Array(width * height).fill(true), width, height, false);
    expect(levels[large[0]]).toBeCloseTo(0.12);
    expect(levels[medium[0]]).toBeCloseTo(0.68);
    expect(levels[tiny[0]]).toBeCloseTo(0.92);
    expect(levels[0]).toBeCloseTo(0.82);
  });

  it("rounds staircase corners along an irregular subject boundary", () => {
    const cells = [
      false, true, false,
      true, true, true,
      false, true, false
    ];
    const positions = reliefInternals.buildSmoothedBoundaryPositions(4, 4, 30, 30, cells);
    const corner = positions.get(1);
    expect(corner).toBeDefined();
    expect(corner?.[0]).not.toBeCloseTo(10);
    expect(corner?.[1]).not.toBeCloseTo(0);
  });

  it("keeps preview boundary vertices on the base instead of creating spikes", () => {
    const cells = [
      false, true, false,
      true, true, true,
      false, true, false
    ];
    const heights = Array(16).fill(5);
    heights[0] = 1;
    const preview = reliefInternals.buildPreviewSurface(4, 4, 30, 30, heights, cells);
    const boundary = reliefInternals.buildSmoothedBoundaryPositions(4, 4, 30, 30, cells);
    for (const index of boundary.keys()) expect(preview.positions[index * 3 + 1]).toBe(1);
  });

  it("uses a manually edited heightmap without renormalizing its levels", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-print-editor-test-"));
    try {
      const imagePath = join(directory, "source.png");
      const mapPath = join(directory, "edited.png");
      const source = Buffer.alloc(32 * 32 * 4);
      for (let y = 2; y < 30; y += 1) for (let x = 2; x < 30; x += 1) {
        const offset = (y * 32 + x) * 4;
        source[offset] = 230; source[offset + 1] = 40; source[offset + 2] = 40; source[offset + 3] = 255;
      }
      await writeFile(imagePath, await sharp(source, { raw: { width: 32, height: 32, channels: 4 } }).png().toBuffer());
      const values = Buffer.from(Array.from({ length: 32 * 32 }, (_, index) => index % 32 < 16 ? 64 : 192));
      await writeFile(mapPath, await sharp(values, { raw: { width: 32, height: 32, channels: 1 } }).png().toBuffer());
      const result = await createRelief(imagePath, directory, {
        widthMm: 40, baseMm: 1.6, reliefMm: 4, resolution: 32, invert: false,
        profile: "logo", smoothing: 5, detail: 2, processingMode: "height"
      }, mapPath, true);
      const rendered = await sharp(Buffer.from(result.heightmapDataUrl.split(",")[1], "base64")).raw().toBuffer();
      expect(rendered[16 * 32 + 8]).toBe(64);
      expect(rendered[16 * 32 + 24]).toBe(192);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
