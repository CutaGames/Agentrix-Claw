import { Logger } from '@nestjs/common';
import type { StreamEvent } from '../../query-engine/interfaces/stream-event.interface';
import type {
  IVoiceStreamStrategy,
  VoiceStrategyCallbacks,
  VoiceStrategySessionOptions,
} from './voice-stream-strategy.interface';
import type { VoiceService } from '../voice.service';
import type { OpenClawProxyService } from '../../openclaw-proxy/openclaw-proxy.service';
import { DeepgramSTTAdapter } from '../adapters/deepgram-stt.adapter';
import { edgeTTS, resolveEdgeVoice } from '../adapters/edge-tts.adapter';
import type { StreamingSTTSession } from '../adapters/voice-provider.interface';

/**
 * CascadeVoiceStrategy — Traditional STT → LLM → TTS pipeline.
 *
 * Wraps the existing proven voice logic from RealtimeVoiceGateway into the
 * IVoiceStreamStrategy interface. No behavioral changes — just a structural
 * refactor to enable parallel deployment of the new e2e strategy.
 *
 * STT chain:  Deepgram streaming → (fallback) buffered Gemini/AWS/Groq/Whisper
 * LLM chain:  OpenClaw proxy → model router
 * TTS chain:  Edge TTS → (fallback) Kokoro/Polly
 */

interface CascadeSession {
  options: VoiceStrategySessionOptions;
  callbacks: VoiceStrategyCallbacks;
  streamingSession: StreamingSTTSession | null;
  audioChunks: Buffer[];
  currentResponseAbort: AbortController | null;
  responseGeneration: number;
  ttsSentenceBuffer: string;
  ttsQueue: Promise<void>;
  lastFinalTranscript: string;
  lastFinalAt: number;
  activeStreamingToken: symbol | null;
  ignoredStreamingTokens: Set<symbol>;
  pendingStreamingEnd: {
    token: symbol;
    settled: boolean;
    resolve: (receivedFinal: boolean) => void;
    timeout: NodeJS.Timeout;
  } | null;
  streamingFinalText: string;
  streamingFinalToken: symbol | null;
}

const PCM_SAMPLE_RATE = 16000;
const PCM_CHANNEL_COUNT = 1;
const PCM_BITS_PER_SAMPLE = 16;
const STREAMING_FINALIZATION_TIMEOUT_MS = 2000;

export class CascadeVoiceStrategy implements IVoiceStreamStrategy {
  readonly name = 'cascade' as const;
  private readonly logger = new Logger(CascadeVoiceStrategy.name);
  private readonly streamingAdapter = new DeepgramSTTAdapter();
  private sessions = new Map<string, CascadeSession>();

  constructor(
    private readonly voiceService: VoiceService,
    private readonly openClawProxyService: OpenClawProxyService,
  ) {}

  isAvailable(): boolean {
    return true; // Cascade is always available as fallback
  }

  async initSession(
    options: VoiceStrategySessionOptions,
    callbacks: VoiceStrategyCallbacks,
  ): Promise<void> {
    const session: CascadeSession = {
      options,
      callbacks,
      streamingSession: null,
      audioChunks: [],
      currentResponseAbort: null,
      responseGeneration: 0,
      ttsSentenceBuffer: '',
      ttsQueue: Promise.resolve(),
      lastFinalTranscript: '',
      lastFinalAt: 0,
      activeStreamingToken: null,
      ignoredStreamingTokens: new Set<symbol>(),
      pendingStreamingEnd: null,
      streamingFinalText: '',
      streamingFinalToken: null,
    };

    this.sessions.set(options.sessionId, session);
    await this.initializeStreamingSTT(session);
    callbacks.onModelUsed?.(options.sessionId, 'cascade-pipeline', 'cascade');
  }

