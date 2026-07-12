import { NativeModules } from 'react-native';
import { OtaModelDownloadService } from './otaModelDownload.service';

export type MobileLocalChatRole = 'system' | 'user' | 'assistant' | 'tool';

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
  prewarmMultimodal?: (modelId: string) => Promise<void>;
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
        // Audio is handled by the whisper-base audio encoder (separate OTA asset).
        // supportsAudioInput is true only when the encoder is downloaded, because
        // the main model GGUF has no audio tokeniser — audio sent without the
        // encoder causes "Exception in HostFunction: <unknown>" in llama.cpp.
        supportsAudioInput: OtaModelDownloadService.hasAudioInputAssets(modelId),
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

/**
 * Strip known thinking trace markers from final model output.
 * Gemma 4: <|channel>thought\n...content...<channel|>
 * DeepSeek / generic: <think>...</think>
 */
function normalizeLocalOutput(text: string): string {
  let result = text;
  // Gemma 4 thinking channel
  result = result.replace(/<\|channel>thought[\s\S]*?<channel\|>/g, '');
  // Gemma chat template thinking turn
  result = result.replace(/<start_of_turn>thought[\s\S]*?<end_of_turn>/g, '');
  // Generic <think> blocks
  result = result.replace(/<think>[\s\S]*?<\/think>/g, '');
  return result.trim();
}

/**
 * Streaming thinking filter: buffers tokens that might be part of a thinking
 * block and only emits tokens that are confirmed user-visible content.
 */
export class StreamThinkingFilter {
  private buffer = '';
  private insideThinking = false;
  // Gemma 4 open tag chars
  private static readonly GEMMA_OPEN = '<|channel>thought';
  private static readonly GEMMA_CLOSE = '<channel|>';
  // Gemma chat template thinking turn
  private static readonly GEMMA_TURN_OPEN = '<start_of_turn>thought';
  private static readonly GEMMA_TURN_CLOSE = '<end_of_turn>';
  private static readonly THINK_OPEN = '<think>';
  private static readonly THINK_CLOSE = '</think>';

  /** Feed a token, returns the text that should be shown to the user (may be empty). */
  push(token: string): string {
    this.buffer += token;

    if (this.insideThinking) {
      // Look for close tag
      const gemmaClose = this.buffer.indexOf(StreamThinkingFilter.GEMMA_CLOSE);
      const gemmaTurnClose = this.buffer.indexOf(StreamThinkingFilter.GEMMA_TURN_CLOSE);
      const thinkClose = this.buffer.indexOf(StreamThinkingFilter.THINK_CLOSE);
      const candidates = [
        { idx: gemmaClose, tag: StreamThinkingFilter.GEMMA_CLOSE },
        { idx: gemmaTurnClose, tag: StreamThinkingFilter.GEMMA_TURN_CLOSE },
        { idx: thinkClose, tag: StreamThinkingFilter.THINK_CLOSE },
      ].filter(c => c.idx >= 0).sort((a, b) => a.idx - b.idx);
      const closeIdx = candidates[0]?.idx ?? -1;
      const closeTag = candidates[0]?.tag ?? StreamThinkingFilter.GEMMA_CLOSE;
      if (closeIdx >= 0) {
        this.insideThinking = false;
        this.buffer = this.buffer.slice(closeIdx + closeTag.length);
        // Recurse in case there's visible text after the close tag
        if (this.buffer) {
          const remaining = this.buffer;
          this.buffer = '';
          return this.push(remaining);
        }
        return '';
      }
      // Keep buffering, nothing to emit
      // Prevent unbounded buffer growth — keep only last 64 chars for tag matching
      if (this.buffer.length > 256) {
        this.buffer = this.buffer.slice(-64);
      }
      return '';
    }

    // Not inside thinking — check for open tag
    const openCandidates = [
      { idx: this.buffer.indexOf(StreamThinkingFilter.GEMMA_OPEN), tag: StreamThinkingFilter.GEMMA_OPEN },
      { idx: this.buffer.indexOf(StreamThinkingFilter.GEMMA_TURN_OPEN), tag: StreamThinkingFilter.GEMMA_TURN_OPEN },
      { idx: this.buffer.indexOf(StreamThinkingFilter.THINK_OPEN), tag: StreamThinkingFilter.THINK_OPEN },
    ].filter(c => c.idx >= 0).sort((a, b) => a.idx - b.idx);
    const openIdx = openCandidates[0]?.idx ?? -1;
    const openTag = openCandidates[0]?.tag ?? '';

    if (openIdx >= 0) {
      const visible = this.buffer.slice(0, openIdx);
      this.insideThinking = true;
      this.buffer = this.buffer.slice(openIdx + openTag.length);
      return visible;
    }

    // Check if buffer ends with a partial match of any open tag
    const partialTags = [StreamThinkingFilter.GEMMA_OPEN, StreamThinkingFilter.GEMMA_TURN_OPEN, StreamThinkingFilter.THINK_OPEN];
    for (const tag of partialTags) {
      for (let len = 1; len < tag.length && len <= this.buffer.length; len++) {
        if (this.buffer.endsWith(tag.slice(0, len))) {
          const safe = this.buffer.slice(0, this.buffer.length - len);
          this.buffer = this.buffer.slice(this.buffer.length - len);
          return safe;
        }
      }
    }

    // No partial match — emit everything
    const out = this.buffer;
    this.buffer = '';
    return out;
  }

