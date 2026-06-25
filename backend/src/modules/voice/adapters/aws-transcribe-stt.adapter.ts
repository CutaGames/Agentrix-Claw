import { Logger } from '@nestjs/common';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
  MediaEncoding,
  LanguageCode,
} from '@aws-sdk/client-transcribe-streaming';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import type {
  StreamingSTTAdapter,
  StreamingSTTSession,
  StreamingSTTCallbacks,
  STTResult,
  STTOptions,
} from './voice-provider.interface';

/**
 * AwsTranscribeSTTAdapter — Real-time streaming speech-to-text via AWS
 * Transcribe Streaming.
 *
 * Why this exists: Deepgram runs on a limited free tier; the product owner's
 * AWS account is paid and reliable, so AWS is the preferred realtime STT
 * provider (with Deepgram kept as a secondary fallback in CascadeVoiceStrategy).
 *
 * Audio contract (verified against realtime-voice.gateway + cascade strategy):
 *   The mobile realtime client streams raw PCM 16-bit little-endian, mono,
 *   16 kHz audio chunks (cascade passes `encoding: 'linear16', sampleRate:
 *   16000`). That maps 1:1 to AWS `MediaEncoding.PCM` @ 16000 Hz — chunks are
 *   fed straight into `AudioEvent.AudioChunk` with no transcoding.
 *
 * Streaming design:
 *   - write() enqueues a chunk and wakes a push-based async generator that
 *     backs the StartStreamTranscriptionCommand AudioStream.
 *   - end() closes the generator (drains remaining chunks then completes).
 *   - abort() destroys the client immediately.
 *   - The TranscriptResultStream is consumed in the background: partial
 *     results → onInterim, final results (!IsPartial) → onFinal.
 *   - A max-duration safety timeout bounds the session so a stuck AWS turn can
 *     never leak a client/HTTP-2 connection. client.destroy() always runs in
 *     the consumer's finally and on end/abort.
 *
 * Requires: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (+ optional AWS_REGION).
 */

/** Hard ceiling for a single streaming session before we force-tear it down. */
const MAX_SESSION_DURATION_MS = Number(
  process.env.VOICE_REALTIME_STT_MAX_MS || 300_000,
);

const DEFAULT_SAMPLE_RATE = 16000;

export class AwsTranscribeSTTAdapter implements StreamingSTTAdapter {
  readonly name = 'aws-transcribe';
  private readonly logger = new Logger(AwsTranscribeSTTAdapter.name);
  private readonly region = process.env.AWS_REGION || 'us-east-1';

  get isAvailable(): boolean {
    return Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  }

  private createClient(): TranscribeStreamingClient {
    return new TranscribeStreamingClient({
      region: this.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      // Dedicated HTTP/2 connection per request. AWS Transcribe Streaming
      // intermittently throws "non-retryable streaming request / Deserialization
      // error" when several concurrent transcribe streams are multiplexed onto a
      // single shared HTTP/2 socket (the event-stream framing gets corrupted).
      // disableConcurrentStreams gives each session its own connection, which
      // removes that class of failure. requestTimeout:0 because a streaming turn
      // legitimately stays open far longer than any default request timeout
      // (we bound it ourselves via MAX_SESSION_DURATION_MS).
      requestHandler: new NodeHttp2Handler({
        disableConcurrentStreams: true,
        requestTimeout: 0,
        sessionTimeout: 0,
      }),
    });
  }

