import JSZip from "jszip";
import { removeInvalidTriangles } from "./mesh-quality.js";

export type Vec3 = readonly [number, number, number];
export type Triangle = readonly [number, number, number];
export type Mesh = { vertices: Vec3[]; triangles: Triangle[] };
export type ColoredMesh = { mesh: Mesh; color: string; name: string };

export function encodeBinaryStl(mesh: Mesh, title: string): Buffer {
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

export async function encodeThreeMf(
  mesh: Mesh,
  coloredMeshes?: ColoredMesh[],
  canonicalMaterials?: number[],
  canonicalColors?: string[],
  sideColorIndex = 0
): Promise<Buffer> {
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
  const parts = (canonicalMaterials?.length && canonicalColors?.length
    ? canonicalColors.map((color, index) => ({ mesh: { vertices: [], triangles: [] }, color, name: `AMS ${index + 1}` }))
    : coloredMeshes?.length ? coloredMeshes : [{ mesh, color: "#B7F58A", name: "Relief" }])
    .map((part) => ({ ...part, mesh: removeInvalidTriangles(part.mesh) }));
  const palette = parts.filter((part, index) => parts.findIndex(other => other.color.toUpperCase() === part.color.toUpperCase()) === index);
  const materialIndex = parts.map(part => palette.findIndex(other => other.color.toUpperCase() === part.color.toUpperCase()));
  const materialXml = palette.map(({ color, name }) =>
    `<base name="${escapeXml(name)}" displaycolor="${color.toUpperCase()}FF"/>`
  ).join("");
  // Keep a closed mesh: splitting painted surface triangles into parts creates
  // open shells that slicers repair into unwanted through-colored volumes.
  const vertices: Vec3[] = [];
  const coloredTriangles: Array<{ triangle: Triangle; material: number }> = [];
  if (canonicalMaterials?.length === mesh.triangles.length && canonicalColors?.length) {
    for (const vertex of mesh.vertices) vertices.push(vertex);
    mesh.triangles.forEach((triangle, index) => coloredTriangles.push({
      triangle,
      material: materialIndex[Math.max(0, Math.min(canonicalColors.length - 1, canonicalMaterials[index] ?? 0))]
    }));
  } else {
    for (let material = 0; material < parts.length; material += 1) {
      const offset = vertices.length;
      // Kein Spread bei großen Meshes: Schon etwa 100.000 Eckpunkte können
      // sonst die maximale JavaScript-Argumentzahl überschreiten.
      for (const vertex of parts[material].mesh.vertices) vertices.push(vertex);
      for (const [a, b, c] of parts[material].mesh.triangles) {
        coloredTriangles.push({ triangle: [a + offset, b + offset, c + offset], material: materialIndex[material] });
      }
    }
  }
  const vertexXml = vertices.map(([x, y, z]) => `<vertex x="${x.toFixed(5)}" y="${y.toFixed(5)}" z="${z.toFixed(5)}"/>`).join("");
  let minimumZ = Infinity;
  for (const vertex of vertices) minimumZ = Math.min(minimumZ, vertex[2]);
  const triangleXml = coloredTriangles.map(({ triangle: [v1, v2, v3], material }) => {
    // Only upward-facing surfaces carry the motif; back and walls stay in
    // the selected body color, including legacy through-colored meshes.
    const points = [vertices[v1], vertices[v2], vertices[v3]];
    const onBottom = points.every(point => point[2] <= minimumZ + 1e-5);
    const top = !onBottom && normalOf(vertices[v1], vertices[v2], vertices[v3])[2] > 0.85;
    const assigned = top ? material : (materialIndex[sideColorIndex] ?? 0);
    return `<triangle v1="${v1}" v2="${v2}" v3="${v3}" pid="2" p1="${assigned}" paint_color="${encodePaintColor(assigned + 1)}"/>`;
  }).join("");
  const objectId = 3;
  const objectXml = `<object id="${objectId}" type="model" name="AI Print Studio"><mesh><vertices>${vertexXml}</vertices><triangles>${triangleXml}</triangles></mesh></object>`;
  const buildXml = `<item objectid="${objectId}"/>`;
  zip.folder("3D")?.file("3dmodel.model", `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="de-DE" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Application">OrcaSlicer-2.0.0</metadata>
<metadata name="BambuStudio:3mfVersion">1</metadata>
<metadata name="Title">AI Print Studio</metadata>
<metadata name="Description">Druckoptimiert für eine 0,4-mm-Düse</metadata>
<resources><basematerials id="2">${materialXml}</basematerials>${objectXml}</resources>
<build>${buildXml}</build></model>`);
  // Anycubic/Orca require a part record even for a single painted mesh.
  // Omitting it makes a model with project metadata appear to have no geometry.
  zip.file("Metadata/model_settings.config", `<?xml version="1.0" encoding="UTF-8"?>
<config><object id="${objectId}"><metadata key="name" value="AI Print Studio"/><metadata key="extruder" value="${(materialIndex[sideColorIndex] ?? 0) + 1}"/><part id="${objectId}" subtype="normal_part"><metadata key="name" value="Relief"/><metadata key="extruder" value="${(materialIndex[sideColorIndex] ?? 0) + 1}"/></part></object></config>`);
  // Supply the palette only; invented printer/process preset IDs overwrite
  // the user's working profiles and leave the project unprintable.
  zip.file("Metadata/project_settings.config", JSON.stringify({
    filament_colour: palette.map(({ color }) => color.toUpperCase())
  }));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

// TriangleSelector leaf encoding, filament slots are one-based (max 16).
export function encodePaintColor(slot: number): string {
  if (!Number.isInteger(slot) || slot < 1 || slot > 16) {
    throw new Error("3MF-Farbdruck unterstützt 1 bis 16 Filamentplätze.");
  }
  return slot < 3 ? (slot * 4).toString(16).toUpperCase() : `${(slot - 3).toString(16).toUpperCase()}C`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[character] ?? character);
}

export function normalOf(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

export function estimateMeshVolume(mesh: Mesh): number {
  let signed = 0;
  for (const [aIndex, bIndex, cIndex] of mesh.triangles) {
    const a = mesh.vertices[aIndex], b = mesh.vertices[bIndex], c = mesh.vertices[cIndex];
    signed += (
      a[0] * (b[1] * c[2] - b[2] * c[1])
      - a[1] * (b[0] * c[2] - b[2] * c[0])
      + a[2] * (b[0] * c[1] - b[1] * c[0])
    ) / 6;
  }
  return Math.abs(signed);
}

export function sanitizeStem(stem: string): string {
  return stem.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "modell";
}
