import { describe, expect, it } from "vitest";
import { automaticSmoothingForMode, isExcellentReliefCandidate, mapReliefPassProgress, meaningfulReliefIssueCount, minimumFeatureForMode, optimizationVariants, rankReliefCandidate, resolveReliefMode, smoothingCandidates } from "./relief-optimization";

describe("local relief optimization", () => {
  it("never replaces an explicitly selected emblem with wordmark processing", () => {
    expect(resolveReliefMode("vector", "logo")).toBe("vector");
    expect(resolveReliefMode("wordmark", "logo")).toBe("wordmark");
    expect(resolveReliefMode("auto", "logo")).toBe("auto");
  });

  it("avoids repeating the expensive local depth model", () => {
    expect(smoothingCandidates("depth")).toEqual([3]);
    expect(smoothingCandidates("vector")).toEqual([1]);
  });

  it("never grows an emblem into a brim during automatic optimization", () => {
    expect(minimumFeatureForMode("vector", "logo", true)).toBe(0);
    expect(minimumFeatureForMode("wordmark", "logo", true)).toBe(0.6);
  });

  it("locks normal emblem generation to the proven smooth contour setting", () => {
    expect(automaticSmoothingForMode("vector")).toBe(1);
    expect(automaticSmoothingForMode("wordmark")).toBe(2);
  });

  it("tries a bounded set of genuinely different emblem variants", () => {
    const variants = optimizationVariants("vector", 320, 1);
    expect(variants).toHaveLength(3);
    expect(new Set(variants.map(({ smoothing, detail }) => `${smoothing}:${detail}`)).size).toBe(3);
    expect(variants.every((variant) => variant.smoothing === 1)).toBe(true);
    expect(variants.every((variant) => variant.resolution === 320)).toBe(true);
  });

  it("does not count the no-problems summary as an issue", () => {
    expect(meaningfulReliefIssueCount(["Keine offensichtlichen Druckprobleme erkannt."])).toBe(0);
    expect(meaningfulReliefIssueCount(["Viele steile Übergänge können Details unsauber drucken."])).toBe(1);
  });

  it("only calls a fully valid and size-limited result excellent", () => {
    const excellent = { score: 100, contourScore: 82, issueCount: 0, triangleCount: 220_000, stlBytes: 11_000_000, threeMfBytes: 3_000_000, geometryValid: true, transitionsOk: true };
    expect(isExcellentReliefCandidate(excellent)).toBe(true);
    expect(isExcellentReliefCandidate({ ...excellent, contourScore: 70 })).toBe(false);
    expect(isExcellentReliefCandidate({ ...excellent, transitionsOk: false })).toBe(false);
    expect(isExcellentReliefCandidate({ ...excellent, threeMfBytes: 26_000_000 })).toBe(false);
  });

  it("prefers a printable candidate before a marginally smaller mesh", () => {
    const printable = rankReliefCandidate({ score: 100, contourScore: 96, issueCount: 0, triangleCount: 240_000, smoothing: 3, recommendedSmoothing: 3 });
    const smaller = rankReliefCandidate({ score: 95, contourScore: 70, issueCount: 1, triangleCount: 100_000, smoothing: 2, recommendedSmoothing: 3 });
    expect(printable).toBeGreaterThan(smaller);
  });

  it("prefers the smoother measured contour when printability is equal", () => {
    const smooth = rankReliefCandidate({ score: 100, contourScore: 98, issueCount: 0, triangleCount: 200_000, smoothing: 4, recommendedSmoothing: 3 });
    const rough = rankReliefCandidate({ score: 100, contourScore: 70, issueCount: 0, triangleCount: 200_000, smoothing: 3, recommendedSmoothing: 3 });
    expect(smooth).toBeGreaterThan(rough);
  });

  it("rejects invalid geometry and broken transitions despite a high score", () => {
    const stable = rankReliefCandidate({ score: 95, contourScore: 90, issueCount: 0, triangleCount: 220_000, smoothing: 1, recommendedSmoothing: 1, geometryValid: true, transitionsOk: true });
    const broken = rankReliefCandidate({ score: 100, contourScore: 100, issueCount: 0, triangleCount: 220_000, smoothing: 1, recommendedSmoothing: 1, geometryValid: false, transitionsOk: false });
    expect(stable).toBeGreaterThan(broken);
  });

  it("keeps completed internal passes below the overall 100 percent", () => {
    expect(mapReliefPassProgress(100, 5, 25)).toBe(25);
    expect(mapReliefPassProgress(50, 25, 45)).toBe(35);
    expect(mapReliefPassProgress(100, 90, 97)).toBe(97);
  });
});
