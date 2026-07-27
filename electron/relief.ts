import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import JSZip from "jszip";
import sharp from "sharp";

export type ReliefOptions = {
  widthMm: number;
  baseMm: number;
  reliefMm: number;
  resolution: number;
  invert: boolean;
  profile: "fast" | "balanced" | "fine" | "photo" | "logo";
  smoothing: number;
  detail: number;
};

export type PrintabilityReport = {
  score: number;
  status: "ready" | "warning" | "critical";
  issues: string[];
  estimatedVolumeCm3: number;
};

export type ReliefResult = {
  stlPath: string;
  threeMfPath: string;
  vertexCount: number;
  triangleCount: number;
  widthMm: number;
  heightMm: number;
  options: ReliefOptions;
  printability: PrintabilityReport;
  heightmapDataUrl: string;
  preview: {
    positions: number[];
    indices: number[];
  };
};

type Vec3 = readonly [number, number, number];
type Triangle = readonly [number, number, number];
type Mesh = { vertices: Vec3[]; triangles: Triangle[] };

const safeDefaults: ReliefOptions = {
  widthMm: 100,
  baseMm: 1.6,
  reliefMm: 4,
  resolution: 256,
  invert: false,
  profile: "balanced",
  smoothing: 2,
  detail: 1
};

export async function createRelief(
  imagePath: string,
  outputDirectory: string,
  requested: Partial<ReliefOptions> = {}
): Promise<ReliefResult> {
  const options = validateOptions({ ...safeDefaults, ...requested });
  const metadata = await sharp(imagePath).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Das Bild besitzt keine gültigen Abmessungen.");

  const aspect = metadata.height / metadata.width;
  const gridWidth = options.resolution;
  const gridHeight = Math.max(16, Math.round(options.resolution * aspect));
  const prepared = sharp(imagePath)
    .rotate()
    .resize(gridWidth, gridHeight, { fit: "fill" })
    .ensureAlpha();
  const { data: rgba } = await prepared.clone()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const subjectPixels = cleanSubjectPixelMask(buildSubjectPixelMask(rgba, gridWidth, gridHeight), gridWidth, gridHeight);
  const cellMask = buildCellMask(subjectPixels, gridWidth, gridHeight);
  const { data } = await prepared
    .flatten({ background: "#ffffff" })
    .grayscale()
    .blur(profileSettings(options.profile).inputBlur)
    .normalize({ lower: 1, upper: 99 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const heightMm = options.widthMm * gridHeight / gridWidth;
  const profile = profileSettings(options.profile);
  const rawLevels = Array.from(data, (value) => {
    const luminance = value / 255;
    const normalized = options.invert ? luminance : 1 - luminance;
    return Math.max(0, Math.min(1, (Math.pow(normalized, profile.gamma) - 0.5) * profile.contrast + 0.5));
  });
  const smoothed = smoothHeightField(rawLevels, gridWidth, gridHeight, options.smoothing);
  const detailed = smoothed.map((value, index) =>
    Math.max(0, Math.min(1, value + (rawLevels[index] - value) * options.detail * profile.detail))
  );
  const profiledLevels = profile.steps ? detailed.map((value) => Math.round(value * profile.steps) / profile.steps) : detailed;
  // Eine flache Konturzone verhindert, dass antialiaste Randpixel als hohe,
  // sägezahnartige Außenwand im Mesh erscheinen.
  const levels = applyBoundaryRim(profiledLevels, subjectPixels, gridWidth, gridHeight, options.profile === "logo" ? 2 : 1);
  const heights = levels.map((value) => options.baseMm + value * options.reliefMm);
  const mesh = buildWatertightHeightMesh(gridWidth, gridHeight, options.widthMm, heightMm, heights, cellMask);
  const preview = buildPreviewSurface(gridWidth, gridHeight, options.widthMm, heightMm, heights, cellMask);
  const printability = analysePrintability(mesh, heights, options, cellMask, gridWidth);
  const heightmapPng = await sharp(Buffer.from(levels.map((value) => Math.round(value * 255))), {
    raw: { width: gridWidth, height: gridHeight, channels: 1 }
  }).png().toBuffer();

  await mkdir(outputDirectory, { recursive: true });
  const stem = sanitizeStem(basename(imagePath, extname(imagePath)));
  const stlPath = join(outputDirectory, `${stem}-relief.stl`);
  const threeMfPath = join(outputDirectory, `${stem}-relief.3mf`);
  await Promise.all([
    writeFile(stlPath, encodeBinaryStl(mesh, "AI Print Studio Relief")),
    writeFile(threeMfPath, await encodeThreeMf(mesh))
  ]);

  return {
    stlPath,
    threeMfPath,
    vertexCount: mesh.vertices.length,
    triangleCount: mesh.triangles.length,
    widthMm: options.widthMm,
    heightMm,
    options,
    printability,
    heightmapDataUrl: `data:image/png;base64,${heightmapPng.toString("base64")}`,
    preview
  };
}

function validateOptions(options: ReliefOptions): ReliefOptions {
  if (options.widthMm < 20 || options.widthMm > 300) throw new Error("Die Breite muss zwischen 20 und 300 mm liegen.");
  if (options.baseMm < 0.8 || options.baseMm > 10) throw new Error("Die Grundplatte muss zwischen 0,8 und 10 mm liegen.");
  if (options.reliefMm < 0.5 || options.reliefMm > 20) throw new Error("Die Reliefhöhe muss zwischen 0,5 und 20 mm liegen.");
  if (options.resolution < 32 || options.resolution > 512) throw new Error("Die Auflösung muss zwischen 32 und 512 liegen.");
  if (!["fast", "balanced", "fine", "photo", "logo"].includes(options.profile)) throw new Error("Unbekanntes Qualitätsprofil.");
  if (options.smoothing < 0 || options.smoothing > 5) throw new Error("Die Glättung muss zwischen 0 und 5 liegen.");
  if (options.detail < 0 || options.detail > 2) throw new Error("Die Detailstärke muss zwischen 0 und 2 liegen.");
  return options;
}

function profileSettings(profile: ReliefOptions["profile"]) {
  return {
    fast: { inputBlur: 0.3, gamma: 1, contrast: 1.12, detail: 0.5, steps: 24 },
    balanced: { inputBlur: 0.45, gamma: 0.95, contrast: 1.16, detail: 0.8, steps: 48 },
    fine: { inputBlur: 0.35, gamma: 0.92, contrast: 1.12, detail: 1.1, steps: 0 },
    photo: { inputBlur: 0.7, gamma: 0.82, contrast: 1.02, detail: 0.45, steps: 0 },
    logo: { inputBlur: 0.3, gamma: 1, contrast: 1.35, detail: 1.25, steps: 16 }
  }[profile];
}

function smoothHeightField(values: number[], width: number, height: number, passes: number): number[] {
  let current = values.slice();
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const center = current[i];
      let sum = center * 4, weight = 4;
      for (const neighbor of [i - 1, i + 1, i - width, i + width]) {
        const edgeWeight = Math.abs(current[neighbor] - center) < 0.12 ? 1 : 0.15;
        sum += current[neighbor] * edgeWeight; weight += edgeWeight;
      }
      next[i] = sum / weight;
    }
    current = next;
  }
  return current;
}