  /** Flush any remaining buffered content (call at end of stream). */
  flush(): string {
    const out = this.insideThinking ? '' : this.buffer;
    this.buffer = '';
    this.insideThinking = false;
    return out;
  }
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

  /**
   * Fire-and-forget: pre-load the on-device context + multimodal projector
   * for `modelId` so subsequent image / audio turns do not pay the 10–20 s
   * projector-load cost on the critical path. Safe to call repeatedly.
   */
  static prewarmMultimodal(modelId: string): void {
    const resolvedBridge = resolveBridge();
    const prewarm = resolvedBridge?.bridge.prewarmMultimodal;
    if (!prewarm) return;
    // Do not await — the whole point is to overlap with user input.
    Promise.resolve(prewarm(modelId)).catch(() => {/* best-effort */});
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
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      /** Abort if the overall stream doesn't complete within this many ms. Default 60s. */
      timeoutMs?: number;
      /** Abort if no token chunk arrives within this many ms. Default 25s. */
      stallTimeoutMs?: number;
      /** Optional caller-controlled abort signal. */
      signal?: AbortSignal;
    },
  ): AsyncGenerator<string> {
    const resolvedBridge = resolveBridge();
    if (!resolvedBridge) {
      throw new Error('Local mobile inference bridge is not available on this device.');
    }
    const { bridge, source } = resolvedBridge;
    const overallTimeoutMs = options?.timeoutMs ?? 60_000;
    const stallTimeoutMs = options?.stallTimeoutMs ?? 25_000;

    if (typeof bridge.generateStream === 'function') {
      const queuedChunks: string[] = [];
      let streamCompleted = false;
      let streamError: unknown;
      let receivedIncrementalChunk = false;
      let wakeConsumer: (() => void) | null = null;
      const waitForChunk = () => new Promise<void>((resolve) => {
        wakeConsumer = resolve;
      });
      const wake = () => {
        if (wakeConsumer) {
          const resolve = wakeConsumer;
          wakeConsumer = null;
          resolve();
        }
      };
      // Overall + stall watchdogs convert hang → abort + streamError.
      const fail = (err: unknown) => {
        if (!streamCompleted) {
          streamError = err;
          streamCompleted = true;
          wake();
        }
      };
      let lastTokenAt = Date.now();
      const overallTimer = setTimeout(() => {
        fail(new Error(`Local inference timeout after ${Math.round(overallTimeoutMs / 1000)}s. Please try again or switch to cloud.`));
      }, overallTimeoutMs);
      const stallTimer = setInterval(() => {
        if (streamCompleted) return;
        if (Date.now() - lastTokenAt > stallTimeoutMs) {
          fail(new Error(`Local inference stalled (no tokens for ${Math.round(stallTimeoutMs / 1000)}s).`));
        }
      }, Math.min(stallTimeoutMs / 2, 5000));
      const externalAbort = options?.signal;
      const onExternalAbort = () => fail(new Error('Local inference aborted.'));
      if (externalAbort) {
        if (externalAbort.aborted) onExternalAbort();
        else externalAbort.addEventListener('abort', onExternalAbort, { once: true });
      }
      const cleanupTimers = () => {
        clearTimeout(overallTimer);
        clearInterval(stallTimer);
        if (externalAbort) externalAbort.removeEventListener('abort', onExternalAbort);
      };

      const pushChunk = (chunk: string) => {
        if (!chunk) {
          return;
        }

        lastTokenAt = Date.now();
        queuedChunks.push(chunk);
        wake();
      };

      const handleIncrementalChunk = (chunk: string) => {
        if (!chunk) {
          return;
        }

        receivedIncrementalChunk = true;
        pushChunk(chunk);
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
        wake();
      }).catch((error) => {
        streamError = error;
        streamCompleted = true;
        wake();
      });

      try {
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

        if (streamError) {
          throw new Error(extractErrorMessage(streamError, 'Local model inference failed.'));
        }

        await streamPromise;
        if (streamError) {
          throw new Error(extractErrorMessage(streamError, 'Local model inference failed.'));
        }
      } finally {
        cleanupTimers();
      }

      return;
    }

    const text = normalizeLocalOutput(await this.generate(messages, options));
    for (const chunk of chunkText(text)) {
      yield chunk;
    }
  }
}