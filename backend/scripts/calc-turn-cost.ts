/// <reference types="node" />

type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
};

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-20250514': { inputPerMillion: 15, outputPerMillion: 75, cacheReadPerMillion: 1.5, cacheWritePerMillion: 18.75 },
  'claude-sonnet-4-20250514': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  'claude-3-5-haiku-20241022': { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08, cacheWritePerMillion: 1 },
  'claude-3-haiku-20240307': { inputPerMillion: 0.25, outputPerMillion: 1.25, cacheReadPerMillion: 0.03, cacheWritePerMillion: 0.3 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4-turbo': { inputPerMillion: 10, outputPerMillion: 30 },
  'o1': { inputPerMillion: 15, outputPerMillion: 60 },
  'o1-mini': { inputPerMillion: 3, outputPerMillion: 12 },
  'o3-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-2.0-flash-lite': { inputPerMillion: 0.02, outputPerMillion: 0.08 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5 },
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  'llama-3.3-70b': { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  'llama-3.1-8b': { inputPerMillion: 0.05, outputPerMillion: 0.08 },
  'us.anthropic.claude-sonnet-4-20250514-v1:0': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
  'us.anthropic.claude-3-5-haiku-20241022-v1:0': { inputPerMillion: 0.8, outputPerMillion: 4, cacheReadPerMillion: 0.08, cacheWritePerMillion: 1 },
  'ap-southeast-1.anthropic.claude-sonnet-4-20250514-v1:0': { inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3, cacheWritePerMillion: 3.75 },
};

const FALLBACK_PRICING: ModelPricing = {
  inputPerMillion: 3,
  outputPerMillion: 15,
};

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function readNumber(name: string): number {
  const raw = readArg(name);
  if (!raw) {
    return 0;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPricing(model: string): ModelPricing {
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }

  const normalizedModel = model.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (normalizedModel.includes(key) || key.includes(normalizedModel)) {
      return pricing;
    }
  }

  return FALLBACK_PRICING;
}

function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  const pricing = getPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  const cacheReadCost = pricing.cacheReadPerMillion
    ? (cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion
    : 0;
  const cacheWriteCost = pricing.cacheWritePerMillion
    ? (cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillion
    : 0;

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

function formatCost(costUsd: number): string {
  if (costUsd < 0.001) return `$${(costUsd * 100).toFixed(4)}¢`;
  if (costUsd < 0.01) return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(3)}`;
}

const model = readArg('model') || 'claude-sonnet-4-20250514';
const inputTokens = readNumber('input');
const outputTokens = readNumber('output');
const cacheReadTokens = readNumber('cache-read');
const cacheWriteTokens = readNumber('cache-write');

const costUsd = calculateCost(model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);

process.stdout.write(JSON.stringify({
  model,
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
  costUsd,
  formattedCost: formatCost(costUsd),
}, null, 2));