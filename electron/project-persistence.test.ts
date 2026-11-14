import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { parseStudioProject, restoreProjectSource } from "./project-persistence";
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>';
async function project(tool="image") {
 const png=await sharp(Buffer.from(svg)).png().toBuffer();
 return {schemaVersion:1,tool,source:{name:"logo.svg",dataUrl:`data:image/png;base64,${png.toString("base64")}`,originalDataUrl:`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,format:"svg"},settings:{widthMm:100,baseMm:1.6,reliefMm:4,smoothing:2,detail:1,processingMode:"wordmark",profile:"logo",raiseLightAreas:false,multicolorEnabled:true,colorCount:2,colors:["#FFFFFF","#000000"],sourceColors:["#FFFFFF","#000000"],colorMapping:[1,0],sideColorIndex:1,includeLogoBackground:true,optimizeForStandardNozzle:true,reduceTo250kTriangles:true}};
}
it.each(["image","text","lithophane"])("round-trips %s with original SVG bytes and saved colors",async tool=>{
 const dir=await mkdtemp(join(tmpdir(),"project-roundtrip-"));
 try{const input=await project(tool);const restored=await restoreProjectSource(JSON.parse(JSON.stringify(parseStudioProject(input))),dir);
 expect(restored.tool).toBe(tool);expect(restored.source.format).toBe("svg");
 expect(await readFile(restored.source.path as string,"utf8")).toBe(svg);
 expect(restored.settings.colorMapping).toEqual([1,0]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
it("rejects invalid settings instead of crashing the renderer",async()=>{
 const input=await project();input.settings.sideColorIndex=99;expect(()=>parseStudioProject(input)).toThrow();
});
it("loads legacy raster-only projects with the actual source format",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"project-legacy-"));
 try{const input=await project();delete (input.source as {originalDataUrl?:string}).originalDataUrl;const restored=await restoreProjectSource(input,dir);expect(restored.source.format).toBe("png");}
 finally{await rm(dir,{recursive:true,force:true});}
});
