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

import { File as ExpoFile } from 'expo-file-system';
import type { LlamaContext } from 'llama.rn';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { OtaModelDownloadService } from './otaModelDownload.service';
import { addVoiceDiagnostic } from './voiceDiagnostics';
import {
  getLocalLlamaModelPathCandidates,
  resolveLocalLlamaContextInitOptions,
} from './llamaContextConfig.service';
import type {
  MobileLocalChatContentPart,
  MobileLocalChatMessage,
  MobileLocalRuntimeCapabilities,
} from './mobileLocalInference.service';

// ── Context Pool ───────────────────────────────────────

let activeContext: LlamaContext | null = null;
let activeModelId: string | null = null;
let loadingPromise: Promise<LlamaContext | null> | null = null;
let activeContextProfile: ContextProfile | null = null;
let loadingContextProfile: ContextProfile | null = null;
let activeMultimodalInitialized = false;
let activeRuntimeCapabilities: MobileLocalRuntimeCapabilities | null = null;
let lastContextInitError: string | null = null;

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

type ContextProfile = 'text' | 'multimodal';

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
};

type LlamaRnModule = Pick<typeof import('llama.rn'), 'initLlama' | 'loadLlamaModelInfo'>;

let cachedLlamaRnModule: LlamaRnModule | null = null;

function getLlamaRnModule(): LlamaRnModule {
  if (Platform.OS === 'web') {
    throw new Error('llama.rn is unavailable on web.');
  }

  if (!cachedLlamaRnModule) {
    cachedLlamaRnModule = require('llama.rn') as LlamaRnModule;
  }

  return cachedLlamaRnModule;
}

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

function resolveContextProfile(messages: MobileLocalChatMessage[]): ContextProfile {
  const requirements = getMessageRequirements(messages);
  return requirements.needsVision || requirements.needsAudioInput ? 'multimodal' : 'text';
}

function profileSatisfies(requested: ContextProfile, active: ContextProfile | null): boolean {
  return active === requested || (requested === 'text' && active === 'multimodal');
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    for (const key of ['message', 'reason', 'error', 'detail', 'code']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') {
        return serialized;
      }
    } catch {}
  }

  return '';
}

async function initializeContext(modelPath: string, profile: ContextProfile): Promise<LlamaContext> {
  const llamaRnModule = getLlamaRnModule();
  const pathCandidates = getLocalLlamaModelPathCandidates(modelPath);
  let lastPrimaryError: unknown = null;
  let lastFallbackError: unknown = null;
  let lastModelInfoError: unknown = null;

  for (const candidate of pathCandidates) {
    try {
      await llamaRnModule.loadLlamaModelInfo(candidate);
    } catch (error) {
      lastModelInfoError = error;
    }

    try {
      return await llamaRnModule.initLlama({
        model: candidate,
        ...resolveLocalLlamaContextInitOptions(profile, 'primary', Platform.OS),
      });
    } catch (primaryError) {
      lastPrimaryError = primaryError;
      try {
        return await llamaRnModule.initLlama({
          model: candidate,
          ...resolveLocalLlamaContextInitOptions(profile, 'fallback', Platform.OS),
        });
      } catch (fallbackError) {
        lastFallbackError = fallbackError;
      }
    }
  }

  const reason = formatUnknownError(lastFallbackError)
    || formatUnknownError(lastPrimaryError)
    || formatUnknownError(lastModelInfoError)
    || 'unknown runtime error';
  throw new Error(`Failed to initialize the on-device ${profile} runtime: ${reason}`);
}

