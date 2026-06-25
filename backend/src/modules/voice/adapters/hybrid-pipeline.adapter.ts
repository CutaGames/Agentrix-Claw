import { Logger } from '@nestjs/common';
import type {
  STTAdapter,
  STTResult,
  STTOptions,
  TTSAdapter,
  TTSResult,
  TTSOptions,
  StreamingTTSAdapter,
  StreamingTTSCallbacks,
} from './voice-provider.interface';

/**
 * HybridPipelineAdapter — Composes STT and TTS adapters with automatic fallback.
 *
 * This is the default "agent mode" pipeline:
 *   User Audio → STT (Groq/Whisper/AWS) → LLM → TTS (Edge/Polly) → Audio
 *
 * Features:
 * - Ordered fallback chains for both STT and TTS
 * - Per-request provider override
 * - Latency tracking per provider
 * - Automatic skip of unavailable providers
 */

export class HybridPipelineAdapter {
  private readonly logger = new Logger(HybridPipelineAdapter.name);

  private sttChain: STTAdapter[] = [];
  private ttsChain: (TTSAdapter | StreamingTTSAdapter)[] = [];
  private latencyLog: Array<{ provider: string; type: 'stt' | 'tts'; durationMs: number; timestamp: number }> = [];

  constructor(
    sttAdapters: STTAdapter[],
    ttsAdapters: (TTSAdapter | StreamingTTSAdapter)[],
  ) {
    this.sttChain = sttAdapters.filter((a) => a.isAvailable);
    this.ttsChain = ttsAdapters.filter((a) => a.isAvailable);

    this.logger.log(
      `Pipeline initialized — STT: [${this.sttChain.map((a) => a.name).join(', ')}], ` +
      `TTS: [${this.ttsChain.map((a) => a.name).join(', ')}]`,
    );
  }

  // ── STT ────────────────────────────────────────────────

  /**
   * Transcribe audio using the fallback chain.
   * If preferProvider is set, it will be tried first.
   */
  async transcribe(
    audio: Buffer,
    mimeType: string,
    options?: STTOptions & { preferProvider?: string },
  ): Promise<STTResult> {
    const chain = this.getOrderedChain(this.sttChain, options?.preferProvider);

    for (const adapter of chain) {
      try {
        const start = Date.now();
        const result = await adapter.transcribe(audio, mimeType, options);
        const durationMs = Date.now() - start;

        this.recordLatency(adapter.name, 'stt', durationMs);
        this.logger.debug(`STT [${adapter.name}] succeeded in ${durationMs}ms: "${result.text.slice(0, 50)}..."`);

        return { ...result, provider: adapter.name, durationMs };
      } catch (err: any) {
        this.logger.warn(`STT [${adapter.name}] failed: ${err.message}`);
      }
    }

    throw new Error(`All STT providers failed: [${chain.map((a) => a.name).join(', ')}]`);
  }

  // ── TTS ────────────────────────────────────────────────

  /**
   * Synthesize text to audio using the fallback chain.
   */
  async synthesize(
    text: string,
    options?: TTSOptions & { preferProvider?: string },
  ): Promise<TTSResult> {
    const chain = this.getOrderedChain(this.ttsChain, options?.preferProvider);

    for (const adapter of chain) {
      try {
        const start = Date.now();
        const result = await adapter.synthesize(text, options);
        const durationMs = Date.now() - start;

        this.recordLatency(adapter.name, 'tts', durationMs);
        this.logger.debug(`TTS [${adapter.name}] succeeded in ${durationMs}ms (${result.audio.length} bytes)`);

        return { ...result, provider: adapter.name, durationMs };
      } catch (err: any) {
        this.logger.warn(`TTS [${adapter.name}] failed: ${err.message}`);
      }
    }

    throw new Error(`All TTS providers failed: [${chain.map((a) => a.name).join(', ')}]`);
  }

  /**
   * Streaming TTS — tries each adapter that supports streaming.
   * Falls back to non-streaming (buffer all → emit as single chunk) if needed.
   */
  synthesizeStream(
    text: string,
    options: TTSOptions & { preferProvider?: string },
    callbacks: StreamingTTSCallbacks,
  ): { cancel: () => void } {
    const chain = this.getOrderedChain(this.ttsChain, options?.preferProvider);
    let cancelled = false;

    const tryNext = (index: number) => {
      if (cancelled || index >= chain.length) {
        callbacks.onError?.(new Error('All TTS streaming providers failed'));
        return;
      }

      const adapter = chain[index];

      // Check if adapter supports streaming
      if ('synthesizeStream' in adapter && typeof (adapter as StreamingTTSAdapter).synthesizeStream === 'function') {
        const streamAdapter = adapter as StreamingTTSAdapter;
        const handle = streamAdapter.synthesizeStream(text, options, {
          onChunk: (chunk) => {
            if (!cancelled) callbacks.onChunk?.(chunk);
          },
          onEnd: () => {
            if (!cancelled) callbacks.onEnd?.();
          },
          onError: (err) => {
            this.logger.warn(`Streaming TTS [${adapter.name}] failed: ${err.message}`);
            tryNext(index + 1);
          },
        });

        // Store cancel handle
        cancelFn = handle.cancel;
      } else {
        // Fallback: non-streaming synthesis
        adapter.synthesize(text, options)
          .then((result) => {
            if (!cancelled) {
              callbacks.onChunk?.(result.audio);
              callbacks.onEnd?.();
            }
          })
          .catch((err) => {
            this.logger.warn(`TTS [${adapter.name}] failed: ${err.message}`);
            tryNext(index + 1);
          });
      }
    };

    let cancelFn = () => { cancelled = true; };
    tryNext(0);

    return { cancel: () => { cancelled = true; cancelFn(); } };
  }

  // ── Diagnostics ────────────────────────────────────────

  /**
   * Get average latency per provider over the last N entries.
   */
  getLatencyStats(lastN = 50): Record<string, { avgMs: number; count: number }> {
    const recent = this.latencyLog.slice(-lastN);
    const stats: Record<string, { totalMs: number; count: number }> = {};

    for (const entry of recent) {
      const key = `${entry.type}:${entry.provider}`;
      if (!stats[key]) stats[key] = { totalMs: 0, count: 0 };
      stats[key].totalMs += entry.durationMs;
      stats[key].count += 1;
    }

    const result: Record<string, { avgMs: number; count: number }> = {};
    for (const [key, val] of Object.entries(stats)) {
      result[key] = { avgMs: Math.round(val.totalMs / val.count), count: val.count };
    }
    return result;
  }

  getSTTProviders(): string[] {
    return this.sttChain.map((a) => a.name);
  }

  getTTSProviders(): string[] {
    return this.ttsChain.map((a) => a.name);
  }

  // ── Internal ───────────────────────────────────────────

  private getOrderedChain<T extends { name: string }>(chain: T[], preferProvider?: string): T[] {
    if (!preferProvider) return chain;
    const preferred = chain.find((a) => a.name.toLowerCase() === preferProvider.toLowerCase());
    if (!preferred) return chain;
    return [preferred, ...chain.filter((a) => a !== preferred)];
  }

  private recordLatency(provider: string, type: 'stt' | 'tts', durationMs: number) {
    this.latencyLog.push({ provider, type, durationMs, timestamp: Date.now() });
    if (this.latencyLog.length > 200) {
      this.latencyLog = this.latencyLog.slice(-200);
    }
  }
}
