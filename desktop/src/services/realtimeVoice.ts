/**
 * Realtime Voice Service — Desktop (Tauri)
 *
 * Full-duplex WebSocket voice via Socket.IO /voice namespace.
 * Replaces the old HTTP upload half-duplex approach.
 *
 * Architecture:
 *   AudioWorklet (PCM 16kHz) → Socket.IO → Backend Gateway → STT/LLM/TTS → audio chunks back
 */

import { io, type Socket } from "socket.io-client";

// ── Types ──────────────────────────────────────────────

export type RealtimeVoiceState =
  | "disconnected"
  | "connecting"
  | "idle"
  | "listening"
  | "thinking"
  | "speaking";

export interface RealtimeVoiceCallbacks {
  onStateChange?: (state: RealtimeVoiceState) => void;
  /** Session created on the backend and ready for streaming */
  onSessionReady?: (sessionId: string, instanceId?: string) => void;
  /** Interim STT transcript (live subtitles) */
  onTranscriptInterim?: (text: string) => void;
  /** Final STT transcript */
  onTranscriptFinal?: (text: string, lang?: string) => void;
  /** Agent text chunk (for chat bubble) */
  onAgentText?: (chunk: string) => void;
  /** Agent text complete */
  onAgentEnd?: (interrupted?: boolean) => void;
  /** Agent audio chunk for playback */
  onAgentAudio?: (audio: ArrayBuffer, format: string, text?: string) => void;
  /** Strategy selected by server */
  onStrategyInfo?: (strategy: string) => void;
  /** Deep-think task routed to ultra-tier model */
  onDeepThinkStart?: (targetModel: string) => void;
  /** Deep-think progress update (0-100) */
  onDeepThinkProgress?: (progress: number, stage?: string) => void;
  /** Deep-think completed with result */
  onDeepThinkDone?: (summary: string, model?: string) => void;
  /** Deep-think detailed content (for large-screen display) */
  onDeepThinkDetail?: (content: string, model?: string) => void;
  /** Fabric device list updated */
  onFabricDevicesChanged?: (devices: FabricDevice[]) => void;
  /** Fabric primary device changed */
  onFabricPrimaryChanged?: (newPrimaryDeviceId: string) => void;
  /** Error */
  onError?: (error: string, code?: string) => void;
}

export interface FabricDevice {
  deviceId: string;
  deviceType: string;
  isPrimary: boolean;
  capabilities: Record<string, boolean | string>;
  lastActiveAt: string;
}

export interface RealtimeVoiceOptions {
  /** Backend WebSocket base URL (e.g. https://api.agentrix.top) */
  wsUrl: string;
  /** JWT auth token */
  token: string;
  /** OpenClaw instance ID */
  instanceId: string;
  /** Preferred model for agent responses */
  model?: string;
  /** Language preference */
  lang?: string;
  /** Voice ID for TTS */
  voiceId?: string;
  /** Full-duplex mode (continuous listening while agent speaks) */
  duplexMode?: boolean;
  /** Device type hint for strategy selection */
  deviceType?: "phone" | "desktop" | "web" | "glass" | "watch";
}

// ── PCM Audio Worklet ──────────────────────────────────

