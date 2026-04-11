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
import type { MobileLocalChatMessage, MobileLocalRuntimeCapabilities } from './mobileLocalInference.service';

// ── Context Pool ───────────────────────────────────────

let activeContext: LlamaContext | null = null;
let activeModelId: string | null = null;
let loadingPromise: Promise<LlamaContext | null> | null = null;
let activeMultimodalInitialized = false;
let activeVocoderInitialized = false;
let activeRuntimeCapabilities: MobileLocalRuntimeCapabilities | null = null;

const STOP_TOKENS = [
  '<end_of_turn>',
  '<|end|>',
  '<|eot_id|>',
  '<|im_end|>',
  '<|endoftext|>',
  '</s>',
];

const STREAM_SOFT_FLUSH_CHARS = 16;
const STREAM_HARD_FLUSH_CHARS = 28;

type MultimodalSupport = {
  vision: boolean;
  audio: boolean;
};

type MessageRequirements = {
  needsVision: boolean;
  needsAudioInput: boolean;
};

type CompletionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<Record<string, unknown>>;
};

type LlamaContextWithExtras = LlamaContext & {
  initMultimodal: (options: {
    path: string;
    use_gpu?: boolean;
    image_min_tokens?: number;
    image_max_tokens?: number;
  }) => Promise<boolean>;
  getMultimodalSupport: () => Promise<MultimodalSupport>;
  releaseMultimodal: () => Promise<void>;
  initVocoder: (options: {
    path: string;
    n_batch?: number;
  }) => Promise<boolean>;
  isVocoderEnabled: () => Promise<boolean>;
  releaseVocoder: () => Promise<void>;
};

function shouldFlushStreamChunk(token: string, pendingChunk: string): boolean {
  if (!token || !pendingChunk) {
    return false;
  }

  if (/[\n\r。！？.!?]$/.test(token)) {
    return true;
  }

  if (pendingChunk.length >= STREAM_HARD_FLUSH_CHARS) {
    return true;
  }

  return pendingChunk.length >= STREAM_SOFT_FLUSH_CHARS && /\s$/.test(token);
}

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
    await releaseActiveContext();
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
  activeMultimodalInitialized = false;
  activeVocoderInitialized = false;
  activeRuntimeCapabilities = null;
  return ctx;
}

function resetRuntimeState() {
  activeContext = null;
  activeModelId = null;
  loadingPromise = null;
  activeMultimodalInitialized = false;
  activeVocoderInitialized = false;
  activeRuntimeCapabilities = null;
}

function withExtras(context: LlamaContext): LlamaContextWithExtras {
  return context as unknown as LlamaContextWithExtras;
}

async function releaseActiveContext(): Promise<void> {
  if (!activeContext) {
    resetRuntimeState();
    return;
  }

  const context = activeContext;
  const extendedContext = withExtras(context);
  try {
    if (activeVocoderInitialized) {
      await extendedContext.releaseVocoder();
    }
  } catch {}

  try {
    if (activeMultimodalInitialized) {
      await extendedContext.releaseMultimodal();
    }
  } catch {}

  try {
    await context.release();
  } catch {}

  resetRuntimeState();
}

function resolveCapabilityModelId(input?: string): string | null {
  if (input) {
    return resolveModelId(input);
  }

  if (activeModelId) {
    return activeModelId;
  }

  return KNOWN_MODEL_IDS.find((id) => OtaModelDownloadService.isModelDownloaded(id)) || null;
}

