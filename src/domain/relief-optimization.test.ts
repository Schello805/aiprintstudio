import { describe, expect, it } from "vitest";
import { rankReliefCandidate, resolveReliefMode, smoothingCandidates } from "./relief-optimization";

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

  it("prefers a printable candidate before a marginally smaller mesh", () => {
    const printable = rankReliefCandidate({ score: 100, issueCount: 0, triangleCount: 300_000, smoothing: 3, recommendedSmoothing: 3 });
    const smaller = rankReliefCandidate({ score: 95, issueCount: 1, triangleCount: 100_000, smoothing: 2, recommendedSmoothing: 3 });
    expect(printable).toBeGreaterThan(smaller);
  });
});
