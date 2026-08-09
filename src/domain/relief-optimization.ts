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

export function meaningfulReliefIssueCount(issues: string[]): number {
  return issues.filter((issue) => !issue.startsWith("Keine offensichtlichen Druckprobleme")).length;
}

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
  if (mode === "vector") return [1];
  return [1, 2, 3, 4];
}

export function optimizationVariants(mode: ReliefProcessingMode, resolution: number, detail: number): ReliefOptimizationVariant[] {
  if (mode === "depth") return [{ smoothing: 3, detail, resolution }];
  if (mode === "vector") return [
    // Die Wappen-Kontur ist bereits vektorisiert. Stärkere Ringglättung
    // verschiebt ihre Außenlinie und kann Doppelränder oder Spitzen erzeugen.
    { smoothing: 1, detail: 1, resolution },
    { smoothing: 1, detail: 0.85, resolution },
    { smoothing: 1, detail: 0.7, resolution }
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
  if (mode === "vector") return 1;
  if (mode === "wordmark") return 2;
  return 2;
}

export function minimumFeatureForMode(mode: ReliefProcessingMode, suggestedProfile: "logo" | "photo", optimize: boolean): number {
  if (!optimize) return 0;
  // Eine Mindestbreite ist für Schriftzüge sinnvoll. Bei Wappen würde dieselbe
  // Flächenerweiterung jedoch eine umlaufende, brim-artige Kontur erzeugen.
  return mode === "wordmark" || (mode === "auto" && suggestedProfile === "logo") ? 0.6 : 0;
}

export function rankReliefCandidate(input: {
  score: number;
  contourScore: number;
  issueCount: number;
  triangleCount: number;
  smoothing: number;
  recommendedSmoothing: number;
  geometryValid?: boolean;
  transitionsOk?: boolean;
  stlBytes?: number;
  threeMfBytes?: number;
}): number {
  const invalidGeometryPenalty = input.geometryValid === false ? 1_000_000 : 0;
  const transitionPenalty = input.transitionsOk === false ? 100_000 : 0;
  const exportLimitPenalty = Math.max(input.triangleCount - 250_000, 0) / 10
    + Math.max((input.stlBytes ?? 0) - 25_000_000, 0) / 100
    + Math.max((input.threeMfBytes ?? 0) - 25_000_000, 0) / 100;
  return input.score * 100
    + input.contourScore * 100
    - input.issueCount * 1_000
    - input.triangleCount / 100_000
    - Math.abs(input.smoothing - input.recommendedSmoothing) * 100
    - invalidGeometryPenalty
    - transitionPenalty
    - exportLimitPenalty;
}

export function mapReliefPassProgress(progress: number, start: number, end: number): number {
  const normalized = Math.max(0, Math.min(100, progress)) / 100;
  return Math.round(start + normalized * Math.max(0, end - start));
}
