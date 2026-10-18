import { extractColorPalette } from "../domain/color-palette";
import { isExcellentReliefCandidate, meaningfulReliefIssueCount } from "../domain/relief-optimization";

export type View = "studio" | "history" | "settings" | "info";
export type StudioTool = "home" | "image" | "text" | "lithophane" | "prompt";
export type ProductShape = "source" | "rectangle" | "rounded" | "circle" | "shield" | "hexagon" | "heart";
export type LegalPage = "imprint" | "privacy" | "cookies" | null;
export type SelectedImage = {
  path: string;
  name: string;
  size: number;
  width: number;
  height: number;
  format?: "png" | "jpg" | "webp" | "svg";
  suggestedProfile: "logo" | "photo";
  dataUrl: string;
};
export type ReliefResult = Awaited<ReturnType<NonNullable<typeof window.desktop>["createRelief"]>>;
export type Ai3dResult = Awaited<ReturnType<NonNullable<typeof window.desktop>["createAi3d"]>>;
export type Ai3dModel = Awaited<ReturnType<NonNullable<typeof window.desktop>["getAi3dModels"]>>[number];
export type Ai3dDiagnostic = Awaited<ReturnType<NonNullable<typeof window.desktop>["getLastAi3dDiagnostic"]>>;
export type CadPlan = Ai3dResult["plan"];
export type CadPrimitive = CadPlan["primitives"][number];
export type UpdateInfo = Awaited<ReturnType<NonNullable<typeof window.desktop>["checkForUpdate"]>>;
export type AppMetrics = Awaited<ReturnType<NonNullable<typeof window.desktop>["getAppMetrics"]>>;

export type QualityProfile = "fast" | "balanced" | "fine" | "photo" | "logo";
export type ProcessingMode = "auto" | "vector" | "wordmark" | "depth" | "height";
export type PipelineKind = "auto" | "emblem" | "wordmark" | "text" | "photo" | "lithophane";

export type HistoryEntry = {
  id: string;
  name: string;
  createdAt: string;
  triangleCount: number;
  widthMm: number;
  heightMm: number;
  profile: QualityProfile;
  score: number;
};

export type StudioProject = {
  schemaVersion: 1;
  engineVersion?: string;
  savedAt: string;
  source: SelectedImage;
  tool: "image" | "text" | "lithophane";
  settings: {
    widthMm: number;
    baseMm: number;
    reliefMm: number;
    smoothing: number;
    detail: number;
    processingMode: ProcessingMode;
    profile: QualityProfile;
    raiseLightAreas: boolean;
    multicolorEnabled: boolean;
    colorCount: number;
    sourceColors: string[];
    colors: string[];
    colorMapping?: number[];
    sideColorIndex: number;
    includeLogoBackground: boolean;
    optimizeForStandardNozzle: boolean;
    reduceTo250kTriangles: boolean;
    productShape?: ProductShape;
    borderMm?: number;
    holeDiameterMm?: number;
    curveAngle?: number;
  };
};

export type SettingsStatus = {
  openAiConfigured: boolean;
  openAiStored: boolean;
  modelSetupAccepted: boolean;
  storageVersion: number;
  depthModelAvailable: boolean;
};

export const RELIEF_ENGINE_VERSION = "2026-08-09-wordmark-trace-v2";

export const optimalResolution: Record<QualityProfile, number> = {
  fast: 192,
  balanced: 320,
  fine: 512,
  photo: 384,
  logo: 512
};

