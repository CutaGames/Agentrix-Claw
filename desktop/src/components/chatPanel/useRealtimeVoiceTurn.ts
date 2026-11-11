import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ChatMessage } from "../../services/store";
import type { VoiceState } from "../../services/voice";
import type { FabricDevice } from "../../services/realtimeVoice";

interface StreamFeedback {
  tone: "info" | "warning" | "error" | "success";
  label: string;
  detail?: string;
}

interface ActiveRealtimeVoiceTurnRef {
  current: { sessionId: string; assistantMessageId: string } | null;
}

interface UseRealtimeVoiceTurnParams {
  activeRealtimeVoiceTurnRef: ActiveRealtimeVoiceTurnRef;
  sessionIdRef: MutableRefObject<string>;
  voiceState: VoiceState;
  appendChunk: (sessionId: string, assistantMessageId: string, chunk: string) => void;
  finalizeMessage: (sessionId: string, assistantMessageId: string) => void;
  addSystemMessage: (content: string) => void;
  updateSessionMessages: (
    sessionId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
    options?: { persist?: boolean; markUnread?: boolean },
  ) => ChatMessage[];
  patchSessionRuntime: (sessionId: string, patch: { sending?: boolean }) => void;
  notifyIfBackground: (title: string, body: string) => Promise<void> | void;
  setSendStartedAt: (value: number | null) => void;
  setActiveToolRun: (value: null) => void;
  setContinuePrompt: (value: string | null) => void;
  setStreamFeedback: Dispatch<SetStateAction<StreamFeedback | null>>;
  setBallState: (state: "idle" | "recording" | "thinking" | "speaking") => void;
  setDeepThinkActive: (value: boolean) => void;
  setDeepThinkTargetModel: (value: string | null) => void;
  setFabricDevices: (devices: FabricDevice[]) => void;
}

