import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
};

type HandleContinueArgs = {
  sending: boolean;
  onSend: (prompt: string) => void | Promise<unknown>;
};

export function useAutoContinue(
  setStreamFeedback: Dispatch<SetStateAction<StreamFeedback | null>>,
) {
  const [continuePrompt, setContinuePrompt] = useState<string | null>(null);
  const pendingAutoContinuePromptRef = useRef<string | null>(null);
  const pendingAutoContinueReasonRef = useRef<AutoContinueReason | null>(null);
  const pendingAutoContinueSessionIdRef = useRef<string | null>(null);

  const clearPendingAutoContinue = useCallback(() => {
    pendingAutoContinuePromptRef.current = null;
    pendingAutoContinueReasonRef.current = null;
    pendingAutoContinueSessionIdRef.current = null;
  }, []);

  const cancelAutoContinue = useCallback(() => {
    clearPendingAutoContinue();
  }, [clearPendingAutoContinue]);

  const prepareAutoContinueTurn = useCallback((isSyntheticContinueTurn: boolean) => {
    cancelAutoContinue();
    if (isSyntheticContinueTurn) return;
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
  }: FinalizeAutoContinueArgs) => {
    const queuedPrompt = pendingAutoContinuePromptRef.current;
    const queuedReason = pendingAutoContinueReasonRef.current;
    const queuedSessionId = pendingAutoContinueSessionIdRef.current;

    if (!queuedPrompt || !queuedReason || queuedSessionId !== targetSessionId) {
      return;
    }

    setStreamFeedback({
      tone: "warning",
      label: responseInterrupted
        ? "当前回复已停止"
        : queuedReason === "tool_use"
          ? "任务仍可继续"
          : "回复仍可继续",
      detail: responseInterrupted
        ? "本轮执行已中止，可点击 Continue 从当前进度继续"
        : queuedReason === "tool_use"
          ? "已停止自动续写，避免额外消耗 Premium Request；点击 Continue 继续未完成步骤"
          : "已停止自动续写，避免额外消耗 Premium Request；点击 Continue 从当前位置续写",
    });
  }, [setStreamFeedback]);

  const handleContinue = useCallback(({ sending, onSend }: HandleContinueArgs) => {
    if (!continuePrompt || sending) return;
    const prompt = continuePrompt;
    cancelAutoContinue();
    void onSend(prompt);
  }, [cancelAutoContinue, continuePrompt]);

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