  /**
   * Open a streaming STT session backed by a push-based audio queue.
   *
   * Throws synchronously (via the awaited client.send) if the stream can't be
   * opened — CascadeVoiceStrategy relies on that to fall back to Deepgram.
   */
  async createStreamingSession(
    options: STTOptions,
    callbacks: StreamingSTTCallbacks,
  ): Promise<StreamingSTTSession> {
    if (!this.isAvailable) {
      throw new Error('AWS Transcribe credentials not configured');
    }

    const lang = this.resolveLang(options?.lang);
    const sampleRate = options?.sampleRate || DEFAULT_SAMPLE_RATE;
    const client = this.createClient();

    // ── push-based audio queue → async generator ──────────────
    const chunkQueue: Buffer[] = [];
    let closed = false;
    let aborted = false;
    let wake: (() => void) | null = null;

    async function* audioStream(): AsyncGenerator<AudioStream> {
      while (true) {
        if (chunkQueue.length > 0) {
          const chunk = chunkQueue.shift()!;
          yield { AudioEvent: { AudioChunk: new Uint8Array(chunk) } };
          continue;
        }
        if (closed || aborted) {
          return;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = null;
      }
    }

    // ── language selection (mirrors the HTTP press-to-talk path) ──
    const commandParams: any = {
      MediaEncoding: MediaEncoding.PCM,
      MediaSampleRateHertz: sampleRate,
      AudioStream: audioStream(),
    };
    if (lang === 'zh') {
      commandParams.LanguageCode = LanguageCode.ZH_CN;
    } else if (lang === 'en') {
      commandParams.LanguageCode = LanguageCode.EN_US;
    } else {
      commandParams.IdentifyLanguage = true;
      commandParams.LanguageOptions = 'en-US,zh-CN';
      commandParams.PreferredLanguage = LanguageCode.ZH_CN;
    }

    const command = new StartStreamTranscriptionCommand(commandParams);

    // Opening the stream — failures here propagate to the caller for fallback.
    let cleanedUp = false;
    let safetyTimer: NodeJS.Timeout | null = null;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      try {
        client.destroy();
      } catch {
        /* noop */
      }
    };

    const startConsumer = (response: any) => {
      safetyTimer = setTimeout(() => {
        if (cleanedUp) return;
        this.logger.warn(
          `AWS Transcribe streaming session exceeded ${MAX_SESSION_DURATION_MS}ms — tearing down`,
        );
        aborted = true;
        closed = true;
        wake?.();
        cleanup();
      }, MAX_SESSION_DURATION_MS);

      // ── background consumer: TranscriptResultStream → callbacks ──
      void (async () => {
        try {
          if (response.TranscriptResultStream) {
            for await (const event of response.TranscriptResultStream) {
              if (aborted) break;
              const results = event.TranscriptEvent?.Transcript?.Results || [];
              for (const result of results) {
                const text = result.Alternatives?.[0]?.Transcript || '';
                if (!text) continue;

                const detectedLang = this.normalizeDetectedLang(result.LanguageCode, lang);

                if (result.IsPartial) {
                  callbacks.onInterim?.(text);
                } else {
                  callbacks.onFinal?.({
                    text,
                    lang: detectedLang,
                    provider: this.name,
                  });
                }
              }
            }
          }
        } catch (err: any) {
          if (!aborted) {
            // Capture the real underlying error — the eventstream deserializer
            // often surfaces a non-Error object whose String() is "[object
            // Object]", which told us nothing in earlier incidents.
            this.logger.error(
              `AWS Transcribe stream consume error: name=${err?.name} ` +
              `msg=${JSON.stringify(err?.message)} ` +
              `status=${err?.$response?.statusCode ?? err?.$metadata?.httpStatusCode ?? '?'} ` +
              `props=${Object.getOwnPropertyNames(err || {}).join(',')}`,
            );
            callbacks.onError?.(err instanceof Error ? err : new Error(String(err?.message || err?.name || 'AWS stream error')));
          }
        } finally {
          cleanup();
        }
      })();
    };

    // ── Lazy open ────────────────────────────────────────────
    // AWS Transcribe Streaming rejects the request (surfacing as an opaque
    // "Deserialization error / non-retryable streaming request") when the
    // HTTP/2 stream is opened with no audio in flight. The realtime gateway
    // opens the STT session at session-init — before the user speaks — so an
    // eager client.send() here intermittently fails and demotes us to the
    // fallback provider. Defer client.send() until the first real audio chunk
    // is queued (with one retry) so the stream always opens with audio flowing.
    let opened = false;
    let opening: Promise<void> | null = null;

    const ensureOpened = (): Promise<void> => {
      if (opened || aborted) return Promise.resolve();
      if (opening) return opening;
      opening = (async () => {
        let lastErr: any;
        for (let attempt = 1; attempt <= 2; attempt++) {
          if (aborted) return;
          try {
            const response = await client.send(command);
            opened = true;
            startConsumer(response);
            return;
          } catch (err: any) {
            lastErr = err;
            this.logger.warn(
              `AWS Transcribe open attempt ${attempt} failed: ${err?.message || err}`,
            );
            if (attempt < 2 && !aborted) {
              await new Promise((r) => setTimeout(r, 150));
            }
          }
        }
        // Surface the failure so the caller can fall back (cascade buffered PCM → Deepgram REST).
        callbacks.onError?.(
          lastErr instanceof Error
            ? lastErr
            : new Error(String(lastErr?.message || lastErr || 'AWS Transcribe open failed')),
        );
        cleanup();
      })();
      return opening;
    };

    return {
      write: (chunk: Buffer) => {
        if (aborted || closed) return;
        chunkQueue.push(Buffer.from(chunk));
        // Open on the first chunk so AWS always sees audio in flight.
        if (!opened) {
          void ensureOpened();
        }
        wake?.();
      },
      end: () => {
        closed = true;
        wake?.();
      },
      abort: () => {
        aborted = true;
        closed = true;
        wake?.();
        cleanup();
      },
    };
  }

