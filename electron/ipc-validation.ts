import { resolve } from "node:path";
import { z } from "zod";
import type { ReliefOptions } from "./relief.js";
import type { TextImageOptions } from "./text-image.js";

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Die Farbpalette enthält ungültige Farben.");

export const partialReliefOptionsSchema = z.object({
  sourceName: z.string().max(255, "Der ursprüngliche Dateiname ist ungültig.").optional(),
  widthMm: z.number().finite().min(20, "Die Breite muss zwischen 20 und 300 mm liegen.").max(300, "Die Breite muss zwischen 20 und 300 mm liegen.").optional(),
  baseMm: z.number().finite().min(0.8, "Die Grundplatte muss zwischen 0,8 und 10 mm liegen.").max(10, "Die Grundplatte muss zwischen 0,8 und 10 mm liegen.").optional(),
  reliefMm: z.number().finite().min(0.5, "Die Reliefhöhe muss zwischen 0,5 und 20 mm liegen.").max(20, "Die Reliefhöhe muss zwischen 0,5 und 20 mm liegen.").optional(),
  resolution: z.number().int().min(32, "Die Auflösung muss zwischen 32 und 512 liegen.").max(512, "Die Auflösung muss zwischen 32 und 512 liegen.").optional(),
  invert: z.boolean().optional(),
  profile: z.enum(["fast", "balanced", "fine", "photo", "logo"], { message: "Unbekanntes Qualitätsprofil." }).optional(),
  smoothing: z.number().finite().min(0, "Die Glättung muss zwischen 0 und 8 liegen.").max(8, "Die Glättung muss zwischen 0 und 8 liegen.").optional(),
  detail: z.number().finite().min(0, "Die Detailstärke muss zwischen 0 und 2 liegen.").max(2, "Die Detailstärke muss zwischen 0 und 2 liegen.").optional(),
  processingMode: z.enum(["auto", "vector", "wordmark", "depth", "height"], { message: "Unbekannter Verarbeitungsmodus." }).optional(),
  pipelineKind: z.enum(["auto", "emblem", "wordmark", "text", "photo", "lithophane"], { message: "Unbekannte Verarbeitungspipeline." }).optional(),
  includeBackground: z.boolean({ message: "Die Hintergrundeinstellung ist ungültig." }).optional(),
  nozzleMm: z.number().finite().min(0.2, "Die Düsengröße muss zwischen 0,2 und 1,2 mm liegen.").max(1.2, "Die Düsengröße muss zwischen 0,2 und 1,2 mm liegen.").optional(),
  minimumFeatureMm: z.number().finite().min(0, "Die Mindestbreite muss zwischen 0 und 4 mm liegen.").max(4, "Die Mindestbreite muss zwischen 0 und 4 mm liegen.").optional(),
  sourceColors: z.array(hexColorSchema).max(16, "Die erkannte Bildpalette enthält ungültige Farben.").optional(),
  colors: z.array(hexColorSchema).max(16, "Die Farbpalette enthält ungültige Farben.").optional(),
  colorMapping: z.array(z.number().int().min(0)).max(16).optional(),
  sideColorIndex: z.number().int().min(0, "Die gewählte Seitenfarbe ist ungültig.").optional(),
  outputMode: z.enum(["relief", "lithophane", "stamp"], { message: "Unbekannte Ausgabeart." }).optional(),
  shape: z.enum(["source", "rectangle", "rounded", "circle", "shield", "hexagon", "heart"], { message: "Unbekannte Außenform." }).optional(),
  borderMm: z.number().finite().min(0, "Die Rahmeneinstellung ist ungültig.").max(12, "Die Rahmeneinstellung ist ungültig.").optional(),
  borderHeightMm: z.number().finite().min(0, "Die Rahmeneinstellung ist ungültig.").max(20, "Die Rahmeneinstellung ist ungültig.").optional(),
  holeDiameterMm: z.number().finite().min(0, "Der Lochdurchmesser ist ungültig.").max(20, "Der Lochdurchmesser ist ungültig.").optional(),
  holePosition: z.enum(["top-left", "top-center", "top-right"], { message: "Die Lochposition ist ungültig." }).optional(),
  curveAngle: z.number().finite().min(0, "Die Wölbung muss zwischen 0 und 90 Grad liegen.").max(90, "Die Wölbung muss zwischen 0 und 90 Grad liegen.").optional(),
  mirrorX: z.boolean({ message: "Die Spiegelung ist ungültig." }).optional()
}).strict();

export const textImageOptionsSchema = z.object({
  text: z.string().trim().min(1, "Der Text muss zwischen 1 und 240 Zeichen enthalten.").max(240, "Der Text muss zwischen 1 und 240 Zeichen enthalten."),
  fontFamily: z.enum(["Helvetica", "Avenir Next", "Arial", "Times New Roman", "Courier New"]).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  alignment: z.enum(["left", "center", "right"]).optional()
}).strict();

export function validateIpcReliefOptions(input: unknown): Partial<ReliefOptions> {
  const parsed = partialReliefOptionsSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Die Relief-Einstellungen sind ungültig.");
  }
  return parsed.data;
}

export function validateIpcTextImageOptions(input: unknown): TextImageOptions {
  const parsed = textImageOptionsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Die Texteinstellungen sind ungültig.");
  }
  return parsed.data;
}

export function isPathInsideDirectory(targetPath: string, rootDirectory: string): boolean {
  const normalizedRoot = resolve(rootDirectory);
  const normalizedCandidate = resolve(targetPath);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

export function isApprovedSourceImagePath(
  imagePath: unknown,
  approvedPaths: ReadonlySet<string>,
  allowedTempDirectories: readonly string[] = []
): imagePath is string {
  if (typeof imagePath !== "string" || !imagePath.trim()) return false;
  const resolved = resolve(imagePath);
  if (approvedPaths.has(resolved)) return true;
  return allowedTempDirectories.some((dir) => isPathInsideDirectory(resolved, dir));
}

export function isAllowedShowItemPath(
  targetPath: unknown,
  logsDirectory: string,
  previewRootDirectory: string,
  approvedPaths: ReadonlySet<string>
): targetPath is string {
  if (typeof targetPath !== "string" || !targetPath.trim()) return false;
  const resolved = resolve(targetPath);
  if (approvedPaths.has(resolved)) return true;
  return (
    isPathInsideDirectory(resolved, logsDirectory) ||
    isPathInsideDirectory(resolved, previewRootDirectory)
  );
}