function analysePrintability(mesh: Mesh, heights: number[], options: ReliefOptions, cellMask: boolean[], columns: number): PrintabilityReport {
  const issues: string[] = [];
  let score = 100;
  if (options.baseMm < 1.2) { issues.push("Grundplatte dünner als 1,2 mm."); score -= 25; }
  const pixelMm = options.widthMm / Math.max(1, columns - 1);
  let steepEdges = 0;
  for (let i = 1; i < heights.length; i += 1) {
    if (i % columns !== 0 && Math.abs(heights[i] - heights[i - 1]) / pixelMm > 2) steepEdges += 1;
  }
  if (steepEdges / Math.max(1, heights.length) > 0.08) { issues.push("Viele steile Übergänge können Details unsauber drucken."); score -= 20; }
  if (mesh.triangles.length > 800_000) { issues.push("Sehr großes Mesh – der Slicer kann länger benötigen."); score -= 5; }
  if (cellMask.filter(Boolean).length < 4) { issues.push("Das erkannte Motiv ist zu klein oder unvollständig."); score -= 45; }
  const areaMm2 = cellMask.filter(Boolean).length * pixelMm * pixelMm;
  const averageHeight = heights.reduce((sum, height) => sum + height, 0) / Math.max(1, heights.length);
  const boundedScore = Math.max(0, score);
  return {
    score: boundedScore,
    status: boundedScore >= 80 ? "ready" : boundedScore >= 55 ? "warning" : "critical",
    issues: issues.length ? issues : ["Keine offensichtlichen Druckprobleme erkannt."],
    estimatedVolumeCm3: areaMm2 * averageHeight / 1000
  };
}

