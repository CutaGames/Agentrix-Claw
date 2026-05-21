/**
 * RealtimeVoiceService — Socket.IO-based duplex voice control channel.
 *
 * The mobile client keeps local STT for low-friction microphone capture,
 * then pushes final transcripts to the backend voice gateway for streaming
 * agent text + sentence-level TTS responses.
 */

import { AppState, type AppStateStatus } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { addVoiceDiagnostic } from './voiceDiagnostics';
import { isVoiceUiE2EEnabled, setVoiceUiE2ERealtimeBridge } from '../testing/e2e';

export type RealtimeVoiceState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';

export interface RealtimeVoiceCallbacks {
  onStateChange: (state: RealtimeVoiceState) => void;
  onSessionReady?: (sessionId: string) => void;
  onInterimTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onAgentTextChunk: (chunk: string) => void;
  onAgentAudioChunk: (audioBase64: string, format: string) => void;
  onAgentResponseEnd: () => void;
  onAgentSpeechStart: () => void;
  onToolCall: (toolName: string, status: 'start' | 'end') => void;
  onError: (error: string) => void;
  onDisconnect: (reason: string) => void;
}

export interface RealtimeVoiceConfig {
  wsUrl: string;
  token: string;
  instanceId: string;
  language: string;
  modelId?: string;
  agentVoiceId?: string;
  deviceType?: 'phone' | 'desktop' | 'web' | 'glass' | 'watch';
}

type SocketBufferLike = {
  type: 'Buffer';
  data: number[];
};

function toSocketBufferLike(audio: ArrayBuffer | Uint8Array): SocketBufferLike {
  const bytes = audio instanceof Uint8Array
    ? audio
    : new Uint8Array(audio);

  return {
    type: 'Buffer',
    data: Array.from(bytes),
  };
}

export class RealtimeVoiceService {
  private socket: Socket | null = null;
  private config: RealtimeVoiceConfig | null = null;
  private callbacks: RealtimeVoiceCallbacks;
  private _state: RealtimeVoiceState = 'disconnected';
  private sessionId: string | null = null;
  private intentionallyClosed = false;
  private appStateSubscription: { remove: () => void } | null = null;
  private pendingTexts: string[] = [];
  private e2eCleanup: (() => void) | null = null;

  constructor(callbacks: RealtimeVoiceCallbacks) {
    this.callbacks = callbacks;
  }

  get state(): RealtimeVoiceState {
    return this._state;
  }

  get isConnected(): boolean {
    return !!this.socket?.connected && !!this.sessionId && this._state !== 'error';
  }

  get currentSessionId(): string | null {
    return this.sessionId;
  }

  getSocketClient(): Socket | null {
    return this.socket;
  }

  connect(config: RealtimeVoiceConfig): void {
    this.config = config;
    this.intentionallyClosed = false;
    this.pendingTexts = [];
    this.setupAppStateListener();
    this.createSocket();
  }