export function useRealtimeVoiceTurn({
  activeRealtimeVoiceTurnRef,
  sessionIdRef,
  voiceState,
  appendChunk,
  finalizeMessage,
  addSystemMessage,
  updateSessionMessages,
  patchSessionRuntime,
  notifyIfBackground,
  setSendStartedAt,
  setActiveToolRun,
  setContinuePrompt,
  setStreamFeedback,
  setBallState,
  setDeepThinkActive,
  setDeepThinkTargetModel,
  setFabricDevices,
}: UseRealtimeVoiceTurnParams) {
  const settleRealtimeVoiceTurn = useCallback((options?: { interrupted?: boolean; errorMessage?: string }) => {
    const activeTurn = activeRealtimeVoiceTurnRef.current;
    if (!activeTurn) {
      if (options?.errorMessage) {
        addSystemMessage(`❌ ${options.errorMessage}`);
      }
      setSendStartedAt(null);
      return;
    }

    activeRealtimeVoiceTurnRef.current = null;

    if (options?.errorMessage) {
      const updated = updateSessionMessages(
        activeTurn.sessionId,
        (prev) => prev.map((message) => (
          message.id === activeTurn.assistantMessageId
            ? {
                ...message,
                content: options.errorMessage!,
                error: true,
                streaming: false,
              }
            : message
        )),
        { persist: true, markUnread: true },
      );
      const failedMessage = updated.find((message) => message.id === activeTurn.assistantMessageId);
      if (failedMessage?.content) {
        void notifyIfBackground("Agentrix", failedMessage.content.slice(0, 100));
      }
      setStreamFeedback({
        tone: "error",
        label: "语音会话失败",
        detail: options.errorMessage,
      });
    } else if (options?.interrupted) {
      const updated = updateSessionMessages(
        activeTurn.sessionId,
        (prev) => prev.map((message) => (
          message.id === activeTurn.assistantMessageId
            ? {
                ...message,
                content: message.content.trim() ? message.content : "语音回复已中断。",
                streaming: false,
              }
            : message
        )),
        { persist: true, markUnread: true },
      );
      const interruptedMessage = updated.find((message) => message.id === activeTurn.assistantMessageId);
      if (interruptedMessage?.content) {
        void notifyIfBackground("Agentrix", interruptedMessage.content.slice(0, 100));
      }
      setStreamFeedback({
        tone: "warning",
        label: "语音回复已中断",
        detail: "已结束当前语音输出",
      });
    } else {
      finalizeMessage(activeTurn.sessionId, activeTurn.assistantMessageId);
      setStreamFeedback(null);
    }

    patchSessionRuntime(activeTurn.sessionId, { sending: false });
    setSendStartedAt(null);

    if (activeTurn.sessionId === sessionIdRef.current && voiceState === "idle") {
      setBallState("idle");
    }
  }, [
    activeRealtimeVoiceTurnRef,
    addSystemMessage,
    finalizeMessage,
    notifyIfBackground,
    patchSessionRuntime,
    sessionIdRef,
    setBallState,
    setSendStartedAt,
    setStreamFeedback,
    updateSessionMessages,
    voiceState,
  ]);

  const beginRealtimeVoiceTurn = useCallback((text: string) => {
    const normalized = text.trim();
    if (!normalized) {
      return;
    }

    if (activeRealtimeVoiceTurnRef.current) {
      settleRealtimeVoiceTurn({ interrupted: true });
    }

    const targetSessionId = sessionIdRef.current;
    const createdAt = Date.now();
    const userMessage: ChatMessage = {
      id: `u-${createdAt}`,
      role: "user",
      content: normalized,
      createdAt,
    };
    const assistantMessageId = `a-${createdAt + 1}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      streaming: true,
      createdAt: createdAt + 1,
    };

    activeRealtimeVoiceTurnRef.current = {
      sessionId: targetSessionId,
      assistantMessageId,
    };

    updateSessionMessages(targetSessionId, (prev) => [...prev, userMessage, assistantMessage], { persist: true });
    setSendStartedAt(createdAt);
    setActiveToolRun(null);
    setContinuePrompt(null);
    setStreamFeedback({
      tone: "info",
      label: "桌面实时语音已接管",
      detail: "等待语音回复分片",
    });
    patchSessionRuntime(targetSessionId, { sending: true });

    if (targetSessionId === sessionIdRef.current) {
      setBallState("thinking");
    }
  }, [
    activeRealtimeVoiceTurnRef,
    patchSessionRuntime,
    sessionIdRef,
    setActiveToolRun,
    setBallState,
    setContinuePrompt,
    setSendStartedAt,
    setStreamFeedback,
    settleRealtimeVoiceTurn,
    updateSessionMessages,
  ]);

  const handleRealtimeVoiceTranscript = useCallback((text: string) => {
    beginRealtimeVoiceTurn(text);
  }, [beginRealtimeVoiceTurn]);

  const handleRealtimeVoiceAgentText = useCallback((chunk: string) => {
    const activeTurn = activeRealtimeVoiceTurnRef.current;
    if (!activeTurn || !chunk) {
      return;
    }

    appendChunk(activeTurn.sessionId, activeTurn.assistantMessageId, chunk);
    setStreamFeedback((current) => {
      if (current?.tone === "error") {
        return current;
      }
      return {
        tone: "info",
        label: "正在输出语音回复",
        detail: "桌面 realtime voice 正在流式返回",
      };
    });

    if (activeTurn.sessionId === sessionIdRef.current) {
      setBallState("speaking");
    }
  }, [activeRealtimeVoiceTurnRef, appendChunk, sessionIdRef, setBallState, setStreamFeedback]);

  const handleRealtimeVoiceAgentEnd = useCallback((interrupted?: boolean) => {
    settleRealtimeVoiceTurn(interrupted ? { interrupted: true } : undefined);
  }, [settleRealtimeVoiceTurn]);

  const handleRealtimeVoiceError = useCallback((message: string) => {
    settleRealtimeVoiceTurn({ errorMessage: message });
  }, [settleRealtimeVoiceTurn]);

  const handleRealtimeDeepThinkStart = useCallback((targetModel: string) => {
    setDeepThinkActive(true);
    setDeepThinkTargetModel(targetModel || null);
    setStreamFeedback({
      tone: "info",
      label: "深度分析已转入超脑",
      detail: targetModel ? `目标模型: ${targetModel}` : "等待异步返回",
    });
  }, [setDeepThinkActive, setDeepThinkTargetModel, setStreamFeedback]);

  const handleRealtimeDeepThinkDone = useCallback((summary: string, model?: string) => {
    setDeepThinkActive(false);
    setDeepThinkTargetModel(null);
    setStreamFeedback({
      tone: "success",
      label: "深度分析完成",
      detail: model ? `返回模型: ${model}` : "已收到总结",
    });

    const normalized = summary.trim();
    if (normalized) {
      addSystemMessage(`🧠 Deep think${model ? ` (${model})` : ""}: ${normalized}`);
    }
  }, [addSystemMessage, setDeepThinkActive, setDeepThinkTargetModel, setStreamFeedback]);

  const handleRealtimeFabricDevicesChanged = useCallback((devices: FabricDevice[]) => {
    setFabricDevices(devices);
    if (devices.length <= 1) {
      return;
    }

    const primaryDevice = devices.find((device) => device.isPrimary);
    setStreamFeedback({
      tone: "info",
      label: `语音 Session Fabric 已连接 ${devices.length} 台设备`,
      detail: primaryDevice ? `当前主设备: ${primaryDevice.deviceType}` : "可从其他设备接管",
    });
  }, [setFabricDevices, setStreamFeedback]);

  return {
    settleRealtimeVoiceTurn,
    beginRealtimeVoiceTurn,
    handleRealtimeVoiceTranscript,
    handleRealtimeVoiceAgentText,
    handleRealtimeVoiceAgentEnd,
    handleRealtimeVoiceError,
    handleRealtimeDeepThinkStart,
    handleRealtimeDeepThinkDone,
    handleRealtimeFabricDevicesChanged,
  };
}
