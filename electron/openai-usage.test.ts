import { describe, expect, it } from "vitest";
import { calculateAiCost, estimateTokens, getOpenAiModel, listOpenAiModels } from "./openai-usage";

describe("OpenAI usage estimate", () => {
  it("calculates input, cached input and output with the configured EUR estimate", () => {
    expect(calculateAiCost("gpt-5.6-sol", 1_000_000, 1_000_000, 200_000)).toBeCloseTo(31.372, 6);
  });

  it("never bills more cached tokens than total input tokens", () => {
    expect(calculateAiCost("gpt-5.6-sol", 100, 0, 1_000)).toBeCloseTo(0.000046, 9);
  });

  it("provides a stable preflight token estimate", () => {
    expect(estimateTokens("12345678")).toBe(2);
    expect(estimateTokens("")).toBe(1);
  });

  it("lists only supported models with increasing typical costs", () => {
    const models = listOpenAiModels();
    expect(models.map((model) => model.id)).toEqual(["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]);
    expect(models[0].typicalCostEur).toBeGreaterThan(models[1].typicalCostEur);
    expect(models[1].typicalCostEur).toBeGreaterThan(models[2].typicalCostEur);
    expect(() => getOpenAiModel("unknown")).toThrow(/nicht unterstützt/);
  });
});
