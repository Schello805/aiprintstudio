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
};

export type ReliefResult = {
  stlPath: string;
  threeMfPath: string;
  vertexCount: number;
  triangleCount: number;
  widthMm: number;
  heightMm: number;
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
  invert: false
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
  const { data } = await sharp(imagePath)
    .rotate()
    .resize(gridWidth, gridHeight, { fit: "fill" })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .normalize({ lower: 1, upper: 99 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const heightMm = options.widthMm * gridHeight / gridWidth;
  const heights = Array.from(data, (value) => {
    const luminance = value / 255;
    const normalized = options.invert ? luminance : 1 - luminance;
    const contrasted = Math.max(0, Math.min(1, (normalized - 0.5) * 1.18 + 0.5));
    const stepped = Math.round(contrasted * 31) / 31;
    return options.baseMm + stepped * options.reliefMm;
  });
  const mesh = buildWatertightHeightMesh(gridWidth, gridHeight, options.widthMm, heightMm, heights);
  const preview = buildPreviewSurface(gridWidth, gridHeight, options.widthMm, heightMm, heights);

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
    preview
  };
}

function validateOptions(options: ReliefOptions): ReliefOptions {
  if (options.widthMm < 20 || options.widthMm > 300) throw new Error("Die Breite muss zwischen 20 und 300 mm liegen.");
  if (options.baseMm < 0.8 || options.baseMm > 10) throw new Error("Die Grundplatte muss zwischen 0,8 und 10 mm liegen.");
  if (options.reliefMm < 0.5 || options.reliefMm > 20) throw new Error("Die Reliefhöhe muss zwischen 0,5 und 20 mm liegen.");
  if (options.resolution < 32 || options.resolution > 256) throw new Error("Die Auflösung muss zwischen 32 und 256 liegen.");
  return options;
}

function buildWatertightHeightMesh(
  columns: number,
  rows: number,
  widthMm: number,
  heightMm: number,
  heights: number[]
): Mesh {
  const vertices: Vec3[] = [];
  const triangles: Triangle[] = [];
  const index = (x: number, y: number) => y * columns + x;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      vertices.push([
        x * widthMm / (columns - 1),
        y * heightMm / (rows - 1),
        heights[index(x, y)]
      ]);
    }
  }

  const bottomOffset = vertices.length;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      vertices.push([x * widthMm / (columns - 1), y * heightMm / (rows - 1), 0]);
    }
  }

  for (let y = 0; y < rows - 1; y += 1) {
    for (let x = 0; x < columns - 1; x += 1) {
      const a = index(x, y), b = index(x + 1, y), c = index(x, y + 1), d = index(x + 1, y + 1);
      triangles.push([a, b, d], [a, d, c]);
      triangles.push([bottomOffset + a, bottomOffset + d, bottomOffset + b], [bottomOffset + a, bottomOffset + c, bottomOffset + d]);
    }
  }

  const addWall = (topA: number, topB: number) => {
    const bottomA = bottomOffset + topA, bottomB = bottomOffset + topB;
    triangles.push([topA, bottomB, topB], [topA, bottomA, bottomB]);
  };
  for (let x = 0; x < columns - 1; x += 1) {
    addWall(index(x + 1, 0), index(x, 0));
    addWall(index(x, rows - 1), index(x + 1, rows - 1));
  }
  for (let y = 0; y < rows - 1; y += 1) {
    addWall(index(0, y), index(0, y + 1));
    addWall(index(columns - 1, y + 1), index(columns - 1, y));
  }
  return { vertices, triangles };
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
  heights: number[]
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
      const a = y * previewColumns + x;
      const b = a + 1;
      const c = a + previewColumns;
      const d = c + 1;
      indices.push(a, d, b, a, c, d);
    }
  }
  return { positions, indices };
}

export const reliefInternals = { buildWatertightHeightMesh, buildPreviewSurface, encodeBinaryStl };
