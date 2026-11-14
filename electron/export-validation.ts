import { inspectThreeMf } from "./three-mf-validation.js";
import { validateMeshGeometry } from "./mesh-quality.js";
import type { Mesh } from "./relief-export.js";

export type ExportValidation = { valid: boolean; errors: string[]; triangleCount: number };
export const maximumExportTriangles = 250_000;
export const maximumExportBytes = 25_000_000;

export function exportFitsLimits(validation: ExportValidation, byteLength: number): boolean {
  return validation.valid && validation.triangleCount <= maximumExportTriangles && byteLength <= maximumExportBytes;
}

export async function validateGeneratedExportBuffer(extension: ".stl" | ".3mf", data: Buffer): Promise<ExportValidation> {
  const errors: string[] = [];
  if (extension === ".stl") {
    if (data.length < 84) return { valid: false, errors: ["STL-Datei ist unvollständig."], triangleCount: 0 };
    const triangleCount = data.readUInt32LE(80);
    if (triangleCount < 1) errors.push("STL enthält keine Dreiecke.");
    if (data.length !== 84 + triangleCount * 50) errors.push("STL-Länge stimmt nicht mit der Dreiecksangabe überein.");
    const inspected = Math.min(triangleCount, Math.floor((data.length - 84) / 50));
    for (let triangle = 0; triangle < inspected; triangle += 1) {
      const offset = 84 + triangle * 50;
      for (let value = 0; value < 12; value += 1) {
        if (!Number.isFinite(data.readFloatLE(offset + value * 4))) {
          errors.push(`STL enthält bei Dreieck ${triangle + 1} einen ungültigen Zahlenwert.`);
          triangle = inspected;
          break;
        }
      }
    }
    if (errors.length === 0) {
      const mesh: Mesh = { vertices: [], triangles: [] };
      for (let triangle=0;triangle<triangleCount;triangle++) {
        const indices: [number,number,number] = [0,0,0];
        for(let vertex=0;vertex<3;vertex++) {
          const offset=84+triangle*50+12+vertex*12;
          indices[vertex]=mesh.vertices.length;
          mesh.vertices.push([data.readFloatLE(offset),data.readFloatLE(offset+4),data.readFloatLE(offset+8)]);
        }
        mesh.triangles.push(indices);
      }
      errors.push(...validateMeshGeometry(mesh).errors);
    }
    return { valid: errors.length === 0, errors, triangleCount };
  }

  try {
    const validation = await inspectThreeMf(data);
    return { valid: validation.errors.length === 0, ...validation };
  } catch (error) {
    return { valid: false, errors: [`3MF-Archiv ist beschädigt: ${error instanceof Error ? error.message : "unbekannter Fehler"}`], triangleCount: 0 };
  }
}