async function getOrLoadContext(modelId: string, profile: ContextProfile = 'text'): Promise<LlamaContext> {
  if (activeContext && activeModelId === modelId && profileSatisfies(profile, activeContextProfile)) {
    return activeContext;
  }

  if (loadingPromise && activeModelId === modelId && profileSatisfies(profile, loadingContextProfile)) {
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
  loadingContextProfile = profile;
  addVoiceDiagnostic('local-model-runtime', 'context-init-start', {
    modelId,
    profile,
  });
  loadingPromise = initializeContext(modelPath, profile).catch((err) => {
    lastContextInitError = formatUnknownError(err) || 'unknown runtime error';
    addVoiceDiagnostic('local-model-runtime', 'context-init-failed', {
      modelId,
      profile,
      message: lastContextInitError,
    });
    activeModelId = null;
    loadingPromise = null;
    loadingContextProfile = null;
    throw err;
  });

  const ctx = await loadingPromise;
  activeContext = ctx;
  activeContextProfile = profile;
  loadingPromise = null;
  loadingContextProfile = null;
  activeMultimodalInitialized = false;
  activeRuntimeCapabilities = null;
  lastContextInitError = null;
  addVoiceDiagnostic('local-model-runtime', 'context-init-ready', {
    modelId,
    profile,
  });
  return ctx;
}

function resetRuntimeState() {
  activeContext = null;
  activeModelId = null;
  loadingPromise = null;
  activeContextProfile = null;
  loadingContextProfile = null;
  activeMultimodalInitialized = false;
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
      supportsVisionInput: KNOWN_MODEL_IDS.some((id) => (
        OtaModelDownloadService.hasMultimodalAssets(id)
        && OtaModelDownloadService.declaresVisionInput(id)
      )),
      supportsAudioInput: KNOWN_MODEL_IDS.some((id) => (
        OtaModelDownloadService.hasMultimodalAssets(id)
        && OtaModelDownloadService.declaresAudioInput(id)
      )),
      supportsAudioOutput: OtaModelDownloadService.hasAnyOnDeviceAudioOutputAssets(),
    };
  }

  return {
    available: OtaModelDownloadService.isModelDownloaded(modelId),
    runtimeSource: 'global',
    supportsTextGeneration: true,
    supportsStreaming: true,
    supportsVisionInput: OtaModelDownloadService.hasMultimodalAssets(modelId)
      && OtaModelDownloadService.declaresVisionInput(modelId),
    supportsAudioInput: OtaModelDownloadService.hasMultimodalAssets(modelId)
      && OtaModelDownloadService.declaresAudioInput(modelId),
    supportsAudioOutput: OtaModelDownloadService.hasAnyOnDeviceAudioOutputAssets(modelId),
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

      const projectorPathCandidates = getLocalLlamaModelPathCandidates(projectorPath);
      const multimodalInitAttempts = Platform.OS === 'android'
        ? [{ use_gpu: false }]
        : [{ use_gpu: true }, { use_gpu: false }];

      for (const candidate of projectorPathCandidates) {
        for (const attempt of multimodalInitAttempts) {
          try {
            activeMultimodalInitialized = await extendedContext.initMultimodal({
              path: candidate,
              use_gpu: attempt.use_gpu,
              image_max_tokens: 512,
            });
          } catch {
            activeMultimodalInitialized = false;
          }

          if (activeMultimodalInitialized) {
            break;
          }
        }

        if (activeMultimodalInitialized) {
          break;
        }
      }
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

async function ensureRuntimeCapabilities(modelId: string): Promise<MobileLocalRuntimeCapabilities> {
  if (!OtaModelDownloadService.isModelDownloaded(modelId)) {
    return buildStaticCapabilities(modelId);
  }

  if (activeContext && activeModelId === modelId && activeRuntimeCapabilities) {
    return activeRuntimeCapabilities;
  }

  // Probe capabilities WITHOUT eagerly loading the multimodal projector.
  // Loading the 986MB projector during capability probing causes OOM crashes
  // on Android devices with limited RAM. Instead, determine multimodal support
  // from file presence + declared capabilities, and only load the projector
  // lazily when the user actually sends a multimodal message.
  const staticCaps = buildStaticCapabilities(modelId);
  const hasProjector = OtaModelDownloadService.hasMultimodalAssets(modelId)
    && !!OtaModelDownloadService.getMultimodalProjectorPath(modelId);

  activeRuntimeCapabilities = {
    ...staticCaps,
    supportsVisionInput: hasProjector && staticCaps.supportsVisionInput,
    supportsAudioInput: staticCaps.supportsAudioInput,
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
    throw new Error('The selected local package is missing image support on this device.');
  }

  if (requirements.needsAudioInput && !capabilities.supportsAudioInput) {
    throw new Error('The selected local model does not expose on-device audio input on this device yet.');
  }
}

function inferMimeTypeFromUri(uri: string, fallback: string): string {
  const normalized = uri.split('?')[0]?.toLowerCase() || '';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.bmp')) return 'image/bmp';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.mp3')) return 'audio/mpeg';
  if (normalized.endsWith('.wav')) return 'audio/wav';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  return fallback;
}

function audioMimeTypeFromFormat(format: string): string {
  return format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
}

