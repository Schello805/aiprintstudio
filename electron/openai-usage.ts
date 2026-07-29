export const openAiPricing = {
  model: "gpt-5.6-sol",
  inputUsdPerMillion: 5,
  cachedInputUsdPerMillion: 0.5,
  outputUsdPerMillion: 30,
  usdToEurEstimate: 0.92
} as const;

export function calculateAiCost(inputTokens: number, outputTokens: number, cachedTokens = 0): number {
  const safeInput = Math.max(0, inputTokens);
  const safeCached = Math.min(safeInput, Math.max(0, cachedTokens));
  const regularInput = safeInput - safeCached;
  const usd = (
    regularInput * openAiPricing.inputUsdPerMillion +
    safeCached * openAiPricing.cachedInputUsdPerMillion +
    Math.max(0, outputTokens) * openAiPricing.outputUsdPerMillion
  ) / 1_000_000;
  return usd * openAiPricing.usdToEurEstimate;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
