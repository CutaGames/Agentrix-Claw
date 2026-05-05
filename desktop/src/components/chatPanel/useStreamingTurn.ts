import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { getActivePlan, type AgentPlan } from "../../services/agentIntelligence";
import {
  checkDesktopLocalModelReady,
  ensureDesktopLocalSidecar,
  getDesktopLocalModelLabel,
  normalizeDesktopLocalModelId,
} from "../../services/localChat";
import { trackLocalInferenceOutcome } from "../../services/localInferenceTelemetry";
import { LocalLLMSidecar, type ChatMessage as LocalLLMChatMessage } from "../../services/localLLM";
import {
  syncLocalConversation,
  streamChat,
  streamDirectChat,
  type ChatAttachment,
  type ChatMessage,
  type OpenClawInstance,
} from "../../services/store";
import { listWorkspaceDir, type FileEntry } from "../../services/workspace";
import type { StreamEvent } from "../../../../shared/stream-parser.ts";
import type { TaskTimelineStatus } from "../TaskTimeline";
import { buildContinuePrompt } from "./continuePrompt";
import { getLocalPrefillFeedback, STREAM_CHUNK_FLUSH_MS } from "./contextBudget";
import { createEmptySessionRuntimeState, type SessionRuntimeState } from "./sessionRuntime";

interface StreamFeedback {
  tone: "info" | "warning" | "error" | "success";
  label: string;
  detail?: string;
}

interface TokenUsageState {
  percent: number;
  used: number;
  total: number;
}

interface CompactionInfoState {
  isCompacted: boolean;
  turnIndex: number;
  contextTokens: number;
}

interface ActiveToolRunState {
  toolCallId: string;
  toolName: string;
  status: string;
  startedAt: number;
}

interface StreamCostState {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalCostUsd: number;
  model: string;
}

interface TimelineRecordArgs {
  id: string;
  toolName: string;
  status: TaskTimelineStatus;
  input?: unknown;
  output?: unknown;
  startedAt?: number;
  finishedAt?: number;
  message?: string;
}

interface ChunkHandlerParams {
  targetSessionId: string;
  assistantId: string;
  assistantTextRef: { current: string };
  sawToolEventAfterLastTextRef: { current: boolean };
  sessionIdRef: { current: string };
  audioPlayer?: { playing?: boolean } | null;
  sentenceAccumulator?: { push: (chunk: string) => void } | null;
  setBallState: (state: "idle" | "recording" | "thinking" | "speaking") => void;
  setStreamFeedback: Dispatch<SetStateAction<StreamFeedback | null>>;
}

interface MetaHandlerParams {
  targetSessionId: string;
  assistantId: string;
  useDesktopLocalModel: boolean;
  activeInstance?: OpenClawInstance;
  setPlanForSession: (sessionId: string, plan: AgentPlan | null) => void;
  setSelectedModel: Dispatch<SetStateAction<string>>;
  manualModelSelectionRef: { current: unknown };
}

interface StreamEventHandlerParams {
  targetSessionId: string;
  sawApprovalRequiredRef: { current: boolean };
  sawToolEventAfterLastTextRef: { current: boolean };
  cloudDoneReasonRef: { current: Extract<StreamEvent, { type: "done" }>["reason"] | null };
  summarizeToolInput: (input: unknown) => string;
  recordToolTimelineEvent: (sessionId: string, args: TimelineRecordArgs) => void;
  refreshWorkspaceChanges: () => Promise<void> | void;
  handleWorkspaceWriteArtifact: (toolName: string, rawResult: unknown) => void;
  queueAutoContinue: (sessionId: string, reason: "max_tokens" | "tool_use") => void;
  setContinuePrompt: (value: string | null) => void;
  setStreamCost: Dispatch<SetStateAction<StreamCostState | null>>;
  setTokenUsage: Dispatch<SetStateAction<TokenUsageState | null>>;
  setCompactionInfo: Dispatch<SetStateAction<CompactionInfoState | null>>;
  setStreamFeedback: Dispatch<SetStateAction<StreamFeedback | null>>;
  setActiveToolRun: Dispatch<SetStateAction<ActiveToolRunState | null>>;
}

interface DoneHandlerParams {
  targetSessionId: string;
  assistantId: string;
  hasPendingAutoContinue: () => boolean;
  effectiveChatMode: "ask" | "agent" | "plan";
  looksIncompleteAssistantOutput: (text: string) => boolean;
  assistantTextRef: { current: string };
  sawApprovalRequiredRef: { current: boolean };
  sawToolEventAfterLastTextRef: { current: boolean };
  cloudDoneReasonRef: { current: Extract<StreamEvent, { type: "done" }>["reason"] | null };
  queueAutoContinue: (sessionId: string, reason: "max_tokens" | "tool_use") => void;
  setStreamFeedback: Dispatch<SetStateAction<StreamFeedback | null>>;
  sentenceAccumulator?: { flush?: () => void } | null;
  sessionAbortControllersRef: MutableRefObject<Record<string, AbortController | null>>;
  sessionIdRef: { current: string };
  abortRef: MutableRefObject<AbortController | null>;
  patchSessionRuntime: (sessionId: string, patch: { sending?: boolean }) => void;
  setSendStartedAt: (value: number | null) => void;
  setActiveToolRun: Dispatch<SetStateAction<ActiveToolRunState | null>>;
  setStreamCost: Dispatch<SetStateAction<StreamCostState | null>>;
  fetchTokenUsage: () => void | Promise<void>;
  authToken: string | null;
  setPlanForSession: (sessionId: string, plan: AgentPlan | null) => void;
}

