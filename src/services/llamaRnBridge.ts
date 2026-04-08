/**
 * llama.rn Bridge for Mobile On-Device LLM Inference
 *
 * Uses llama.rn (React Native binding for llama.cpp) to run GGUF models
 * on-device. Registers as globalThis.__AGENTRIX_LOCAL_LLM__ so the existing
 * MobileLocalInferenceService picks it up automatically.
 *
 * Model files are downloaded by OtaModelDownloadService to the device's
 * document directory under models/.
 */

import { initLlama, type LlamaContext } from 'llama.rn';
import { AppState, type AppStateStatus } from 'react-native';
import { OtaModelDownloadService } from './otaModelDownload.service';
import type { MobileLocalChatMessage } from './mobileLocalInference.service';

// ── Context Pool ───────────────────────────────────────

let activeContext: LlamaContext | null = null;
let activeModelId: string | null = null;
let loadingPromise: Promise<LlamaContext | null> | null = null;

const STOP_TOKENS = [
  '<end_of_turn>',
  '<|end|>',
  '<|eot_id|>',
  '<|im_end|>',
  '<|endoftext|>',
  '</s>',
];

async function getOrLoadContext(modelId: string): Promise<LlamaContext> {
  if (activeContext && activeModelId === modelId) {
    return activeContext;
  }

  if (loadingPromise && activeModelId === modelId) {
    const ctx = await loadingPromise;
    if (ctx) return ctx;
  }

  // Release previous context
  if (activeContext) {
    try {
      await activeContext.release();
    } catch { /* ignore */ }
    activeContext = null;
    activeModelId = null;
  }

  const modelPath = OtaModelDownloadService.getLocalPath(modelId);
  if (!modelPath) {
    throw new Error(`Model ${modelId} is not downloaded. Go to Settings → Local Model to download.`);
  }

  activeModelId = modelId;
  loadingPromise = initLlama({
    model: modelPath,
    n_ctx: 2048,
    n_gpu_layers: 99, // Metal on iOS, OpenCL on Android if available
    use_mlock: true,
  }).catch((err) => {
    activeModelId = null;
    loadingPromise = null;
    throw err;
  });

  const ctx = await loadingPromise;
  activeContext = ctx;
  loadingPromise = null;
  return ctx;
}

// ── Bridge Implementation ──────────────────────────────

const KNOWN_MODEL_IDS = ['gemma-4-2b', 'gemma-4-4b'];

const bridge = {
  isAvailable(): boolean {
    return KNOWN_MODEL_IDS.some((id) => OtaModelDownloadService.isModelDownloaded(id));
  },

  async generate(payload: {
    model?: string;
    messages: MobileLocalChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const modelId = resolveModelId(payload.model);
    const context = await getOrLoadContext(modelId);

    const result = await context.completion({
      messages: payload.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      n_predict: payload.maxTokens || 512,
      temperature: payload.temperature ?? 0.7,
      stop: STOP_TOKENS,
    });

    return result.text;
  },

  async generateStream(payload: {
    model?: string;
    messages: MobileLocalChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string[]> {
    const modelId = resolveModelId(payload.model);
    const context = await getOrLoadContext(modelId);

    const tokens: string[] = [];

    await context.completion(
      {
        messages: payload.messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
        n_predict: payload.maxTokens || 512,
        temperature: payload.temperature ?? 0.7,
        stop: STOP_TOKENS,
      },
      (data) => {
        if (data.token) {
          tokens.push(data.token);
        }
      },
    );

    return tokens;
  },
};

function resolveModelId(input?: string): string {
  if (!input) return 'gemma-4-2b';

  // Alias normalization: gemma-nano-2b variants → gemma-4-2b
  const lower = input.toLowerCase();
  if (lower.includes('nano') || lower === 'gemma-nano-2b' || lower === 'gemma-nano-2b-local') {
    return 'gemma-4-2b';
  }

  if (KNOWN_MODEL_IDS.includes(input)) {
    return input;
  }

  // Default to smallest model
  return 'gemma-4-2b';
}

// ── Lifecycle ──────────────────────────────────────────

function handleAppStateChange(state: AppStateStatus) {
  if (state === 'background' || state === 'inactive') {
    // Release model from memory when app backgrounds to save RAM
    if (activeContext) {
      activeContext.release().catch(() => {});
      activeContext = null;
      activeModelId = null;
      loadingPromise = null;
    }
  }
}

// ── Registration ───────────────────────────────────────

export function initLlamaBridge(): void {
  (globalThis as { __AGENTRIX_LOCAL_LLM__?: typeof bridge }).__AGENTRIX_LOCAL_LLM__ = bridge;
  AppState.addEventListener('change', handleAppStateChange);
}

export async function releaseLlamaBridge(): Promise<void> {
  if (activeContext) {
    await activeContext.release();
    activeContext = null;
    activeModelId = null;
    loadingPromise = null;
  }
  (globalThis as { __AGENTRIX_LOCAL_LLM__?: typeof bridge }).__AGENTRIX_LOCAL_LLM__ = undefined;
}
