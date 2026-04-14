import { NativeModules } from 'react-native';
import { OtaModelDownloadService } from './otaModelDownload.service';

export type MobileLocalChatRole = 'system' | 'user' | 'assistant';

export type MobileLocalChatContentPart =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
      };
    }
  | {
      type: 'input_audio';
      input_audio: {
        format: 'wav' | 'mp3';
        url?: string;
        data?: string;
      };
    };

export type MobileLocalChatContent = string | MobileLocalChatContentPart[];

export interface MobileLocalChatMessage {
  role: MobileLocalChatRole;
  content: MobileLocalChatContent;
}

export interface MobileLocalRuntimeCapabilities {
  available: boolean;
  runtimeSource: 'unavailable' | 'native' | 'global';
  supportsTextGeneration: boolean;
  supportsStreaming: boolean;
  supportsVisionInput: boolean;
  supportsAudioInput: boolean;
  supportsAudioOutput: boolean;
}

type LocalBridgeGenerateResult =
  | string
  | {
      text?: string;
      content?: string;
      reply?: string;
    };

type LocalBridge = {
  isAvailable?: (options?: { model?: string }) => boolean | Promise<boolean>;
  getCapabilities?: (options?: { model?: string }) => Partial<MobileLocalRuntimeCapabilities> | Promise<Partial<MobileLocalRuntimeCapabilities>>;
  generate?: (payload: {
    model?: string;
    messages: MobileLocalChatMessage[];
    temperature?: number;
    maxTokens?: number;
  }) => Promise<LocalBridgeGenerateResult>;
  generateStream?: (payload: {
    model?: string;
    messages: MobileLocalChatMessage[];
    temperature?: number;
    maxTokens?: number;
    onToken?: (chunk: string) => void;
  }) => Promise<string[] | LocalBridgeGenerateResult>;
};

type ResolvedLocalBridge = {
  bridge: LocalBridge;
  source: 'native' | 'global';
};

const DEFAULT_MODEL_ID = 'gemma-4-2b';
const DEFAULT_MODEL_LABEL = 'Gemma 4 E2B (Local)';
const DEFAULT_RUNTIME_CAPABILITIES: MobileLocalRuntimeCapabilities = {
  available: false,
  runtimeSource: 'unavailable',
  supportsTextGeneration: false,
  supportsStreaming: false,
  supportsVisionInput: false,
  supportsAudioInput: false,
  supportsAudioOutput: false,
};

function resolveBridge(): ResolvedLocalBridge | null {
  const nativeBridge = (NativeModules as Record<string, unknown>)?.AgentrixLocalLLM as LocalBridge | undefined;
  if (nativeBridge) {
    return { bridge: nativeBridge, source: 'native' };
  }

  const globalBridge = (globalThis as { __AGENTRIX_LOCAL_LLM__?: LocalBridge }).__AGENTRIX_LOCAL_LLM__;
  return globalBridge ? { bridge: globalBridge, source: 'global' } : null;
}

function buildDeclaredCapabilities(
  resolvedBridge: ResolvedLocalBridge | null,
  options?: { model?: string },
): MobileLocalRuntimeCapabilities {
  if (!resolvedBridge) {
    return DEFAULT_RUNTIME_CAPABILITIES;
  }

  const { bridge, source } = resolvedBridge;
  const supportsTextGeneration = typeof bridge.generate === 'function' || typeof bridge.generateStream === 'function';
  const supportsStreaming = typeof bridge.generateStream === 'function';
  let available = supportsTextGeneration || supportsStreaming;

  if (typeof bridge.isAvailable === 'function') {
    try {
      const immediateAvailability = bridge.isAvailable(options);
      if (typeof immediateAvailability === 'boolean') {
        available = immediateAvailability;
      }
    } catch {
      available = false;
    }
  }

  const modelId = options?.model;
  const staticLocalCapabilityOverride = modelId && OtaModelDownloadService.getModelEntry(modelId)
    ? {
        available: OtaModelDownloadService.isModelDownloaded(modelId),
        supportsVisionInput: OtaModelDownloadService.hasMultimodalAssets(modelId)
          && OtaModelDownloadService.declaresVisionInput(modelId),
        supportsAudioInput: OtaModelDownloadService.hasMultimodalAssets(modelId)
          && OtaModelDownloadService.declaresAudioInput(modelId),
        supportsAudioOutput: OtaModelDownloadService.hasAnyOnDeviceAudioOutputAssets(modelId),
      }
    : null;

  return {
    available: staticLocalCapabilityOverride?.available ?? available,
    runtimeSource: source,
    supportsTextGeneration,
    supportsStreaming,
    supportsVisionInput: staticLocalCapabilityOverride?.supportsVisionInput ?? false,
    supportsAudioInput: staticLocalCapabilityOverride?.supportsAudioInput ?? false,
    supportsAudioOutput: staticLocalCapabilityOverride?.supportsAudioOutput ?? false,
  };
}