interface ErrorHandlerParams {
  targetSessionId: string;
  assistantId: string;
  sessionIdRef: { current: string };
  abortRef: MutableRefObject<AbortController | null>;
  sessionAbortControllersRef: MutableRefObject<Record<string, AbortController | null>>;
  updateSessionMessages: (
    sessionId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
    options?: { persist?: boolean; markUnread?: boolean },
  ) => ChatMessage[];
  patchSessionRuntime: (sessionId: string, patch: { sending?: boolean }) => void;
  setSendStartedAt: (value: number | null) => void;
  setActiveToolRun: Dispatch<SetStateAction<ActiveToolRunState | null>>;
  setContinuePrompt: (value: string | null) => void;
  setStreamFeedback: Dispatch<SetStateAction<StreamFeedback | null>>;
}

interface RunCloudStreamParams {
  activeInstanceId: string | null;
  activeAgentId: string | null;
  outboundText: string;
  history: Array<{ role: string; content: string }>;
  cloudHistoryForInstance: Array<{ role: "user" | "assistant"; content: string }>;
  targetSessionId: string;
  authToken: string;
  cloudModelForTurn?: string;
  effectiveChatMode: "ask" | "agent" | "plan";
  chunkHandler: (chunk: string) => void;
  metaHandler: (meta: { resolvedModel?: string; resolvedModelLabel?: string; plan?: AgentPlan }) => void;
  eventHandler: (event: StreamEvent) => void;
  doneHandler: (resolve: () => void) => () => void;
  errorHandler: (resolve: () => void) => (err: string) => void;
  sessionAbortControllersRef: MutableRefObject<Record<string, AbortController | null>>;
  sessionIdRef: { current: string };
  abortRef: MutableRefObject<AbortController | null>;
}

interface CleanupTurnParams {
  targetSessionId: string;
  sessionIdRef: { current: string };
  abortRef: MutableRefObject<AbortController | null>;
  sessionAbortControllersRef: MutableRefObject<Record<string, AbortController | null>>;
  patchSessionRuntime: (sessionId: string, patch: { sending?: boolean }) => void;
  setSendStartedAt: (value: number | null) => void;
  setActiveToolRun: Dispatch<SetStateAction<ActiveToolRunState | null>>;
  onAfterCleanup?: () => void;
}

interface UseStreamingTurnParams {
  workspaceDir: string | null;
  formatBytes: (size: number) => string;
  updateSessionMessages: (
    sessionId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
    options?: { persist?: boolean; markUnread?: boolean },
  ) => ChatMessage[];
  sessionRuntimeRef: MutableRefObject<Record<string, SessionRuntimeState>>;
  notifyIfBackground: (title: string, body: string) => Promise<void> | void;
}

interface RunLocalTurnParams {
  targetSessionId: string;
  assistantId: string;
  authToken: string | null;
  outboundText: string;
  history: Array<{ role: string; content: string }>;
  activeLocalModelId: string;
  effectiveChatMode: "ask" | "agent" | "plan";
  shouldEscalateLocalTurn: boolean;
  allowCloudFallback: boolean;
  escalatedResolvedModel: string;
  escalatedResolvedModelLabel: string;
  localToolInstanceId?: string;
  localToolAgentId?: string;
  chunkHandler: (chunk: string) => void;
  cleanupTurnToIdle: () => void;
  setStreamFeedback: Dispatch<SetStateAction<StreamFeedback | null>>;
  updateSessionMessages: (
    sessionId: string,
    updater: (prev: ChatMessage[]) => ChatMessage[],
    options?: { persist?: boolean; markUnread?: boolean },
  ) => ChatMessage[];
  recordToolTimelineEvent: (sessionId: string, args: TimelineRecordArgs) => void;
  refreshWorkspaceChanges: () => Promise<void> | void;
  handleWorkspaceWriteArtifact: (toolName: string, rawResult: unknown) => void;
  localSidecarRef: MutableRefObject<LocalLLMSidecar | null>;
  sentenceAccumulator?: { flush?: () => void } | null;
  sessionAbortControllersRef: MutableRefObject<Record<string, AbortController | null>>;
  sessionIdRef: { current: string };
  abortRef: MutableRefObject<AbortController | null>;
}

