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

it("rejects a geometrically open STL",async()=>{
 const {encodeBinaryStl}=await import("./relief-export");
 const result=await validateGeneratedExportBuffer(".stl",encodeBinaryStl({vertices:[[0,0,0],[1,0,0],[0,1,0]],triangles:[[0,1,2]]},"open"));
 expect(result.valid).toBe(false);expect(result.errors.join(" ")).toContain("offene");
});
it.each(["vertex","coordinate","build","material","relationship","cycle"])("rejects corrupted 3MF %s references",async kind=>{
 const {encodeThreeMf}=await import("./relief-export");
 const bytes=await encodeThreeMf({vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],triangles:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]]});
 expect((await validateGeneratedExportBuffer(".3mf",bytes)).valid).toBe(true);
 const zip=await JSZip.loadAsync(bytes);let xml=await zip.file("3D/3dmodel.model")!.async("string");
 if(kind==="coordinate")xml=xml.replace('x="0"','x=""');
 if(kind==="vertex")xml=xml.replace('v3="1"','v3="999999"');
 if(kind==="build")xml=xml.replace('objectid="3"','objectid="999999"');
 if(kind==="material")xml=xml.replace('p1="0"','p1="999999"');
 if(kind==="cycle")xml=xml.replace(/<mesh>[\s\S]*?<\/mesh>/,'<components><component objectid="3"/></components>');
 if(kind==="relationship")zip.file("_rels/.rels",(await zip.file("_rels/.rels")!.async("string")).replace("/3D/3dmodel.model","/missing.model"));
 zip.file("3D/3dmodel.model",xml);
 expect((await validateGeneratedExportBuffer(".3mf",await zip.generateAsync({type:"nodebuffer"}))).valid).toBe(false);
});
it("accepts standard namespace prefixes and reordered coordinate attributes",async()=>{
 const {encodeThreeMf}=await import("./relief-export");
 const zip=await JSZip.loadAsync(await encodeThreeMf({vertices:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],triangles:[[0,2,1],[0,1,3],[1,2,3],[2,0,3]]}));
 let xml=await zip.file("3D/3dmodel.model")!.async("string");
 xml=xml.replace(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g,'<vertex z="$3" y="$2" x="$1"/>');
 zip.file("3D/3dmodel.model",xml);
 expect((await validateGeneratedExportBuffer(".3mf",await zip.generateAsync({type:"nodebuffer"}))).valid).toBe(true);
});