function buildWatertightHeightMesh(
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  heights: number[],
  cellMask?: boolean[]
): Mesh {
  const vertices: Vec3[] = [];
  const triangles: Triangle[] = [];
  const index = (x: number, y: number) => y * columns + x;
  const cells = cellMask ?? Array((columns - 1) * (rows - 1)).fill(true);
  const isCell = (x: number, y: number) => x >= 0 && y >= 0 && x < columns - 1 && y < rows - 1 && cells[y * (columns - 1) + x];
  const topVertices = new Map<number, number>();
  const bottomVertices = new Map<number, number>();
  const vertexFor = (gridIndex: number, bottom: boolean) => {
    const map = bottom ? bottomVertices : topVertices;
    const existing = map.get(gridIndex);
    if (existing !== undefined) return existing;
    const x = gridIndex % columns, y = Math.floor(gridIndex / columns);
    const created = vertices.length;
    vertices.push([
      x * widthMm / (columns - 1),
      y * heightMm / (rows - 1),
      bottom ? 0 : heights[gridIndex]
    ]);
    map.set(gridIndex, created);
    return created;
  };
  const addWall = (gridA: number, gridB: number) => {
    const topA = vertexFor(gridA, false), topB = vertexFor(gridB, false);
    const bottomA = vertexFor(gridA, true), bottomB = vertexFor(gridB, true);
    triangles.push([topA, bottomB, topB], [topA, bottomA, bottomB]);
  };

  for (let y = 0; y < rows - 1; y += 1) {
    for (let x = 0; x < columns - 1; x += 1) {
      if (!isCell(x, y)) continue;
      const ga = index(x, y), gb = index(x + 1, y), gc = index(x, y + 1), gd = index(x + 1, y + 1);
      const a = vertexFor(ga, false), b = vertexFor(gb, false), c = vertexFor(gc, false), d = vertexFor(gd, false);
      const ba = vertexFor(ga, true), bb = vertexFor(gb, true), bc = vertexFor(gc, true), bd = vertexFor(gd, true);
      triangles.push([a, b, d], [a, d, c], [ba, bd, bb], [ba, bc, bd]);
      if (!isCell(x, y - 1)) addWall(ga, gb);
      if (!isCell(x + 1, y)) addWall(gb, gd);
      if (!isCell(x, y + 1)) addWall(gd, gc);
      if (!isCell(x - 1, y)) addWall(gc, ga);
    }
  }
  return { vertices, triangles };
}

function buildSubjectPixelMask(rgba: Buffer, width: number, height: number): boolean[] {
  const pixelCount = width * height;
  let hasTransparency = false;
  for (let i = 0; i < pixelCount; i += 1) {
    if (rgba[i * 4 + 3] < 245) { hasTransparency = true; break; }
  }
  if (hasTransparency) {
    return Array.from({ length: pixelCount }, (_, i) => rgba[i * 4 + 3] >= 64);
  }

  const corners = [0, width - 1, (height - 1) * width, pixelCount - 1];
  const background = [0, 1, 2].map((channel) =>
    corners.reduce((sum, pixel) => sum + rgba[pixel * 4 + channel], 0) / corners.length
  );
  const closeToBackground = (pixel: number) => {
    const offset = pixel * 4;
    return Math.hypot(
      rgba[offset] - background[0],
      rgba[offset + 1] - background[1],
      rgba[offset + 2] - background[2]
    ) < 52;
  };
  const outside = new Uint8Array(pixelCount);
  const queue: number[] = [];
  const enqueue = (pixel: number) => {
    if (!outside[pixel] && closeToBackground(pixel)) {
      outside[pixel] = 1;
      queue.push(pixel);
    }
  };
  for (let x = 0; x < width; x += 1) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { enqueue(y * width); enqueue(y * width + width - 1); }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor], x = pixel % width, y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }
  return Array.from({ length: pixelCount }, (_, i) => outside[i] === 0);
}