  /**
   * One-shot transcription — satisfies the base STTAdapter contract.
   *
   * Reuses the same streaming client with a finite audio generator. Expects
   * PCM16/WAV input (the realtime path only ever produces PCM16@16k); WAV
   * input has its 44-byte header stripped, other formats are passed through
   * best-effort (AWS PCM streaming will reject anything that isn't raw PCM,
   * surfacing as an error the caller can fall back on).
   */
  async transcribe(audio: Buffer, mimeType: string, options?: STTOptions): Promise<STTResult> {
    if (!this.isAvailable) {
      throw new Error('AWS Transcribe credentials not configured');
    }

    const lang = this.resolveLang(options?.lang);
    const sampleRate = options?.sampleRate || DEFAULT_SAMPLE_RATE;
    const pcmBuffer = this.toRawPcm(audio, mimeType);
    const client = this.createClient();

    const CHUNK_SIZE = 8192;
    async function* audioStream(): AsyncGenerator<AudioStream> {
      for (let offset = 0; offset < pcmBuffer.length; offset += CHUNK_SIZE) {
        yield {
          AudioEvent: {
            AudioChunk: new Uint8Array(pcmBuffer.subarray(offset, offset + CHUNK_SIZE)),
          },
        };
      }
    }

    const commandParams: any = {
      MediaEncoding: MediaEncoding.PCM,
      MediaSampleRateHertz: sampleRate,
      AudioStream: audioStream(),
    };
    if (lang === 'zh') {
      commandParams.LanguageCode = LanguageCode.ZH_CN;
    } else if (lang === 'en') {
      commandParams.LanguageCode = LanguageCode.EN_US;
    } else {
      commandParams.IdentifyLanguage = true;
      commandParams.LanguageOptions = 'en-US,zh-CN';
      commandParams.PreferredLanguage = LanguageCode.ZH_CN;
    }

    try {
      const response = await client.send(new StartStreamTranscriptionCommand(commandParams));
      let transcript = '';
      let detectedLang: string | undefined;
      if (response.TranscriptResultStream) {
        for await (const event of response.TranscriptResultStream) {
          const results = event.TranscriptEvent?.Transcript?.Results || [];
          for (const result of results) {
            if (!result.IsPartial && result.Alternatives?.[0]?.Transcript) {
              transcript += result.Alternatives[0].Transcript + ' ';
              detectedLang = this.normalizeDetectedLang(result.LanguageCode, lang);
            }
          }
        }
      }
      return {
        text: transcript.trim(),
        lang: detectedLang,
        provider: this.name,
      };
    } finally {
      try {
        client.destroy();
      } catch {
        /* noop */
      }
    }
  }

  private toRawPcm(audio: Buffer, mimeType: string): Buffer {
    const type = (mimeType || '').toLowerCase();
    // WAV containers carry a 44-byte header before raw PCM samples.
    if (type.includes('wav') || (audio.length > 44 && audio.toString('ascii', 0, 4) === 'RIFF')) {
      return audio.subarray(44);
    }
    return audio;
  }

  private resolveLang(lang?: string): 'zh' | 'en' | 'auto' {
    if (!lang || lang === 'auto') return 'auto';
    if (lang.startsWith('zh')) return 'zh';
    if (lang.startsWith('en')) return 'en';
    return 'auto';
  }

  private normalizeDetectedLang(detected?: string, fallback?: 'zh' | 'en' | 'auto'): string | undefined {
    if (detected) {
      const lower = detected.toLowerCase();
      if (lower.startsWith('zh')) return 'zh';
      if (lower.startsWith('en')) return 'en';
      return detected;
    }
    return fallback && fallback !== 'auto' ? fallback : undefined;
  }
}