export const modeTooltips: Record<ProcessingMode, string> = {
  auto: "Analysiert das Bild und verwendet automatisch die hochwertigste passende Methode.\nBeispiel: Ein Wappen nutzt saubere Flächen, ein Foto die lokale KI-Tiefenschätzung.",
  vector: "Bewahrt geschlossene Innenflächen und ordnet Motivbereichen feste Höhen zu.\nBeispiel: Weiße Felder und Rollen innerhalb eines Wappens bleiben erhalten.",
  wordmark: "Für Logo-Schrift nutzt die App SVG-Pfade. PNG/JPG werden lokal nach SVG vektorisiert, echte SVG-Dateien liefern aber deutlich sauberere Schrift und Konturen.\nBeispiel: Die Innenräume von a, e, d, o und ö bleiben bei echten Pfaden am zuverlässigsten offen.",
  depth: "Schätzt mit Depth Anything V2 die räumliche Tiefe eines Fotos.\nBeispiel: Eine Person wird vom Hintergrund räumlich getrennt.",
  height: "Übernimmt die Helligkeit des Bildes direkt als Höhe.\nBeispiel: Weiß entspricht hoch und Schwarz niedrig – oder umgekehrt."
};

export const parameterTooltips = {
  width: "Bestimmt die Gesamtbreite des fertigen Modells; die Höhe folgt dem Bildformat.\nBeispiel: 100 mm erzeugt ein etwa handgroßes Wappen.",
  base: "Dicke der stabilen Platte unter dem Relief.\nBeispiel: 1,6 mm eignet sich meist für ein leichtes Wandschild.",
  relief: "Maximaler Höhenunterschied zwischen tiefster und höchster Motivfläche.\nBeispiel: 4 mm lässt Rollen deutlich aus dem Wappen hervortreten.",
  smoothing: "Glättet kleine Unebenheiten und Bildrauschen; hohe Werte entfernen Details.\nBeispiel: 2 glättet Kanten moderat, 4 eignet sich für unruhige Fotos.",
  detail: "Führt feine Bildinformationen nach der Glättung wieder zurück.\nBeispiel: 1 ist neutral, 1,5 betont feine Linien stärker.",
  dark: "Dunkle Bildbereiche werden höher als helle Bereiche ausgegeben.\nBeispiel: Schwarze Schrift steht erhaben auf weißem Grund.",
  light: "Helle Bildbereiche werden höher als dunkle Bereiche ausgegeben.\nBeispiel: Ein weißes Motiv steht erhaben auf schwarzem Grund."
};

export function formatApiCost(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 4 : 2
  }).format(value);
}

export function formatStorage(bytes: number): string {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(bytes / 1_000_000_000)} GB`;
}

export function isExcellentReliefResult(result: NonNullable<ReliefResult>): boolean {
  return isExcellentReliefCandidate({
    score: result.printability.score,
    contourScore: result.contourQuality.score,
    issueCount: meaningfulReliefIssueCount(result.printability.issues),
    triangleCount: result.triangleCount,
    stlBytes: result.fileBytes.stl,
    threeMfBytes: result.fileBytes.threeMf,
    geometryValid: result.geometryValidation.valid,
    transitionsOk: result.printability.checks.find((check) => check.label === "Übergänge")?.status === "ok"
  });
}

export async function detectPalette(dataUrl: string): Promise<string[]> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Farben konnten nicht aus dem Bild gelesen werden."));
    image.src = dataUrl;
  });
  const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const detected = extractColorPalette(context.getImageData(0, 0, canvas.width, canvas.height).data, 4);
  // Sehr ähnliche Cluster sind meist Kantenglättung oder ein Verlauf und
  // keine eigene druckbare Filamentfarbe. Die App reduziert sie automatisch,
  // ohne den Nutzer mit einer Farbanzahl-Auswahl zu belasten.
  return detected.filter((color, index, palette) => index === 0 || palette.slice(0, index).every((existing) => {
    const rgb = [color, existing].map((entry) => [1, 3, 5].map((offset) => Number.parseInt(entry.slice(offset, offset + 2), 16)));
    return Math.hypot(rgb[0][0] - rgb[1][0], rgb[0][1] - rgb[1][1], rgb[0][2] - rgb[1][2]) >= 32;
  })).slice(0, 4);
}

export function darkestColorIndex(colors: string[]): number {
  let darkest = 0, darkestLuminance = Number.POSITIVE_INFINITY;
  colors.forEach((color, index) => {
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    if (luminance < darkestLuminance) { darkest = index; darkestLuminance = luminance; }
  });
  return darkest;
}
