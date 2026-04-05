import { useState, useCallback, useEffect, useRef, type CSSProperties } from "react";
import {
  startRecording,
  stopRecording,
  cancelRecording,
  speechToText,
  type VoiceState,
} from "../services/voice";
import {
  isLiveSpeechAvailable,
  requestLiveSpeechPermissions,
  startLiveSpeechRecognition,
  type LiveSpeechController,
} from "../services/liveSpeech";
import { API_BASE, useAuthStore } from "../services/store";
import {
  RealtimeVoiceService,
  type FabricDevice,
  type RealtimeVoiceState,
} from "../services/realtimeVoice";

interface RealtimeVoiceConfig {
  enabled?: boolean;
  instanceId?: string;
  model?: string;
  lang?: string;
  voiceId?: string;
  onSessionReady?: (sessionId: string, instanceId?: string) => void;
  onTranscriptFinal?: (text: string, lang?: string) => void;
  onAgentText?: (chunk: string) => void;
  onAgentEnd?: (interrupted?: boolean) => void;
  onDeepThinkStart?: (targetModel: string) => void;
  onDeepThinkProgress?: (progress: number, stage?: string) => void;
  onDeepThinkDone?: (summary: string, model?: string) => void;
  onDeepThinkDetail?: (content: string, model?: string) => void;
  onFabricDevicesChanged?: (devices: FabricDevice[]) => void;
  onFabricPrimaryChanged?: (deviceId: string) => void;
  onError?: (message: string, code?: string) => void;
}

interface Props {
  onTranscript: (text: string) => void;
  voiceState: VoiceState;
  onStateChange: (state: VoiceState) => void;
  /** When true, stop any current TTS playback (barge-in) */
  onBargeIn?: () => void;
  realtime?: RealtimeVoiceConfig;
}

function mapRealtimeStateToVoiceState(state: RealtimeVoiceState): VoiceState {
  switch (state) {
    case "listening":
      return "recording";
    case "thinking":
      return "processing";
    case "speaking":
      return "speaking";
    default:
      return "idle";
  }
}

