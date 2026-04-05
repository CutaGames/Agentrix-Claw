import { CSSProperties, useState, useCallback, useRef, useEffect } from "react";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import agentrixLogo from "../assets/agentrix-logo.png";
import { type ClipboardCapture, type ClipboardAction, buildClipboardPrompt } from "../services/clipboard";
import VoiceResultCard from "./VoiceResultCard";
import { useAuthStore, streamChat, streamDirectChat, type ChatMessage } from "../services/store";
import { startRecording, stopRecording, speechToText, stopTTS } from "../services/voice";
import { AudioQueuePlayer, SentenceAccumulator, detectLang } from "../services/AudioQueuePlayer";
import { loadSessionMessages, persistSession } from "../services/chatSessionStore";
import type { StreamEvent } from "../../../shared/stream-parser.ts";

type BallState = "idle" | "recording" | "thinking" | "speaking";
type ConversationMessage = ChatMessage & { role: "user" | "assistant" };
type DirectChatMessage = { role: ChatMessage["role"]; content: string };

interface Props {
  onTap: () => void;
  /** Open Pro Mode (double-click or expand from voice result) */
  onOpenPro?: () => void;
  state?: BallState;
  /** Compact mode — no clipboard/context menus, used inside ChatPanel header */
  compact?: boolean;
  /** Live transcript text for capsule display */
  transcript?: string;
  /** Audio volume 0-1 for waveform bars */
  volume?: number;
  /** Result text snippet from agent reply (legacy, used in compact mode) */
  resultText?: string;
}

// ── Color palette per state ──────────────────────────────
const STATE_COLORS: Record<BallState, { from: string; to: string; glow: string }> = {
  idle:      { from: "#6C5CE7", to: "#a78bfa", glow: "rgba(108,92,231,0.45)" },
  recording: { from: "#10B981", to: "#34d399", glow: "rgba(16,185,129,0.5)" },
  thinking:  { from: "#F59E0B", to: "#fbbf24", glow: "rgba(245,158,11,0.5)" },
  speaking:  { from: "#3b82f6", to: "#60a5fa", glow: "rgba(59,130,246,0.5)" },
};

const BALL_SIZE = 64;
const CAPSULE_WIDTH = 230;
const VOICE_SESSION_KEY_PREFIX = "agentrix_voice_session";
const VOICE_HISTORY_PREVIEW_LIMIT = 6;
const VOICE_REQUEST_HISTORY_LIMIT = 12;
const VOICE_AUTO_CONTINUE_LIMIT = 3;
const VOICE_CONTINUE_PROMPT = "Continue from exactly where you stopped. Do not repeat completed content. Preserve the same language, structure, and formatting.";

function buildVoiceSessionStorageKey(instanceId: string | null, agentId: string | null) {
  return `${VOICE_SESSION_KEY_PREFIX}:${instanceId || "direct"}:${agentId || "default"}`;
}

function getOrCreateVoiceSessionId(storageKey: string) {
  const existing = localStorage.getItem(storageKey);
  if (existing && existing.trim()) {
    return existing;
  }
  const created = `voice-session-${Date.now()}`;
  localStorage.setItem(storageKey, created);
  return created;
}

function toConversationMessages(messages: ChatMessage[]) {
  return messages.filter((message): message is ConversationMessage => (
    message.role === "user" || message.role === "assistant"
  ));
}

function getSessionTitle(messages: ChatMessage[]) {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) {
    return "Voice Session";
  }
  return firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? "..." : "");
}

function isMicrophonePermissionError(error: unknown) {
  const errorName = typeof error === "object" && error && "name" in error ? String((error as { name?: unknown }).name || "") : "";
  const errorMessage = typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message || "") : "";
  const normalized = `${errorName} ${errorMessage}`.toLowerCase();

  return normalized.includes("permission")
    || normalized.includes("denied")
    || normalized.includes("notallowed")
    || normalized.includes("securityerror");
}