async function readContentUriAsDataUrl(uri: string, mimeType: string): Promise<string> {
  try {
    const file = new ExpoFile(uri);
    const resolvedMimeType = file.type || inferMimeTypeFromUri(uri, mimeType);
    const base64 = await file.base64();
    return `data:${resolvedMimeType};base64,${base64}`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read local media attachment: ${reason}`);
  }
}

async function normalizeContentPart(part: MobileLocalChatContentPart): Promise<Record<string, unknown>> {
  if (part.type === 'text') {
    return part;
  }

  if (part.type === 'image_url') {
    const url = part.image_url.url;
    if (!url.startsWith('content://')) {
      return part;
    }

    return {
      type: 'image_url',
      image_url: {
        url: await readContentUriAsDataUrl(url, 'image/jpeg'),
      },
    };
  }

  if (part.input_audio.data || !part.input_audio.url?.startsWith('content://')) {
    return part;
  }

  const data = await readContentUriAsDataUrl(
    part.input_audio.url,
    audioMimeTypeFromFormat(part.input_audio.format),
  );

  return {
    type: 'input_audio',
    input_audio: {
      format: part.input_audio.format,
      data,
    },
  };
}

async function toNormalizedCompletionMessages(
  messages: MobileLocalChatMessage[],
): Promise<CompletionMessage[]> {
  return Promise.all(messages.map(async (message) => {
    if (!Array.isArray(message.content)) {
      return {
        role: message.role as 'system' | 'user' | 'assistant',
        content: message.content,
      };
    }

    return {
      role: message.role as 'system' | 'user' | 'assistant',
      content: await Promise.all(message.content.map((part) => normalizeContentPart(part))),
    };
  }));
}

// ── Bridge Implementation ──────────────────────────────

const KNOWN_MODEL_IDS = ['gemma-4-2b', 'gemma-4-4b', 'qwen2.5-omni-3b'];

function getBridgeCapabilities(options?: { model?: string }): Partial<MobileLocalRuntimeCapabilities> {
  const modelId = resolveCapabilityModelId(options?.model);
  return buildStaticCapabilities(modelId);
}

const bridge = {
  async isAvailable(options?: { model?: string }): Promise<boolean> {
    const modelId = resolveCapabilityModelId(options?.model);
    if (!modelId || !OtaModelDownloadService.isModelDownloaded(modelId)) {
      return false;
    }

    try {
      await getOrLoadContext(modelId, 'text');
      lastContextInitError = null;
      return true;
    } catch (error) {
      lastContextInitError = formatUnknownError(error) || lastContextInitError || 'unknown runtime error';
      return false;
    }
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
    const contextProfile = resolveContextProfile(payload.messages);
    await ensureMessageSupport(modelId, payload.messages);
    const context = await getOrLoadContext(modelId, contextProfile);

    if (contextProfile === 'multimodal') {
      await ensureMultimodalSupport(context, modelId);
    }

    const completionMessages = await toNormalizedCompletionMessages(payload.messages);

    const result = await context.completion({
      messages: completionMessages,
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
    const contextProfile = resolveContextProfile(payload.messages);
    await ensureMessageSupport(modelId, payload.messages);
    const context = await getOrLoadContext(modelId, contextProfile);

    // Lazily load the multimodal projector only when the message actually
    // contains images.  This avoids a 986 MB projector load during capability
    // probing, which caused OOM crashes on Android devices with limited RAM.
    if (contextProfile === 'multimodal') {
      await ensureMultimodalSupport(context, modelId);
    }

    const completionMessages = await toNormalizedCompletionMessages(payload.messages);

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
        messages: completionMessages,
        n_predict: payload.maxTokens || 512,
        temperature: payload.temperature ?? 0.7,
        stop: STOP_TOKENS,
      } as any),
      (data) => {
        const tokenText = typeof data.token === 'string' ? data.token : '';
        if (tokenText) {
          pendingChunk += tokenText;
          if (shouldFlushStreamChunk(tokenText, pendingChunk)) {
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
  if (Platform.OS === 'web') {
    return;
  }

  (globalThis as { __AGENTRIX_LOCAL_LLM__?: typeof bridge }).__AGENTRIX_LOCAL_LLM__ = bridge;
  AppState.addEventListener('change', handleAppStateChange);
}

export async function releaseLlamaBridge(): Promise<void> {
  await releaseActiveContext();
  (globalThis as { __AGENTRIX_LOCAL_LLM__?: typeof bridge }).__AGENTRIX_LOCAL_LLM__ = undefined;
}
