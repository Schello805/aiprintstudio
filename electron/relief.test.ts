import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import JSZip from "jszip";
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
    expect(redSkin?.mesh.vertices.every((vertex) => vertex[2] >= 5)).toBe(true);
    expect(Math.max(...(redSkin?.mesh.vertices.map((vertex) => vertex[2]) ?? []))).toBeCloseTo(5.4);
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

  it("keeps monochrome text previews perfectly level up to their boundary", () => {
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
    expect(new Set(heights)).toEqual(new Set([5]));
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
    expect(preview.positions).toHaveLength(columns * rows * 3);
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
      expect(topHeights).toEqual(new Set([5.6]));
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
        profile: "logo", smoothing: 2, detail: 1, processingMode: "vector",
        sourceColors: [], colors: [], sideColorIndex: 0
      });
      const usedVertices = new Set(result.preview.indices);
      const topHeights = new Set([...usedVertices].map((index) =>
        Number(result.preview.positions[index * 3 + 1].toFixed(4))
      ));
      expect(topHeights).toEqual(new Set([5.6]));
      expect(result.triangleCount).toBeGreaterThan(1_000);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
