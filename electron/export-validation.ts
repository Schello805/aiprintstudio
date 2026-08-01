import JSZip from "jszip";

export type ExportValidation = { valid: boolean; errors: string[]; triangleCount: number };

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
    return { valid: errors.length === 0, errors, triangleCount };
  }

  try {
    const archive = await JSZip.loadAsync(data);
    const modelEntry = archive.file("3D/3dmodel.model");
    if (!archive.file("[Content_Types].xml")) errors.push("3MF-Inhaltstypen fehlen.");
    if (!archive.file("_rels/.rels")) errors.push("3MF-Beziehungsdatei fehlt.");
    if (!modelEntry) return { valid: false, errors: [...errors, "3MF-Modellbeschreibung fehlt."], triangleCount: 0 };
    const model = await modelEntry.async("string");
    if (!/<model\b[^>]*\bunit="millimeter"/i.test(model)) errors.push("3MF verwendet nicht Millimeter als Einheit.");
    const vertices = [...model.matchAll(/<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"\s*\/>/g)];
    const triangles = [...model.matchAll(/<triangle\b/g)];
    if (!vertices.length || !triangles.length) errors.push("3MF enthält keine verwertbare Meshgeometrie.");
    if ([...model.matchAll(/<item\b/g)].length !== 1) errors.push("3MF muss genau ein gemeinsames Build-Objekt enthalten.");
    if (vertices.some((match) => match.slice(1).some((value) => !Number.isFinite(Number(value))))) errors.push("3MF enthält ungültige Koordinaten.");
    return { valid: errors.length === 0, errors, triangleCount: triangles.length };
  } catch (error) {
    return { valid: false, errors: [`3MF-Archiv ist beschädigt: ${error instanceof Error ? error.message : "unbekannter Fehler"}`], triangleCount: 0 };
  }
}
