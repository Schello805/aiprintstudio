import { describe, expect, it } from "vitest";
import { calculateAiCost, estimateTokens } from "./openai-usage";

describe("OpenAI usage estimate", () => {
  it("calculates input, cached input and output with the configured EUR estimate", () => {
    expect(calculateAiCost(1_000_000, 1_000_000, 200_000)).toBeCloseTo(31.372, 6);
  });

  it("never bills more cached tokens than total input tokens", () => {
    expect(calculateAiCost(100, 0, 1_000)).toBeCloseTo(0.000046, 9);
  });

  it("provides a stable preflight token estimate", () => {
    expect(estimateTokens("12345678")).toBe(2);
    expect(estimateTokens("")).toBe(1);
  });
});
