/**
 * Tiny client for the LLM router endpoints.
 * Backend: backend/src/modules/llm-router/llm-router.controller.ts
 */
import { apiClient } from "./client";

export interface RouterTier {
  id: string;
  name: string;
  nameCn: string;
  icon: string;
  models: string[];
  cost: string;
  latency: string;
  description: string;
}

export interface RouterModel {
  id: string;
  name: string;
  provider: string;
  tiers: string[];
  maxTokens: number;
  supportsVision: boolean;
  cost: { inputPer1M: number; outputPer1M: number };
}

export interface RouterModelsResponse {
  default: "auto";
  auto: { id: "auto"; name: string; nameCn: string; provider: string; tier: string; isDefault: boolean; description: string };
  models: RouterModel[];
}

export const llmRouterApi = {
  tiers: async (): Promise<{ tiers: RouterTier[] } | null> =>
    apiClient.get("/llm-router/tiers"),
  models: async (): Promise<RouterModelsResponse | null> =>
    apiClient.get("/llm-router/models"),
  classify: async (
    prompt: string,
  ): Promise<{ tier: string; model: string; modelId: string; provider: string; reason: string } | null> =>
    apiClient.get(`/llm-router/classify?prompt=${encodeURIComponent(prompt)}`),
};