function buildStaticCapabilities(modelId?: string | null): MobileLocalRuntimeCapabilities {
  if (!modelId) {
    return {
      available: KNOWN_MODEL_IDS.some((id) => OtaModelDownloadService.isModelDownloaded(id)),
      runtimeSource: 'global',
      supportsTextGeneration: true,
      supportsStreaming: true,
      supportsVisionInput: KNOWN_MODEL_IDS.some((id) => OtaModelDownloadService.hasMultimodalAssets(id)),
      supportsAudioInput: false,
      supportsAudioOutput: KNOWN_MODEL_IDS.some((id) => OtaModelDownloadService.hasVocoderAssets(id)),
    };
  }

  return {
    available: OtaModelDownloadService.isModelDownloaded(modelId),
    runtimeSource: 'global',
    supportsTextGeneration: true,
    supportsStreaming: true,
    supportsVisionInput: OtaModelDownloadService.hasMultimodalAssets(modelId),
    supportsAudioInput: false,
    supportsAudioOutput: OtaModelDownloadService.hasVocoderAssets(modelId),
  };
}

function getMessageRequirements(messages: MobileLocalChatMessage[]): MessageRequirements {
  return messages.reduce<MessageRequirements>((requirements, message) => {
    if (!Array.isArray(message.content)) {
      return requirements;
    }

    for (const part of message.content) {
      if (part.type === 'image_url') {
        requirements.needsVision = true;
      }

      if (part.type === 'input_audio') {
        if (part.input_audio?.format !== 'wav' && part.input_audio?.format !== 'mp3') {
          throw new Error(`Unsupported local audio format: ${part.input_audio?.format || 'unknown'}`);
        }

        requirements.needsAudioInput = true;
      }
    }

    return requirements;
  }, { needsVision: false, needsAudioInput: false });
}

async function ensureMultimodalSupport(
  context: LlamaContext,
  modelId: string,
): Promise<MultimodalSupport> {
  const extendedContext = withExtras(context);

  if (!OtaModelDownloadService.hasMultimodalAssets(modelId)) {
    return { vision: false, audio: false };
  }

  try {
    if (!activeMultimodalInitialized) {
      const projectorPath = OtaModelDownloadService.getMultimodalProjectorPath(modelId);
      if (!projectorPath) {
        return { vision: false, audio: false };
      }

      activeMultimodalInitialized = await extendedContext.initMultimodal({
        path: projectorPath,
        use_gpu: true,
        image_max_tokens: 512,
      });
    }

    if (!activeMultimodalInitialized) {
      return { vision: false, audio: false };
    }

    return await extendedContext.getMultimodalSupport();
  } catch {
    activeMultimodalInitialized = false;
    return { vision: false, audio: false };
  }
}

async function ensureVocoderSupport(
  context: LlamaContext,
  modelId: string,
): Promise<boolean> {
  const extendedContext = withExtras(context);

  if (!OtaModelDownloadService.hasVocoderAssets(modelId)) {
    return false;
  }

  try {
    if (!activeVocoderInitialized) {
      const vocoderPath = OtaModelDownloadService.getVocoderPath(modelId);
      if (!vocoderPath) {
        return false;
      }

      activeVocoderInitialized = await extendedContext.initVocoder({ path: vocoderPath });
    }

    return activeVocoderInitialized ? await extendedContext.isVocoderEnabled() : false;
  } catch {
    activeVocoderInitialized = false;
    return false;
  }
}

async function ensureRuntimeCapabilities(modelId: string): Promise<MobileLocalRuntimeCapabilities> {
  if (!OtaModelDownloadService.isModelDownloaded(modelId)) {
    return buildStaticCapabilities(modelId);
  }

  if (activeContext && activeModelId === modelId && activeRuntimeCapabilities) {
    return activeRuntimeCapabilities;
  }

  const context = await getOrLoadContext(modelId);
  const multimodalSupport = await ensureMultimodalSupport(context, modelId);
  const supportsAudioOutput = await ensureVocoderSupport(context, modelId);

  activeRuntimeCapabilities = {
    ...buildStaticCapabilities(modelId),
    supportsVisionInput: multimodalSupport.vision,
    supportsAudioInput: multimodalSupport.audio,
    supportsAudioOutput,
  };

  return activeRuntimeCapabilities;
}

