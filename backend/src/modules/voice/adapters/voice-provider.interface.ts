/**
 * VoiceProviderAdapter — Unified interface for voice providers.
 *
 * All STT and TTS adapters implement this interface to allow
 * dynamic routing and fallback chains.
 */

// ── STT ────────────────────────────────────────────────────

export interface STTResult {
  text: string;
  lang?: string;
  confidence?: number;
  segments?: Array<{ text: string; start: number; end: number }>;
  provider: string;
  durationMs?: number;
}

export interface STTOptions {
  lang?: string;         // Language hint: 'zh', 'en', 'auto'
  model?: string;        // Provider-specific model name
  prompt?: string;       // Context prompt for better accuracy
  temperature?: number;
  sampleRate?: number;
  encoding?: string;
}

export interface STTAdapter {
  readonly name: string;
  readonly isAvailable: boolean;

  /**
   * Transcribe audio buffer to text.
   * @param audio  Raw audio buffer (any format — adapter handles conversion)
   * @param mimeType  Original MIME type (e.g. 'audio/webm', 'audio/m4a')
   * @param options  STT configuration
   */
  transcribe(audio: Buffer, mimeType: string, options?: STTOptions): Promise<STTResult>;
}

// ── Streaming STT ──────────────────────────────────────────

export interface StreamingSTTCallbacks {
  onInterim?: (transcript: string) => void;
  onFinal?: (result: STTResult) => void;
  onError?: (error: Error) => void;
}

export interface StreamingSTTSession {
  /** Send an audio chunk to the stream */
  write(chunk: Buffer): void;
  /** Signal end of audio input */
  end(): void;
  /** Abort the session immediately */
  abort(): void;
}

export interface StreamingSTTAdapter extends STTAdapter {
  /**
   * Open a streaming STT session.
   * Audio chunks are pushed via write(), results arrive via callbacks.
   */
  createStreamingSession(
    options: STTOptions,
    callbacks: StreamingSTTCallbacks,
  ): Promise<StreamingSTTSession>;
}

// ── TTS ────────────────────────────────────────────────────

export interface TTSResult {
  audio: Buffer;
  contentType: string;    // e.g. 'audio/mpeg'
  durationMs?: number;
  provider: string;
}

export interface TTSOptions {
  voice?: string;         // Voice ID or preset name
  lang?: string;          // Language hint
  rate?: string;          // Speech rate (e.g. '+0%', '+20%')
  pitch?: string;         // Pitch adjustment
  format?: 'mp3' | 'opus' | 'pcm';
}

export interface TTSAdapter {
  readonly name: string;
  readonly isAvailable: boolean;

  /**
   * Synthesize text to audio buffer.
   */
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
}

export interface StreamingTTSCallbacks {
  onChunk?: (chunk: Buffer) => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

export interface StreamingTTSAdapter extends TTSAdapter {
  /**
   * Synthesize text with streaming audio output.
   */
  synthesizeStream(
    text: string,
    options: TTSOptions,
    callbacks: StreamingTTSCallbacks,
  ): { cancel: () => void };
}

// ── End-to-End Realtime ────────────────────────────────────

export interface RealtimeVoiceCallbacks {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAgentText?: (text: string, isFinal: boolean) => void;
  onAgentAudio?: (chunk: Buffer) => void;
  onAgentAudioEnd?: () => void;
  onToolCall?: (toolName: string, args: Record<string, any>) => void;
  onError?: (error: Error) => void;
  onSessionEnd?: () => void;
}

export interface RealtimeVoiceSession {
  /** Send audio chunk to the realtime model */
  sendAudio(chunk: Buffer): void;
  /** Send a text message (e.g. system prompt update) */
  sendText(text: string, role?: 'user' | 'system'): void;
  /** Interrupt/cancel current agent response */
  interrupt(): void;
  /** Close the session */
  close(): void;
}

export interface RealtimeVoiceAdapter {
  readonly name: string;
  readonly isAvailable: boolean;

  /**
   * Create an end-to-end realtime voice session (e.g. GPT-4o Realtime, Gemini Live).
   */
  createSession(
    systemPrompt: string,
    callbacks: RealtimeVoiceCallbacks,
    options?: { model?: string; voice?: string; lang?: string },
  ): Promise<RealtimeVoiceSession>;
}