export default function VoiceButton({
  onTranscript,
  voiceState,
  onStateChange,
  onBargeIn,
  realtime,
}: Props) {
  const { token } = useAuthStore();
  const [error, setError] = useState("");
  const [duplexMode, setDuplexMode] = useState(false);
  const [liveAvailable] = useState(isLiveSpeechAvailable);
  const [liveListening, setLiveListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const liveSpeechRef = useRef<LiveSpeechController | null>(null);
  const manualStopRef = useRef(false);
  const realtimeVoiceRef = useRef<RealtimeVoiceService | null>(null);
  const realtimeStreamingRef = useRef(false);
  const [realtimeStreaming, setRealtimeStreaming] = useState(false);

  const realtimeEnabled = Boolean(realtime?.enabled && token && realtime.instanceId);
  const supportsDuplex = realtimeEnabled || liveAvailable;
  const realtimeInstanceId = realtime?.instanceId;
  const realtimeModel = realtime?.model;
  const realtimeLang = realtime?.lang;
  const realtimeVoiceId = realtime?.voiceId;

  const realtimeHandlersRef = useRef({
    onStateChange,
    onBargeIn,
    onSessionReady: realtime?.onSessionReady,
    onTranscriptFinal: realtime?.onTranscriptFinal,
    onAgentText: realtime?.onAgentText,
    onAgentEnd: realtime?.onAgentEnd,
    onDeepThinkStart: realtime?.onDeepThinkStart,
    onDeepThinkProgress: realtime?.onDeepThinkProgress,
    onDeepThinkDone: realtime?.onDeepThinkDone,
    onDeepThinkDetail: realtime?.onDeepThinkDetail,
    onFabricDevicesChanged: realtime?.onFabricDevicesChanged,
    onFabricPrimaryChanged: realtime?.onFabricPrimaryChanged,
    onError: realtime?.onError,
  });

  useEffect(() => {
    realtimeHandlersRef.current = {
      onStateChange,
      onBargeIn,
      onSessionReady: realtime?.onSessionReady,
      onTranscriptFinal: realtime?.onTranscriptFinal,
      onAgentText: realtime?.onAgentText,
      onAgentEnd: realtime?.onAgentEnd,
      onDeepThinkStart: realtime?.onDeepThinkStart,
      onDeepThinkProgress: realtime?.onDeepThinkProgress,
      onDeepThinkDone: realtime?.onDeepThinkDone,
      onDeepThinkDetail: realtime?.onDeepThinkDetail,
      onFabricDevicesChanged: realtime?.onFabricDevicesChanged,
      onFabricPrimaryChanged: realtime?.onFabricPrimaryChanged,
      onError: realtime?.onError,
    };
  }, [
    onBargeIn,
    onStateChange,
    realtime?.onAgentEnd,
    realtime?.onAgentText,
    realtime?.onDeepThinkDetail,
    realtime?.onDeepThinkDone,
    realtime?.onDeepThinkProgress,
    realtime?.onDeepThinkStart,
    realtime?.onError,
    realtime?.onFabricDevicesChanged,
    realtime?.onFabricPrimaryChanged,
    realtime?.onSessionReady,
    realtime?.onTranscriptFinal,
  ]);

  const setRealtimeStreamingState = useCallback((next: boolean) => {
    realtimeStreamingRef.current = next;
    setRealtimeStreaming(next);
  }, []);

  const disconnectRealtime = useCallback((resetState = true) => {
    const service = realtimeVoiceRef.current;
    realtimeVoiceRef.current = null;
    if (service) {
      service.disconnect();
    }
    setRealtimeStreamingState(false);
    setInterimTranscript("");
    if (resetState) {
      onStateChange("idle");
    }
  }, [onStateChange, setRealtimeStreamingState]);

  const stopLiveSpeechSession = useCallback((manual = false) => {
    manualStopRef.current = manual;
    const ctrl = liveSpeechRef.current;
    liveSpeechRef.current = null;
    setLiveListening(false);
    setInterimTranscript("");
    if (ctrl) {
      try { if (manual) ctrl.abort(); else ctrl.stop(); } catch {}
    }
  }, []);

  const ensureRealtimeService = useCallback(async (sessionDuplexMode = duplexMode) => {
    if (!token) {
      throw new Error("Not logged in");
    }
    if (!realtimeInstanceId) {
      throw new Error("Select an instance before using realtime voice");
    }

    let service = realtimeVoiceRef.current;
    if (!service) {
      service = new RealtimeVoiceService(
        {
          wsUrl: API_BASE,
          token,
          instanceId: realtimeInstanceId,
          model: realtimeModel || undefined,
          lang: realtimeLang || (navigator.language?.startsWith("zh") ? "zh" : "en"),
          voiceId: realtimeVoiceId,
          duplexMode: sessionDuplexMode,
          deviceType: "desktop",
        },
        {
          onStateChange: (state) => {
            if (state === "disconnected") {
              setRealtimeStreamingState(false);
            }
            if (state === "idle" && !realtimeStreamingRef.current) {
              setInterimTranscript("");
            }
            realtimeHandlersRef.current.onStateChange(mapRealtimeStateToVoiceState(state));
          },
          onSessionReady: (sessionId, instanceId) => {
            realtimeVoiceRef.current?.queryFabricDevices();
            realtimeHandlersRef.current.onSessionReady?.(sessionId, instanceId);
          },
          onTranscriptInterim: (text) => {
            setInterimTranscript(text);
          },
          onTranscriptFinal: (text, lang) => {
            const normalized = text.trim();
            setInterimTranscript("");
            if (normalized) {
              realtimeHandlersRef.current.onTranscriptFinal?.(normalized, lang);
            }
          },
          onAgentText: (chunk) => {
            realtimeHandlersRef.current.onAgentText?.(chunk);
          },
          onAgentEnd: (interrupted) => {
            realtimeHandlersRef.current.onAgentEnd?.(interrupted);
          },
          onDeepThinkStart: (targetModel) => {
            realtimeHandlersRef.current.onDeepThinkStart?.(targetModel);
          },
          onDeepThinkProgress: (progress, stage) => {
            realtimeHandlersRef.current.onDeepThinkProgress?.(progress, stage);
          },
          onDeepThinkDone: (summary, model) => {
            realtimeHandlersRef.current.onDeepThinkDone?.(summary, model);
          },
          onDeepThinkDetail: (content, model) => {
            realtimeHandlersRef.current.onDeepThinkDetail?.(content, model);
          },
          onFabricDevicesChanged: (devices) => {
            realtimeHandlersRef.current.onFabricDevicesChanged?.(devices);
          },
          onFabricPrimaryChanged: (deviceId) => {
            realtimeHandlersRef.current.onFabricPrimaryChanged?.(deviceId);
          },
          onError: (message, code) => {
            const normalized = message || "Realtime voice unavailable";
            setError(normalized);
            setRealtimeStreamingState(false);
            setInterimTranscript("");
            realtimeHandlersRef.current.onStateChange("idle");
            realtimeHandlersRef.current.onError?.(normalized, code);
          },
        },
      );
      realtimeVoiceRef.current = service;
    }

    if (!service.isConnected) {
      await service.connect();
    }

    return service;
  }, [duplexMode, realtimeInstanceId, realtimeLang, realtimeModel, realtimeVoiceId, setRealtimeStreamingState, token]);

  const startRealtimeListening = useCallback(async (sessionDuplexMode = duplexMode) => {
    if (realtimeStreamingRef.current) {
      return;
    }

    setError("");
    try {
      const service = await ensureRealtimeService(sessionDuplexMode);
      if (service.currentState === "thinking" || service.currentState === "speaking") {
        service.interrupt();
      }
      realtimeHandlersRef.current.onBargeIn?.();
      await service.startListening();
      setRealtimeStreamingState(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Realtime voice unavailable";
      setError(message);
      setRealtimeStreamingState(false);
      onStateChange("idle");
      realtimeHandlersRef.current.onError?.(message);
    }
  }, [duplexMode, ensureRealtimeService, onStateChange, setRealtimeStreamingState]);

  const pauseRealtimeListening = useCallback(() => {
    const service = realtimeVoiceRef.current;
    if (!service || !realtimeStreamingRef.current) {
      return;
    }
    service.stopListening();
    setRealtimeStreamingState(false);
    setInterimTranscript("");
  }, [setRealtimeStreamingState]);

  const cancelRealtimeSession = useCallback(() => {
    realtimeVoiceRef.current?.interrupt();
    disconnectRealtime(true);
  }, [disconnectRealtime]);

  // ── Legacy hold-to-talk / realtime hold-to-talk ─────────────────

  const handleRecordStart = useCallback(async () => {
    if (realtimeEnabled) {
      await startRealtimeListening(false);
      return;
    }

    if (voiceState !== "idle") return;
    setError("");
    try {
      await startRecording();
      onStateChange("recording");
    } catch {
      setError("Microphone access denied");
    }
  }, [onStateChange, realtimeEnabled, startRealtimeListening, voiceState]);

  const handleRecordStop = useCallback(async () => {
    if (realtimeEnabled) {
      pauseRealtimeListening();
      return;
    }

    if (voiceState !== "recording") return;
    onStateChange("processing");
    try {
      const blob = await stopRecording();
      if (!token) {
        setError("Not logged in");
        onStateChange("idle");
        return;
      }
      const text = await speechToText(blob, token);
      if (text.trim()) {
        onTranscript(text.trim());
      }
    } catch {
      setError("Voice recognition failed");
    }
    onStateChange("idle");
  }, [onStateChange, onTranscript, pauseRealtimeListening, realtimeEnabled, token, voiceState]);

  const handleCancel = useCallback(() => {
    if (realtimeEnabled) {
      cancelRealtimeSession();
      return;
    }

    if (duplexMode) {
      stopLiveSpeechSession(true);
    } else {
      cancelRecording();
    }
    onStateChange("idle");
    setInterimTranscript("");
  }, [cancelRealtimeSession, duplexMode, onStateChange, realtimeEnabled, stopLiveSpeechSession]);

  // ── Duplex mode: real-time speech recognition ────────────

  const startLiveSpeechSession = useCallback(async () => {
    if (liveSpeechRef.current || !liveAvailable) return;

    const perm = await requestLiveSpeechPermissions();
    if (!perm.granted) {
      setError("Microphone permission denied");
      return;
    }

    setError("");
    manualStopRef.current = false;

    const lang = navigator.language?.startsWith("zh") ? "zh" : "en";

    liveSpeechRef.current = startLiveSpeechRecognition(lang, {
      onStart: () => {
        setLiveListening(true);
        onStateChange("recording");
        setInterimTranscript("");
      },
      onEnd: () => {
        liveSpeechRef.current = null;
        setLiveListening(false);
        if (!manualStopRef.current && duplexMode) {
          setTimeout(() => {
            if (duplexMode) startLiveSpeechSession();
          }, 300);
        } else {
          onStateChange("idle");
        }
      },
      onSpeechStart: () => {
        onBargeIn?.();
      },
      onInterimResult: (transcript) => {
        setInterimTranscript(transcript);
      },
      onFinalResult: (transcript) => {
        const normalized = transcript.trim();
        if (!normalized) return;
        setInterimTranscript("");
        stopLiveSpeechSession(false);
        onBargeIn?.();
        onStateChange("processing");
        onTranscript(normalized);
      },
      onError: (err) => {
        if (err.error === "aborted" || err.error === "no-speech") return;
        setError(err.message || "Speech recognition error");
        setLiveListening(false);
        onStateChange("idle");
      },
    });
  }, [duplexMode, liveAvailable, onBargeIn, onStateChange, onTranscript, stopLiveSpeechSession]);

  const toggleDuplex = useCallback(() => {
    if (realtimeEnabled) {
      if (duplexMode) {
        disconnectRealtime(true);
        setDuplexMode(false);
      } else {
        disconnectRealtime(false);
        setDuplexMode(true);
        void startRealtimeListening(true);
      }
      return;
    }

    if (duplexMode) {
      stopLiveSpeechSession(true);
      setDuplexMode(false);
      onStateChange("idle");
    } else {
      setDuplexMode(true);
      void startLiveSpeechSession();
    }
  }, [disconnectRealtime, duplexMode, onStateChange, realtimeEnabled, startLiveSpeechSession, startRealtimeListening, stopLiveSpeechSession]);

  // ── Interaction handlers ─────────────────────────────────

  const handlePointerDown = useCallback(() => {
    if (duplexMode) return;
    void handleRecordStart();
  }, [duplexMode, handleRecordStart]);

  const handlePointerUp = useCallback(() => {
    if (duplexMode) return;
    if (realtimeEnabled) {
      pauseRealtimeListening();
      return;
    }
    if (voiceState === "recording") {
      void handleRecordStop();
    }
  }, [duplexMode, handleRecordStop, pauseRealtimeListening, realtimeEnabled, voiceState]);

  const handleClick = useCallback(() => {
    if (!duplexMode) return;
    if (realtimeEnabled) {
      if (realtimeStreaming) {
        pauseRealtimeListening();
      } else {
        void startRealtimeListening(true);
      }
      return;
    }
    if (liveListening) {
      stopLiveSpeechSession(true);
      onStateChange("idle");
    } else {
      void startLiveSpeechSession();
    }
  }, [duplexMode, liveListening, onStateChange, pauseRealtimeListening, realtimeEnabled, realtimeStreaming, startLiveSpeechSession, startRealtimeListening, stopLiveSpeechSession]);

  // Listen for global voice events (from FloatingBall long-press / hotkey)
  useEffect(() => {
    const handleStart = () => {
      if (duplexMode) {
        if (realtimeEnabled) {
          void startRealtimeListening(true);
        } else {
          void startLiveSpeechSession();
        }
        return;
      }
      void handleRecordStart();
    };

    const handleStop = () => {
      if (duplexMode) {
        if (realtimeEnabled) {
          pauseRealtimeListening();
        } else {
          stopLiveSpeechSession(true);
        }
        return;
      }
      void handleRecordStop();
    };

    window.addEventListener("agentrix:voice-start", handleStart);
    window.addEventListener("agentrix:voice-stop", handleStop);
    return () => {
      window.removeEventListener("agentrix:voice-start", handleStart);
      window.removeEventListener("agentrix:voice-stop", handleStop);
    };
  }, [duplexMode, handleRecordStart, handleRecordStop, pauseRealtimeListening, realtimeEnabled, startLiveSpeechSession, startRealtimeListening, stopLiveSpeechSession]);

  useEffect(() => {
    return () => {
      stopLiveSpeechSession(true);
      disconnectRealtime(false);
    };
  }, [disconnectRealtime, stopLiveSpeechSession]);

  useEffect(() => {
    if (!realtimeVoiceRef.current) {
      return;
    }
    disconnectRealtime(true);
  }, [disconnectRealtime, realtimeEnabled, realtimeInstanceId, realtimeLang, realtimeModel, realtimeVoiceId]);

  useEffect(() => {
    if (duplexMode && !realtimeEnabled && !liveSpeechRef.current) {
      void startLiveSpeechSession();
    }
  }, [duplexMode, realtimeEnabled, startLiveSpeechSession]);

  const isActive = realtimeEnabled ? realtimeStreaming : voiceState === "recording" || liveListening;
  const isProcessing = voiceState === "processing";

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4 }}>
      {/* Duplex toggle */}
      {supportsDuplex && (
        <button
          onClick={toggleDuplex}
          style={{
            ...toggleBtn,
            background: duplexMode ? "rgba(34,197,94,0.2)" : "transparent",
            border: duplexMode ? "1px solid rgba(34,197,94,0.5)" : "1px solid var(--border)",
            color: duplexMode ? "#22c55e" : "var(--text-muted)",
          }}
          title={duplexMode ? "Duplex ON — click to disable" : "Enable duplex (hands-free) mode"}
        >
          {duplexMode ? "🔄" : "⇄"}
        </button>
      )}

      {/* Main voice button */}
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={duplexMode ? handleClick : undefined}
        onContextMenu={(e) => e.preventDefault()}
        disabled={!realtimeEnabled && isProcessing}
        style={{
          ...btnBase,
          background: isActive
            ? duplexMode
              ? "rgba(34, 197, 94, 0.3)"
              : "rgba(239, 68, 68, 0.3)"
            : isProcessing
              ? "rgba(254, 202, 87, 0.2)"
              : "var(--bg-input)",
          border: isActive
            ? duplexMode
              ? "1px solid rgba(34, 197, 94, 0.5)"
              : "1px solid rgba(239, 68, 68, 0.5)"
            : "1px solid var(--border)",
          animation: isActive ? "breathe 1.5s ease-in-out infinite" : "none",
        }}
        title={
          duplexMode
            ? isActive ? "Listening... click to pause" : "Click to start listening"
            : isActive ? "Release to send" : voiceState === "speaking" ? "Hold to interrupt and speak" : "Hold to talk"
        }
      >
        {isProcessing ? "⏳" : isActive ? (duplexMode ? "🔄" : "🔴") : voiceState === "speaking" ? "🔊" : "🎤"}
      </button>

      {/* Interim transcript preview */}
      {interimTranscript && (
        <div style={transcriptPreviewStyle}>
          {interimTranscript}
        </div>
      )}

      {/* Cancel button while recording (hold mode only) */}
      {isActive && !duplexMode && (
        <button
          onClick={handleCancel}
          onKeyDown={(e) => e.key === "Escape" && handleCancel()}
          style={cancelBtnStyle}
        >
          ✕ Cancel (Esc)
        </button>
      )}

      {error && (
        <div style={errorStyle}>
          {error}
        </div>
      )}
    </div>
  );
}

const btnBase: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background 0.2s",
  flexShrink: 0,
};

const toggleBtn: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  cursor: "pointer",
  fontSize: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.2s",
  flexShrink: 0,
};

const transcriptPreviewStyle: CSSProperties = {
  position: "absolute",
  bottom: 48,
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(0,0,0,0.8)",
  color: "#e5e7eb",
  borderRadius: 8,
  padding: "4px 10px",
  fontSize: 11,
  maxWidth: 280,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  pointerEvents: "none",
};

const cancelBtnStyle: CSSProperties = {
  position: "absolute",
  top: -28,
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(0,0,0,0.7)",
  color: "#f87171",
  border: "none",
  borderRadius: 12,
  padding: "2px 8px",
  fontSize: 10,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const errorStyle: CSSProperties = {
  position: "absolute",
  bottom: -20,
  left: "50%",
  transform: "translateX(-50%)",
  fontSize: 10,
  color: "#f87171",
  whiteSpace: "nowrap",
};
