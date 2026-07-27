import { describe, expect, it } from "vitest";
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
      { widthMm: 20, baseMm: 0.8, reliefMm: 2, resolution: 32, invert: false, profile: "balanced", smoothing: 2, detail: 1 },
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
});
