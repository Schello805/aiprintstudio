import { describe, expect, it } from "vitest";
import { resolveReliefPipeline } from "./relief-pipelines";

describe("relief pipeline contracts", () => {
  it("keeps emblem-only silhouette rules out of text and wordmarks", () => {
    const emblem = resolveReliefPipeline({ pipelineKind: "emblem", processingMode: "vector", outputMode: "relief", profile: "logo" });
    const text = resolveReliefPipeline({ pipelineKind: "text", processingMode: "vector", outputMode: "relief", profile: "logo" });
    const wordmark = resolveReliefPipeline({ pipelineKind: "wordmark", processingMode: "wordmark", outputMode: "relief", profile: "logo" });
    expect(emblem.solidOuterSilhouette).toBe(true);
    expect(emblem.minimumSmoothing).toBe(1);
    expect(text.solidOuterSilhouette).toBe(false);
    expect(wordmark.mask).toBe("wordmark");
  });

  it("keeps photo and lithophane pipelines independent from vector settings", () => {
    expect(resolveReliefPipeline({ pipelineKind: "photo", processingMode: "depth", outputMode: "relief", profile: "photo" }).heightMode).toBe("depth");
    expect(resolveReliefPipeline({ pipelineKind: "lithophane", processingMode: "height", outputMode: "lithophane", profile: "photo" }).heightMode).toBe("height");
  });
});
