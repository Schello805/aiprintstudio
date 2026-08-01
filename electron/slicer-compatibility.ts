import JSZip from "jszip";
import { validateGeneratedExportBuffer } from "./export-validation.js";

export type SupportedSlicer = "Bambu Studio" | "OrcaSlicer" | "Anycubic Slicer" | "PrusaSlicer";
export type SlicerCompatibilityReport = {
  slicer: SupportedSlicer;
  compatible: boolean;
  checks: Array<{ label: string; passed: boolean; detail: string }>;
};

export async function inspectSlicerCompatibility(
  stl: Buffer,
  threeMf: Buffer,
  expected: { widthMm: number; heightMm: number; colorCount: number }
): Promise<SlicerCompatibilityReport[]> {
  const [stlValidation, threeMfValidation] = await Promise.all([
    validateGeneratedExportBuffer(".stl", stl),
    validateGeneratedExportBuffer(".3mf", threeMf)
  ]);
  const bounds = binaryStlBounds(stl);
  const archive = await JSZip.loadAsync(threeMf);
  const model = await archive.file("3D/3dmodel.model")?.async("string") ?? "";
  const metadata = await archive.file("Metadata/model_settings.config")?.async("string") ?? "";
  const projectSettings = await archive.file("Metadata/project_settings.config")?.async("string") ?? "";
  const itemCount = [...model.matchAll(/<item\b/g)].length;
  const componentCount = [...model.matchAll(/<component\b/g)].length;
  const materialCount = [...model.matchAll(/<base\b/g)].length;
  const triangleMaterials = new Set([...model.matchAll(/<triangle\b[^>]*\bp1="([0-9]+)"/g)].map((match) => match[1])).size;
  const checks = {
    validStl: { label: "STL-Struktur", passed: stlValidation.valid, detail: stlValidation.errors.join(" ") || "Binäre STL ist vollständig." },
    valid3mf: { label: "3MF-Struktur", passed: threeMfValidation.valid, detail: threeMfValidation.errors.join(" ") || "3MF-Archiv und Modellbeziehungen sind vollständig." },
    millimeter: { label: "Millimeter-Maßstab", passed: /<model\b[^>]*unit="millimeter"/i.test(model), detail: "Das 3MF deklariert Millimeter als Einheit." },
    dimensions: {
      label: "Abmessungen",
      passed: plausibleMillimeterExtent(bounds.width, expected.widthMm)
        && plausibleMillimeterExtent(bounds.height, expected.heightMm)
        && bounds.minimumZ >= -0.001,
      detail: `${bounds.width.toFixed(2)} × ${bounds.height.toFixed(2)} mm; Unterseite Z=${bounds.minimumZ.toFixed(3)} mm.`
    },
    assembly: { label: "Zusammengehöriges Modell", passed: itemCount === 1 && (expected.colorCount < 2 || componentCount >= expected.colorCount || triangleMaterials >= expected.colorCount), detail: `${itemCount} Build-Objekt, ${triangleMaterials} direkt zugewiesene Materialien.` },
    colors: { label: "Materialfarben", passed: expected.colorCount < 2 || materialCount >= expected.colorCount, detail: `${materialCount} eingebettete 3MF-Materialfarben.` },
    bambuMetadata: { label: "Bambu-/Orca-Metadaten", passed: /filament_colour/.test(projectSettings) && /AI Print Studio/.test(metadata + projectSettings), detail: "Filamentfarben und neutrales AI-Print-Studio-Profil sind vorhanden." }
  };
  const shared = [checks.validStl, checks.valid3mf, checks.millimeter, checks.dimensions, checks.assembly, checks.colors];
  return (["Bambu Studio", "OrcaSlicer", "Anycubic Slicer", "PrusaSlicer"] as SupportedSlicer[]).map((slicer) => {
    const slicerChecks = slicer === "Bambu Studio" || slicer === "OrcaSlicer" ? [...shared, checks.bambuMetadata] : shared;
    return { slicer, compatible: slicerChecks.every((check) => check.passed), checks: slicerChecks };
  });
}

function plausibleMillimeterExtent(actual: number, expectedCanvas: number): boolean {
  // Bei quellformbasierten Logos darf transparente Randfläche wegfallen. Die
  // Prüfung verhindert die typischen Meter-/Zoll-Skalierungsfehler, verlangt
  // aber nicht, dass das Motiv den vollständigen Bildrahmen berührt.
  return actual >= expectedCanvas * 0.5 && actual <= expectedCanvas + 0.5;
}

function binaryStlBounds(data: Buffer): { width: number; height: number; minimumZ: number } {
  const triangles = data.length >= 84 ? Math.min(data.readUInt32LE(80), Math.floor((data.length - 84) / 50)) : 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const offset = 84 + triangle * 50 + 12;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const x = data.readFloatLE(offset + vertex * 12);
      const y = data.readFloatLE(offset + vertex * 12 + 4);
      const z = data.readFloatLE(offset + vertex * 12 + 8);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z);
    }
  }
  return { width: maxX - minX, height: maxY - minY, minimumZ: minZ };
}