  processAudioChunk(sessionId: string, chunk: Buffer): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.streamingSession) {
      session.streamingSession.write(chunk);
      session.audioChunks.push(chunk);
      return;
    }

    session.audioChunks.push(chunk);
  }

  async processAudioEnd(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.streamingSession) {
      const endingSession = session.streamingSession;
      const endingToken = session.activeStreamingToken;

      session.streamingSession = null;
      session.activeStreamingToken = null;

      const finalReceived = endingToken
        ? await this.awaitStreamingFinalization(session, endingToken, () => endingSession.end())
        : false;

      const storedFinal = session.streamingFinalText;
      const storedToken = session.streamingFinalToken;
      session.streamingFinalText = '';
      session.streamingFinalToken = null;

      if (finalReceived || (storedToken === endingToken && storedFinal)) {
        const transcript = storedFinal;
        session.audioChunks = [];
        await this.initializeStreamingSTT(session);
        if (!session.options.duplexMode && transcript) {
          await this.startAgentResponse(session, transcript);
        }
        return;
      }

      if (session.audioChunks.length > 0) {
        this.logger.warn(`Streaming final timed out for ${sessionId}; falling back to buffered PCM`);
        if (endingToken) session.ignoredStreamingTokens.add(endingToken);
        await this.processBufferedAudio(session);
      }

      session.audioChunks = [];
      await this.initializeStreamingSTT(session);
      return;
    }

    if (session.audioChunks.length === 0) {
      session.callbacks.onError?.(sessionId, 'No audio data received');
      return;
    }

    await this.processBufferedAudio(session);
  }

  async processText(sessionId: string, text: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    await this.startAgentResponse(session, text);
  }

  interrupt(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const hadActive = !!session.currentResponseAbort;
    session.currentResponseAbort?.abort();
    session.currentResponseAbort = null;
    session.responseGeneration += 1;
    session.ttsSentenceBuffer = '';
    if (hadActive) {
      session.callbacks.onAgentTextEnd?.(sessionId);
    }
  }

  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.streamingSession?.abort();
    session.currentResponseAbort?.abort();
    this.sessions.delete(sessionId);
  }

  // ── Streaming STT ────────────────────────────────

  private async initializeStreamingSTT(session: CascadeSession): Promise<void> {
    if (!this.streamingAdapter.isAvailable) {
      this.logger.warn(`Streaming STT unavailable for ${session.options.sessionId}`);
      return;
    }

    try {
      const token = Symbol(`stream-${session.options.sessionId}-${Date.now()}`);
      session.streamingSession?.abort();
      session.activeStreamingToken = token;

      session.streamingSession = await this.streamingAdapter.createStreamingSession(
        { lang: session.options.lang, encoding: 'linear16', sampleRate: 16000 },
        {
          onInterim: (transcript) => {
            session.callbacks.onTranscriptInterim?.(session.options.sessionId, transcript);
          },
          onFinal: (result) => {
            if (session.ignoredStreamingTokens.has(token)) {
              session.ignoredStreamingTokens.delete(token);
              this.resolvePendingTurn(session, token, false);
              return;
            }

            const text = (result.text || '').trim();
            session.callbacks.onTranscriptFinal?.(
              session.options.sessionId, text, result.lang || session.options.lang, result.provider,
            );

            this.resolvePendingTurn(session, token, Boolean(text));
            session.audioChunks = [];

            if (text) {
              session.streamingFinalText = text;
              session.streamingFinalToken = token;
            }

            if (!session.options.duplexMode || !text) return;

            const now = Date.now();
            if (text === session.lastFinalTranscript && now - session.lastFinalAt < 2000) return;

            session.lastFinalTranscript = text;
            session.lastFinalAt = now;
            void this.startAgentResponse(session, text);
          },
          onError: (error) => {
            this.logger.warn(`Streaming STT error: ${error.message}`);
            session.streamingSession = null;
            this.resolvePendingTurn(session, token, false);
            session.callbacks.onError?.(session.options.sessionId, 'Streaming transcription failed', 'STREAMING_STT_ERROR');
          },
        },
      );
    } catch (error: any) {
      session.streamingSession = null;
      session.activeStreamingToken = null;
      this.logger.warn(`Failed to init streaming STT: ${error.message}`);
    }
  }

  private async awaitStreamingFinalization(
    session: CascadeSession,
    token: symbol,
    closeStream: () => void,
  ): Promise<boolean> {
    if (session.pendingStreamingEnd?.token === token && !session.pendingStreamingEnd.settled) {
      return false;
    }

    return await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        this.resolvePendingTurn(session, token, false);
      }, STREAMING_FINALIZATION_TIMEOUT_MS);

      session.pendingStreamingEnd = { token, settled: false, resolve, timeout };
      closeStream();
    });
  }

  private resolvePendingTurn(session: CascadeSession, token: symbol, receivedFinal: boolean) {
    const pending = session.pendingStreamingEnd;
    if (!pending || pending.token !== token || pending.settled) return;
    pending.settled = true;
    clearTimeout(pending.timeout);
    session.pendingStreamingEnd = null;
    pending.resolve(receivedFinal);
  }

  // ── Buffered Audio Fallback ──────────────────────

  private async processBufferedAudio(session: CascadeSession): Promise<void> {
    const audioBuffer = Buffer.concat(session.audioChunks);
    session.audioChunks = [];

    try {
      const wavBuffer = this.wrapPcm16AsWav(audioBuffer);
      const result = await this.voiceService.transcribe(wavBuffer, 'audio/wav', 'voice.wav', session.options.lang);
      const transcript = result?.transcript || '';

      session.callbacks.onTranscriptFinal?.(session.options.sessionId, transcript, session.options.lang);

      if (transcript) {
        await this.startAgentResponse(session, transcript);
      }
    } catch (error: any) {
      this.logger.error(`STT error: ${error.message}`);
      session.callbacks.onTranscriptFinal?.(session.options.sessionId, '', session.options.lang);
    }
  }

  // ── Agent Response (LLM + TTS) ──────────────────

  private async startAgentResponse(session: CascadeSession, text: string): Promise<void> {
    this.interrupt(session.options.sessionId);

    const generation = session.responseGeneration;
    const abortController = new AbortController();
    session.currentResponseAbort = abortController;
    session.ttsSentenceBuffer = '';

    try {
      await this.openClawProxyService.streamChatToCallbacks(
        session.options.userId,
        session.options.instanceId,
        {
          message: text,
          sessionId: session.options.sessionId,
          model: session.options.model,
          voiceId: session.options.voiceId,
        },
        {
          signal: abortController.signal,
          onMeta: async (meta) => {
            if (meta?.resolvedModel) {
              session.callbacks.onModelUsed?.(
                session.options.sessionId,
                String(meta.resolvedModel),
                String(meta.resolvedModelLabel || 'upstream'),
              );
            }
          },
          onChunk: async (chunk) => {
            if (abortController.signal.aborted || generation !== session.responseGeneration) return;
            session.callbacks.onAgentText?.(session.options.sessionId, chunk);
            this.queueSentenceTts(session, chunk, false, generation);
          },
          onEvent: async (event: StreamEvent) => {
            if (abortController.signal.aborted || generation !== session.responseGeneration) return;
            session.callbacks.onStreamEvent?.(session.options.sessionId, event);

            if (event.type === 'usage' && event.model) {
              session.callbacks.onModelUsed?.(
                session.options.sessionId,
                event.model,
                'usage',
              );
            }

            if (event.type === 'thinking') {
              session.callbacks.onDeepThinkStart?.(session.options.sessionId, session.options.model || 'analysis');
            }

            if (event.type === 'done') {
              session.callbacks.onDeepThinkDone?.(session.options.sessionId, event.reason);
            }
          },
          onDone: async () => {
            if (abortController.signal.aborted || generation !== session.responseGeneration) return;
            this.queueSentenceTts(session, '', true, generation);
            await session.ttsQueue.catch(() => undefined);
            if (generation === session.responseGeneration) {
              session.callbacks.onAgentTextEnd?.(session.options.sessionId);
              session.callbacks.onAgentAudioEnd?.(session.options.sessionId);
            }
          },
        },
      );
    } catch (error: any) {
      if (abortController.signal.aborted) return;
      this.logger.error(`Agent response failed: ${error.message}`);
      session.callbacks.onError?.(session.options.sessionId, error.message, 'VOICE_AGENT_RESPONSE_ERROR');
    } finally {
      if (session.currentResponseAbort === abortController) {
        session.currentResponseAbort = null;
      }
    }
  }

  // ── Sentence-level TTS Queue ─────────────────────

  private queueSentenceTts(session: CascadeSession, text: string, flush: boolean, generation: number) {
    if (generation !== session.responseGeneration) return;
    if (text) session.ttsSentenceBuffer += text;

    const sentenceRegex = /[^。！？.!?\n]+[。！？.!?\n]+/g;
    const segments = (session.ttsSentenceBuffer.match(sentenceRegex) || []).map(s => s.trim()).filter(Boolean);

    if (segments.length > 0) {
      session.ttsSentenceBuffer = session.ttsSentenceBuffer.slice(
        (session.ttsSentenceBuffer.match(sentenceRegex) || []).join('').length,
      );
    }

    if (flush) {
      const remainder = session.ttsSentenceBuffer.trim();
      if (remainder) segments.push(remainder);
      session.ttsSentenceBuffer = '';
    }

    for (const sentence of segments) {
      session.ttsQueue = session.ttsQueue
        .then(() => this.emitSentenceAudio(session, sentence, generation))
        .catch((err) => this.logger.warn(`TTS queue error: ${err.message}`));
    }
  }

  private async emitSentenceAudio(session: CascadeSession, sentence: string, generation: number): Promise<void> {
    if (!sentence || generation !== session.responseGeneration) return;

    const clean = sentence
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`#>|]/g, '')
      .trim();

    if (!clean) return;

    const isChinese = session.options.lang === 'zh' || /[\u4e00-\u9fff]/.test(clean);
    const voice = resolveEdgeVoice(session.options.voiceId, isChinese);
    const audioBuffer = await edgeTTS(clean, { voice });

    if (generation !== session.responseGeneration) return;

    session.callbacks.onAgentAudio?.(session.options.sessionId, audioBuffer, 'mp3', sentence);
  }

  // ── Helpers ──────────────────────────────────────

  private wrapPcm16AsWav(pcmBuffer: Buffer): Buffer {
    const header = Buffer.alloc(44);
    const byteRate = PCM_SAMPLE_RATE * PCM_CHANNEL_COUNT * (PCM_BITS_PER_SAMPLE / 8);
    const blockAlign = PCM_CHANNEL_COUNT * (PCM_BITS_PER_SAMPLE / 8);

    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(PCM_CHANNEL_COUNT, 22);
    header.writeUInt32LE(PCM_SAMPLE_RATE, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(PCM_BITS_PER_SAMPLE, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(pcmBuffer.length, 40);

    return Buffer.concat([header, pcmBuffer]);
  }
}
