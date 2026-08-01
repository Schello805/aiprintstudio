export type ReliefProcessingMode = "auto" | "vector" | "wordmark" | "depth" | "height";

export type ReliefOptimizationVariant = { smoothing: number; detail: number; resolution: number };

export type ReliefQualityFacts = {
  score: number;
  contourScore: number;
  issueCount: number;
  triangleCount: number;
  stlBytes: number;
  threeMfBytes: number;
  geometryValid: boolean;
  transitionsOk: boolean;
};

export function resolveReliefMode(
  selected: ReliefProcessingMode,
  suggestedProfile: "logo" | "photo"
): ReliefProcessingMode {
  return selected === "auto" ? (suggestedProfile === "logo" ? "auto" : "depth") : selected;
}

export function smoothingCandidates(mode: ReliefProcessingMode): number[] {
  // Depth Anything ist der teure Schritt. Ein mehrfacher kompletter
  // Tiefenlauf wäre langsam und bringt für die nachgelagerte Glättung keinen
  // Mehrwert; Kontur- und Höhenverfahren lassen sich dagegen günstig lokal
  // vergleichen.
  if (mode === "depth") return [3];
  if (mode === "vector") return [5, 6];
  return [1, 2, 3, 4];
}

export function optimizationVariants(mode: ReliefProcessingMode, resolution: number, detail: number): ReliefOptimizationVariant[] {
  if (mode === "depth") return [{ smoothing: 3, detail, resolution }];
  if (mode === "vector") return [
    { smoothing: 6, detail: 0.55, resolution },
    { smoothing: 7, detail: 0.55, resolution },
    { smoothing: 8, detail: 0.6, resolution },
    { smoothing: 6, detail: 0.7, resolution },
    { smoothing: 7, detail: 0.7, resolution },
    { smoothing: 8, detail: 0.75, resolution }
  ];
  return smoothingCandidates(mode).map((smoothing) => ({ smoothing, detail, resolution }));
}

export function isExcellentReliefCandidate(facts: ReliefQualityFacts): boolean {
  return facts.geometryValid
    && facts.score >= 95
    && facts.contourScore >= 75
    && facts.issueCount === 0
    && facts.transitionsOk
    && facts.triangleCount <= 250_000
    && facts.stlBytes <= 25_000_000
    && facts.threeMfBytes <= 25_000_000;
}

export function automaticSmoothingForMode(mode: ReliefProcessingMode): number {
  if (mode === "depth") return 3;
  if (mode === "height") return 2;
  if (mode === "vector") return 6;
  if (mode === "wordmark") return 2;
  return 2;
}

export function minimumFeatureForMode(mode: ReliefProcessingMode, suggestedProfile: "logo" | "photo", optimize: boolean): number {
  if (!optimize) return 0;
  // Eine Mindestbreite ist für Schriftzüge sinnvoll. Bei Wappen würde dieselbe
  // Flächenerweiterung jedoch eine umlaufende, brim-artige Kontur erzeugen.
  return mode === "wordmark" || (mode === "auto" && suggestedProfile === "logo") ? 0.8 : 0;
}

export function rankReliefCandidate(input: {
  score: number;
  contourScore: number;
  issueCount: number;
  triangleCount: number;
  smoothing: number;
  recommendedSmoothing: number;
}): number {
  return input.score * 1_000
    + input.contourScore * 20
    - input.issueCount * 50
    - input.triangleCount / 100_000
    - Math.abs(input.smoothing - input.recommendedSmoothing) * 10;
}

export function mapReliefPassProgress(progress: number, start: number, end: number): number {
  const normalized = Math.max(0, Math.min(100, progress)) / 100;
  return Math.round(start + normalized * Math.max(0, end - start));
}
