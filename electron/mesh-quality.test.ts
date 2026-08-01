import { describe, expect, it } from "vitest";
import { analyseContourQuality, removeInvalidTriangles, validateMeshGeometry } from "./mesh-quality";

describe("mesh quality gate", () => {
  it("removes duplicate and zero-area triangles before export", () => {
    const mesh = {
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] as const,
      triangles: [[0, 1, 2], [0, 1, 2], [0, 0, 1]] as const
    };
    const cleaned = removeInvalidTriangles(mesh);
    expect(cleaned.triangles).toEqual([[0, 1, 2]]);
  });

  it("blocks invalid indices and non-finite vertices", () => {
    const report = validateMeshGeometry({
      vertices: [[0, 0, 0], [Number.NaN, 0, 0], [0, 1, 0]],
      triangles: [[0, 1, 4]]
    });
    expect(report.valid).toBe(false);
    expect(report.stats.invalidTriangles).toBe(1);
  });

  it("scores a regular contour better than many nozzle-scale slivers", () => {
    const regular = analyseContourQuality({ vertices: [[0, 0, 0], [2, 0, 0], [0, 2, 0]], triangles: [[0, 1, 2]] }, 0.4);
    const slivers = analyseContourQuality({ vertices: [[0, 0, 0], [0.01, 0, 0], [0, 2, 0]], triangles: [[0, 1, 2]] }, 0.4);
    expect(regular.score).toBeGreaterThan(slivers.score);
  });
});