function mergeCapabilities(
  declared: MobileLocalRuntimeCapabilities,
  override: Partial<MobileLocalRuntimeCapabilities> | null | undefined,
): MobileLocalRuntimeCapabilities {
  if (!override) {
    return declared;
  }

  return {
    available: typeof override.available === 'boolean' ? override.available : declared.available,
    runtimeSource: override.runtimeSource || declared.runtimeSource,
    supportsTextGeneration: typeof override.supportsTextGeneration === 'boolean'
      ? override.supportsTextGeneration
      : declared.supportsTextGeneration,
    supportsStreaming: typeof override.supportsStreaming === 'boolean'
      ? override.supportsStreaming
      : declared.supportsStreaming,
    supportsVisionInput: typeof override.supportsVisionInput === 'boolean'
      ? override.supportsVisionInput
      : declared.supportsVisionInput,
    supportsAudioInput: typeof override.supportsAudioInput === 'boolean'
      ? override.supportsAudioInput
      : declared.supportsAudioInput,
    supportsAudioOutput: typeof override.supportsAudioOutput === 'boolean'
      ? override.supportsAudioOutput
      : declared.supportsAudioOutput,
  };
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return !!value && typeof value === 'object' && typeof (value as Promise<T>).then === 'function';
}

function extractText(result: LocalBridgeGenerateResult | null | undefined): string {
  if (!result) {
    return '';
  }

  if (typeof result === 'string') {
    return result;
  }

  return String(result.text || result.content || result.reply || '');
}

function extractErrorMessage(error: unknown, fallback: string): string {
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

  return fallback;
}

function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const sentenceMatches = trimmed.match(/[^。！？.!?\n]+[。！？.!?\n]*/g);
  if (sentenceMatches?.length) {
    return sentenceMatches.map((item) => item.trim()).filter(Boolean);
  }

  return trimmed.match(/.{1,48}(?:\s+|$)/g)?.map((item) => item.trim()).filter(Boolean) || [trimmed];
}

function normalizeLocalOutput(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }

  // Strip <think>…</think> and <|channel>thought…<|channel> blocks (Gemma 4 format)
  let cleaned = trimmed
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\|channel>thought[\s\S]*?<\|channel>/gi, '')
    .replace(/<\|channel>thought[\s\S]*$/gi, '') // unclosed trailing block
    .trim();

  if (!cleaned) {
    return '';
  }

  if (!/^Thinking Process:/i.test(cleaned)) {
    return cleaned;
  }

  const parts = cleaned.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    const tail = parts[parts.length - 1];
    if (tail && !/^Thinking Process:/i.test(tail)) {
      return tail;
    }
  }

  return cleaned;
}

/**
 * Streaming filter: buffers chunks to detect and strip thinking blocks that
 * arrive incrementally (e.g. `<|channel>thought … <|channel>`).
 */
function createStreamThinkingFilter(): (chunk: string) => string {
  let buffering = false;
  let buffer = '';

  return (chunk: string): string => {
    if (buffering) {
      buffer += chunk;
      // Check for closing tag
      const closeIdx = buffer.indexOf('<|channel>');
      if (closeIdx !== -1) {
        // Found closing tag — discard everything up to and including it
        const afterClose = buffer.slice(closeIdx + '<|channel>'.length);
        buffering = false;
        buffer = '';
        return afterClose;
      }
      if (buffer.includes('</think>')) {
        const afterClose = buffer.split('</think>').pop() || '';
        buffering = false;
        buffer = '';
        return afterClose;
      }
      return ''; // Still buffering — suppress output
    }

    // Detect start of thinking block
    const combined = chunk;
    if (combined.includes('<|channel>thought') || combined.includes('<think>')) {
      buffering = true;
      // Keep anything before the tag
      const startMarker = combined.includes('<|channel>thought')
        ? '<|channel>thought'
        : '<think>';
      const startIdx = combined.indexOf(startMarker);
      const before = combined.slice(0, startIdx);
      buffer = combined.slice(startIdx);

      // Check if the whole block is in one chunk
      const closeTag = startMarker === '<think>' ? '</think>' : '<|channel>';
      const afterStart = buffer.slice(startMarker.length);
      const closeIdx = afterStart.indexOf(closeTag);
      if (closeIdx !== -1) {
        const afterClose = afterStart.slice(closeIdx + closeTag.length);
        buffering = false;
        buffer = '';
        return before + afterClose;
      }

      return before;
    }

    // Also strip "Thinking Process:" prefix lines from streaming
    if (/^Thinking Process:/i.test(combined.trimStart())) {
      return '';
    }

    return chunk;
  };
}

export class MobileLocalInferenceService {
  static readonly modelId = DEFAULT_MODEL_ID;
  static readonly modelLabel = DEFAULT_MODEL_LABEL;

  static getDeclaredCapabilities(options?: { model?: string }): MobileLocalRuntimeCapabilities {
    const resolvedBridge = resolveBridge();
    const declared = buildDeclaredCapabilities(resolvedBridge, options);
    const capabilityOverride = resolvedBridge?.bridge.getCapabilities?.(options);

    if (!capabilityOverride || isPromiseLike(capabilityOverride)) {
      return declared;
    }

    return mergeCapabilities(declared, capabilityOverride);
  }

