import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { validateGeneratedExportBuffer } from "./export-validation";

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
});