  private createSocket(): void {
    if (!this.config) {
      return;
    }

    if (isVoiceUiE2EEnabled() && typeof window !== 'undefined') {
      this.setupE2ERealtimeChannel();
      return;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.setState('connecting');

    const socket = io(this.config.wsUrl, {
      transports: ['websocket'],
      auth: { token: this.config.token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 10000,
      forceNew: true,
    });

    this.socket = socket;

    socket.on('connect', () => {
      addVoiceDiagnostic('realtime-voice', 'socket-connected', { id: socket.id });
      this.setState('connecting');
      this.startSession();
    });

    socket.on('disconnect', (reason) => {
      addVoiceDiagnostic('realtime-voice', 'socket-disconnected', { reason, intentional: this.intentionallyClosed });
      this.sessionId = null;
      this.pendingTexts = [];
      if (this.intentionallyClosed) {
        this.setState('disconnected');
        this.callbacks.onDisconnect('intentional');
        return;
      }
      this.setState('disconnected');
      this.callbacks.onDisconnect(reason);
    });

    socket.on('connect_error', (error) => {
      addVoiceDiagnostic('realtime-voice', 'socket-connect-error', { error: error.message });
      this.setState('error');
      this.callbacks.onError(error.message || 'Realtime voice connect failed');
    });

    socket.on('voice:session:ready', (payload: { sessionId?: string }) => {
      this.sessionId = payload?.sessionId || null;
      addVoiceDiagnostic('realtime-voice', 'session-ready', { sessionId: this.sessionId });
      this.setState('connected');
      if (this.sessionId) {
        this.callbacks.onSessionReady?.(this.sessionId);
      }
      this.flushPendingTexts();
    });

    socket.on('voice:transcript:interim', (payload: { text?: string }) => {
      this.setState('listening');
      this.callbacks.onInterimTranscript(payload?.text || '');
    });

    socket.on('voice:stt:interim', (payload: { transcript?: string }) => {
      this.setState('listening');
      this.callbacks.onInterimTranscript(payload?.transcript || '');
    });

    socket.on('voice:transcript:final', (payload: { text?: string }) => {
      this.setState('thinking');
      this.callbacks.onFinalTranscript(payload?.text || '');
    });

    socket.on('voice:stt:final', (payload: { transcript?: string }) => {
      this.setState('thinking');
      this.callbacks.onFinalTranscript(payload?.transcript || '');
    });

    socket.on('voice:meta', (payload: any) => {
      addVoiceDiagnostic('realtime-voice', 'meta', payload || {});
    });

    socket.on('voice:agent:text', (payload: { chunk?: string; text?: string }) => {
      this.setState('thinking');
      this.callbacks.onAgentTextChunk(payload?.chunk || payload?.text || '');
    });

    socket.on('voice:agent:speech:start', () => {
      this.setState('speaking');
      this.callbacks.onAgentSpeechStart();
    });

    socket.on('voice:agent:audio', (payload: { audio?: string; format?: string }) => {
      this.setState('speaking');
      this.callbacks.onAgentAudioChunk(payload?.audio || '', payload?.format || 'mp3');
    });

    socket.on('voice:agent:end', () => {
      this.setState('connected');
      this.callbacks.onAgentResponseEnd();
    });

    socket.on('voice:tool:start', (payload: { tool?: string }) => {
      this.callbacks.onToolCall(payload?.tool || '', 'start');
    });

    socket.on('voice:tool:end', (payload: { tool?: string }) => {
      this.callbacks.onToolCall(payload?.tool || '', 'end');
    });

    socket.on('voice:error', (payload: { error?: string }) => {
      const error = payload?.error || 'Realtime voice error';
      addVoiceDiagnostic('realtime-voice', 'socket-error-event', { error });
      this.callbacks.onError(error);
    });
  }

  private setupE2ERealtimeChannel(): void {
    this.e2eCleanup?.();
    this.socket = null;
    this.sessionId = 'e2e-realtime-session';
    this.setState('connecting');

    const handleFinalTranscript = (text: string) => {
      this.setState('thinking');
      this.callbacks.onFinalTranscript(text);
    };

    const handleAssistantChunk = (chunk: string) => {
      this.setState('thinking');
      this.callbacks.onAgentTextChunk(chunk);
    };

    const handleAssistantEnd = () => {
      this.setState('connected');
      this.callbacks.onAgentResponseEnd();
    };

    const handleError = (error: string) => {
      this.setState('error');
      this.callbacks.onError(error || 'Realtime voice error');
    };

    setVoiceUiE2ERealtimeBridge({
      onFinalTranscript: handleFinalTranscript,
      onAssistantChunk: handleAssistantChunk,
      onAssistantEnd: handleAssistantEnd,
      onError: handleError,
    });

    this.e2eCleanup = () => {
      setVoiceUiE2ERealtimeBridge(null);
    };

    addVoiceDiagnostic('realtime-voice', 'session-ready', { sessionId: this.sessionId, mode: 'e2e' });
    this.setState('connected');
    this.callbacks.onSessionReady?.(this.sessionId);
    this.flushPendingTexts();
  }

  private startSession(): void {
    if (!this.socket || !this.config) {
      return;
    }

    this.socket.emit('voice:session:start', {
      sessionId: this.sessionId || undefined,
      instanceId: this.config.instanceId,
      lang: this.config.language,
      voiceId: this.config.agentVoiceId,
      duplexMode: true,
      model: this.config.modelId,
      deviceType: this.config.deviceType || 'phone',
    });
  }

  sendText(text: string): void {
    if (!this.socket || !this.sessionId) {
      if (text.trim()) {
        this.pendingTexts.push(text);
        addVoiceDiagnostic('realtime-voice', 'queue-text-until-ready', {
          queuedCount: this.pendingTexts.length,
        });
      }
      return;
    }

    this.setState('thinking');
    this.socket.emit('voice:text', {
      sessionId: this.sessionId,
      text,
      model: this.config?.modelId,
    });
  }

  sendInterrupt(): void {
    if (!this.socket || !this.sessionId) {
      return;
    }

    this.socket.emit('voice:interrupt', { sessionId: this.sessionId });
  }

  sendAudioChunk(audio: ArrayBuffer | Uint8Array): void {
    if (!this.socket || !this.sessionId) {
      return;
    }

    this.socket.emit('voice:audio:chunk', {
      sessionId: this.sessionId,
      audio: toSocketBufferLike(audio),
    });
  }

  sendImageFrame(frameBase64: string, mimeType = 'image/jpeg'): void {
    if (!this.socket || !this.sessionId || !frameBase64) {
      return;
    }

    this.socket.emit('voice:image:frame', {
      sessionId: this.sessionId,
      frame: frameBase64,
      mimeType,
    });
  }

  endAudioInput(): void {
    if (!this.socket || !this.sessionId) {
      return;
    }

    this.socket.emit('voice:audio:end', { sessionId: this.sessionId });
  }

  startListening(): void {
    this.setState('listening');
  }

  stopListening(): void {
    if (this._state === 'listening') {
      this.setState('connected');
    }
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.removeAppStateListener();
    this.e2eCleanup?.();
    this.e2eCleanup = null;

    if (this.socket) {
      if (this.sessionId) {
        this.socket.emit('voice:session:end', { sessionId: this.sessionId });
      }
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.sessionId = null;
    this.pendingTexts = [];
    this.setState('disconnected');
  }

  private flushPendingTexts(): void {
    if (!this.sessionId || !this.pendingTexts.length) {
      return;
    }

    const queued = [...this.pendingTexts];
    this.pendingTexts = [];
    for (const text of queued) {
      this.sendText(text);
    }
  }

  private setupAppStateListener(): void {
    this.removeAppStateListener();
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private removeAppStateListener(): void {
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
  }

  private handleAppStateChange = (nextState: AppStateStatus): void => {
    if (nextState !== 'active' || this.intentionallyClosed || !this.config) {
      return;
    }

    if (!this.socket || this.socket.disconnected) {
      this.createSocket();
    }
  };

  private setState(state: RealtimeVoiceState): void {
    if (this._state === state) return;
    this._state = state;
    this.callbacks.onStateChange(state);
  }
}