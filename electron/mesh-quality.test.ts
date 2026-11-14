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

it("rejects open and inconsistently oriented surfaces",()=>{
 expect(validateMeshGeometry({vertices:[[0,0,0],[1,0,0],[0,1,0]],triangles:[[0,1,2]]}).valid).toBe(false);
 const tetra={vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]] as const,triangles:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]] as const};
 expect(validateMeshGeometry(tetra).valid).toBe(true);
 expect(validateMeshGeometry({...tetra,triangles:[[0,1,2],...tetra.triangles.slice(1)]}).valid).toBe(false);
});
it("recognizes a closed STL-style triangle soup by shared positions",()=>{
 const vertices=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]] as const;
 const faces=[[0,2,1],[0,1,3],[1,2,3],[2,0,3]] as const;
 const soup=faces.flatMap(face=>face.map(i=>vertices[i]));
 const result=validateMeshGeometry({vertices:soup,triangles:faces.map((_,i)=>[i*3,i*3+1,i*3+2])});
 expect(result.valid).toBe(true);expect(result.stats.boundaryEdges).toBe(0);expect(result.stats.connectedComponents).toBe(1);
});
