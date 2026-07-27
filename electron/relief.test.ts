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
});
