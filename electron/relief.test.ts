import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
import { createRelief } from "./relief";
import { reliefInternals } from "./relief";

function normalForTest(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number]
) {
  const ux = b[0] - a[0], uy = b[1] - a[1];
  const vx = c[0] - a[0], vy = c[1] - a[1];
  return [0, 0, ux * vy - uy * vx] as const;
}

describe("relief mesh", () => {
  it("does not grow a one-pixel text edge into a brim cell", () => {
    const isolated = [
      false, false, false,
      false, true, false,
      false, false, false
    ];
    expect(reliefInternals.buildCellMask(isolated, 3, 3, 2)).toEqual([false, false, false, false]);
    const stroke = [
      false, false, false,
      true, true, false,
      false, false, false
    ];
    expect(reliefInternals.buildCellMask(stroke, 3, 3, 2)).toEqual([true, false, true, false]);
  });

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

  it("orients STL and 3MF geometry like the upright preview", () => {
    const mesh = {
      vertices: [
        [2, 0, 1],
        [8, 0, 1],
        [2, 10, 1]
      ] as const,
      triangles: [[0, 1, 2]] as const
    };
    const oriented = reliefInternals.orientMeshLikePreview(mesh, 10);
    expect(oriented.vertices).toEqual([
      [2, 10, 1],
      [8, 10, 1],
      [2, 0, 1]
    ]);
    expect(oriented.triangles).toEqual([[0, 2, 1]]);
    const originalNormal = normalForTest(mesh.vertices[0], mesh.vertices[1], mesh.vertices[2]);
    const [oa, ob, oc] = oriented.triangles[0];
    const orientedNormal = normalForTest(oriented.vertices[oa], oriented.vertices[ob], oriented.vertices[oc]);
    expect(orientedNormal[2]).toBeCloseTo(originalNormal[2]);
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

  it("creates product masks for round plates and real hanging holes", () => {
    const circle = reliefInternals.buildProductPixelMask(21, 21, 100, 100, "circle", 0, "top-center");
    expect(circle[10 * 21 + 10]).toBe(true);
    expect(circle[0]).toBe(false);
    expect(circle[20]).toBe(false);
    const withHole = reliefInternals.buildProductPixelMask(101, 101, 100, 100, "rectangle", 8, "top-center");
    expect(withHole[4 * 101 + 50]).toBe(false);
    expect(withHole[50 * 101 + 50]).toBe(true);
  });

  it("curves and mirrors a closed mesh without changing its topology", () => {
    const mesh = reliefInternals.buildWatertightHeightMesh(3, 3, 30, 20, Array(9).fill(3));
    const curved = reliefInternals.transformProductMesh(mesh, 30, 45, false);
    expect(curved.triangles).toEqual(mesh.triangles);
    expect(Math.max(...curved.vertices.map((vertex) => vertex[2]))).toBeGreaterThan(3);
    const mirrored = reliefInternals.transformProductMesh(mesh, 30, 0, true);
    expect(mirrored.vertices[0][0]).toBeCloseTo(30 - mesh.vertices[0][0]);
    expect(mirrored.triangles[0]).toEqual([mesh.triangles[0][0], mesh.triangles[0][2], mesh.triangles[0][1]]);
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
      { widthMm: 20, baseMm: 0.8, reliefMm: 2, resolution: 32, invert: false, profile: "balanced", smoothing: 2, detail: 1, processingMode: "height", sourceColors: [], colors: [], sideColorIndex: 0 },
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

  it("keeps monochrome transparent lettering on one uniform height", () => {
    const rgba = Buffer.from([
      255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 0, 255, 255, 255, 255
    ]);
    const mask = [true, true, false, true];
    const levels = reliefInternals.buildVectorLevels(rgba, mask, 2, 2, false);
    expect(levels).toEqual([1, 1, 0, 1]);
  });

  it("assigns subject cells to the nearest configured filament color", () => {
    const rgba = Buffer.from([
      250, 5, 5, 255, 250, 5, 5, 255,
      5, 5, 250, 255, 5, 5, 250, 255
    ]);
    const assignments = reliefInternals.buildColorCellAssignments(rgba, [true], 2, 2, ["#FF0000", "#0000FF"]);
    expect(assignments).toEqual([0]);
  });

  it("writes separate colored objects and materials into a 3MF", async () => {
    const first = reliefInternals.buildWatertightHeightMesh(2, 2, 10, 10, [2, 2, 2, 2]);
    const second = reliefInternals.buildWatertightHeightMesh(2, 2, 10, 10, [3, 3, 3, 3]);
    const archive = await reliefInternals.encodeThreeMf(first, [
      { mesh: first, color: "#FF0000", name: "AMS 1" },
      { mesh: second, color: "#0000FF", name: "AMS 2" }
    ]);
    const zip = await JSZip.loadAsync(archive);
    const model = await zip.file("3D/3dmodel.model")?.async("string");
    const modelSettings = await zip.file("Metadata/model_settings.config")?.async("string");
    const projectSettings = await zip.file("Metadata/project_settings.config")?.async("string");
    expect(model).toContain('displaycolor="#FF0000FF"');
    expect(model).toContain('displaycolor="#0000FFFF"');
    expect(model).toContain('pid="2" p1="0"');
    expect(model).toContain('pid="2" p1="1"');
    expect(model?.match(/<object /g)).toHaveLength(3);
    expect(model?.match(/<component /g)).toHaveLength(2);
    expect(model?.match(/<item /g)).toHaveLength(1);
    expect(model).toContain('name="AI Print Studio"');
    expect(model).toContain('<metadata name="Title">AI Print Studio</metadata>');
    expect(modelSettings).toContain('<metadata key="name" value="AI Print Studio"/>');
    expect(modelSettings).toContain('<metadata key="extruder" value="1"/>');
    expect(modelSettings).toContain('<metadata key="extruder" value="2"/>');
    expect(JSON.parse(projectSettings ?? "{}").filament_colour).toEqual(["#FF0000", "#0000FF"]);
    expect(JSON.parse(projectSettings ?? "{}").filament_settings_id).toEqual(["AI Print Studio", "AI Print Studio"]);
    expect(JSON.parse(projectSettings ?? "{}").print_settings_id).toBe("AI Print Studio");
    expect(JSON.parse(projectSettings ?? "{}").nozzle_diameter).toEqual(["0.4"]);
    expect(JSON.parse(projectSettings ?? "{}").printer_settings_id).toBe("AI Print Studio · 0.4 mm");
  });

  it("widens thin wordmark pixels for a standard 0.4 mm nozzle", () => {
    const mask = Array(9 * 9).fill(false) as boolean[];
    mask[4 * 9 + 4] = true;
    const expanded = reliefInternals.expandPixelMask(mask, 9, 9, 2);
    expect(expanded.filter(Boolean)).toHaveLength(13);
    expect(expanded[4 * 9 + 2]).toBe(true);
    expect(expanded[2 * 9 + 4]).toBe(true);
    expect(expanded[2 * 9 + 2]).toBe(false);
  });

  it("merges high-resolution color meshes without overflowing the call stack", () => {
    const vertexCount = 180_000;
    const first = {
      vertices: Array.from({ length: vertexCount }, (_, index) => [index, 0, 0] as const),
      triangles: Array.from({ length: vertexCount - 2 }, (_, index) => [index, index + 1, index + 2] as const)
    };
    const merged = reliefInternals.mergeMeshes([first, first]);
    expect(merged.vertices).toHaveLength(vertexCount * 2);
    expect(merged.triangles).toHaveLength((vertexCount - 2) * 2);
    expect(merged.triangles[vertexCount - 2][0]).toBe(vertexCount);
  });

  it("uses one filament for all side walls and thin color skins on top", () => {
    const colored = reliefInternals.buildColoredMeshes(
      3, 3, 20, 20, Array(9).fill(5), Array(4).fill(true),
      [0, 1, 0, 1], ["#000000", "#FF0000"], 0
    );
    const sideBody = colored.find((part) => part.color === "#000000");
    const redSkin = colored.find((part) => part.color === "#FF0000");
    expect(sideBody?.mesh.vertices.some((vertex) => vertex[2] === 0)).toBe(true);
    expect(redSkin?.mesh.vertices.every((vertex) => vertex[2] >= 4.6)).toBe(true);
    expect(Math.max(...(redSkin?.mesh.vertices.map((vertex) => vertex[2]) ?? []))).toBeCloseTo(5);
  });

  it("removes isolated raised cells from the outer rim of stepped logos", () => {
    const columns = 8, rows = 8;
    const cellColumns = columns - 1, cellRows = rows - 1;
    const mask = Array(cellColumns * cellRows).fill(true) as boolean[];
    const heights = Array(cellColumns * cellRows).fill(1.6);
    heights[0 * cellColumns + 3] = 5.6;
    heights[3 * cellColumns + 0] = 5.6;
    heights[6 * cellColumns + 5] = 5.6;
    heights[3 * cellColumns + 3] = 5.6;

    const flattened = reliefInternals.flattenSteppedOuterRim(heights, mask, columns, rows, 2);

    expect(flattened[0 * cellColumns + 3]).toBe(1.6);
    expect(flattened[3 * cellColumns + 0]).toBe(1.6);
    expect(flattened[6 * cellColumns + 5]).toBe(1.6);
    expect(flattened[3 * cellColumns + 3]).toBe(5.6);
  });

  it("assigns every outer and color-transition edge to the configured side color", () => {
    const columns = 7, rows = 7;
    const mask = Array((columns - 1) * (rows - 1)).fill(true) as boolean[];
    const assignments = mask.map((_, index) => {
      const x = index % (columns - 1), y = Math.floor(index / (columns - 1));
      return x >= 1 && x <= 4 && y >= 1 && y <= 4 ? 1 : 2;
    });
    const stabilized = reliefInternals.enforceUniformEdgeColor(assignments, mask, columns, rows, 0);
    const at = (values: number[], x: number, y: number) => x < 0 || y < 0 || x >= columns - 1 || y >= rows - 1 ? -1 : values[y * (columns - 1) + x];
    for (let y = 0; y < rows - 1; y += 1) for (let x = 0; x < columns - 1; x += 1) {
      const original = at(assignments, x, y);
      const transition = [at(assignments, x - 1, y), at(assignments, x + 1, y), at(assignments, x, y - 1), at(assignments, x, y + 1)].some((neighbor) => neighbor !== original);
      if (transition) expect(at(stabilized, x, y)).toBe(0);
    }
    expect(stabilized.filter((color) => color === 1).length).toBeGreaterThan(0);
    expect(stabilized.filter((color) => color === 0).length).toBeGreaterThan(0);
  });

  it("keeps simplified preview sides in the configured side color", () => {
    const columns = 304, rows = 12;
    const cellMask = Array((columns - 1) * (rows - 1)).fill(true) as boolean[];
    const assignments = cellMask.map(() => 1);
    const preview = reliefInternals.buildPreviewSurface(
      columns,
      rows,
      100,
      40,
      Array(columns * rows).fill(5),
      cellMask,
      assignments,
      ["#000000", "#FF0000"],
      0
    );
    const black = preview.colorParts.find((part) => part.color === "#000000");
    const red = preview.colorParts.find((part) => part.color === "#FF0000");
    expect(black?.indices).toContain(0);
    expect(black?.indices.length).toBeGreaterThan(0);
    expect(red?.indices.length).toBeGreaterThan(0);
  });

  it("shows a multicolor wordmark grounded at its exact configured height", () => {
    const columns = 5, rows = 5;
    const cellMask = Array((columns - 1) * (rows - 1)).fill(true) as boolean[];
    const assignments = cellMask.map((_, index) => index % 2);
    const preview = reliefInternals.buildPreviewSurface(
      columns,
      rows,
      40,
      40,
      Array(columns * rows).fill(4),
      cellMask,
      assignments,
      ["#315979", "#8492A4"],
      0,
      true
    );
    const yCoordinates = preview.positions.filter((_, index) => index % 3 === 1);
    expect(Math.min(...yCoordinates)).toBe(0);
    expect(Math.max(...yCoordinates)).toBe(4);
    expect(preview.colorParts).toHaveLength(2);
    expect(preview.colorParts.every((part) => part.indices.length > 0)).toBe(true);
  });

  it("keeps the emblem underside filled with only the carrier color visible", () => {
    const columns = 6, rows = 6;
    const cellMask = Array((columns - 1) * (rows - 1)).fill(true) as boolean[];
    const assignments = cellMask.map((_, index) => index % 3);
    const preview = reliefInternals.buildPreviewSurface(
      columns,
      rows,
      50,
      50,
      Array(columns * rows).fill(5.6),
      cellMask,
      assignments,
      ["#111111", "#FF2020", "#FFFFFF"],
      0,
      true
    );
    const carrier = preview.colorParts.find((part) => part.color === "#111111");
    expect(carrier).toBeDefined();
    const carrierHeights = (carrier?.indices ?? []).map((index) => preview.positions[index * 3 + 1]);
    expect(carrierHeights).toContain(0);
    for (const part of preview.colorParts.filter((entry) => entry.color !== "#111111")) {
      const highestByPosition = new Map<string, number>();
      for (let vertex = 0; vertex < preview.positions.length / 3; vertex += 1) {
        const x = preview.positions[vertex * 3], y = preview.positions[vertex * 3 + 1], z = preview.positions[vertex * 3 + 2];
        const key = `${x.toFixed(6)}:${z.toFixed(6)}`;
        highestByPosition.set(key, Math.max(highestByPosition.get(key) ?? Number.NEGATIVE_INFINITY, y));
      }
      for (let index = 0; index < part.indices.length; index += 3) {
        const a = part.indices[index], b = part.indices[index + 1], c = part.indices[index + 2];
        const ax = preview.positions[a * 3], ay = preview.positions[a * 3 + 1], az = preview.positions[a * 3 + 2];
        const bx = preview.positions[b * 3], by = preview.positions[b * 3 + 1], bz = preview.positions[b * 3 + 2];
        const cx = preview.positions[c * 3], cy = preview.positions[c * 3 + 1], cz = preview.positions[c * 3 + 2];
        expect(Math.min(ay, by, cy)).toBeGreaterThan(0);
        for (const [x, y, z] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]]) {
          expect(y).toBeCloseTo(highestByPosition.get(`${x.toFixed(6)}:${z.toFixed(6)}`) ?? y);
        }
      }
    }
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

  it("smooths a pixelated circular outline into an even radius", () => {
    const columns = 25, rows = 25;
    const cells = Array((columns - 1) * (rows - 1)).fill(false) as boolean[];
    const center = (columns - 1) / 2;
    for (let y = 0; y < rows - 1; y += 1) for (let x = 0; x < columns - 1; x += 1) {
      const dx = x + 0.5 - center, dy = y + 0.5 - center;
      cells[y * (columns - 1) + x] = Math.hypot(dx, dy) <= 9;
    }
    const positions = reliefInternals.buildSmoothedBoundaryPositions(columns, rows, 24, 24, cells);
    const radii = [...positions.values()].map(([x, y]) => Math.hypot(x - 12, y - 12));
    const average = radii.reduce((sum, radius) => sum + radius, 0) / radii.length;
    const deviation = Math.sqrt(radii.reduce((sum, radius) => sum + (radius - average) ** 2, 0) / radii.length);
    expect(radii.length).toBeGreaterThan(40);
    expect(deviation).toBeLessThan(0.1);
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

  it("shows monochrome text previews as grounded solids", () => {
    const columns = 4, rows = 4;
    const preview = reliefInternals.buildPreviewSurface(
      columns,
      rows,
      30,
      30,
      Array(columns * rows).fill(5),
      Array((columns - 1) * (rows - 1)).fill(true),
      undefined,
      [],
      0,
      true
    );
    const heights = preview.positions.filter((_, index) => index % 3 === 1);
    expect(new Set(heights)).toEqual(new Set([0, 5]));
    expect(preview.indices.length).toBeGreaterThan((columns - 1) * (rows - 1) * 6);
  });

  it("builds a high-resolution preview without overflowing the call stack", () => {
    const columns = 384, rows = 442;
    const heights = Array(columns * rows).fill(2.5);
    heights[0] = 1.6;
    const preview = reliefInternals.buildPreviewSurface(columns, rows, 100, 115, heights);
    expect(preview.positions.length).toBeGreaterThan(0);
    expect(preview.indices.length).toBeGreaterThan(0);
  });

  it("keeps the full logo resolution in the preview for smooth round edges", () => {
    const columns = 512, rows = 512;
    const heights = Array(columns * rows).fill(5.6);
    const preview = reliefInternals.buildPreviewSurface(
      columns,
      rows,
      100,
      100,
      heights,
      Array((columns - 1) * (rows - 1)).fill(true),
      undefined,
      [],
      0,
      true
    );
    expect(preview.positions).toHaveLength(columns * rows * 2 * 3);
  });

  it("creates a level top surface for antialiased monochrome text", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-print-flat-text-test-"));
    try {
      const imagePath = join(directory, "text.png");
      const pixels = Buffer.alloc(32 * 16 * 4);
      for (let y = 3; y < 13; y += 1) for (let x = 4; x < 28; x += 1) {
        const offset = (y * 32 + x) * 4;
        pixels[offset] = 255; pixels[offset + 1] = 255; pixels[offset + 2] = 255;
        pixels[offset + 3] = x === 4 || x === 27 || y === 3 || y === 12 ? 128 : 255;
      }
      await writeFile(imagePath, await sharp(pixels, { raw: { width: 32, height: 16, channels: 4 } }).png().toBuffer());
      const result = await createRelief(imagePath, directory, {
        widthMm: 80, baseMm: 1.6, reliefMm: 4, resolution: 64, invert: false,
        profile: "logo", smoothing: 1, detail: 1, processingMode: "vector"
      });
      const usedVertices = new Set(result.preview.indices);
      const topHeights = new Set([...usedVertices].map((index) => result.preview.positions[index * 3 + 1]));
      expect(topHeights).toEqual(new Set([0, 5.6]));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps a sparse multicolor word logo level instead of creating height spikes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-print-wordmark-test-"));
    try {
      const imagePath = join(directory, "wordmark.png");
      const svg = Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="320" height="160">
          <rect width="320" height="160" fill="white"/>
          <path d="M35 55 C70 10 95 85 140 40 C170 18 205 52 250 42" fill="none" stroke="#315979" stroke-width="7"/>
          <text x="35" y="105" font-family="Helvetica" font-size="40" fill="#8492a4">Frauenärzte</text>
          <text x="120" y="137" font-family="Helvetica" font-size="24" font-style="italic" fill="#315979">im Seenland</text>
        </svg>
      `);
      await writeFile(imagePath, await sharp(svg).png().toBuffer());
      const result = await createRelief(imagePath, directory, {
        widthMm: 100, baseMm: 1.6, reliefMm: 4, resolution: 256, invert: false,
        profile: "logo", smoothing: 2, detail: 1, processingMode: "wordmark",
        sourceColors: [], colors: [], sideColorIndex: 0
      });
      const usedVertices = new Set(result.preview.indices);
      const topHeights = new Set([...usedVertices].map((index) =>
        Number(result.preview.positions[index * 3 + 1].toFixed(4))
      ));
      expect(topHeights).toEqual(new Set([0, 4]));
      expect(Math.max(...topHeights)).toBe(4);
      expect(result.triangleCount).toBeGreaterThan(1_000);
      expect(result.slicer.layerHeightMm).toBe(0.2);
      expect(result.slicer.layerCount).toBe(20);
      expect(result.slicer.estimatedMinutes).toBeGreaterThan(0);
      expect(result.slicer.materialGrams).toBeGreaterThan(0);
      expect(result.slicer.filamentMeters).toBeGreaterThan(0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("exports a word logo background as a flat base with a clearly raised motif", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-print-wordmark-background-test-"));
    try {
      const imagePath = join(directory, "logo.png");
      const svg = Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">
          <rect width="160" height="160" fill="#28313d"/>
          <rect x="28" y="35" width="104" height="40" rx="10" fill="#9eeab4"/>
          <text x="30" y="125" font-family="Helvetica" font-size="35" font-weight="bold" fill="white">AI Print</text>
        </svg>
      `);
      await writeFile(imagePath, await sharp(svg).png().toBuffer());
      const result = await createRelief(imagePath, directory, {
        widthMm: 80, baseMm: 1.6, reliefMm: 4, resolution: 128, invert: false,
        profile: "logo", smoothing: 2, detail: 1, processingMode: "wordmark",
        includeBackground: true, sourceColors: [], colors: [], sideColorIndex: 0
      });
      const usedVertices = new Set(result.preview.indices);
      const heights = new Set([...usedVertices].map((index) =>
        Number(result.preview.positions[index * 3 + 1].toFixed(4))
      ));
      expect(heights).toEqual(new Set([0, 1.6, 5.6]));
      expect(result.preview.positions.some((_, index) => index % 3 === 1 && result.preview.positions[index] === 1.6)).toBe(true);
      expect(result.preview.positions.some((_, index) => index % 3 === 1 && result.preview.positions[index] === 5.6)).toBe(true);
      for (let index = 0; index < result.preview.indices.length; index += 3) {
        const vertices = result.preview.indices.slice(index, index + 3).map((vertex) => ({
          x: result.preview.positions[vertex * 3],
          y: result.preview.positions[vertex * 3 + 1],
          z: result.preview.positions[vertex * 3 + 2]
        }));
        const verticalLevels = new Set(vertices.map((vertex) => vertex.y.toFixed(4)));
        const horizontalPositions = new Set(vertices.map((vertex) => `${vertex.x.toFixed(4)}:${vertex.z.toFixed(4)}`));
        if (verticalLevels.size > 1) expect(horizontalPositions.size).toBeLessThanOrEqual(2);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("automatically treats a gradient logo as one printable background relief", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-print-auto-gradient-logo-test-"));
    try {
      const imagePath = join(directory, "gradient-logo.png");
      const svg = Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">
          <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#9aa3ad"/><stop offset="1" stop-color="#252d38"/>
          </linearGradient></defs>
          <rect width="180" height="180" fill="url(#bg)"/>
          <rect x="35" y="35" width="110" height="55" rx="12" fill="#91e2ad"/>
          <text x="28" y="138" font-family="Helvetica" font-size="34" font-weight="bold" fill="white">AI Print</text>
        </svg>
      `);
      await writeFile(imagePath, await sharp(svg).png().toBuffer());
      const result = await createRelief(imagePath, directory, {
        widthMm: 100, baseMm: 1.6, reliefMm: 4, resolution: 128, invert: false,
        profile: "logo", smoothing: 2, detail: 1, processingMode: "auto",
        includeBackground: false, nozzleMm: 0.4, minimumFeatureMm: 0,
        sourceColors: [], colors: [], sideColorIndex: 0
      });
      expect(result.options.includeBackground).toBe(true);
      expect(result.options.minimumFeatureMm).toBe(0.8);
      expect(result.printability.checks.find((check) => check.label === "Zusammenhalt")?.status).toBe("ok");
      expect(result.printability.checks.find((check) => check.label === "Mindestbreite")?.status).toBe("ok");
      const heights = new Set(result.preview.positions.filter((_, index) => index % 3 === 1).map((height) => Number(height.toFixed(4))));
      expect(heights).toEqual(new Set([0, 1.6, 5.6]));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("removes enclosed background from wordmark letters but preserves it for emblems", () => {
    const width = 9, height = 9;
    const rgba = Buffer.alloc(width * height * 4, 255);
    for (let y = 2; y <= 6; y += 1) for (let x = 2; x <= 6; x += 1) {
      if (x === 2 || x === 6 || y === 2 || y === 6) {
        const offset = (y * width + x) * 4;
        rgba[offset] = 55;
        rgba[offset + 1] = 85;
        rgba[offset + 2] = 115;
      }
    }
    const center = 4 * width + 4;
    const emblemMask = reliefInternals.buildSubjectPixelMask(rgba, width, height);
    const wordmarkMask = reliefInternals.buildWordmarkPixelMask(rgba, width, height);
    expect(emblemMask[center]).toBe(true);
    expect(wordmarkMask[center]).toBe(false);
    expect(wordmarkMask[2 * width + 4]).toBe(true);
  });

  it("keeps a smooth logo gradient on the base while raising the foreground", () => {
    const width = 40, height = 40;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const background = Math.round(155 - y / (height - 1) * 115);
      const offset = (y * width + x) * 4;
      rgba[offset] = background;
      rgba[offset + 1] = background + 3;
      rgba[offset + 2] = background + 7;
      rgba[offset + 3] = 255;
    }
    for (let y = 12; y < 28; y += 1) for (let x = 10; x < 30; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 120;
      rgba[offset + 1] = 225;
      rgba[offset + 2] = 170;
    }
    const mask = reliefInternals.buildWordmarkPixelMask(rgba, width, height);
    expect(mask[2 * width + 20]).toBe(false);
    expect(mask[20 * width + 2]).toBe(false);
    expect(mask[37 * width + 20]).toBe(false);
    expect(mask[20 * width + 20]).toBe(true);
  });

  it("does not raise a radial vignette behind a logo", () => {
    const width = 80, height = 80;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const nx = (x - width / 2) / (width / 2);
      const ny = (y - height / 2) / (height / 2);
      const light = Math.round(58 + Math.max(0, 1 - (nx * nx + ny * ny)) * 72);
      const offset = (y * width + x) * 4;
      rgba[offset] = light;
      rgba[offset + 1] = light + 5;
      rgba[offset + 2] = light + 12;
      rgba[offset + 3] = 255;
    }
    for (let y = 28; y < 52; y += 1) for (let x = 25; x < 55; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = 170;
      rgba[offset + 1] = 244;
      rgba[offset + 2] = 195;
    }
    const mask = reliefInternals.buildWordmarkPixelMask(rgba, width, height);
    expect(mask[40 * width + 10]).toBe(false);
    expect(mask[10 * width + 40]).toBe(false);
    expect(mask[65 * width + 40]).toBe(false);
    expect(mask[40 * width + 40]).toBe(true);
  });
});
