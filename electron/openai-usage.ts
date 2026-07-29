export const openAiModels = [
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    role: "Beste Qualität",
    description: "Für komplexe Formen und die zuverlässigsten CAD-Pläne.",
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 30
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    role: "Empfohlen",
    description: "Sehr gute Balance aus Modellqualität und Kosten.",
    inputUsdPerMillion: 2.5,
    cachedInputUsdPerMillion: 0.25,
    outputUsdPerMillion: 15
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    role: "Günstig",
    description: "Für einfache Modelle und kostensensible Versuche.",
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.1,
    outputUsdPerMillion: 6
  }
] as const;

export type OpenAiModelId = typeof openAiModels[number]["id"];
export const defaultOpenAiModel: OpenAiModelId = "gpt-5.6-terra";
export const usdToEurEstimate = 0.92;

export function getOpenAiModel(modelId: string) {
  const model = openAiModels.find((candidate) => candidate.id === modelId);
  if (!model) throw new Error("Das ausgewählte OpenAI-Modell wird von dieser App-Version nicht unterstützt.");
  return model;
}

export function calculateAiCost(modelId: OpenAiModelId, inputTokens: number, outputTokens: number, cachedTokens = 0): number {
  const pricing = getOpenAiModel(modelId);
  const safeInput = Math.max(0, inputTokens);
  const safeCached = Math.min(safeInput, Math.max(0, cachedTokens));
  const regularInput = safeInput - safeCached;
  const usd = (
    regularInput * pricing.inputUsdPerMillion +
    safeCached * pricing.cachedInputUsdPerMillion +
    Math.max(0, outputTokens) * pricing.outputUsdPerMillion
  ) / 1_000_000;
  return usd * usdToEurEstimate;
}

export function listOpenAiModels() {
  return openAiModels.map((model) => ({
    ...model,
    typicalCostEur: calculateAiCost(model.id, 1_000, 2_000)
  }));
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