async function ensureMessageSupport(modelId: string, messages: MobileLocalChatMessage[]): Promise<void> {
  const requirements = getMessageRequirements(messages);
  if (!requirements.needsVision && !requirements.needsAudioInput) {
    return;
  }

  const capabilities = await ensureRuntimeCapabilities(modelId);
  if (requirements.needsVision && !capabilities.supportsVisionInput) {
    throw new Error('Local Gemma package is missing image support on this device.');
  }

  if (requirements.needsAudioInput && !capabilities.supportsAudioInput) {
    throw new Error('Local Gemma audio input is not available for this model/runtime yet.');
  }
}

function toCompletionMessages(messages: MobileLocalChatMessage[]): CompletionMessage[] {
  return messages.map((message) => ({
    role: message.role as 'system' | 'user' | 'assistant',
    content: message.content as string | Array<Record<string, unknown>>,
  }));
}

// ── Bridge Implementation ──────────────────────────────

const KNOWN_MODEL_IDS = ['gemma-4-2b', 'gemma-4-4b'];

function getBridgeCapabilities(options?: { model?: string }): Partial<MobileLocalRuntimeCapabilities> {
  const modelId = resolveCapabilityModelId(options?.model);
  return buildStaticCapabilities(modelId);
}

const bridge = {
  isAvailable(options?: { model?: string }): boolean {
    const modelId = resolveCapabilityModelId(options?.model);
    return modelId
      ? OtaModelDownloadService.isModelDownloaded(modelId)
      : KNOWN_MODEL_IDS.some((id) => OtaModelDownloadService.isModelDownloaded(id));
  },

  async getCapabilities(options?: { model?: string }): Promise<Partial<MobileLocalRuntimeCapabilities>> {
    const modelId = resolveCapabilityModelId(options?.model);
    if (!modelId) {
      return getBridgeCapabilities(options);
    }

    try {
      return await ensureRuntimeCapabilities(modelId);
    } catch {
      return getBridgeCapabilities({ model: modelId });
    }
  },

  async generate(payload: {
    model?: string;
    messages: MobileLocalChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const modelId = resolveModelId(payload.model);
    await ensureMessageSupport(modelId, payload.messages);
    const context = await getOrLoadContext(modelId);

    const result = await context.completion({
      messages: toCompletionMessages(payload.messages),
      n_predict: payload.maxTokens || 512,
      temperature: payload.temperature ?? 0.7,
      stop: STOP_TOKENS,
    } as any);

    return result.text;
  },

  async generateStream(payload: {
    model?: string;
    messages: MobileLocalChatMessage[];
    temperature?: number;
    maxTokens?: number;
    onToken?: (chunk: string) => void;
  }): Promise<string[]> {
    const modelId = resolveModelId(payload.model);
    await ensureMessageSupport(modelId, payload.messages);
    const context = await getOrLoadContext(modelId);

    const chunks: string[] = [];
    let pendingChunk = '';

    const flushPendingChunk = () => {
      if (!pendingChunk) {
        return;
      }

      chunks.push(pendingChunk);
      payload.onToken?.(pendingChunk);
      pendingChunk = '';
    };

    await context.completion(
      ({
        messages: toCompletionMessages(payload.messages),
        n_predict: payload.maxTokens || 512,
        temperature: payload.temperature ?? 0.7,
        stop: STOP_TOKENS,
      } as any),
      (data) => {
        if (data.token) {
          pendingChunk += data.token;
          if (shouldFlushStreamChunk(data.token, pendingChunk)) {
            flushPendingChunk();
          }
        }
      },
    );

    flushPendingChunk();

    return chunks;
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
    void releaseActiveContext();
  }
}

// ── Registration ───────────────────────────────────────

export function initLlamaBridge(): void {
  (globalThis as { __AGENTRIX_LOCAL_LLM__?: typeof bridge }).__AGENTRIX_LOCAL_LLM__ = bridge;
  AppState.addEventListener('change', handleAppStateChange);
}

export async function releaseLlamaBridge(): Promise<void> {
  await releaseActiveContext();
  (globalThis as { __AGENTRIX_LOCAL_LLM__?: typeof bridge }).__AGENTRIX_LOCAL_LLM__ = undefined;
}