export function useStreamingTurn({
  workspaceDir,
  formatBytes,
  updateSessionMessages,
  sessionRuntimeRef,
  notifyIfBackground,
}: UseStreamingTurnParams) {
  const chunkBufferRef = useRef<Map<string, { sessionId: string; chunks: string[] }>>(new Map());
  const chunkFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingResponseStartedRef = useRef<Set<string>>(new Set());

  // Cache a short top-level listing of the workspace so we can hand the model
  // an immediate snapshot of what's there (avoids the model guessing or
  // hallucinating tool calls just to "see" the folder).
  const workspaceListingRef = useRef<string>("");
  useEffect(() => {
    let cancelled = false;
    if (!workspaceDir) {
      workspaceListingRef.current = "";
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const entries: FileEntry[] = await listWorkspaceDir("");
        if (cancelled) return;
        const sorted = [...entries]
          .sort((a, b) => {
            if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
            return a.name.localeCompare(b.name);
          })
          .slice(0, 40);
        const lines = sorted.map((e) => (e.is_dir ? `${e.name}/` : e.name));
        const more = entries.length > sorted.length ? `\n…and ${entries.length - sorted.length} more` : "";
        workspaceListingRef.current = lines.length ? `${lines.join("\n")}${more}` : "(empty)";
      } catch {
        workspaceListingRef.current = "";
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceDir]);

  const serializeMessageForModel = useCallback((content: string, attachments: ChatAttachment[] = []) => {
    const trimmed = content.trim();
    let result = trimmed;
    if (attachments.length > 0) {
      const attachmentLines = attachments.map((attachment, index) => {
        const label = attachment.kind === "image"
          ? "Image"
          : attachment.kind === "video"
            ? "Video"
            : attachment.kind === "audio"
              ? "Audio"
              : "File";
        return `${index + 1}. ${label}: ${attachment.originalName} (${attachment.mimetype}, ${formatBytes(attachment.size)})\nURL: ${attachment.publicUrl}`;
      });
      const prefix = trimmed ? `${trimmed}\n\n` : "";
      result = `${prefix}[User Attachments]\n${attachmentLines.join("\n\n")}\nUse the attachment URLs when relevant.`;
    }
    if (workspaceDir) {
      // Strip Windows extended-length prefix \\?\ for human / model readability.
      const displayDir = workspaceDir.replace(/^\\\\\?\\/, "").replace(/^\/\?\//, "");
      const listing = workspaceListingRef.current;
      const listingBlock = listing
        ? `\nTop-level entries:\n${listing}\n`
        : "";
      result += `\n\n[Desktop Workspace]\nPath: ${displayDir}${listingBlock}\nGuidance: When the user asks about files in "the workspace" / "项目" / "代码库" / "this folder", they mean the path above. Reference relative paths (e.g. \`docs/foo.md\`). If you need to read or modify files, request the user to invoke the workspace tool (or the local agent) — do not invent <function_calls>/<invoke> XML; that markup is not executable in this chat.`;
    }
    return result;
  }, [formatBytes, workspaceDir]);

  const flushChunkBuffer = useCallback(() => {
    chunkFlushTimerRef.current = null;
    const entries = Array.from(chunkBufferRef.current.entries());
    chunkBufferRef.current.clear();
    for (const [msgId, { sessionId, chunks }] of entries) {
      const combined = chunks.join("");
      if (!combined) continue;
      updateSessionMessages(sessionId, (prev) =>
        prev.map((message) => (
          message.id === msgId ? { ...message, content: message.content + combined } : message
        )),
      );
    }
  }, [updateSessionMessages]);

  const appendChunk = useCallback((sessionId: string, msgId: string, chunk: string) => {
    const existing = chunkBufferRef.current.get(msgId);
    if (existing) {
      existing.chunks.push(chunk);
    } else {
      chunkBufferRef.current.set(msgId, { sessionId, chunks: [chunk] });
    }
    if (chunkFlushTimerRef.current === null) {
      chunkFlushTimerRef.current = setTimeout(flushChunkBuffer, STREAM_CHUNK_FLUSH_MS);
    }
  }, [flushChunkBuffer]);

  const finalizeMessage = useCallback((sessionId: string, msgId: string) => {
    if (chunkFlushTimerRef.current !== null) {
      clearTimeout(chunkFlushTimerRef.current);
      chunkFlushTimerRef.current = null;
    }
    streamingResponseStartedRef.current.delete(`${sessionId}:${msgId}`);
    flushChunkBuffer();

    const updated = updateSessionMessages(
      sessionId,
      (prev) => prev.map((message) => {
        if (message.id !== msgId) {
          return message;
        }

        if (message.content.trim().length > 0) {
          return { ...message, streaming: false };
        }

        const runtime = sessionRuntimeRef.current[sessionId] || createEmptySessionRuntimeState();
        const fallbackContent = runtime.desktopTimelineEntries.length > 0
          || runtime.desktopTaskStatus === "executing"
          || runtime.desktopTaskStatus === "need-approve"
          ? "任务已执行，但本轮没有返回可展示的正文。你可以继续追问，让它基于当前进度继续输出。"
          : "本轮没有返回可展示的正文。你可以继续追问，让它从当前进度继续。";

        return {
          ...message,
          content: fallbackContent,
          streaming: false,
        };
      }),
      { persist: true, markUnread: true },
    );
    const targetMessage = updated.find((message) => message.id === msgId);
    if (targetMessage) {
      void notifyIfBackground("Agentrix", targetMessage.content.slice(0, 100));
    }
  }, [flushChunkBuffer, notifyIfBackground, sessionRuntimeRef, updateSessionMessages]);

  const createChunkHandler = useCallback(({
    targetSessionId,
    assistantId,
    assistantTextRef,
    sawToolEventAfterLastTextRef,
    sessionIdRef,
    audioPlayer,
    sentenceAccumulator,
    setBallState,
    setStreamFeedback,
  }: ChunkHandlerParams) => (chunk: string) => {
    assistantTextRef.current += chunk;
    sawToolEventAfterLastTextRef.current = false;
    const responseKey = `${targetSessionId}:${assistantId}`;
    if (!streamingResponseStartedRef.current.has(responseKey)) {
      streamingResponseStartedRef.current.add(responseKey);
      if (targetSessionId === sessionIdRef.current && !audioPlayer?.playing) {
        setBallState("speaking");
      }
      setStreamFeedback((current) => {
        if (current?.tone === "error") return current;
        return {
          tone: "info",
          label: "正在输出回复",
          detail: "内容持续生成中",
        };
      });
    }
    appendChunk(targetSessionId, assistantId, chunk);
    sentenceAccumulator?.push(chunk);
  }, [appendChunk]);

  const createMetaHandler = useCallback(({
    targetSessionId,
    assistantId,
    useDesktopLocalModel,
    setPlanForSession,
    setSelectedModel,
    manualModelSelectionRef,
  }: MetaHandlerParams) => (meta: { resolvedModel?: string; resolvedModelLabel?: string; plan?: AgentPlan }) => {
    updateSessionMessages(targetSessionId, (prev) =>
      prev.map((message) => message.id === assistantId ? { ...message, meta } : message),
    );
    if (meta.resolvedModel && !useDesktopLocalModel) {
      const normalizedResolvedModel = normalizeDesktopLocalModelId(meta.resolvedModel);
      manualModelSelectionRef.current = null;
      setSelectedModel((currentSelectedModel) => (
        currentSelectedModel === normalizedResolvedModel ? currentSelectedModel : normalizedResolvedModel
      ));
      try {
        localStorage.setItem("agentrix_desktop_selected_model", normalizedResolvedModel);
      } catch {}
    }
    if (meta.plan) {
      setPlanForSession(targetSessionId, meta.plan);
    }
  }, [updateSessionMessages]);

  const createStreamEventHandler = useCallback(({
    targetSessionId,
    sawApprovalRequiredRef,
    sawToolEventAfterLastTextRef,
    cloudDoneReasonRef,
    summarizeToolInput,
    recordToolTimelineEvent,
    refreshWorkspaceChanges,
    handleWorkspaceWriteArtifact,
    queueAutoContinue,
    setContinuePrompt,
    setStreamCost,
    setTokenUsage,
    setCompactionInfo,
    setStreamFeedback,
    setActiveToolRun,
  }: StreamEventHandlerParams) => (event: StreamEvent) => {
    if (event.type === "usage") {
      setStreamCost({
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        cacheReadTokens: event.cacheReadTokens || 0,
        totalCostUsd: event.totalCostUsd || 0,
        model: event.model || "",
      });
      if (event.inputTokens + event.outputTokens > 0) {
        setTokenUsage((prev) => prev ? {
          ...prev,
          used: event.inputTokens + event.outputTokens,
          percent: prev.total > 0 ? Math.round(((event.inputTokens + event.outputTokens) / prev.total) * 100) : prev.percent,
        } : prev);
      }
      return;
    }

    if (event.type === "turn_info") {
      if (event.isCompacted) {
        setCompactionInfo({
          isCompacted: true,
          turnIndex: event.turnIndex,
          contextTokens: event.contextTokens,
        });
      }
      return;
    }

    if (event.type === "thinking") {
      setStreamFeedback({
        tone: "info",
        label: "正在思考",
        detail: event.text || "分析上下文和任务中",
      });
      return;
    }

    if (event.type === "tool_start") {
      sawToolEventAfterLastTextRef.current = true;
      const startedAt = Date.now();
      setActiveToolRun({
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: "starting",
        startedAt,
      });
      recordToolTimelineEvent(targetSessionId, {
        id: event.toolCallId,
        toolName: event.toolName,
        status: "running",
        input: event.input,
        startedAt,
      });
      setStreamFeedback({
        tone: "info",
        label: `正在执行 ${event.toolName}`,
        detail: summarizeToolInput(event.input),
      });
      return;
    }

    if (event.type === "tool_progress") {
      setActiveToolRun((current) => current
        ? {
            ...current,
            status: event.status || current.status,
          }
        : {
            toolCallId: event.toolCallId,
            toolName: "tool",
            status: event.status || "running",
            startedAt: Date.now(),
          });
      setStreamFeedback((current) => ({
        tone: "info",
        label: current?.label || "工具执行中",
        detail: event.partialResult || event.status || current?.detail || "处理中",
      }));
      return;
    }

    if (event.type === "tool_result") {
      sawToolEventAfterLastTextRef.current = true;
      setActiveToolRun(null);
      void refreshWorkspaceChanges();
      handleWorkspaceWriteArtifact(event.toolName, event.result);
      recordToolTimelineEvent(targetSessionId, {
        id: event.toolCallId,
        toolName: event.toolName,
        status: event.success ? "completed" : "failed",
        output: event.success ? event.result : event.error,
        finishedAt: Date.now(),
        message: event.error,
      });
      setStreamFeedback({
        tone: event.success ? "success" : "error",
        label: event.success ? `${event.toolName} 已完成` : `${event.toolName} 执行失败`,
        detail: event.success
          ? `${Math.max(1, Math.round(event.durationMs / 1000))}s`
          : event.error,
      });
      return;
    }

    if (event.type === "tool_error") {
      sawToolEventAfterLastTextRef.current = true;
      const timedOut = /timeout|timed out|ETIMEDOUT/i.test(event.error);
      setActiveToolRun(null);
      recordToolTimelineEvent(targetSessionId, {
        id: event.toolCallId,
        toolName: event.toolName,
        status: "failed",
        output: event.error,
        finishedAt: Date.now(),
        message: event.error,
      });
      if (timedOut) {
        setContinuePrompt(buildContinuePrompt());
        setStreamFeedback({
          tone: "warning",
          label: `${event.toolName} 超时`,
          detail: "点击 Continue 从当前进度续写",
        });
      } else {
        setStreamFeedback({
          tone: "error",
          label: `${event.toolName} 执行失败`,
          detail: event.error,
        });
      }
      return;
    }

    if (event.type === "approval_required") {
      sawApprovalRequiredRef.current = true;
      recordToolTimelineEvent(targetSessionId, {
        id: event.toolCallId,
        toolName: event.toolName,
        status: "waiting-approval",
        input: event.input,
        startedAt: Date.now(),
        message: event.reason,
      });
      window.dispatchEvent(new CustomEvent("agentrix:approval-needed", {
        detail: {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          riskLevel: event.riskLevel,
          reason: event.reason,
        },
      }));
      setStreamFeedback({
        tone: "warning",
        label: "等待审批",
        detail: `${event.toolName} 需要确认后才能继续`,
      });
      return;
    }

    if (event.type === "done") {
      cloudDoneReasonRef.current = event.reason;
      setActiveToolRun(null);
      if (event.reason === "max_tokens") {
        queueAutoContinue(targetSessionId, "max_tokens");
        setStreamFeedback({
          tone: "warning",
          label: "输出达到长度上限",
          detail: "点击 Continue 从中断位置续写",
        });
      } else if (event.reason === "tool_use") {
        queueAutoContinue(targetSessionId, "tool_use");
        setStreamFeedback({
          tone: "warning",
          label: "复杂任务尚未完成",
          detail: "工具链达到当前执行预算，点击 Continue 继续未完成步骤",
        });
      } else if (event.reason === "abort") {
        setStreamFeedback({
          tone: "warning",
          label: "回复已中止",
          detail: "可以继续或重新发送",
        });
      } else if (event.reason !== "error") {
        setStreamFeedback(null);
      }
      return;
    }

    if (event.type === "error") {
      const timedOut = /timeout|timed out|ETIMEDOUT/i.test(event.error);
      setActiveToolRun(null);
      if (timedOut) {
        setContinuePrompt(buildContinuePrompt());
        setStreamFeedback({
          tone: "warning",
          label: "请求超时",
          detail: "点击 Continue 从已生成内容后继续",
        });
      } else {
        setStreamFeedback({
          tone: "error",
          label: "请求失败",
          detail: event.error,
        });
      }
    }
  }, []);

  const createDoneHandler = useCallback(({
    targetSessionId,
    assistantId,
    hasPendingAutoContinue,
    effectiveChatMode,
    looksIncompleteAssistantOutput,
    assistantTextRef,
    sawApprovalRequiredRef,
    sawToolEventAfterLastTextRef,
    cloudDoneReasonRef,
    queueAutoContinue,
    setStreamFeedback,
    sentenceAccumulator,
    sessionAbortControllersRef,
    sessionIdRef,
    abortRef,
    patchSessionRuntime,
    setSendStartedAt,
    setActiveToolRun,
    setStreamCost,
    fetchTokenUsage,
    authToken,
    setPlanForSession,
  }: DoneHandlerParams) => (resolve: () => void) => () => {
    if (
      !hasPendingAutoContinue()
      && !sawApprovalRequiredRef.current
      && effectiveChatMode !== "ask"
      && (cloudDoneReasonRef.current === null || cloudDoneReasonRef.current === "end_turn" || cloudDoneReasonRef.current === "stop_sequence")
      && looksIncompleteAssistantOutput(assistantTextRef.current)
    ) {
      queueAutoContinue(targetSessionId, sawToolEventAfterLastTextRef.current ? "tool_use" : "max_tokens");
      setStreamFeedback({
        tone: "warning",
        label: sawToolEventAfterLastTextRef.current ? "任务似乎尚未完成" : "检测到输出未完成",
        detail: "已停止自动续写，避免额外消耗 Premium Request；点击 Continue 继续",
      });
    }
    finalizeMessage(targetSessionId, assistantId);
    sentenceAccumulator?.flush?.();
    sessionAbortControllersRef.current[targetSessionId] = null;
    if (targetSessionId === sessionIdRef.current) {
      abortRef.current = null;
    }
    patchSessionRuntime(targetSessionId, { sending: false });
    setSendStartedAt(null);
    setActiveToolRun(null);
    setStreamCost(null);
    void fetchTokenUsage();
    if (authToken) {
      void getActivePlan(authToken, targetSessionId)
        .then((plan) => {
          if (plan) {
            setPlanForSession(targetSessionId, plan);
          }
        })
        .catch(() => {});
    }
    resolve();
  }, [finalizeMessage]);

  const createErrorHandler = useCallback(({
    targetSessionId,
    assistantId,
    sessionIdRef,
    abortRef,
    sessionAbortControllersRef,
    updateSessionMessages,
    patchSessionRuntime,
    setSendStartedAt,
    setActiveToolRun,
    setContinuePrompt,
    setStreamFeedback,
  }: ErrorHandlerParams) => (resolve: () => void) => (err: string) => {
    streamingResponseStartedRef.current.delete(`${targetSessionId}:${assistantId}`);
    updateSessionMessages(
      targetSessionId,
      (prev) => prev.map((message) => (
        message.id === assistantId
          ? {
              ...message,
              content: message.content.trim().length > 0 ? message.content : `Error: ${err || "未知错误"}`,
              error: true,
              streaming: false,
            }
          : message
      )),
      { persist: true, markUnread: true },
    );
    sessionAbortControllersRef.current[targetSessionId] = null;
    if (targetSessionId === sessionIdRef.current) {
      abortRef.current = null;
    }
    patchSessionRuntime(targetSessionId, { sending: false });
    setSendStartedAt(null);
    setActiveToolRun(null);
    if (/timeout|timed out|ETIMEDOUT/i.test(err)) {
      setContinuePrompt(buildContinuePrompt());
      setStreamFeedback({
        tone: "warning",
        label: "请求超时",
        detail: "点击 Continue 从已生成内容后继续",
      });
    } else {
      setStreamFeedback({
        tone: "error",
        label: "请求失败",
        detail: err,
      });
    }
    resolve();
  }, []);

  const runCloudStream = useCallback(async ({
    activeInstanceId,
    activeAgentId,
    outboundText,
    history,
    cloudHistoryForInstance,
    targetSessionId,
    authToken,
    cloudModelForTurn,
    effectiveChatMode,
    chunkHandler,
    metaHandler,
    eventHandler,
    doneHandler,
    errorHandler,
    sessionAbortControllersRef,
    sessionIdRef,
    abortRef,
  }: RunCloudStreamParams) => {
    await new Promise<void>((resolve) => {
      let controller: AbortController;
      if (activeInstanceId) {
        controller = streamChat({
          instanceId: activeInstanceId,
          message: outboundText,
          history: cloudHistoryForInstance,
          sessionId: targetSessionId,
          token: authToken,
          model: cloudModelForTurn,
          mode: effectiveChatMode,
          maxTokens: 12288,
          onChunk: chunkHandler,
          onMeta: metaHandler,
          onEvent: eventHandler,
          onDone: doneHandler(resolve),
          onError: errorHandler(resolve),
        });
      } else {
        controller = streamDirectChat({
          messages: history,
          sessionId: targetSessionId,
          agentId: activeAgentId,
          token: authToken,
          model: cloudModelForTurn,
          mode: effectiveChatMode,
          onChunk: chunkHandler,
          onEvent: eventHandler,
          onDone: doneHandler(resolve),
          onError: errorHandler(resolve),
        });
      }

      sessionAbortControllersRef.current[targetSessionId] = controller;
      if (targetSessionId === sessionIdRef.current) {
        abortRef.current = controller;
      }
    });
  }, []);

  const runLocalTurn = useCallback(async ({
    targetSessionId,
    assistantId,
    authToken,
    outboundText,
    history,
    activeLocalModelId,
    effectiveChatMode,
    shouldEscalateLocalTurn,
    allowCloudFallback,
    escalatedResolvedModel,
    escalatedResolvedModelLabel,
    localToolInstanceId,
    localToolAgentId,
    chunkHandler,
    cleanupTurnToIdle,
    setStreamFeedback,
    updateSessionMessages,
    recordToolTimelineEvent,
    refreshWorkspaceChanges,
    handleWorkspaceWriteArtifact,
    localSidecarRef,
    sentenceAccumulator,
    sessionAbortControllersRef,
    sessionIdRef,
    abortRef,
  }: RunLocalTurnParams) => {
    let shouldFallbackToCloud = false;

    if (shouldEscalateLocalTurn) {
      shouldFallbackToCloud = true;
      updateSessionMessages(
        targetSessionId,
        (prev) => prev.map((message) => (
          message.id === assistantId
            ? {
                ...message,
                meta: {
                  resolvedModel: escalatedResolvedModel,
                  resolvedModelLabel: escalatedResolvedModelLabel,
                },
              }
            : message
        )),
      );
      setStreamFeedback({
        tone: "info",
        label: "混合模式已切换云端编排",
        detail: "当前请求需要工具链或更长执行预算，已跳过本地直答",
      });
      return { shouldFallbackToCloud };
    }

    const localStartedAt = Date.now();
    const readiness = await checkDesktopLocalModelReady();
    if (!readiness.ready) {
      shouldFallbackToCloud = Boolean(authToken) && allowCloudFallback;
      trackLocalInferenceOutcome({
        platform: "desktop",
        tier: "local",
        outcome: shouldFallbackToCloud ? "fallback-to-cloud" : "error",
        modelId: activeLocalModelId,
        durationMs: Date.now() - localStartedAt,
        reason: readiness.message || "local-runtime-not-ready",
      });
      if (!shouldFallbackToCloud) {
        updateSessionMessages(
          targetSessionId,
          (prev) => prev.map((existing) => (
            existing.id === assistantId
              ? {
                  ...existing,
                  content: `⚠️ ${readiness.message || "本地模型不可用"}`,
                  error: true,
                  streaming: false,
                }
              : existing
          )),
          { persist: true, markUnread: true },
        );
        setStreamFeedback({
          tone: "error",
          label: "本地模型不可用",
          detail: readiness.message || "请在设置中下载本地模型",
        });
        cleanupTurnToIdle();
      } else {
        updateSessionMessages(
          targetSessionId,
          (prev) => prev.map((existing) => (
            existing.id === assistantId
              ? { ...existing, content: "", error: false, streaming: true, meta: undefined }
              : existing
          )),
        );
        setStreamFeedback({
          tone: "warning",
          label: "本地模型不可用，切换云端",
          detail: readiness.message || "请在设置中下载本地模型",
        });
      }
      return { shouldFallbackToCloud };
    }

    updateSessionMessages(
      targetSessionId,
      (prev) => prev.map((message) => (
        message.id === assistantId
          ? {
              ...message,
              meta: {
                resolvedModel: activeLocalModelId,
                resolvedModelLabel: getDesktopLocalModelLabel(activeLocalModelId),
              },
            }
          : message
      )),
    );

    const controller = new AbortController();
    sessionAbortControllersRef.current[targetSessionId] = controller;
    if (targetSessionId === sessionIdRef.current) {
      abortRef.current = controller;
    }

    try {
      const localSidecar = localSidecarRef.current || new LocalLLMSidecar();
      localSidecarRef.current = localSidecar;
      const localModelLabel = getDesktopLocalModelLabel(activeLocalModelId);
      if (localSidecar.currentStatus !== "running") {
        setStreamFeedback({
          tone: "info",
          label: "模型载入中",
          detail: `${localModelLabel} 正在加载到本地内存`,
        });
      }

      await ensureDesktopLocalSidecar(localSidecar);
      setStreamFeedback(getLocalPrefillFeedback(history));

      let receivedFirstLocalChunk = false;
      let toolCallingHandled = false;
      if (effectiveChatMode !== "ask") {
        try {
          const { runDesktopToolCallingLoop } = await import("../../services/desktopToolCalling");
          setStreamFeedback({
            tone: "info",
            label: "正在思考",
            detail: "检查是否需要使用工具",
          });
          const localToolRunIds = new Map<string, string[]>();
          const toolResult = await runDesktopToolCallingLoop(
            localSidecar,
            history as LocalLLMChatMessage[],
            {
              instanceId: localToolInstanceId,
              agentId: localToolAgentId,
              authToken: authToken || undefined,
              sessionId: targetSessionId,
              temperature: 0.7,
              maxTokens: 6144,
              onToolCall: (name: string, args: Record<string, unknown>) => {
                const id = `local-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const queuedIds = localToolRunIds.get(name) || [];
                queuedIds.push(id);
                localToolRunIds.set(name, queuedIds);
                recordToolTimelineEvent(targetSessionId, {
                  id,
                  toolName: name,
                  status: "running",
                  input: args,
                  startedAt: Date.now(),
                });
                setStreamFeedback({
                  tone: "info",
                  label: name,
                  detail: "正在执行工具调用",
                });
              },
              onToolResult: (name: string, result: string) => {
                const queuedIds = localToolRunIds.get(name) || [];
                const id = queuedIds.shift() || `local-${name}-${Date.now()}`;
                localToolRunIds.set(name, queuedIds);
                const failed = /^error\b|"error"\s*:|"success"\s*:\s*false/i.test(result);
                if (!failed) {
                  handleWorkspaceWriteArtifact(name, result);
                }
                recordToolTimelineEvent(targetSessionId, {
                  id,
                  toolName: name,
                  status: failed ? "failed" : "completed",
                  output: result,
                  finishedAt: Date.now(),
                });
                void refreshWorkspaceChanges();
              },
              abortSignal: controller.signal,
            },
          );
          toolCallingHandled = true;
          if (toolResult.text) {
            chunkHandler(toolResult.text);
          }
        } catch (toolError: any) {
          console.warn("[local-tool-calling] fallback to streaming:", toolError?.message);
        }
      }

      if (!toolCallingHandled) {
        for await (const chunk of localSidecar.chatStream(history as LocalLLMChatMessage[], { maxTokens: 4096 })) {
          if (controller.signal.aborted) {
            break;
          }
          if (!receivedFirstLocalChunk) {
            receivedFirstLocalChunk = true;
            setStreamFeedback({
              tone: "info",
              label: "正在输出回复",
              detail: "内容持续生成中",
            });
          }
          chunkHandler(chunk);
        }
      }

      if (!controller.signal.aborted) {
        finalizeMessage(targetSessionId, assistantId);
        sentenceAccumulator?.flush?.();
        setStreamFeedback(null);

        if (authToken) {
          const syncMessages: Array<{ role: "user" | "assistant"; content: string }> = [{
            role: "user",
            content: outboundText,
          }];
          updateSessionMessages(targetSessionId, (prev) => {
            const assistantMessage = prev.find((message) => message.id === assistantId);
            if (assistantMessage?.content?.trim()) {
              syncMessages.push({ role: "assistant", content: assistantMessage.content });
            }
            return prev;
          });
          if (syncMessages.length > 1) {
            void syncLocalConversation(authToken, targetSessionId, syncMessages, activeLocalModelId);
          }
        }

        trackLocalInferenceOutcome({
          platform: "desktop",
          tier: "local",
          outcome: "success",
          modelId: activeLocalModelId,
          durationMs: Date.now() - localStartedAt,
          tokensOut: 0,
        });
      }
    } catch (error: any) {
      const message = error?.message || String(error);
      const timedOut = /timeout/i.test(message);
      const stalled = /stall/i.test(message);
      const aborted = /abort/i.test(message);
      trackLocalInferenceOutcome({
        platform: "desktop",
        tier: "local",
        outcome: aborted ? "aborted" : timedOut ? "timeout" : stalled ? "stall" : "error",
        modelId: activeLocalModelId,
        durationMs: Date.now() - localStartedAt,
        reason: message.slice(0, 160),
      });
      shouldFallbackToCloud = Boolean(authToken) && allowCloudFallback;
      if (!shouldFallbackToCloud) {
        updateSessionMessages(
          targetSessionId,
          (prev) => prev.map((existing) => (
            existing.id === assistantId
              ? {
                  ...existing,
                  content: existing.content.trim().length > 0 ? existing.content : `Error: ${message}`,
                  error: true,
                  streaming: false,
                }
              : existing
          )),
          { persist: true, markUnread: true },
        );
        setStreamFeedback({
          tone: "error",
          label: "本地模型执行失败",
          detail: message,
        });
      } else {
        updateSessionMessages(
          targetSessionId,
          (prev) => prev.map((existing) => (
            existing.id === assistantId
              ? {
                  ...existing,
                  content: "",
                  error: false,
                  streaming: true,
                  meta: undefined,
                }
              : existing
          )),
        );
        setStreamFeedback({
          tone: "warning",
          label: "本地模型不可用，切换云端",
          detail: message,
        });
      }
    } finally {
      sessionAbortControllersRef.current[targetSessionId] = null;
      if (targetSessionId === sessionIdRef.current) {
        abortRef.current = null;
      }
      if (!shouldFallbackToCloud) {
        cleanupTurnToIdle();
      }
    }

    return { shouldFallbackToCloud };
  }, [finalizeMessage]);

  const createTurnCleanupHandler = useCallback(({
    targetSessionId,
    sessionIdRef,
    abortRef,
    sessionAbortControllersRef,
    patchSessionRuntime,
    setSendStartedAt,
    setActiveToolRun,
    onAfterCleanup,
  }: CleanupTurnParams) => () => {
    sessionAbortControllersRef.current[targetSessionId] = null;
    if (targetSessionId === sessionIdRef.current) {
      abortRef.current = null;
    }
    patchSessionRuntime(targetSessionId, { sending: false });
    setSendStartedAt(null);
    setActiveToolRun(null);
    onAfterCleanup?.();
  }, []);

  useEffect(() => () => {
    if (chunkFlushTimerRef.current) {
      clearTimeout(chunkFlushTimerRef.current);
      chunkFlushTimerRef.current = null;
    }
    chunkBufferRef.current.clear();
    streamingResponseStartedRef.current.clear();
  }, []);

  return {
    serializeMessageForModel,
    appendChunk,
    finalizeMessage,
    streamingResponseStartedRef,
    createChunkHandler,
    createMetaHandler,
    createStreamEventHandler,
    createDoneHandler,
    createErrorHandler,
    runCloudStream,
    runLocalTurn,
    createTurnCleanupHandler,
  };
}