  static async getCapabilities(options?: { model?: string }): Promise<MobileLocalRuntimeCapabilities> {
    const resolvedBridge = resolveBridge();
    const declared = buildDeclaredCapabilities(resolvedBridge, options);
    if (!resolvedBridge) {
      return declared;
    }

    let merged = declared;
    if (typeof resolvedBridge.bridge.getCapabilities === 'function') {
      try {
        const capabilityOverride = await resolvedBridge.bridge.getCapabilities(options);
        merged = mergeCapabilities(declared, capabilityOverride);
      } catch {
        merged = declared;
      }
    }

    try {
      const available = await this.isAvailable(options?.model);
      return {
        ...merged,
        available,
      };
    } catch {
      return merged;
    }
  }

  static async isAvailable(model?: string): Promise<boolean> {
    const resolvedBridge = resolveBridge();
    if (!resolvedBridge) {
      return false;
    }
    const { bridge } = resolvedBridge;

    if (typeof bridge.isAvailable === 'function') {
      try {
        return await bridge.isAvailable(model ? { model } : undefined);
      } catch {
        return false;
      }
    }

    return typeof bridge.generate === 'function' || typeof bridge.generateStream === 'function';
  }

  static async generate(messages: MobileLocalChatMessage[], options?: { model?: string; temperature?: number; maxTokens?: number }): Promise<string> {
    const resolvedBridge = resolveBridge();
    if (!resolvedBridge) {
      throw new Error('Local mobile inference bridge is not available on this device.');
    }
    const { bridge } = resolvedBridge;

    try {
      if (typeof bridge.generate === 'function') {
        const result = await bridge.generate({
          model: options?.model || DEFAULT_MODEL_ID,
          messages,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        });
        return normalizeLocalOutput(extractText(result));
      }

      if (typeof bridge.generateStream === 'function') {
        const streamed = await bridge.generateStream({
          model: options?.model || DEFAULT_MODEL_ID,
          messages,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
        });

        if (Array.isArray(streamed)) {
          return normalizeLocalOutput(streamed.join(''));
        }

        return normalizeLocalOutput(extractText(streamed));
      }
    } catch (error) {
      throw new Error(extractErrorMessage(error, 'Local model inference failed.'));
    }

    throw new Error('Local mobile inference bridge does not implement a generate API.');
  }

  static async *generateTextStream(
    messages: MobileLocalChatMessage[],
    options?: { model?: string; temperature?: number; maxTokens?: number },
  ): AsyncGenerator<string> {
    const resolvedBridge = resolveBridge();
    if (!resolvedBridge) {
      throw new Error('Local mobile inference bridge is not available on this device.');
    }
    const { bridge, source } = resolvedBridge;

    if (typeof bridge.generateStream === 'function') {
      const queuedChunks: string[] = [];
      let streamCompleted = false;
      let streamError: unknown;
      let receivedIncrementalChunk = false;
      let wakeConsumer: (() => void) | null = null;
      const thinkingFilter = createStreamThinkingFilter();
      const waitForChunk = () => new Promise<void>((resolve) => {
        wakeConsumer = resolve;
      });

      const pushChunk = (chunk: string) => {
        if (!chunk) {
          return;
        }

        queuedChunks.push(chunk);
        if (wakeConsumer) {
          const resolve = wakeConsumer;
          wakeConsumer = null;
          resolve();
        }
      };

      const handleIncrementalChunk = (chunk: string) => {
        if (!chunk) {
          return;
        }

        receivedIncrementalChunk = true;
        const filtered = thinkingFilter(chunk);
        if (filtered) {
          pushChunk(filtered);
        }
      };

      const streamPromise = bridge.generateStream({
        model: options?.model || DEFAULT_MODEL_ID,
        messages,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
        ...(source === 'global' ? { onToken: handleIncrementalChunk } : {}),
      }).then((streamed) => {
        if (!receivedIncrementalChunk) {
          if (Array.isArray(streamed)) {
            const normalized = normalizeLocalOutput(streamed.join(''));
            for (const chunk of chunkText(normalized)) {
              pushChunk(chunk);
            }
          } else {
            const text = normalizeLocalOutput(extractText(streamed));
            if (text) {
              pushChunk(text);
            }
          }
        }

        streamCompleted = true;
        if (wakeConsumer) {
          const resolve = wakeConsumer;
          wakeConsumer = null;
          resolve();
        }
      }).catch((error) => {
        streamError = error;
        streamCompleted = true;
        if (wakeConsumer) {
          const resolve = wakeConsumer;
          wakeConsumer = null;
          resolve();
        }
      });

      while (!streamCompleted || queuedChunks.length > 0) {
        if (queuedChunks.length === 0) {
          await waitForChunk();
          continue;
        }

        const nextChunk = queuedChunks.shift();
        if (nextChunk) {
          yield nextChunk;
        }
      }

      await streamPromise;
      if (streamError) {
        throw new Error(extractErrorMessage(streamError, 'Local model inference failed.'));
      }

      return;
    }

    const text = normalizeLocalOutput(await this.generate(messages, options));
    for (const chunk of chunkText(text)) {
      yield chunk;
    }
  }
}