import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { exportFitsLimits, validateGeneratedExportBuffer } from "./export-validation";

describe("generated export validation", () => {
  it("rejects truncated binary STL files", async () => {
    const data = Buffer.alloc(84);
    data.writeUInt32LE(2, 80);
    const result = await validateGeneratedExportBuffer(".stl", data);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("STL-Länge");
  });

  it("rejects 3MF files without a model", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    const result = await validateGeneratedExportBuffer(".3mf", await zip.generateAsync({ type: "nodebuffer" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("3MF-Modellbeschreibung fehlt.");
  });

  it("enforces 250,000 triangles and 25 MB for every saved model", () => {
    expect(exportFitsLimits({ valid: true, errors: [], triangleCount: 250_000 }, 25_000_000)).toBe(true);
    expect(exportFitsLimits({ valid: true, errors: [], triangleCount: 250_001 }, 1_000)).toBe(false);
    expect(exportFitsLimits({ valid: true, errors: [], triangleCount: 1 }, 25_000_001)).toBe(false);
  });
});
