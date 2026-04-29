import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { CHAT_AUTO_CONTINUE_LIMIT } from "./contextBudget";
import { buildContinuePrompt } from "./continuePrompt";

export type AutoContinueReason = "max_tokens" | "tool_use";

type StreamFeedback = {
  tone: "info" | "warning" | "error" | "success";
  label: string;
  detail?: string;
};

type FinalizeAutoContinueArgs = {
  responseInterrupted: boolean;
  targetSessionId: string;
  activeSessionId: string;
  onSend: (prompt: string) => void | Promise<unknown>;
};

type HandleContinueArgs = {
  sending: boolean;
  onSend: (prompt: string) => void | Promise<unknown>;
};

export function useAutoContinue(
  setStreamFeedback: Dispatch<SetStateAction<StreamFeedback | null>>,
) {
  const [continuePrompt, setContinuePrompt] = useState<string | null>(null);
  const autoContinueCountRef = useRef(0);
  const pendingAutoContinuePromptRef = useRef<string | null>(null);
  const pendingAutoContinueReasonRef = useRef<AutoContinueReason | null>(null);
  const pendingAutoContinueSessionIdRef = useRef<string | null>(null);
  const autoContinueTimerRef = useRef<number | null>(null);

  const clearAutoContinueTimer = useCallback(() => {
    if (autoContinueTimerRef.current !== null) {
      window.clearTimeout(autoContinueTimerRef.current);
      autoContinueTimerRef.current = null;
    }
  }, []);

  const clearPendingAutoContinue = useCallback(() => {
    pendingAutoContinuePromptRef.current = null;
    pendingAutoContinueReasonRef.current = null;
    pendingAutoContinueSessionIdRef.current = null;
  }, []);

  const cancelAutoContinue = useCallback(() => {
    clearAutoContinueTimer();
    clearPendingAutoContinue();
  }, [clearAutoContinueTimer, clearPendingAutoContinue]);

  const prepareAutoContinueTurn = useCallback((isSyntheticContinueTurn: boolean) => {
    cancelAutoContinue();
    if (!isSyntheticContinueTurn) {
      autoContinueCountRef.current = 0;
    }
  }, [cancelAutoContinue]);

  const hasPendingAutoContinue = useCallback(() => Boolean(pendingAutoContinuePromptRef.current), []);

  const queueAutoContinue = useCallback((sessionId: string, reason: AutoContinueReason) => {
    const prompt = buildContinuePrompt();
    pendingAutoContinuePromptRef.current = prompt;
    pendingAutoContinueReasonRef.current = reason;
    pendingAutoContinueSessionIdRef.current = sessionId;
    setContinuePrompt(prompt);
  }, []);

  const finalizeAutoContinueTurn = useCallback(({
    responseInterrupted,
    targetSessionId,
    activeSessionId,
    onSend,
  }: FinalizeAutoContinueArgs) => {
    const queuedPrompt = pendingAutoContinuePromptRef.current;
    const queuedReason = pendingAutoContinueReasonRef.current;
    const queuedSessionId = pendingAutoContinueSessionIdRef.current;

    if (
      !responseInterrupted
      && queuedPrompt
      && queuedReason
      && queuedSessionId === targetSessionId
      && autoContinueCountRef.current < CHAT_AUTO_CONTINUE_LIMIT
    ) {
      autoContinueCountRef.current += 1;
      clearPendingAutoContinue();
      setStreamFeedback({
        tone: "warning",
        label: queuedReason === "tool_use" ? "自动继续任务" : "自动续写中",
        detail: queuedReason === "tool_use"
          ? "继续未完成的步骤，避免任务中断"
          : "继续补全被长度上限截断的回复",
      });
      autoContinueTimerRef.current = window.setTimeout(() => {
        autoContinueTimerRef.current = null;
        if (activeSessionId !== targetSessionId) {
          return;
        }
        void onSend(queuedPrompt);
      }, 180);
      return;
    }

    if (
      queuedPrompt
      && queuedReason
      && queuedSessionId === targetSessionId
      && autoContinueCountRef.current >= CHAT_AUTO_CONTINUE_LIMIT
    ) {
      setStreamFeedback({
        tone: "warning",
        label: queuedReason === "tool_use" ? "任务仍可继续" : "回复仍可继续",
        detail: "自动续写达到当前上限，可点击 Continue 继续",
      });
    }
  }, [clearPendingAutoContinue, setStreamFeedback]);

  const handleContinue = useCallback(({ sending, onSend }: HandleContinueArgs) => {
    if (!continuePrompt || sending) return;
    autoContinueCountRef.current = 0;
    cancelAutoContinue();
    void onSend(continuePrompt);
  }, [cancelAutoContinue, continuePrompt]);

  useEffect(() => () => clearAutoContinueTimer(), [clearAutoContinueTimer]);

  return {
    continuePrompt,
    setContinuePrompt,
    cancelAutoContinue,
    hasPendingAutoContinue,
    prepareAutoContinueTurn,
    queueAutoContinue,
    finalizeAutoContinueTurn,
    handleContinue,
  };
}