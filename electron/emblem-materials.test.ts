import { describe, expect, it } from "vitest";
import { reliefInternals } from "./relief";
import { assignCanonicalTriangleMaterials } from "./relief-meshing";
import type { Mesh, Vec3 } from "./relief-export";

describe("emblem colors at smoothed contours", () => {
  it("does not use white field or mixed gray pixels to color a raised black outline", () => {
    const row = [255, 255, 255, 255, 143, 143, 143, 255, 5, 3, 3, 255];
    const assignments = reliefInternals.buildColorCellAssignments(
      Buffer.from([...row, ...row]), [true, true], 3, 2,
      ["#E71A22", "#FDFDFD", "#0D0807"], undefined,
      { pixels: [2.08, 4.88, 4.88, 2.08, 4.88, 4.88], cells: [4.8, 4.8] }
    );
    // The ambiguous edge remains unset; the neighboring outline supplies
    // solid black when the canonical surface is colored.
    expect(assignments).toEqual([-1, 2]);
  });

  it("keeps red fills, white fields and black contours on their own height bands", () => {
    const columns = 9, rows = 6;
    const rowMaterials = [1, -1, 2, 0, 0, 2, 1, 1];
    const rowHeights = [2, 2, 4.8, 3.6, 3.6, 4.8, 2, 2];
    const assignments = Array.from({ length: rows - 1 }, () => rowMaterials).flat();
    const heights = Array.from({ length: rows - 1 }, () => rowHeights).flat();
    const vertices: Vec3[] = [];
    const triangles: Mesh["triangles"] = [];
    for (const [x, top] of [[1.6, 4.8], [2.6, 3.6], [0.3, 2]]) {
      const start = vertices.length;
      vertices.push([x, 1, top], [x + 0.2, 1, top], [x, 3, top]);
      triangles.push([start, start + 1, start + 2]);
    }
    vertices.push([3, 1, 0], [3, 3, 0], [4, 1, 0]);
    triangles.push([9, 10, 11]);
    expect(assignCanonicalTriangleMaterials(
      { vertices, triangles }, assignments, columns, rows, 8, 5, 2, heights
    )).toEqual([2, 0, 1, 2]);
  });
});
