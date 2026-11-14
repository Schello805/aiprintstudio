import { z } from "zod";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { orientedDimensions } from "./image-source.js";

const color = z.string().regex(/^#[\da-f]{6}$/i);
const imageData = z.string().regex(/^data:image\/[a-z+.-]+;base64,[A-Za-z0-9+/=]+$/);
export const studioProjectSchema = z.object({
  schemaVersion: z.literal(1), engineVersion: z.string().optional(), savedAt: z.string().optional(),
  tool: z.enum(["image", "text", "lithophane"]),
  source: z.object({name:z.string().min(1), dataUrl:imageData, originalDataUrl:imageData.optional()}).passthrough(),
  settings: z.object({
    widthMm:z.number().min(20).max(300), baseMm:z.number().min(0.8).max(10), reliefMm:z.number().min(0.5).max(20),
    smoothing:z.number().min(0).max(8), detail:z.number().min(0).max(2),
    processingMode:z.enum(["auto","vector","wordmark","depth","height"]),
    profile:z.enum(["fast","balanced","fine","photo","logo"]), raiseLightAreas:z.boolean(),
    multicolorEnabled:z.boolean(), colorCount:z.number().int().min(1).max(16),
    sourceColors:z.array(color).min(1).max(16), colors:z.array(color).min(1).max(16),
    colorMapping:z.array(z.number().int().min(0)).max(16).optional(), sideColorIndex:z.number().int().min(0),
    includeLogoBackground:z.boolean(), optimizeForStandardNozzle:z.boolean(), reduceTo250kTriangles:z.boolean(),
    productShape:z.enum(["source","rectangle","rounded","circle","shield","hexagon","heart"]).optional(),
    borderMm:z.number().min(0).max(12).optional(), holeDiameterMm:z.number().min(0).max(20).optional(), curveAngle:z.number().min(0).max(90).optional()
  }).passthrough().superRefine((s,ctx) => {
    if(s.sideColorIndex >= s.colors.length || s.colorCount !== s.colors.length || s.sourceColors.length !== s.colors.length || s.colorMapping?.some(i=>i>=s.colors.length)) {
      ctx.addIssue({code:z.ZodIssueCode.custom,message:"Die gespeicherte Farbzuordnung ist ungültig."});
    }
  })
}).passthrough();
export type PersistedProject = z.infer<typeof studioProjectSchema>;
export function parseStudioProject(input: unknown): PersistedProject {
  const parsed = studioProjectSchema.safeParse(input);
  if (!parsed.success) throw new Error(`Ungültiges AI-Print-Studio-Projekt: ${parsed.error.issues[0]?.message}`);
  return parsed.data;
}

export async function restoreProjectSource(input: unknown, directory: string): Promise<PersistedProject> {
  const project = parseStudioProject(input);
  const encoded = project.source.originalDataUrl ?? project.source.dataUrl;
  const bytes = Buffer.from(encoded.slice(encoded.indexOf(",")+1), "base64");
  if (!bytes.length || bytes.length > 25*1024*1024) throw new Error("Das eingebettete Projektbild ist leer oder zu groß.");
  const metadata = await sharp(bytes).metadata();
  const extensions: Record<string,string> = {png:"png",jpeg:"jpg",webp:"webp",svg:"svg"};
  const extension = extensions[metadata.format ?? ""];
  const dimensions = orientedDimensions(metadata);
  if (!extension || !dimensions.width || !dimensions.height || dimensions.width * dimensions.height > 40_000_000) throw new Error("Das Projektbild hat ungültige Abmessungen oder ein unbekanntes Format.");
  await mkdir(directory,{recursive:true});
  const path = join(directory,`source-${randomUUID()}.${extension}`);
  await writeFile(path,bytes);
  return {...project,source:{...project.source,path,format:extension,width:dimensions.width,height:dimensions.height,size:bytes.length}};
}
