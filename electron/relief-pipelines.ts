export type ReliefPipelineKind = "auto" | "emblem" | "wordmark" | "text" | "photo" | "lithophane";
export type ReliefProcessingMode = "auto" | "vector" | "wordmark" | "depth" | "height";

export type ReliefPipelineContract = {
  kind: Exclude<ReliefPipelineKind, "auto">;
  heightMode: "vector" | "depth" | "height";
  mask: "subject" | "wordmark" | "full-frame";
  solidOuterSilhouette: boolean;
  preserveThinStrokes: boolean;
  flattenMotifSurface: boolean;
};

export function resolveReliefPipeline(input: {
  pipelineKind: ReliefPipelineKind;
  processingMode: ReliefProcessingMode;
  outputMode: "relief" | "lithophane" | "stamp";
  profile: "fast" | "balanced" | "fine" | "photo" | "logo";
}): ReliefPipelineContract {
  let kind: Exclude<ReliefPipelineKind, "auto">;
  if (input.pipelineKind !== "auto") kind = input.pipelineKind;
  else if (input.outputMode === "lithophane") kind = "lithophane";
  else if (input.processingMode === "wordmark") kind = "wordmark";
  else if (input.processingMode === "vector" && input.profile === "logo") kind = "emblem";
  else if (input.processingMode === "depth" || input.processingMode === "height" || input.profile === "photo") kind = "photo";
  else kind = "emblem";

  const contracts: Record<Exclude<ReliefPipelineKind, "auto">, ReliefPipelineContract> = {
    emblem: { kind: "emblem", heightMode: "vector", mask: "subject", solidOuterSilhouette: true, preserveThinStrokes: true, flattenMotifSurface: false },
    wordmark: { kind: "wordmark", heightMode: "vector", mask: "wordmark", solidOuterSilhouette: false, preserveThinStrokes: true, flattenMotifSurface: true },
    text: { kind: "text", heightMode: "vector", mask: "subject", solidOuterSilhouette: false, preserveThinStrokes: true, flattenMotifSurface: true },
    photo: { kind: "photo", heightMode: input.processingMode === "height" ? "height" : "depth", mask: "full-frame", solidOuterSilhouette: false, preserveThinStrokes: false, flattenMotifSurface: false },
    lithophane: { kind: "lithophane", heightMode: "height", mask: "full-frame", solidOuterSilhouette: false, preserveThinStrokes: false, flattenMotifSurface: false }
  };
  return contracts[kind];
}