const PCM_WORKLET_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const float32 = input[0];
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
`;

// ── Service Class ──────────────────────────────────────

export class RealtimeVoiceService {
  private socket: Socket | null = null;
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  private sessionId: string | null = null;
  private state: RealtimeVoiceState = "disconnected";
  private callbacks: RealtimeVoiceCallbacks;
  private options: RealtimeVoiceOptions;

  // Playback queue (base64 → AudioBuffer)
  private playbackCtx: AudioContext | null = null;
  private playbackQueue: Array<{ audio: ArrayBuffer; format: string; text?: string }> = [];
  private isPlayingBack = false;
  private currentPlaybackSource: AudioBufferSourceNode | null = null;

  constructor(options: RealtimeVoiceOptions, callbacks: RealtimeVoiceCallbacks = {}) {
    this.options = options;
    this.callbacks = callbacks;
  }

  // ── Public API ────────────────────────────────────

  /** Connect to the voice WebSocket and start a session */
  async connect(): Promise<void> {
    if (this.socket?.connected) return;

    this.setState("connecting");

    // Derive WS URL: strip /api suffix if present, add /voice namespace
    const baseUrl = this.options.wsUrl.replace(/\/api\/?$/, "");

    this.socket = io(`${baseUrl}/voice`, {
      auth: { token: this.options.token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.bindSocketEvents();

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Voice connection timeout"));
      }, 10000);

      this.socket!.once("connect", () => {
        this.startSession();
      });

      this.socket!.once("voice:session:ready", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.socket!.once("connect_error", (err) => {
        clearTimeout(timeout);
        this.setState("disconnected");
        reject(err);
      });
    });
  }

  /** Start capturing microphone audio and streaming to server */
  async startListening(): Promise<void> {
    if (!this.socket?.connected || !this.sessionId) {
      throw new Error("Not connected to voice session");
    }

    this.setState("listening");

    // Set up AudioContext + AudioWorklet for PCM capture
    this.audioCtx = new AudioContext({ sampleRate: 16000 });

    // Register worklet from inline code
    const blob = new Blob([PCM_WORKLET_CODE], { type: "application/javascript" });
    const workletUrl = URL.createObjectURL(blob);
    await this.audioCtx.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioCtx, "pcm-capture-processor");

    this.workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (this.state === "listening" && this.socket?.connected && this.sessionId) {
        // Send raw PCM Int16 as binary
        this.socket.emit("voice:audio:chunk", {
          sessionId: this.sessionId,
          audio: new Uint8Array(event.data),
        });
      }
    };

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.audioCtx.destination); // required for worklet to process
  }

  /** Stop listening and signal end of audio turn */
  stopListening(): void {
    if (this.sessionId && this.socket?.connected) {
      this.socket.emit("voice:audio:end", { sessionId: this.sessionId });
    }
    this.cleanupAudioCapture();
    if (this.state === "listening") {
      this.setState("thinking");
    }
  }

  /** Send a text message (typed input while in voice session) */
  sendText(text: string): void {
    if (!this.socket?.connected || !this.sessionId) return;
    this.socket.emit("voice:text", {
      sessionId: this.sessionId,
      text,
    });
    this.setState("thinking");
  }

  /** Interrupt / barge-in (stop agent response) */
  interrupt(): void {
    if (!this.socket?.connected || !this.sessionId) return;
    this.socket.emit("voice:interrupt", { sessionId: this.sessionId });
    this.stopPlayback();
    this.setState("idle");
  }

  /** Disconnect and release all resources */
  disconnect(): void {
    if (this.sessionId && this.socket?.connected) {
      this.socket.emit("voice:session:end", { sessionId: this.sessionId });
    }
    this.cleanupAudioCapture();
    this.stopPlayback();
    this.socket?.disconnect();
    this.socket = null;
    this.sessionId = null;
    this.setState("disconnected");
  }

  /** Query all devices in the current voice session fabric */
  queryFabricDevices(): void {
    if (!this.socket?.connected || !this.sessionId) return;
    this.socket.emit("voice:fabric:devices", { sessionId: this.sessionId });
  }

  /** Switch primary device in the session fabric */
  switchFabricPrimary(targetDeviceId: string): void {
    if (!this.socket?.connected || !this.sessionId) return;
    this.socket.emit("voice:fabric:switch-primary", {
      sessionId: this.sessionId,
      targetDeviceId,
    });
  }

  get currentState(): RealtimeVoiceState {
    return this.state;
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ── Private ───────────────────────────────────────

  private setState(state: RealtimeVoiceState): void {
    if (this.state === state) return;
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  private startSession(): void {
    this.socket!.emit("voice:session:start", {
      instanceId: this.options.instanceId,
      model: this.options.model,
      lang: this.options.lang || "en",
      voiceId: this.options.voiceId,
      duplexMode: this.options.duplexMode ?? false,
      deviceType: this.options.deviceType || "desktop",
    });
  }

  private bindSocketEvents(): void {
    const s = this.socket!;

    s.on("voice:session:ready", (data: { sessionId: string; instanceId?: string }) => {
      this.sessionId = data.sessionId;
      this.setState("idle");
      this.callbacks.onSessionReady?.(data.sessionId, data.instanceId);
    });

    s.on("voice:stt:interim", (data: { transcript: string }) => {
      this.callbacks.onTranscriptInterim?.(data.transcript);
    });

    s.on("voice:stt:final", (data: { transcript: string; lang?: string }) => {
      this.callbacks.onTranscriptFinal?.(data.transcript, data.lang);
    });

    s.on("voice:agent:text", (data: { chunk: string }) => {
      if (this.state !== "speaking") this.setState("speaking");
      this.callbacks.onAgentText?.(data.chunk);
    });

    s.on("voice:agent:audio", (data: { audio: string; format: string; text?: string }) => {
      if (this.state !== "speaking") this.setState("speaking");
      // Decode base64 audio and queue for playback
      const binary = atob(data.audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      this.enqueuePlayback(bytes.buffer, data.format, data.text);
      this.callbacks.onAgentAudio?.(bytes.buffer, data.format, data.text);
    });

    s.on("voice:agent:end", (data: { interrupted?: boolean }) => {
      this.callbacks.onAgentEnd?.(data.interrupted);
      // Wait for playback queue to drain before going idle
      if (this.playbackQueue.length === 0 && !this.isPlayingBack) {
        this.setState("idle");
      }
    });

    s.on("voice:strategy:info", (data: { strategy: string }) => {
      this.callbacks.onStrategyInfo?.(data.strategy);
    });

    s.on("voice:error", (data: { error: string; code?: string }) => {
      this.callbacks.onError?.(data.error, data.code);
    });

    s.on("voice:session:ended", () => {
      this.sessionId = null;
      this.setState("disconnected");
    });

    // ── Deep-think events ──────────────────────
    s.on("voice:deepthink:start", (data: { targetModel?: string }) => {
      this.callbacks.onDeepThinkStart?.(data.targetModel || "ultra");
    });

    s.on("voice:deepthink:progress", (data: { progress: number; stage?: string }) => {
      this.callbacks.onDeepThinkProgress?.(data.progress, data.stage);
    });

    s.on("voice:deepthink:done", (data: { summary?: string; model?: string }) => {
      this.callbacks.onDeepThinkDone?.(data.summary || "", data.model);
    });

    s.on("voice:deepthink:detail", (data: { content?: string; model?: string }) => {
      this.callbacks.onDeepThinkDetail?.(data.content || "", data.model);
    });

    // ── Fabric events ──────────────────────────
    s.on("voice:fabric:devices:res", (data: { devices?: FabricDevice[] }) => {
      this.callbacks.onFabricDevicesChanged?.(data.devices || []);
    });

    s.on("voice:fabric:primary-changed", (data: { newPrimaryDeviceId?: string }) => {
      this.callbacks.onFabricPrimaryChanged?.(data.newPrimaryDeviceId || "");
      // Re-query device list
      if (this.sessionId) {
        s.emit("voice:fabric:devices", { sessionId: this.sessionId });
      }
    });

    s.on("disconnect", () => {
      this.sessionId = null;
      this.cleanupAudioCapture();
      this.setState("disconnected");
    });

    s.on("reconnect", () => {
      this.startSession();
    });
  }

  // ── Audio Capture Cleanup ─────────────────────────

  private cleanupAudioCapture(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }

  // ── Audio Playback Queue ──────────────────────────

  private enqueuePlayback(audio: ArrayBuffer, format: string, text?: string): void {
    this.playbackQueue.push({ audio, format, text });
    if (!this.isPlayingBack) {
      this.processPlaybackQueue();
    }
  }

  private async processPlaybackQueue(): Promise<void> {
    if (this.isPlayingBack) return;
    this.isPlayingBack = true;

    if (!this.playbackCtx) {
      this.playbackCtx = new AudioContext();
    }

    while (this.playbackQueue.length > 0) {
      const item = this.playbackQueue.shift()!;
      try {
        const audioBuffer = await this.playbackCtx.decodeAudioData(item.audio.slice(0));
        await this.playAudioBuffer(audioBuffer);
      } catch (err) {
        console.warn("[RealtimeVoice] Failed to decode audio:", err);
      }
    }

    this.isPlayingBack = false;
    // If agent has finished and queue is drained, go idle
    if (this.state === "speaking") {
      this.setState("idle");
    }
  }

  private playAudioBuffer(buffer: AudioBuffer): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.playbackCtx) {
        resolve();
        return;
      }
      const source = this.playbackCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.playbackCtx.destination);
      this.currentPlaybackSource = source;
      source.onended = () => {
        this.currentPlaybackSource = null;
        resolve();
      };
      source.start();
    });
  }

  private stopPlayback(): void {
    this.playbackQueue = [];
    if (this.currentPlaybackSource) {
      try {
        this.currentPlaybackSource.stop();
      } catch {}
      this.currentPlaybackSource = null;
    }
    this.isPlayingBack = false;
  }
}