function buildCellMask(pixels: boolean[], columns: number, rows: number): boolean[] {
  const cells: boolean[] = [];
  for (let y = 0; y < rows - 1; y += 1) {
    for (let x = 0; x < columns - 1; x += 1) {
      const a = y * columns + x;
      const occupied = Number(pixels[a]) + Number(pixels[a + 1]) + Number(pixels[a + columns]) + Number(pixels[a + columns + 1]);
      cells.push(occupied >= 2);
    }
  }
  return cells;
}

function cleanSubjectPixelMask(pixels: boolean[], width: number, height: number): boolean[] {
  let current = pixels.slice();
  for (let pass = 0; pass < 2; pass += 1) {
    const next = current.slice();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let occupied = 0;
        for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox, ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && current[ny * width + nx]) occupied += 1;
        }
        next[y * width + x] = occupied >= 5;
      }
    }
    current = next;
  }
  return current;
}

function applyBoundaryRim(levels: number[], mask: boolean[], width: number, height: number, radius: number): number[] {
  const next = levels.slice();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) { next[index] = 0; continue; }
      let boundary = false;
      for (let oy = -radius; oy <= radius && !boundary; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
            boundary = true; break;
          }
        }
      }
      if (boundary) next[index] = 0;
    }
  }
  return next;
}

function encodeBinaryStl(mesh: Mesh, title: string): Buffer {
  const buffer = Buffer.alloc(84 + mesh.triangles.length * 50);
  buffer.write(title.slice(0, 80), 0, "ascii");
  buffer.writeUInt32LE(mesh.triangles.length, 80);
  let offset = 84;
  for (const triangle of mesh.triangles) {
    const a = mesh.vertices[triangle[0]], b = mesh.vertices[triangle[1]], c = mesh.vertices[triangle[2]];
    const normal = normalOf(a, b, c);
    for (const value of [...normal, ...a, ...b, ...c]) {
      buffer.writeFloatLE(value, offset);
      offset += 4;
    }
    buffer.writeUInt16LE(0, offset);
    offset += 2;
  }
  return buffer;
}

async function encodeThreeMf(mesh: Mesh): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`);
  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`);
  const vertexXml = mesh.vertices.map(([x, y, z]) => `<vertex x="${x.toFixed(5)}" y="${y.toFixed(5)}" z="${z.toFixed(5)}"/>`).join("");
  const triangleXml = mesh.triangles.map(([v1, v2, v3]) => `<triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`).join("");
  zip.folder("3D")?.file("3dmodel.model", `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">AI Print Studio Relief</metadata>
<resources><object id="1" type="model"><mesh><vertices>${vertexXml}</vertices><triangles>${triangleXml}</triangles></mesh></object></resources>
<build><item objectid="1"/></build></model>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

function normalOf(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function sanitizeStem(stem: string): string {
  return stem.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "modell";
}

function buildPreviewSurface(
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  heights: number[],
  cellMask?: boolean[]
): { positions: number[]; indices: number[] } {
  const stride = Math.max(1, Math.ceil(Math.max(columns, rows) / 110));
  const xs = Array.from(new Set([...Array(Math.ceil((columns - 1) / stride) + 1)].map((_, i) => Math.min(i * stride, columns - 1))));
  const ys = Array.from(new Set([...Array(Math.ceil((rows - 1) / stride) + 1)].map((_, i) => Math.min(i * stride, rows - 1))));
  const positions: number[] = [];
  const indices: number[] = [];
  for (const y of ys) {
    for (const x of xs) {
      positions.push(
        x * widthMm / (columns - 1) - widthMm / 2,
        heights[y * columns + x],
        y * heightMm / (rows - 1) - heightMm / 2
      );
    }
  }
  const previewColumns = xs.length;
  for (let y = 0; y < ys.length - 1; y += 1) {
    for (let x = 0; x < xs.length - 1; x += 1) {
      if (cellMask) {
        const sourceX = Math.min(xs[x], columns - 2);
        const sourceY = Math.min(ys[y], rows - 2);
        if (!cellMask[sourceY * (columns - 1) + sourceX]) continue;
      }
      const a = y * previewColumns + x;
      const b = a + 1;
      const c = a + previewColumns;
      const d = c + 1;
      indices.push(a, d, b, a, c, d);
    }
  }
  return { positions, indices };
}

export const reliefInternals = {
  buildCellMask, buildSubjectPixelMask, cleanSubjectPixelMask, applyBoundaryRim,
  buildWatertightHeightMesh, buildPreviewSurface, encodeBinaryStl,
  smoothHeightField, analysePrintability, profileSettings
};
