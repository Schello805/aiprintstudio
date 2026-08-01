export type ReliefProcessingMode = "auto" | "vector" | "wordmark" | "depth" | "height";

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
  return mode === "depth" ? [3] : [1, 2, 3, 4];
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
