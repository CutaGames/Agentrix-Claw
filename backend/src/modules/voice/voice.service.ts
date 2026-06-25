import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  AudioStream,
  MediaEncoding,
  LanguageCode,
} from '@aws-sdk/client-transcribe-streaming';
import { NodeHttp2Handler } from '@smithy/node-http-handler';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { GeminiLiveAdapter } from './adapters/gemini-live.adapter';
import { DeepgramSTTAdapter } from './adapters/deepgram-stt.adapter';

/**
 * Per-provider hard timeout (ms). No single STT provider may exceed this.
 * AWS Transcribe Streaming in particular has no built-in deadline — without
 * this guard a stalled stream keeps the HTTP request open until the client's
 * own timeout (the mobile app waits 45s), which surfaces to the user as the
 * "listening forever → transcription timeout" bug.
 */
const STT_PROVIDER_TIMEOUT_MS = Number(process.env.VOICE_STT_PROVIDER_TIMEOUT_MS || 18_000);

/**
 * Overall transcription budget (ms). The endpoint must always respond within
 * this window so the mobile client never hits its 45s abort. Kept comfortably
 * under the nginx `proxy_read_timeout 60s` and the client's 45s deadline.
 */
const STT_TOTAL_BUDGET_MS = Number(process.env.VOICE_STT_TOTAL_BUDGET_MS || 35_000);

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly REGION = process.env.AWS_REGION || 'us-east-1';
  private readonly groqBaseUrl = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
  private readonly geminiAdapter = new GeminiLiveAdapter();
  private readonly deepgramAdapter = new DeepgramSTTAdapter();

  /**
   * Race a promise against a timeout. On timeout the returned promise rejects
   * with a labelled error; the caller is responsible for any resource cleanup
   * (e.g. destroying a streaming client) in its own finally block.
   */
  private withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
  }

  private getTranscriptionOrder(): Array<'openai' | 'groq' | 'aws' | 'deepgram'> {
    // Default: AWS Transcribe first (paid/voucher primary), then Deepgram
    // (free-tier fallback), then Groq (fast whisper), then OpenAI.
    // The REST path pre-buffers full PCM and feeds it to AWS at once, which the
    // SDK handles reliably (unlike an idle-opened realtime stream). Deepgram is
    // the safety net when AWS is unavailable. Override via VOICE_STT_ORDER.
    const defaultOrder: Array<'openai' | 'groq' | 'aws' | 'deepgram'> = ['aws', 'deepgram', 'groq', 'openai'];
    const configured = (process.env.VOICE_STT_ORDER || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is 'openai' | 'groq' | 'aws' | 'deepgram' =>
        value === 'openai' || value === 'groq' || value === 'aws' || value === 'deepgram');

    return Array.from(new Set<'openai' | 'groq' | 'aws' | 'deepgram'>(configured.length > 0 ? configured : defaultOrder));
  }

  private normalizeLanguageHint(lang?: string): 'zh' | 'en' | undefined {
    if (!lang) return undefined;
    const normalized = lang.toLowerCase().trim();
    if (normalized === 'auto' || normalized === 'mixed' || normalized === 'multilingual') {
      return undefined;
    }
    if (normalized.startsWith('zh')) return 'zh';
    if (normalized.startsWith('en')) return 'en';
    return undefined;
  }

  private buildTranscriptionPrompt(lang?: 'zh' | 'en'): string | undefined {
    if (lang === 'zh') {
      return '这是普通话或中英混合语音。请优先输出准确的中文、标点、品牌名和专有名词。';
    }
    if (lang === 'en') {
      return 'This is English or mixed English and Chinese speech. Return the most accurate transcript with punctuation.';
    }
    return 'The audio may contain English, Chinese, or mixed speech. Return the most accurate transcript with punctuation and proper nouns preserved.';
  }

  /**
   * Transcribe audio buffer.
   * Strategy: convert to PCM WAV → AWS Transcribe Streaming (no S3 needed)
   * Fallback: OpenAI Whisper if configured.
   * @param lang — optional language hint: 'zh' for Chinese, 'en' for English.
   *               If omitted, uses automatic language identification.
   */
  async transcribe(
    buffer: Buffer,
    mimetype: string,
    originalName: string,
    lang?: string,
    opts?: { useGeminiSTT?: boolean },
  ): Promise<{ transcript: string }> {
    const normalizedLang = this.normalizeLanguageHint(lang);

    // ── Tier 0: Gemini STT (free → paid) — OPT-IN only (VOICE_ENABLE_GEMINI=true) ──
    // Default path is AWS/Groq/OpenAI cascade. Gemini is gated because platform keys are
    // rate-limited/leaked; trying them first wastes a round-trip before falling to AWS.
    // INPUT chain (when enabled): Gemini Free → Gemini Paid → AWS/Groq/OpenAI
    const geminiSttOptIn = process.env.VOICE_ENABLE_GEMINI === 'true';
    if (geminiSttOptIn && opts?.useGeminiSTT !== false && this.geminiAdapter.isAvailable) {
      try {
        const audioBase64 = buffer.toString('base64');
        // Map mimetype for Gemini (it accepts common audio formats directly)
        const geminiMime = mimetype?.includes('wav') ? 'audio/wav'
          : mimetype?.includes('webm') ? 'audio/webm'
          : mimetype?.includes('mp4') || mimetype?.includes('m4a') ? 'audio/mp4'
          : mimetype?.includes('ogg') ? 'audio/ogg'
          : mimetype?.includes('mpeg') || mimetype?.includes('mp3') ? 'audio/mpeg'
          : 'audio/wav';
        const result = await this.geminiAdapter.transcribeAudio(audioBase64, geminiMime, normalizedLang);
        if (result?.transcript) {
          this.logger.log(`✅ Gemini STT (tier=${result.tier}): "${result.transcript.slice(0, 60)}..."`);
          return { transcript: result.transcript };
        }
      } catch (err: any) {
        this.logger.warn(`Gemini STT failed, falling back to configured providers: ${err.message}`);
      }
    }

    // ── Tier 1+: AWS / Groq / OpenAI (configured order) ──
    let attemptedProviders = 0;
    let lastProviderError: string | undefined;
    const startedAt = Date.now();
    const budgetExhausted = () => Date.now() - startedAt >= STT_TOTAL_BUDGET_MS;
    // Remaining budget for the next provider, never longer than the per-provider cap.
    const nextProviderTimeout = () =>
      Math.max(2_000, Math.min(STT_PROVIDER_TIMEOUT_MS, STT_TOTAL_BUDGET_MS - (Date.now() - startedAt)));

    // Known-invalid / non-Whisper OpenAI key shapes. Some deployments use
    // `api2d.net`-style reseller keys prefixed with `fk` — those proxies
    // route chat completions but do NOT support the Whisper audio endpoints,
    // which makes the STT call return `401 Incorrect API key` and surfaces
    // a confusing auth error to the user. Skip OpenAI entirely in that case.
    const openAiKey = process.env.OPENAI_API_KEY || '';
    const openAiKeyUsableForWhisper = openAiKey.startsWith('sk-');

    for (const provider of this.getTranscriptionOrder()) {
      if (budgetExhausted()) {
        this.logger.warn('Transcription budget exhausted before all providers were tried.');
        break;
      }
      if (provider === 'openai' && openAiKey && openAiKeyUsableForWhisper) {
        attemptedProviders += 1;
        try {
          return await this.openAiCompatibleTranscription(buffer, originalName, {
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_WHISPER_MODEL || 'whisper-1',
            provider: 'OpenAI Whisper',
            baseURL: process.env.OPENAI_BASE_URL || undefined,
            lang: normalizedLang,
            timeoutMs: nextProviderTimeout(),
          });
        } catch (err: any) {
          lastProviderError = `OpenAI Whisper failed: ${err.message}`;
          this.logger.error(`Whisper fallback failed: ${err.message}`);
        }
      }

      if (provider === 'groq' && process.env.GROQ_API_KEY) {
        attemptedProviders += 1;
        try {
          return await this.openAiCompatibleTranscription(buffer, originalName, {
            apiKey: process.env.GROQ_API_KEY,
            model: process.env.GROQ_TRANSCRIBE_MODEL || 'whisper-large-v3-turbo',
            provider: 'Groq transcription',
            baseURL: this.groqBaseUrl,
            lang: normalizedLang,
            timeoutMs: nextProviderTimeout(),
          });
        } catch (err: any) {
          lastProviderError = `Groq transcription failed: ${err.message}`;
          this.logger.error(`Groq transcription fallback failed: ${err.message}`);
        }
      }

      if (provider === 'deepgram' && this.deepgramAdapter.isAvailable) {
        attemptedProviders += 1;
        try {
          const result = await this.withTimeout(
            this.deepgramAdapter.transcribe(buffer, mimetype, { lang: normalizedLang }),
            nextProviderTimeout(),
            'Deepgram transcription',
          );
          const transcript = (result?.text || '').trim();
          if (transcript) {
            this.logger.log(`✅ Deepgram STT: "${transcript.slice(0, 60)}..."`);
            return { transcript };
          }
          lastProviderError = 'Deepgram returned an empty transcript';
        } catch (err: any) {
          lastProviderError = `Deepgram transcription failed: ${err.message}`;
          this.logger.error(`Deepgram transcription failed: ${err.message}`);
        }
      }

      if (provider === 'aws' && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        attemptedProviders += 1;
        try {
          const result = await this.transcribeStreaming(buffer, mimetype, originalName, normalizedLang, nextProviderTimeout());
          if (result.transcript) return result;
          lastProviderError = 'AWS Transcribe returned an empty transcript';
        } catch (err: any) {
          lastProviderError = `AWS Transcribe Streaming failed: ${err.message}`;
          this.logger.error(`AWS Transcribe Streaming failed: ${err.message}`);
        }
      }
    }

    if (attemptedProviders > 0) {
      this.logger.warn(`All configured transcription providers failed. Last error: ${lastProviderError || 'unknown error'}`);
      throw new BadRequestException(lastProviderError || 'Voice transcription failed with all configured providers.');
    }

    this.logger.warn('No transcription service available');
    throw new BadRequestException(
      'Voice transcription is not configured. Set AWS credentials, OPENAI_API_KEY, or GROQ_API_KEY.',
    );
  }

  /**
   * AWS Transcribe Streaming — sends audio directly over HTTP/2, no S3 needed.
   * Requires audio in PCM 16-bit LE format at 16000 Hz sample rate.
   * Supports automatic language identification for Chinese + English.
   */
  private async transcribeStreaming(
    buffer: Buffer,
    mimetype: string,
    originalName: string,
    lang?: string,
    timeoutMs: number = STT_PROVIDER_TIMEOUT_MS,
  ): Promise<{ transcript: string }> {
    // Convert input audio to 16kHz 16-bit PCM WAV using ffmpeg
    const pcmBuffer = await this.convertToPcm(buffer, mimetype, originalName);

    const client = new TranscribeStreamingClient({
      region: this.REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      // Dedicated HTTP/2 connection — avoids the intermittent transcribe
      // event-stream "Deserialization error" caused by multiplexing concurrent
      // streams onto one shared socket. See aws-transcribe-stt.adapter.ts.
      requestHandler: new NodeHttp2Handler({
        disableConcurrentStreams: true,
        requestTimeout: 0,
        sessionTimeout: 0,
      }),
    });

    // AWS Transcribe Streaming keeps the bidirectional HTTP/2 stream open and
    // has no client-side deadline of its own: if the result stream never emits
    // a final event (malformed PCM, unsupported sample, network stall) the
    // `for await` below blocks forever. Bound it with a hard timeout and tear
    // the connection down so a slow/stuck AWS turn can never hang the request.
    try {
      return await this.withTimeout(
        this.runTranscribeStream(client, pcmBuffer, lang),
        timeoutMs,
        'AWS Transcribe Streaming',
      );
    } finally {
      try { client.destroy(); } catch (_) {}
    }
  }

  /** Send PCM audio to AWS Transcribe Streaming and collect the final transcript. */
  private async runTranscribeStream(
    client: TranscribeStreamingClient,
    pcmBuffer: Buffer,
    lang?: string,
  ): Promise<{ transcript: string }> {
    // Create audio stream generator — send chunks of ~8KB
    const CHUNK_SIZE = 8192;
    async function* audioStream(): AsyncGenerator<AudioStream> {
      for (let offset = 0; offset < pcmBuffer.length; offset += CHUNK_SIZE) {
        yield {
          AudioEvent: {
            AudioChunk: pcmBuffer.subarray(offset, offset + CHUNK_SIZE),
          },
        };
      }
    }

    // Determine language: explicit hint → auto-detect with IdentifyLanguage
    const commandParams: any = {
      MediaEncoding: MediaEncoding.PCM,
      MediaSampleRateHertz: 16000,
      AudioStream: audioStream(),
    };

    if (lang === 'zh') {
      commandParams.LanguageCode = LanguageCode.ZH_CN;
    } else if (lang === 'en') {
      commandParams.LanguageCode = LanguageCode.EN_US;
    } else {
      // Auto-detect: use IdentifyLanguage with Chinese + English
      commandParams.IdentifyLanguage = true;
      commandParams.LanguageOptions = 'en-US,zh-CN';
      commandParams.PreferredLanguage = LanguageCode.ZH_CN;
    }

    const command = new StartStreamTranscriptionCommand(commandParams);

    const response = await client.send(command);

    // Collect transcript from streaming results
    let transcript = '';
    if (response.TranscriptResultStream) {
      for await (const event of response.TranscriptResultStream) {
        if (event.TranscriptEvent?.Transcript?.Results) {
          for (const result of event.TranscriptEvent.Transcript.Results) {
            if (!result.IsPartial && result.Alternatives?.[0]?.Transcript) {
              transcript += result.Alternatives[0].Transcript + ' ';
            }
          }
        }
      }
    }

    return { transcript: transcript.trim() };
  }

  /**
   * Convert audio buffer to 16kHz 16-bit LE PCM using ffmpeg.
   * If ffmpeg is not available, try to pass raw buffer (works for WAV).
   */
  private async convertToPcm(
    buffer: Buffer,
    mimetype: string,
    originalName: string,
  ): Promise<Buffer> {
    const ext = originalName?.split('.').pop() || 'm4a';
    const tmpInput = path.join(os.tmpdir(), `voice_in_${Date.now()}.${ext}`);
    const tmpOutput = path.join(os.tmpdir(), `voice_out_${Date.now()}.pcm`);

    try {
      fs.writeFileSync(tmpInput, buffer);
      execSync(
        `ffmpeg -y -i "${tmpInput}" -ar 16000 -ac 1 -f s16le "${tmpOutput}" 2>/dev/null`,
        { timeout: 15000 },
      );
      const pcm = fs.readFileSync(tmpOutput);
      return pcm;
    } catch (err: any) {
      this.logger.warn(`ffmpeg conversion failed: ${err.message}, using raw buffer`);
      // If input is already WAV, strip the 44-byte header to get raw PCM
      if (mimetype?.includes('wav') || ext === 'wav') {
        return buffer.subarray(44);
      }
      // Otherwise return raw and let Transcribe try to handle it
      return buffer;
    } finally {
      try { fs.unlinkSync(tmpInput); } catch (_) {}
      try { fs.unlinkSync(tmpOutput); } catch (_) {}
    }
  }

  /**
   * Fallback: OpenAI Whisper API
   */
  private async openAiCompatibleTranscription(
    buffer: Buffer,
    originalName: string,
    options: {
      apiKey: string;
      model: string;
      provider: string;
      baseURL?: string;
      lang?: 'zh' | 'en';
      timeoutMs?: number;
    },
  ): Promise<{ transcript: string }> {
    const OpenAI = require('openai').default;
    const openai = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      // Bound the call so a stalled provider cannot hang the HTTP request.
      timeout: options.timeoutMs ?? STT_PROVIDER_TIMEOUT_MS,
      maxRetries: 0,
    });
    const ext = originalName?.split('.').pop() || 'm4a';
    const tmpPath = path.join(os.tmpdir(), `voice_${Date.now()}.${ext}`);
    try {
      fs.writeFileSync(tmpPath, buffer);
      const fileStream = fs.createReadStream(tmpPath);
      const response = await openai.audio.transcriptions.create({
        file: fileStream as any,
        model: options.model,
        response_format: 'text',
        temperature: 0,
        language: options.lang,
        prompt: this.buildTranscriptionPrompt(options.lang),
      });
      return {
        transcript:
          typeof response === 'string'
            ? response
            : (response as any).text || '',
      };
    } catch (err: any) {
      throw new BadRequestException(`${options.provider} failed: ${err.message}`);
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (_) {}
    }
  }
}