function getMicrophonePermissionGuidance() {
  const platform = navigator.platform.toLowerCase();

  if (platform.includes("win")) {
    return {
      settingsUrl: "ms-settings:privacy-microphone",
      fallbackUrl: "https://support.microsoft.com/windows/turn-on-app-permissions-for-your-microphone-in-windows-94991183-f69d-b4cf-4679-c98ca45f577a",
      message: "Microphone access is blocked. Open Windows Settings > Privacy & security > Microphone, allow Agentrix, then try again.",
    };
  }

  if (platform.includes("mac")) {
    return {
      settingsUrl: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
      fallbackUrl: "https://support.apple.com/guide/mac-help/control-access-to-your-microphone-on-mac-mchla1b1e1fe/mac",
      message: "Microphone access is blocked. Open System Settings > Privacy & Security > Microphone, allow Agentrix, then try again.",
    };
  }

  return {
    settingsUrl: "https://support.google.com/chrome/answer/2693767",
    fallbackUrl: "https://support.google.com/chrome/answer/2693767",
    message: "Microphone access is blocked. Allow microphone access for Agentrix in your system settings, then try again.",
  };
}

export default function FloatingBall({
  onTap,
  onOpenPro,
  state = "idle",
  compact = false,
  transcript,
  volume = 0,
  resultText,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pressing, setPressing] = useState(false);
  const [idleFaded, setIdleFaded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showGuide, setShowGuide] = useState(() => localStorage.getItem("agentrix_guided") !== "1");
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clipboardText, setClipboardText] = useState<string | null>(null);
  const [clipboardMenu, setClipboardMenu] = useState(false);
  const clipboardFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [resultVisible, setResultVisible] = useState(false);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Voice Mode (in-ball) state ──────────────────────────
  const [voiceBallState, setVoiceBallState] = useState<BallState>("idle");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceResult, setVoiceResult] = useState("");
  const [voiceResultStreaming, setVoiceResultStreaming] = useState(false);
  const [voiceResultVisible, setVoiceResultVisible] = useState(false);
  const [voicePermissionError, setVoicePermissionError] = useState(false);
  const [voiceTtsIssue, setVoiceTtsIssue] = useState<string | null>(null);
  const [voiceHistoryPreview, setVoiceHistoryPreview] = useState<ConversationMessage[]>([]);
  const [isTTSSpeaking, setIsTTSSpeaking] = useState(false);
  const audioPlayerRef = useRef<AudioQueuePlayer | null>(null);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const voiceHistoryRef = useRef<ConversationMessage[]>([]);
  const voiceSessionIdRef = useRef<string | null>(null);
  const voiceAgentIdRef = useRef<string | null>(null);
  const continuationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickCount = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLongPress = useRef(false);

  // P0: Approval quick channel — badge on FloatingBall
  const [approvalBadge, setApprovalBadge] = useState<{
    toolName: string; riskLevel: number; reason: string;
  } | null>(null);
  const approvalBadgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (compact) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setApprovalBadge({ toolName: detail.toolName, riskLevel: detail.riskLevel, reason: detail.reason });
        if (approvalBadgeTimer.current) clearTimeout(approvalBadgeTimer.current);
        approvalBadgeTimer.current = setTimeout(() => setApprovalBadge(null), 15000);
      }
    };
    window.addEventListener("agentrix:approval-needed", handler);
    return () => {
      window.removeEventListener("agentrix:approval-needed", handler);
      if (approvalBadgeTimer.current) clearTimeout(approvalBadgeTimer.current);
    };
  }, [compact]);

  // Effective state: use voiceBallState when in standalone voice mode, else prop
  const effectiveState = !compact && voiceBallState !== "idle" ? voiceBallState : state;

  // Whether to morph into capsule shape
  const isCapsule = effectiveState === "recording" || effectiveState === "speaking";
  const effectiveTranscript = voiceBallState !== "idle" ? voiceTranscript : transcript;

  const handoffVoiceSessionToPanel = useCallback((dispatchImmediately = true) => {
    const sessionId = voiceSessionIdRef.current;
    const messages = toConversationMessages(voiceHistoryRef.current);
    if (!sessionId || messages.length === 0) {
      return;
    }

    const payload = {
      sessionId,
      sourceDeviceId: "floating-ball",
      agentId: voiceAgentIdRef.current || undefined,
      contextSnapshot: {
        title: getSessionTitle(messages),
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
        })),
      },
    };

    localStorage.setItem("agentrix_pending_handoff", JSON.stringify(payload));
    if (dispatchImmediately) {
      window.dispatchEvent(new CustomEvent("agentrix:handoff-incoming", { detail: payload }));
    }
  }, []);

  const openMicrophoneSettings = useCallback(async () => {
    const guidance = getMicrophonePermissionGuidance();

    try {
      await shellOpen(guidance.settingsUrl);
      return;
    } catch {}

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_bridge_open_browser", { url: guidance.fallbackUrl });
      return;
    } catch {}

    window.open(guidance.fallbackUrl, "_blank", "noopener,noreferrer");
  }, []);

  const showVoiceError = useCallback(async (
    message: string,
    options?: { permission?: boolean; preserveTranscript?: boolean },
  ) => {
    if (continuationTimer.current) clearTimeout(continuationTimer.current);
    voiceAbortRef.current?.abort();
    audioPlayerRef.current?.stopAll();
    stopTTS();
    setVoiceBallState("idle");
    if (!options?.preserveTranscript) {
      setVoiceTranscript("");
    }
    setVoicePermissionError(Boolean(options?.permission));
    setVoiceTtsIssue(null);
    setVoiceResult(message);
    setVoiceResultVisible(true);
    setVoiceResultStreaming(false);
    setIsTTSSpeaking(false);

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_bridge_resize_ball_window", { width: 460, height: 260 });
    } catch {}
  }, []);

  // ── Standalone voice flow (in-ball, no ChatPanel) ───────
  const handleVoiceInBall = useCallback(async () => {
    if (compact) return;
    const { token, instances, activeInstanceId, agents, activeAgentId } = useAuthStore.getState();
    if (!token) { onTap(); return; }

    const activeAgent = agents.find((agent) => agent.id === activeAgentId) || null;
    const voiceSessionKey = buildVoiceSessionStorageKey(activeInstanceId || null, activeAgentId || null);
    const voiceSessionId = getOrCreateVoiceSessionId(voiceSessionKey);
    let existingHistory = toConversationMessages(await loadSessionMessages(voiceSessionId));

    voiceSessionIdRef.current = voiceSessionId;
    voiceAgentIdRef.current = activeAgentId || null;
    voiceHistoryRef.current = existingHistory;
    setVoiceHistoryPreview(existingHistory.slice(-VOICE_HISTORY_PREVIEW_LIMIT));

    const syncVoiceHistory = (messages: ConversationMessage[], persist = false) => {
      existingHistory = messages;
      voiceHistoryRef.current = messages;
      setVoiceHistoryPreview(messages.slice(-VOICE_HISTORY_PREVIEW_LIMIT));
      if (persist) {
        void persistSession(voiceSessionId, messages);
      }
    };

    // Start recording
    if (continuationTimer.current) clearTimeout(continuationTimer.current);
    setVoiceBallState("recording");
    setVoiceTranscript("");
    setVoiceResult("");
    setVoiceResultVisible(false);
    setVoicePermissionError(false);
    setVoiceTtsIssue(null);

    // Resize window for capsule
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_bridge_resize_ball_window", { width: 460, height: 80 });
    } catch {}

    try {
      await startRecording();
    } catch (err) {
      if (isMicrophonePermissionError(err)) {
        await showVoiceError(
          `${getMicrophonePermissionGuidance().message}\n\nUse Open Settings, then Retry.`,
          { permission: true },
        );
      } else {
        await showVoiceError("Unable to start microphone recording. Check your input device, then try again.");
      }
      return;
    }

    // Wait for voice-stop event
    const stopPromise = new Promise<void>((resolve) => {
      const handler = () => { window.removeEventListener("agentrix:voice-stop", handler); resolve(); };
      window.addEventListener("agentrix:voice-stop", handler);
    });
    await stopPromise;

    // Process recording
    setVoiceBallState("thinking");
    try {
      const blob = await stopRecording();
      const transcript = await speechToText(blob, token);
      if (!transcript.trim()) {
        await showVoiceError("No speech detected. Try again and speak a little closer to the microphone.");
        return;
      }
      setVoiceTranscript(transcript);

      const userMsg: ConversationMessage = {
        id: `vu-${Date.now()}`,
        role: "user",
        content: transcript.trim(),
        createdAt: Date.now(),
      };
      const assistantId = `va-${Date.now()}`;
      const assistantMsg: ConversationMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        createdAt: Date.now(),
      };
      const requestHistory: DirectChatMessage[] = existingHistory.slice(-VOICE_REQUEST_HISTORY_LIMIT).map((message) => ({
        role: message.role,
        content: message.content,
      }));

      syncVoiceHistory([...existingHistory, userMsg, assistantMsg], true);

      // Resize for result card
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("desktop_bridge_resize_ball_window", { width: 460, height: 360 });
      } catch {}

      // Auto-inject context: active window + clipboard
      let contextPrefix = "";
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const ctx = await invoke("desktop_bridge_get_context") as any;
        if (ctx?.activeWindow?.title) {
          contextPrefix += `[Active window: ${ctx.activeWindow.title}] `;
        }
        if (ctx?.clipboardTextPreview) {
          contextPrefix += `[Clipboard: ${ctx.clipboardTextPreview.slice(0, 200)}] `;
        }
      } catch {}

      const fullMessage = contextPrefix ? `${contextPrefix}\n${transcript}` : transcript;

      // Stream response directly (not via ChatPanel)
      setVoicePermissionError(false);
      setVoiceResultStreaming(true);
      setVoiceResultVisible(true);
      let resultAccum = "";
      let autoContinueCount = 0;

      // Setup TTS queue
      const player = new AudioQueuePlayer(
        token,
        () => { setIsTTSSpeaking(false); setVoiceBallState("idle"); },
        (playing) => {
          setIsTTSSpeaking(playing);
          if (playing) {
            setVoiceBallState("speaking");
          }
        },
        (message) => setVoiceTtsIssue(message),
      );
      audioPlayerRef.current = player;
      const sentenceAcc = new SentenceAccumulator((sentence) => {
        const trimmed = sentence.trim();
        if (trimmed.length > 2) {
          player.enqueue(trimmed, detectLang(trimmed));
          setIsTTSSpeaking(true);
        }
      });

      const instance = instances.find(i => i.id === activeInstanceId);
      const startResponseStream = (messageToSend: string) => {
        let continueReason: "max_tokens" | "timeout" | null = null;

        const onChunk = (chunk: string) => {
          resultAccum += chunk;
          setVoiceResult(resultAccum);
          setVoiceBallState("speaking");
          voiceHistoryRef.current = voiceHistoryRef.current.map((message) => (
            message.id === assistantId
              ? { ...message, content: resultAccum, streaming: true }
              : message
          ));
          sentenceAcc.push(chunk);
        };

        const scheduleAutoContinue = () => {
          if (autoContinueCount >= VOICE_AUTO_CONTINUE_LIMIT) {
            return false;
          }
          autoContinueCount += 1;
          setVoiceBallState("thinking");
          setVoiceResultStreaming(true);
          startResponseStream(VOICE_CONTINUE_PROMPT);
          return true;
        };

        const finalizeHistory = (content: string, options?: { error?: boolean; streaming?: boolean }) => {
          syncVoiceHistory(
            voiceHistoryRef.current.map((message) => (
              message.id === assistantId
                ? {
                    ...message,
                    content,
                    error: Boolean(options?.error),
                    streaming: Boolean(options?.streaming),
                  }
                : message
            )),
            true,
          );
        };

        const onEvent = (event: StreamEvent) => {
          if (event.type === "tool_error" && /timeout|timed out|ETIMEDOUT/i.test(event.error)) {
            continueReason = "timeout";
          } else if (event.type === "done" && event.reason === "max_tokens") {
            continueReason = "max_tokens";
          } else if (event.type === "error" && /timeout|timed out|ETIMEDOUT/i.test(event.error)) {
            continueReason = "timeout";
          }
        };

        const onDone = () => {
          setVoiceResultStreaming(false);
          if (continueReason && scheduleAutoContinue()) {
            finalizeHistory(resultAccum, { streaming: true });
            return;
          }

          finalizeHistory(resultAccum, { streaming: false });
          sentenceAcc.flush();
          handoffVoiceSessionToPanel(false);
          continuationTimer.current = setTimeout(() => {
            dismissVoiceResult();
          }, 8000);
        };

        const onError = (err: string) => {
          const timedOut = /timeout|timed out|ETIMEDOUT/i.test(err);
          if (timedOut && scheduleAutoContinue()) {
            finalizeHistory(resultAccum, { streaming: true });
            return;
          }

          setVoiceResultStreaming(false);
          const nextContent = resultAccum || `Error: ${err}`;
          setVoiceResult(nextContent);
          finalizeHistory(nextContent, { error: true, streaming: false });
          handoffVoiceSessionToPanel(false);
        };

        if (instance) {
          voiceAbortRef.current = streamChat({
            instanceId: instance.id,
            message: messageToSend,
            sessionId: voiceSessionId,
            token,
            mode: "agent",
            onChunk,
            onEvent,
            onDone,
            onError,
          });
          return;
        }

        const directMessages: DirectChatMessage[] = [...requestHistory];
        if (activeAgent) {
          directMessages.unshift({
            role: "system",
            content: `You are responding as the desktop agent \"${activeAgent.name}\". Keep replies aligned with this agent identity while preserving the user's intent.`,
          });
        }
        directMessages.push({ role: "user", content: messageToSend });
        voiceAbortRef.current = streamDirectChat({
          messages: directMessages,
          sessionId: voiceSessionId,
          agentId: activeAgentId,
          token,
          mode: "agent",
          onChunk,
          onDone: () => {
            setVoiceResultStreaming(false);
            finalizeHistory(resultAccum, { streaming: false });
            sentenceAcc.flush();
            handoffVoiceSessionToPanel(false);
            continuationTimer.current = setTimeout(() => {
              dismissVoiceResult();
            }, 8000);
          },
          onError,
        });
      };

      startResponseStream(fullMessage);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : "Voice reply failed. Please try again.";
      await showVoiceError(message, { preserveTranscript: true });
    }
  }, [compact, handoffVoiceSessionToPanel, onTap, showVoiceError]);

  const dismissVoiceResult = useCallback(async () => {
    if (continuationTimer.current) clearTimeout(continuationTimer.current);
    voiceAbortRef.current?.abort();
    audioPlayerRef.current?.stopAll();
    stopTTS();
    setVoiceBallState("idle");
    setVoiceResult("");
    setVoiceResultVisible(false);
    setVoiceResultStreaming(false);
    setVoicePermissionError(false);
    setVoiceTtsIssue(null);
    setIsTTSSpeaking(false);
    // Resize back to ball
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_bridge_resize_ball_window", { width: 80, height: 80 });
    } catch {}
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (clipboardFadeTimer.current) clearTimeout(clipboardFadeTimer.current);
      if (resultTimer.current) clearTimeout(resultTimer.current);
      if (continuationTimer.current) clearTimeout(continuationTimer.current);
      if (clickTimer.current) clearTimeout(clickTimer.current);
      if (approvalBadgeTimer.current) clearTimeout(approvalBadgeTimer.current);
      voiceAbortRef.current?.abort();
      audioPlayerRef.current?.stopAll();
      stopTTS();
    };
  }, []);

  // Show result card briefly when resultText changes
  useEffect(() => {
    if (resultText) {
      setResultVisible(true);
      if (resultTimer.current) clearTimeout(resultTimer.current);
      resultTimer.current = setTimeout(() => setResultVisible(false), 4000);
    } else {
      setResultVisible(false);
    }
    return () => { if (resultTimer.current) clearTimeout(resultTimer.current); };
  }, [resultText]);

  // Listen for clipboard captures
  useEffect(() => {
    if (compact) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ClipboardCapture>).detail;
      if (detail?.text) {
        setClipboardText(detail.text);
        setClipboardMenu(false);
        if (clipboardFadeTimer.current) clearTimeout(clipboardFadeTimer.current);
        clipboardFadeTimer.current = setTimeout(() => setClipboardText(null), 8000);
      }
    };
    window.addEventListener("agentrix:clipboard-capture", handler);
    return () => {
      window.removeEventListener("agentrix:clipboard-capture", handler);
      if (clipboardFadeTimer.current) clearTimeout(clipboardFadeTimer.current);
    };
  }, [compact]);

  const handleClipboardAction = useCallback((action: ClipboardAction) => {
    if (!clipboardText) return;
    const prompt = buildClipboardPrompt(action, clipboardText);
    onTap();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("agentrix:clipboard-send", { detail: { prompt } }));
    }, 150);
    setClipboardText(null);
    setClipboardMenu(false);
  }, [clipboardText, onTap]);

  // Idle auto-transparency
  useEffect(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (effectiveState === "idle" && !hovered) {
      idleTimer.current = setTimeout(() => setIdleFaded(true), 30000);
    } else {
      setIdleFaded(false);
    }
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current); };
  }, [effectiveState, hovered]);

  const isDragging = useRef(false);
  const pointerStartPos = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setPressing(true);
    isLongPress.current = false;
    isDragging.current = false;
    pointerStartPos.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = setTimeout(() => {
      if (!isDragging.current) {
        isLongPress.current = true;
        window.dispatchEvent(new CustomEvent("agentrix:voice-start"));
      }
    }, 400);
  }, []);

  const handlePointerMove = useCallback(async (e: React.PointerEvent) => {
    if (!pressing || isDragging.current) return;
    if (!pointerStartPos.current) return;
    const dx = e.clientX - pointerStartPos.current.x;
    const dy = e.clientY - pointerStartPos.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      // User is dragging — cancel click/longPress and start window drag
      isDragging.current = true;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().startDragging();
      } catch {}
    }
  }, [pressing]);

  const handlePointerUp = useCallback(() => {
    setPressing(false);
    pointerStartPos.current = null;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isDragging.current) {
      isDragging.current = false;
      return; // Was a drag, don't fire voice-stop
    }
    if (isLongPress.current) {
      window.dispatchEvent(new CustomEvent("agentrix:voice-stop"));
    }
  }, []);

  const handleClick = useCallback(() => {
    if (isDragging.current) return; // Was a drag, ignore click
    if (!isLongPress.current) {
      if (showGuide) {
        setShowGuide(false);
        localStorage.setItem("agentrix_guided", "1");
      }

      // If currently recording, single click stops recording
      if (voiceBallState === "recording") {
        window.dispatchEvent(new CustomEvent("agentrix:voice-stop"));
        return;
      }

      // Double-click detection for Pro Mode
      clickCount.current += 1;
      if (clickCount.current === 1) {
        clickTimer.current = setTimeout(() => {
          // Single click → voice mode or toggle panel
          if (clickCount.current === 1) {
            if (!compact && voiceBallState === "idle" && effectiveState === "idle") {
              // In standalone mode, single click starts voice
              handleVoiceInBall();
            } else {
              onTap();
            }
          }
          clickCount.current = 0;
        }, 250);
      } else if (clickCount.current >= 2) {
        // Double-click → open Pro Mode
        if (clickTimer.current) clearTimeout(clickTimer.current);
        clickCount.current = 0;
        if (onOpenPro) {
          onOpenPro();
        } else {
          onTap();
        }
      }
    }
  }, [onTap, onOpenPro, showGuide, compact, voiceBallState, effectiveState, handleVoiceInBall]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!compact) setContextMenu({ x: e.clientX, y: e.clientY });
  }, [compact]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  const colors = STATE_COLORS[effectiveState];

  // Hover-through: when idle+hovered, become transparent & click-through
  const isPassThrough = effectiveState === "idle" && hovered && idleFaded;
  const baseOpacity = isPassThrough ? 0.15 : hovered ? 1 : idleFaded ? 0.4 : 0.9;

  return (
    <>
    {/* ── Main Orbis Container ─────────────────────────── */}
    <div
      style={{
        position: "relative",
        width: isCapsule ? CAPSULE_WIDTH : BALL_SIZE,
        height: BALL_SIZE,
        borderRadius: isCapsule ? BALL_SIZE / 2 : "50%",
        background: `linear-gradient(135deg, ${colors.from} 0%, ${colors.to} 100%)`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex",
        alignItems: "center",
        justifyContent: isCapsule ? "flex-start" : "center",
        gap: isCapsule ? 8 : 0,
        paddingLeft: isCapsule ? 6 : 0,
        cursor: isPassThrough ? "default" : "pointer",
        pointerEvents: isPassThrough ? "none" : "auto",
        opacity: baseOpacity,
        transition: "width 0.35s cubic-bezier(.4,0,.2,1), border-radius 0.35s cubic-bezier(.4,0,.2,1), opacity 0.25s, transform 0.15s, background 0.4s, box-shadow 0.4s",
        transform: pressing ? "scale(0.92)" : "scale(1)",
        boxShadow: `0 4px 24px ${colors.glow}, inset 0 0 0 1px rgba(255,255,255,0.12)`,
        userSelect: "none",
        WebkitAppRegion: "no-drag",
        animation: effectiveState === "idle" ? "orbisBreathe 3.6s ease-in-out infinite" : effectiveState === "recording" || effectiveState === "speaking" ? "orbisPulse 1.8s ease-in-out infinite" : "none",
        overflow: "hidden",
      } as CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title="Agentrix — Click for voice, double-click for Pro Mode, hold for PTT"
    >
      {/* Logo */}
      <img
        src={agentrixLogo}
        alt="Agentrix"
        width={compact ? 32 : 36}
        height={compact ? 32 : 36}
        style={{ borderRadius: "50%", pointerEvents: "none", flexShrink: 0 }}
      />

      {/* ── Capsule waveform bars ───────────────────── */}
      {isCapsule && (
        <div style={{ display: "flex", alignItems: "center", gap: 2, height: 28, flexShrink: 0 }}>
          {Array.from({ length: 7 }).map((_, i) => {
            const h = Math.max(4, Math.min(26, (volume * 26) * (0.4 + 0.6 * Math.sin((i + Date.now() / 200) * 0.8))));
            return (
              <div
                key={i}
                style={{
                  width: 3,
                  height: h,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.85)",
                  transition: "height 0.08s ease-out",
                }}
              />
            );
          })}
        </div>
      )}

      {/* ── Capsule transcript text ─────────────────── */}
      {isCapsule && effectiveTranscript && (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            color: "rgba(255,255,255,0.9)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            paddingRight: 10,
          }}
        >
          {effectiveTranscript}
        </div>
      )}

      {/* ── Orbiting particles (thinking) ──────────── */}
      {effectiveState === "thinking" && !compact && (
        <svg
          style={{ position: "absolute", inset: -8, width: BALL_SIZE + 16, height: BALL_SIZE + 16, pointerEvents: "none", animation: "orbisOrbit 2.4s linear infinite" }}
          viewBox={`0 0 ${BALL_SIZE + 16} ${BALL_SIZE + 16}`}
        >
          {[0, 90, 180, 270].map((deg, i) => {
            const cx = (BALL_SIZE + 16) / 2;
            const r = BALL_SIZE / 2 + 4;
            const rad = (deg * Math.PI) / 180;
            return (
              <circle
                key={i}
                cx={cx + r * Math.cos(rad)}
                cy={cx + r * Math.sin(rad)}
                r={2.5}
                fill={i % 2 === 0 ? "#F59E0B" : "#fbbf24"}
                opacity={0.85}
              />
            );
          })}
        </svg>
      )}
    </div>

    {/* ── Voice Mode Result Card (standalone) ─────────── */}
    {!compact && voiceResultVisible && voiceResult && (
      <div style={{ position: "absolute", bottom: BALL_SIZE + 10, left: "50%", transform: "translateX(-50%)", zIndex: 10 }}>
        <VoiceResultCard
          text={voiceResult}
          notice={voiceTtsIssue || undefined}
          transcript={voiceTranscript}
          history={voicePermissionError ? undefined : voiceHistoryPreview.map((message) => ({ role: message.role as "user" | "assistant", content: message.content }))}
          isSpeaking={isTTSSpeaking}
          streaming={voiceResultStreaming}
          autoHideMs={voicePermissionError || voiceResultStreaming ? 0 : 8000}
          actions={voicePermissionError ? [
            {
              label: "Open microphone settings",
              icon: "Open",
              onClick: () => { void openMicrophoneSettings(); },
            },
            {
              label: "Retry microphone",
              icon: "Retry",
              onClick: () => { void handleVoiceInBall(); },
            },
          ] : undefined}
          onDismiss={dismissVoiceResult}
          onExpandToPro={voicePermissionError ? undefined : () => {
            handoffVoiceSessionToPanel();
            dismissVoiceResult();
            if (onOpenPro) onOpenPro();
            else onTap();
          }}
        />
      </div>
    )}

    {/* ── Legacy result card (compact / ChatPanel driven) ── */}
    {resultVisible && resultText && !compact && !voiceResultVisible && (
      <div
        onClick={() => { setResultVisible(false); onTap(); }}
        style={{
          position: "absolute",
          bottom: BALL_SIZE + 10,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(22,33,62,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: "10px 14px",
          maxWidth: 260,
          fontSize: 12,
          color: "var(--text, #eee)",
          lineHeight: 1.5,
          cursor: "pointer",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          animation: "fadeInUp 0.25s ease-out",
          zIndex: 10,
        }}
      >
        {resultText.length > 120 ? resultText.slice(0, 120) + "…" : resultText}
        <div style={{ fontSize: 10, color: "var(--text-dim, #888)", marginTop: 4 }}>Click to expand</div>
      </div>
    )}

    {/* Clipboard quick-action menu */}
    {!compact && clipboardMenu && clipboardText && (
      <div
        style={{
          position: "absolute",
          bottom: 64,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(22,33,62,0.95)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          zIndex: 10001,
          padding: "6px 0",
          minWidth: 150,
          fontSize: 13,
        }}
      >
        <div style={{ padding: "6px 14px", fontSize: 11, color: "var(--text-dim, #888)", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 2 }}>
          {clipboardText.slice(0, 40)}{clipboardText.length > 40 ? "..." : ""}
        </div>
        {([
          { action: "translate" as ClipboardAction, label: "🌐 Translate" },
          { action: "summarize" as ClipboardAction, label: "📝 Summarize" },
          { action: "explain" as ClipboardAction, label: "💡 Explain" },
          { action: "rewrite" as ClipboardAction, label: "✏️ Rewrite" },
          { action: "ask" as ClipboardAction, label: "💬 Ask about this" },
        ]).map((item) => (
          <div
            key={item.action}
            onClick={(e) => { e.stopPropagation(); handleClipboardAction(item.action); }}
            style={{
              padding: "8px 14px",
              cursor: "pointer",
              color: "var(--text, #eee)",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {item.label}
          </div>
        ))}
      </div>
    )}

    {/* Clipboard badge */}
    {!compact && clipboardText && effectiveState === "idle" && (
      <div
        onClick={(e) => { e.stopPropagation(); setClipboardMenu(!clipboardMenu); }}
        style={{
          position: "absolute",
          bottom: -4,
          right: -4,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#00D2D3",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          border: "2px solid rgba(22,33,62,0.9)",
          animation: "guideFloat 1.5s ease-in-out infinite",
          zIndex: 10,
        }}
        title="Clipboard actions"
      >
        📋
      </div>
    )}

    {/* Approval notification badge */}
    {!compact && approvalBadge && (
      <div
        onClick={(e) => {
          e.stopPropagation();
          setApprovalBadge(null);
          if (onOpenPro) onOpenPro(); else onTap();
        }}
        style={{
          position: "absolute",
          top: -8,
          right: -8,
          minWidth: 22,
          height: 22,
          borderRadius: 11,
          background: approvalBadge.riskLevel >= 2 ? "#ef4444" : "#fbbf24",
          color: approvalBadge.riskLevel >= 2 ? "#fff" : "#000",
          fontSize: 10,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          border: "2px solid rgba(22,33,62,0.9)",
          padding: "0 4px",
          animation: "orbisPulse 1.5s ease-in-out infinite",
          zIndex: 11,
        }}
        title={`Approval needed: ${approvalBadge.reason}`}
      >
        🔐
      </div>
    )}

    {/* Right-click context menu */}
    {!compact && contextMenu && (
      <div
        style={{
          position: "fixed",
          top: contextMenu.y,
          left: contextMenu.x,
          background: "rgba(22,33,62,0.95)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          zIndex: 10000,
          minWidth: 160,
          padding: "4px 0",
          fontSize: 13,
        }}
        onClick={closeContextMenu}
      >
        {[
          { label: "💬 Open Pro Mode", action: () => { if (onOpenPro) onOpenPro(); else onTap(); } },
          { label: "🆕 New Chat", action: () => window.dispatchEvent(new CustomEvent("agentrix:new-chat")) },
          { label: "🎤 Voice Input", action: () => { onTap(); setTimeout(() => window.dispatchEvent(new CustomEvent("agentrix:voice-start")), 200); } },
          { label: "⚙️ Settings", action: () => { onTap(); setTimeout(() => window.dispatchEvent(new CustomEvent("agentrix:open-settings")), 200); } },
        ].map((item) => (
          <div
            key={item.label}
            onClick={item.action}
            style={{
              padding: "8px 16px",
              cursor: "pointer",
              color: "var(--text, #eee)",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {item.label}
          </div>
        ))}
      </div>
    )}

    {/* First-use guide bubble */}
    {!compact && showGuide && effectiveState === "idle" && (
      <div
        onClick={() => { setShowGuide(false); localStorage.setItem("agentrix_guided", "1"); onTap(); }}
        style={{
          position: "absolute",
          top: -48,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--accent, #6C5CE7)",
          color: "white",
          padding: "8px 14px",
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 500,
          whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(108, 92, 231, 0.5)",
          cursor: "pointer",
          animation: "guideFloat 2s ease-in-out infinite",
          zIndex: 100,
          pointerEvents: "auto",
        }}
      >
        点击说话，双击打开工作台 👋
        <div
          style={{
            position: "absolute",
            bottom: -6,
            left: "50%",
            transform: "translateX(-50%) rotate(45deg)",
            width: 12,
            height: 12,
            background: "var(--accent, #6C5CE7)",
          }}
        />
      </div>
    )}
    </>
  );
}
