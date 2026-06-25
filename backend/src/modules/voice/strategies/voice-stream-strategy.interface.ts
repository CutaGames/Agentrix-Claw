/**
 * IVoiceStreamStrategy — Abstraction for voice processing pipelines.
 *
 * Two implementations:
 *   1. CascadeVoiceStrategy    — Traditional STT → LLM → TTS pipeline (existing)
 *   2. GemmaMultimodalStrategy — End-to-end multimodal model (audio-in → audio-out)
 *
 * The Voice Gateway selects a strategy per session based on:
 *   - Device type (smart_glass → always e2e)
 *   - User plan (premium → prefer e2e)
 *   - GPU node health (unhealthy → fallback to cascade)
 */

import type { StreamEvent } from '../../query-engine/interfaces/stream-event.interface';

export type VoiceStrategyName = 'cascade' | 'gemma-multimodal' | 'gemini-live';

export interface VoiceStrategyCallbacks {
  /** Interim STT transcript (for subtitle display) */
  onTranscriptInterim?: (sessionId: string, text: string) => void;
  /** Final STT transcript */
  onTranscriptFinal?: (sessionId: string, text: string, lang?: string, provider?: string) => void;
  /** Agent text response chunk (for chat bubble display) */
  onAgentText?: (sessionId: string, chunk: string) => void;
  /** Agent text response complete */
  onAgentTextEnd?: (sessionId: string) => void;
  /** Agent audio response chunk (for speaker playback) */
  onAgentAudio?: (sessionId: string, audio: Buffer, format: string, text?: string) => void;
  /** Agent audio response complete */
  onAgentAudioEnd?: (sessionId: string) => void;
  /** Task routed to a different tier (e.g. cascade→ultra API) */
  onDeepThinkStart?: (sessionId: string, targetModel: string) => void;
  /** Deep think task completed */
  onDeepThinkDone?: (sessionId: string, result: string) => void;
  /** Model info for billing/display */
  onModelUsed?: (sessionId: string, model: string, tier: string) => void;
  /** Structured upstream stream events (tool_start, usage, done, etc.) */
  onStreamEvent?: (sessionId: string, event: StreamEvent) => void;
  /** Error */
  onError?: (sessionId: string, error: string, code?: string) => void;
}

export interface VoiceStrategySessionOptions {
  sessionId: string;
  userId: string;
  instanceId: string;
  lang: string;
  voiceId?: string;
  model?: string;
  duplexMode: boolean;
  deviceType?: 'phone' | 'desktop' | 'web' | 'glass' | 'watch';
  userPlan?: 'free' | 'pro' | 'premium';
}

export interface IVoiceStreamStrategy {
  /** Strategy identifier */
  readonly name: VoiceStrategyName;

  /**
   * Initialize a voice session with this strategy.
   * Called once when the session starts.
   */
  initSession(
    options: VoiceStrategySessionOptions,
    callbacks: VoiceStrategyCallbacks,
  ): Promise<void>;

  /**
   * Process an incoming audio chunk (PCM/opus from client).
   * For cascade: feeds into STT streaming adapter.
   * For e2e: sends directly to multimodal model.
   */
  processAudioChunk(sessionId: string, chunk: Buffer): void;

  /**
   * Signal end of an audio turn (user stopped speaking).
   * For cascade: finalizes STT, triggers LLM + TTS.
   * For e2e: may be a no-op (model handles turn detection).
   */
  processAudioEnd(sessionId: string): Promise<void>;

  /**
   * Process a text message (typed input or voice:text event).
   */
  processText(sessionId: string, text: string): Promise<void>;

  /**
   * Process an image frame (from camera/glasses).
   * Only supported by multimodal strategies; cascade returns false.
   */
  processImageFrame?(sessionId: string, frame: Buffer, mimeType: string): Promise<boolean>;

  /**
   * Interrupt / cancel current agent response (barge-in).
   */
  interrupt(sessionId: string): void;

  /**
   * End and clean up the session.
   */
  endSession(sessionId: string): void;

  /**
   * Check if this strategy is currently available (e.g. GPU node healthy).
   */
  isAvailable(): boolean;
}
