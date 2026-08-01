import { describe, expect, it } from "vitest";
import { minimumFeatureForMode, rankReliefCandidate, resolveReliefMode, smoothingCandidates } from "./relief-optimization";

describe("local relief optimization", () => {
  it("never replaces an explicitly selected emblem with wordmark processing", () => {
    expect(resolveReliefMode("vector", "logo")).toBe("vector");
    expect(resolveReliefMode("wordmark", "logo")).toBe("wordmark");
    expect(resolveReliefMode("auto", "logo")).toBe("auto");
  });

  it("avoids repeating the expensive local depth model", () => {
    expect(smoothingCandidates("depth")).toEqual([3]);
    expect(smoothingCandidates("vector")).toEqual([1, 2, 3, 4]);
  });

  it("never grows an emblem into a brim during automatic optimization", () => {
    expect(minimumFeatureForMode("vector", "logo", true)).toBe(0);
    expect(minimumFeatureForMode("wordmark", "logo", true)).toBe(0.8);
  });

  it("prefers a printable candidate before a marginally smaller mesh", () => {
    const printable = rankReliefCandidate({ score: 100, contourScore: 96, issueCount: 0, triangleCount: 300_000, smoothing: 3, recommendedSmoothing: 3 });
    const smaller = rankReliefCandidate({ score: 95, contourScore: 70, issueCount: 1, triangleCount: 100_000, smoothing: 2, recommendedSmoothing: 3 });
    expect(printable).toBeGreaterThan(smaller);
  });

  it("prefers the smoother measured contour when printability is equal", () => {
    const smooth = rankReliefCandidate({ score: 100, contourScore: 98, issueCount: 0, triangleCount: 200_000, smoothing: 4, recommendedSmoothing: 3 });
    const rough = rankReliefCandidate({ score: 100, contourScore: 70, issueCount: 0, triangleCount: 200_000, smoothing: 3, recommendedSmoothing: 3 });
    expect(smooth).toBeGreaterThan(rough);
  });
});
