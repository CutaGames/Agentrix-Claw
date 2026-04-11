import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import {
  useAuthStore,
  streamDirectChat,
  syncLocalConversation,
  streamChat,
  fetchModels,
  apiFetch,
  API_BASE,
  type ChatMessage,
  type ChatAttachment,
  type DesktopAgent,
  type OpenClawInstance,
  uploadChatAttachment,
} from "../services/store";
import MessageBubble from "./MessageBubble";
import VoiceButton from "./VoiceButton";
import FloatingBall from "./FloatingBall";
import SettingsPanel from "./SettingsPanel";
import FileTreePanel from "./FileTreePanel";
import ApprovalSheet from "./ApprovalSheet";
import TaskTimeline, { type TaskRunState, type TaskTimelineEntry, type TaskTimelineStatus } from "./TaskTimeline";
import { gitStatus, gitDiff, gitLog, gitCommit, gitBranchList } from "../services/git";
import { captureScreen } from "../services/screenshot";
import NotificationCenter, { NotificationBadge } from "./NotificationCenter";
import { subscribe as subscribeNotifications, getUnreadCount } from "../services/notifications";
import { type VoiceState } from "../services/voice";
import { type FabricDevice } from "../services/realtimeVoice";
import {
  AudioQueuePlayer,
  SentenceAccumulator,
  detectLang,
} from "../services/AudioQueuePlayer";
import { acceptHandoffWs } from "../services/agentPresence";
import {
  getWorkspaceDir,
  listWorkspaceDir,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "../services/workspace";
import { getDesktopDeviceId } from "../services/desktop";
import {
  fetchDesktopSyncState,
  respondDesktopApproval,
  type DesktopRemoteApproval,
} from "../services/desktopSync";
import { pushSessionSync, isSessionSyncConnected } from "../services/sessionSync";
import { trackEvent } from "../services/analytics";
import {
  getActivePlan,
  approvePlan as approvePlanApi,
  rejectPlan as rejectPlanApi,
  resumeSession as resumeSessionApi,
  type AgentPlan,
} from "../services/agentIntelligence";
import PlanPanel from "./PlanPanel";
import TaskWorkbenchPanel, { type TaskCheckpoint, type TaskWorkbenchEvent } from "./TaskWorkbenchPanel";
import { ContextVisualizer } from "./ContextVisualizer";
import CrossDevicePanel from "./CrossDevicePanel";
import AgentEconomyPanel from "./AgentEconomyPanel";
import MemoryPanel from "./MemoryPanel";
import DreamPanel from "./DreamPanel";
import PluginPanel from "./PluginPanel";
import MemoryWikiPanel from "./MemoryWikiPanel";
import McpPanel from "./McpPanel";
import HandoffBanner from "./HandoffBanner";
import WearableNotification from "./WearableNotification";
import { startOfflineCache, stopOfflineCache, getQueueLength } from "../services/offlineCache";
import {
  listSessionEntries,
  loadSessionMessages,
  persistSession,
  removeSession,
  loadTabs,
  saveTabs,
  loadActiveTabId,
  saveActiveTabId,
  type SessionEntry,
  type PersistedTab,
} from "../services/chatSessionStore";
import TabBar, { type ChatTab } from "./TabBar";
import type { NetworkStatus } from "../services/network";
import type { StreamEvent } from "../../../shared/stream-parser.ts";
import {
  DESKTOP_LOCAL_MODEL_ID,
  DESKTOP_LOCAL_MODEL_LABEL,
  ensureDesktopLocalSidecar,
  getDesktopLocalModelLabel,
  isDesktopLocalModelId,
  normalizeDesktopLocalModelId,
  checkDesktopLocalModelReady,
} from "../services/localChat";
import { LocalLLMSidecar } from "../services/localLLM";

// Send desktop notification when app is in background
async function notifyIfBackground(title: string, body: string) {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const focused = await win.isFocused();
    if (!focused) {
      const { sendNotification, isPermissionGranted, requestPermission } =
        await import("@tauri-apps/plugin-notification");
      let permitted = await isPermissionGranted();
      if (!permitted) permitted = (await requestPermission()) === "granted";
      if (permitted) sendNotification({ title, body: body.slice(0, 100) });
    }
  } catch {}
}

interface Props {
  onClose: () => void;
  networkStatus?: NetworkStatus;
  proMode?: boolean;
  onEnterProMode?: () => void;
}

const APPROX_CHARS_PER_TOKEN = 4;
const LONG_LOCAL_PREFILL_TOKEN_THRESHOLD = 3000;
const MANUAL_MODEL_SELECTION_GRACE_MS = 20_000;
const STALE_DESKTOP_TASK_WINDOW_MS = 45_000;
const RECENT_DESKTOP_FAILURE_WINDOW_MS = 15_000;
const CHAT_AUTO_CONTINUE_LIMIT = 3;
const CHECKPOINT_CONTINUE_PROMPT = "Continue from the latest checkpoint. Preserve the active plan, task progress, and any pending background results.";
const TASK_LIKE_PROMPT_PATTERN = /([a-z]:\\|\\|\/|\.tsx?\b|\.jsx?\b|\.json\b|\.md\b|package\.json|readme|src\/|backend\/|desktop\/|```|\n)|\b(search|find|install|run|execute|debug|fix|edit|write|read|open|grep|list|analy[sz]e|inspect|deploy|build|test|git|ssh|workspace|file|folder|directory|project|repo|code|patch|benchmark|profile|trace|continue|resume)\b|搜索|安装|运行|执行|修复|修改|查看|列出|分析|排查|部署|构建|测试|工作区|文件|目录|项目|仓库|代码/i;

function estimateLocalPrefillTokens(messages: Array<{ content: string }>): number {
  const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  return Math.max(1, Math.round(totalChars / APPROX_CHARS_PER_TOKEN));
}

function getLocalPrefillFeedback(messages: Array<{ content: string }>): StreamFeedback {
  const estimatedTokens = estimateLocalPrefillTokens(messages);
  const isLongContext = estimatedTokens >= LONG_LOCAL_PREFILL_TOKEN_THRESHOLD;

  return {
    tone: "info",
    label: isLongContext ? "长上下文预填充中" : "上下文预填充中",
    detail: isLongContext
      ? `本地模型已就绪，正在预处理约 ${estimatedTokens.toLocaleString()} tokens 的上下文`
      : `本地模型已就绪，正在预处理约 ${estimatedTokens.toLocaleString()} tokens 的上下文`,
  };
}

function getConversationModelLabel(
  modelId: string,
  models: Array<{ id: string; label?: string }>,
  activeInstance?: OpenClawInstance,
): string | null {
  if (!modelId && activeInstance?.resolvedModelLabel) {
    return activeInstance.resolvedModelLabel;
  }

  if (isDesktopLocalModelId(modelId)) {
    return getDesktopLocalModelLabel(modelId);
  }

  const matchedModel = models.find((model) => model.id === modelId);
  if (matchedModel?.label) {
    return matchedModel.label;
  }

  if (activeInstance?.resolvedModel === modelId && activeInstance.resolvedModelLabel) {
    return activeInstance.resolvedModelLabel;
  }

  return modelId || activeInstance?.resolvedModel || null;
}

function buildConversationSystemMessages(
  activeAgent: DesktopAgent | null,
  modelLabel: string | null,
): Array<{ role: "system"; content: string }> {
  const systemMessages: Array<{ role: "system"; content: string }> = [];

  if (modelLabel) {
    systemMessages.push({
      role: "system",
      content: `Current selected model for this conversation: "${modelLabel}". If the user asks which model is currently selected, answer with this exact label. Do not claim to be a different model.`,
    });
  }

  const agentProfile = activeAgent?.description?.trim();
  if (agentProfile) {
    systemMessages.push({
      role: "system",
      content: `Agent profile: ${agentProfile}\nKeep replies aligned with this profile while preserving the user's intent.`,
    });
  }

  return systemMessages;
}

function resolveEffectiveChatMode(
  requestedMode: ChatMode,
  text: string,
  attachmentCount: number,
  hasActivePlan: boolean,
): ChatMode {
  if (requestedMode !== "agent") {
    return requestedMode;
  }

  if (attachmentCount > 0 || hasActivePlan) {
    return "agent";
  }

  return TASK_LIKE_PROMPT_PATTERN.test(text.trim()) ? "agent" : "ask";
}

function shouldEscalateDesktopLocalTurn(effectiveChatMode: ChatMode, hasCloudPath: boolean): boolean {
  return hasCloudPath && effectiveChatMode === "agent";
}

type BallState = "idle" | "recording" | "thinking" | "speaking";
type ChatMode = "ask" | "agent" | "plan";

type SessionRuntimeState = {
  sending: boolean;
  desktopTaskStatus: TaskRunState;
  desktopTimelineEntries: TaskTimelineEntry[];
  pendingApproval: DesktopRemoteApproval | null;
  rememberApprovalForSession: boolean;
  workbenchEvents: TaskWorkbenchEvent[];
  lastCheckpointAt: number | null;
};

function createEmptySessionRuntimeState(): SessionRuntimeState {
  return {
    sending: false,
    desktopTaskStatus: "idle",
    desktopTimelineEntries: [],
    pendingApproval: null,
    rememberApprovalForSession: false,
    workbenchEvents: [],
    lastCheckpointAt: null,
  };
}

type IncomingHandoffSnapshot = {
  title?: string;
  messages?: Array<{
    role?: "user" | "assistant";
    content?: string;
    createdAt?: number;
  }>;
};

type IncomingHandoffEvent = {
  handoffId?: string;
  sessionId?: string;
  sourceDeviceId?: string;
  agentId?: string;
  contextSnapshot?: IncomingHandoffSnapshot;
};

type StreamFeedbackTone = "info" | "warning" | "error" | "success";

type StreamFeedback = {
  tone: StreamFeedbackTone;
  label: string;
  detail?: string;
};

type ActiveToolRun = {
  toolCallId: string;
  toolName: string;
  status: string;
  startedAt: number;
};

export default function ChatPanel({
  onClose,
  networkStatus = "online",
  proMode = false,
  onEnterProMode,
}: Props) {
  const { token, activeAgentId, agents, setActiveAgent, instances, activeInstanceId, setActiveInstance, loadToken } =
    useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [ballState, setBallState] = useState<BallState>("idle");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    try {
      return localStorage.getItem("agentrix_desktop_selected_model") || "";
    } catch {
      return "";
    }
  });
  const [workspaceDir, setWorkspaceDirState] = useState<string | null>(null);
  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const [syncConnected, setSyncConnected] = useState(isSessionSyncConnected());
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [historyEntries, setHistoryEntries] = useState<SessionEntry[]>([]);
  const [crossDeviceOpen, setCrossDeviceOpen] = useState(false);
  const [taskWorkbenchOpen, setTaskWorkbenchOpen] = useState(false);
  const [economyPanelOpen, setEconomyPanelOpen] = useState(false);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [dreamPanelOpen, setDreamPanelOpen] = useState(false);
  const [pluginPanelOpen, setPluginPanelOpen] = useState(false);
  const [wikiPanelOpen, setWikiPanelOpen] = useState(false);
  const [mcpPanelOpen, setMcpPanelOpen] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const desktopDeviceId = useMemo(() => getDesktopDeviceId(), []);
  const [chatMode, setChatMode] = useState<ChatMode>(() => {
    const saved = localStorage.getItem("agentrix_chat_mode");
    return saved === "ask" || saved === "plan" || saved === "agent" ? saved : "ask";
  });
  const activeAgent = useMemo<DesktopAgent | null>(
    () => agents.find((agent) => agent.id === activeAgentId) || null,
    [agents, activeAgentId],
  );

  // ── Multi-tab state ─────────────────────────────────────
  const defaultTabId = `tab-${Date.now()}`;
  const defaultSessionId = `session-${Date.now()}`;
  const [tabs, setTabs] = useState<ChatTab[]>([{ id: defaultTabId, sessionId: defaultSessionId, title: "New Chat", unread: false }]);
  const [activeTabId, setActiveTabId] = useState(defaultTabId);
  const [tabsHydrated, setTabsHydrated] = useState(false);
  const tabMessagesCache = useRef<Record<string, ChatMessage[]>>({});
  const [sessionRuntime, setSessionRuntime] = useState<Record<string, SessionRuntimeState>>({});
  const sessionRuntimeRef = useRef<Record<string, SessionRuntimeState>>({});
  const [sessionPlans, setSessionPlans] = useState<Record<string, AgentPlan | null>>({});

  const sessionIdRef = useRef(defaultSessionId);
  const abortRef = useRef<AbortController | null>(null);
  const sessionAbortControllersRef = useRef<Record<string, AbortController | null>>({});
  const responseInterruptedRef = useRef(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioPlayerRef = useRef<AudioQueuePlayer | null>(null);
  const sentenceAccRef = useRef<SentenceAccumulator | null>(null);
  const localSidecarRef = useRef<LocalLLMSidecar | null>(null);
  const manualModelSelectionRef = useRef<{
    modelId: string;
    instanceId: string | null;
    expiresAt: number;
  } | null>(null);
  // Track whether the current send was voice-initiated for auto-TTS
  const voiceInitiatedRef = useRef(false);
  const activeRealtimeVoiceTurnRef = useRef<{ sessionId: string; assistantMessageId: string } | null>(null);

  const activeSessionRuntime = useMemo(
    () => sessionRuntime[sessionIdRef.current] || createEmptySessionRuntimeState(),
    [sessionRuntime, activeTabId],
  );
  const sending = activeSessionRuntime.sending;
  const desktopTaskStatus = activeSessionRuntime.desktopTaskStatus;
  const desktopTimelineEntries = activeSessionRuntime.desktopTimelineEntries;
  const pendingApproval = activeSessionRuntime.pendingApproval;
  const rememberApprovalForSession = activeSessionRuntime.rememberApprovalForSession;
  const workbenchEvents = activeSessionRuntime.workbenchEvents;
  const lastCheckpointAt = activeSessionRuntime.lastCheckpointAt;
  const activePlan = sessionPlans[sessionIdRef.current] || null;

  // Token bar state — lightweight context usage for input area
  const [tokenUsage, setTokenUsage] = useState<{ percent: number; used: number; total: number } | null>(null);
  const tokenFetchRef = useRef(0);

  // Real-time SSE cost tracking (P0: Precise cost display)
  const [streamCost, setStreamCost] = useState<{
    inputTokens: number; outputTokens: number;
    cacheReadTokens: number; totalCostUsd: number;
    model: string;
  } | null>(null);
  // Compaction status hint (P1: auto-compaction)
  const [compactionInfo, setCompactionInfo] = useState<{
    isCompacted: boolean; turnIndex: number; contextTokens: number;
  } | null>(null);
  const [streamFeedback, setStreamFeedback] = useState<StreamFeedback | null>(null);
  const [activeToolRun, setActiveToolRun] = useState<ActiveToolRun | null>(null);
  const [sendStartedAt, setSendStartedAt] = useState<number | null>(null);
  // Deep-think + fabric device visual state
  const [deepThinkActive, setDeepThinkActive] = useState(false);
  const [deepThinkTargetModel, setDeepThinkTargetModel] = useState<string | null>(null);
  const [fabricDevices, setFabricDevices] = useState<FabricDevice[]>([]);
  const [continuePrompt, setContinuePrompt] = useState<string | null>(null);
  const [windowBounds, setWindowBounds] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 480,
    height: typeof window !== "undefined" ? window.innerHeight : 640,
  }));
  const [windowChromeState, setWindowChromeState] = useState({
    maximized: false,
    fullscreen: false,
  });
  const [feedbackNow, setFeedbackNow] = useState(Date.now());
  const autoContinueCountRef = useRef(0);
  const pendingAutoContinuePromptRef = useRef<string | null>(null);
  const pendingAutoContinueReasonRef = useRef<"max_tokens" | "tool_use" | null>(null);
  const pendingAutoContinueSessionIdRef = useRef<string | null>(null);
  const autoContinueTimerRef = useRef<number | null>(null);

  const effectiveProMode =
    proMode ||
    windowBounds.width > 520 ||
    windowBounds.height > 700 ||
    windowChromeState.maximized ||
    windowChromeState.fullscreen;

  const feedbackElapsedSeconds = useMemo(() => {
    const start = activeToolRun?.startedAt || sendStartedAt;
    if (!start) return 0;
    return Math.max(1, Math.round((feedbackNow - start) / 1000));
  }, [activeToolRun?.startedAt, feedbackNow, sendStartedAt]);

  const visibleStreamFeedback = useMemo(() => {
    if (!streamFeedback) return null;

    if (activeToolRun) {
      return {
        ...streamFeedback,
        detail: streamFeedback.detail
          ? `${streamFeedback.detail} · ${feedbackElapsedSeconds}s`
          : `${activeToolRun.status || "running"} · ${feedbackElapsedSeconds}s`,
      };
    }

    if (sendStartedAt && (streamFeedback.tone === "info" || streamFeedback.tone === "warning")) {
      return {
        ...streamFeedback,
        detail: streamFeedback.detail
          ? `${streamFeedback.detail} · ${feedbackElapsedSeconds}s`
          : `${feedbackElapsedSeconds}s`,
      };
    }

    return streamFeedback;
  }, [activeToolRun, feedbackElapsedSeconds, sendStartedAt, streamFeedback]);

  const compactTitleBar = !effectiveProMode && windowBounds.width < 760;
  const activeHeaderInstance = useMemo(
    () => (activeInstanceId ? instances.find((instance) => instance.id === activeInstanceId) : undefined),
    [activeInstanceId, instances],
  );
  const compactHeaderTitle = activeHeaderInstance?.name || activeAgent?.name || "Agentrix";
  const compactHeaderSubtitle = compactTitleBar
    ? (windowChromeState.fullscreen
      ? "F11 退出全屏"
      : "拖动顶部移动窗口 · 双击放大 · F11 全屏")
    : (getConversationModelLabel(selectedModel, models, activeHeaderInstance) || activeHeaderInstance?.resolvedModelLabel || "Ready");

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

  const queueAutoContinue = useCallback((sessionId: string, reason: "max_tokens" | "tool_use") => {
    const prompt = buildContinuePrompt();
    pendingAutoContinuePromptRef.current = prompt;
    pendingAutoContinueReasonRef.current = reason;
    pendingAutoContinueSessionIdRef.current = sessionId;
    setContinuePrompt(prompt);
  }, []);

  const hasPendingManualModelSelection = useCallback((instanceId: string | null, resolvedModelId?: string | null) => {
    const pendingSelection = manualModelSelectionRef.current;
    if (!pendingSelection) {
      return false;
    }

    if (pendingSelection.instanceId !== instanceId) {
      return false;
    }

    if (pendingSelection.expiresAt <= Date.now()) {
      manualModelSelectionRef.current = null;
      return false;
    }

    if (resolvedModelId && normalizeDesktopLocalModelId(resolvedModelId) === pendingSelection.modelId) {
      manualModelSelectionRef.current = null;
      return false;
    }

    return true;
  }, []);

  const fetchTokenUsage = useCallback(async () => {
    if (!token || !sessionIdRef.current) return;
    const stamp = ++tokenFetchRef.current;
    try {
      const { apiFetch, API_BASE } = await import("../services/store");
      const url = `${API_BASE}/agent-intelligence/sessions/${encodeURIComponent(sessionIdRef.current)}/context-usage${activeInstanceId ? `?instanceId=${activeInstanceId}` : ""}`;
      const res = await apiFetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok && stamp === tokenFetchRef.current) {
        const data = await res.json();
        setTokenUsage({ percent: data.usagePercent, used: data.estimatedTokens, total: data.contextWindowSize });
      }
    } catch {}
  }, [token, activeInstanceId]);

  // Fetch token usage on tab switch, after send, and periodically
  useEffect(() => {
    fetchTokenUsage();
  }, [activeTabId, fetchTokenUsage]);
  useEffect(() => {
    if (!sending) fetchTokenUsage();
  }, [sending, fetchTokenUsage]);

  const refreshWindowChromeState = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const [maximized, fullscreen] = await Promise.all([
        win.isMaximized(),
        win.isFullscreen(),
      ]);
      setWindowChromeState({ maximized, fullscreen });
    } catch {}
  }, []);

  useEffect(() => {
    const syncWindowBounds = () => {
      setWindowBounds({ width: window.innerWidth, height: window.innerHeight });
    };

    syncWindowBounds();
    void refreshWindowChromeState();
    window.addEventListener("resize", syncWindowBounds);
    return () => window.removeEventListener("resize", syncWindowBounds);
  }, [refreshWindowChromeState]);

  useEffect(() => {
    if (!sendStartedAt && !activeToolRun) return;
    setFeedbackNow(Date.now());
    const timer = window.setInterval(() => setFeedbackNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeToolRun, sendStartedAt]);

  useEffect(() => () => clearAutoContinueTimer(), [clearAutoContinueTimer]);

  const enterWindowProMode = useCallback(async () => {
    if (onEnterProMode) {
      onEnterProMode();
      return;
    }

    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { LogicalSize } = await import("@tauri-apps/api/dpi");
      const win = getCurrentWindow();
      await win.setResizable(true);
      await win.setSize(new LogicalSize(1100, 820));
      await win.setMinSize(new LogicalSize(720, 560));
      await win.setAlwaysOnTop(false);
      await win.setFocus();
      setWindowBounds({ width: window.innerWidth, height: window.innerHeight });
      await refreshWindowChromeState();
    } catch {}
  }, [onEnterProMode, refreshWindowChromeState]);

  const toggleWindowMaximize = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const maximized = await win.isMaximized();
      if (maximized) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
      await refreshWindowChromeState();
    } catch {}
  }, [refreshWindowChromeState]);

  const toggleWindowFullscreen = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const fullscreen = await win.isFullscreen();
      await win.setFullscreen(!fullscreen);
      await refreshWindowChromeState();
    } catch {}
  }, [refreshWindowChromeState]);

  useEffect(() => {
    const handleWindowChromeShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.key === "F11") {
        event.preventDefault();
        void toggleWindowFullscreen();
      }
    };

    window.addEventListener("keydown", handleWindowChromeShortcut);
    return () => window.removeEventListener("keydown", handleWindowChromeShortcut);
  }, [toggleWindowFullscreen]);

  const refreshHistory = useCallback(async () => {
    setHistoryEntries(await listSessionEntries());
  }, []);

  useEffect(() => {
    sessionRuntimeRef.current = sessionRuntime;
  }, [sessionRuntime]);

  const patchSessionRuntime = useCallback(
    (
      sessionId: string,
      patch:
        | Partial<SessionRuntimeState>
        | ((current: SessionRuntimeState) => Partial<SessionRuntimeState>),
    ) => {
      setSessionRuntime((prev) => {
        const current = prev[sessionId] || createEmptySessionRuntimeState();
        const delta = typeof patch === "function" ? patch(current) : patch;
        return {
          ...prev,
          [sessionId]: {
            ...current,
            ...delta,
          },
        };
      });
    },
    [],
  );

  const setPlanForSession = useCallback((sessionId: string, plan: AgentPlan | null) => {
    setSessionPlans((prev) => ({
      ...prev,
      [sessionId]: plan,
    }));
    patchSessionRuntime(sessionId, { lastCheckpointAt: Date.now() });
  }, [patchSessionRuntime]);

  const pushWorkbenchEvent = useCallback((sessionId: string, event: TaskWorkbenchEvent) => {
    patchSessionRuntime(sessionId, (current) => ({
      workbenchEvents: [event, ...current.workbenchEvents.filter((entry) => entry.id !== event.id)].slice(0, 16),
      lastCheckpointAt: Math.max(current.lastCheckpointAt || 0, event.createdAt),
    }));
  }, [patchSessionRuntime]);

  const persistMessagesForSession = useCallback(
    (sessionId: string, nextMessages: ChatMessage[]) => {
      if (nextMessages.length === 0) {
        return;
      }

      void persistSession(sessionId, nextMessages).then(() => refreshHistory());

      const firstUser = nextMessages.find((message) => message.role === "user");
      const title = firstUser?.content?.slice(0, 50) || "New Chat";

      setTabs((prev) => prev.map((tab) => (
        tab.sessionId === sessionId
          ? {
              ...tab,
              title,
            }
          : tab
      )));

      pushSessionSync(sessionId, nextMessages, title);
      patchSessionRuntime(sessionId, { lastCheckpointAt: Date.now() });
    },
    [patchSessionRuntime, refreshHistory],
  );

  const updateSessionMessages = useCallback(
    (
      sessionId: string,
      updater: (messages: ChatMessage[]) => ChatMessage[],
      options?: { persist?: boolean; markUnread?: boolean },
    ) => {
      const currentMessages = tabMessagesCache.current[sessionId] || [];
      const nextMessages = updater(currentMessages);
      tabMessagesCache.current[sessionId] = nextMessages;

      if (sessionId === sessionIdRef.current) {
        setMessages(nextMessages);
      }

      if (options?.markUnread && sessionId !== sessionIdRef.current) {
        setTabs((prev) => prev.map((tab) => (
          tab.sessionId === sessionId
            ? { ...tab, unread: true }
            : tab
        )));
      }

      if (options?.persist) {
        persistMessagesForSession(sessionId, nextMessages);
      }

      return nextMessages;
    },
    [persistMessagesForSession],
  );

  const abortSession = useCallback((sessionId: string) => {
    const controller = sessionAbortControllersRef.current[sessionId];
    if (controller) {
      responseInterruptedRef.current = true;
      if (autoContinueTimerRef.current !== null) {
        window.clearTimeout(autoContinueTimerRef.current);
        autoContinueTimerRef.current = null;
      }
      pendingAutoContinuePromptRef.current = null;
      pendingAutoContinueReasonRef.current = null;
      pendingAutoContinueSessionIdRef.current = null;
      controller.abort();
      sessionAbortControllersRef.current[sessionId] = null;
    }
    patchSessionRuntime(sessionId, { sending: false });
    if (sessionId === sessionIdRef.current) {
      abortRef.current = null;
    }
  }, [patchSessionRuntime]);

  const applyDesktopSyncState = useCallback((state: any) => {
    const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
    const deviceTasks = tasks.filter((task: any) => task?.deviceId === desktopDeviceId);
    const approvals = Array.isArray(state?.approvals) ? state.approvals : [];
    const now = Date.now();

    const getTaskActivityTime = (task: any) => Number(
      task?.finishedAt
      || task?.startedAt
      || Date.parse(task?.updatedAt || task?.requestedAt || "")
      || 0,
    );

    const isVisibleTask = (task: any) => {
      const status = (task?.status as TaskRunState) || "completed";
      const ageMs = now - getTaskActivityTime(task);

      if (status === "need-approve") {
        return true;
      }

      if (status === "executing") {
        return ageMs <= STALE_DESKTOP_TASK_WINDOW_MS;
      }

      if (status === "failed") {
        return ageMs <= RECENT_DESKTOP_FAILURE_WINDOW_MS;
      }

      return false;
    };

    const taskGroups = new Map<string, any[]>();
    const taskSessionMap = new Map<string, string>();
    for (const task of deviceTasks) {
      const sessionId = typeof task?.sessionId === "string" && task.sessionId.trim()
        ? task.sessionId
        : "__global__";
      taskSessionMap.set(task.taskId, sessionId);
      const existing = taskGroups.get(sessionId) || [];
      existing.push(task);
      taskGroups.set(sessionId, existing);
    }

    const approvalBySession = new Map<string, DesktopRemoteApproval>();
    for (const approval of approvals) {
      if (approval?.deviceId !== desktopDeviceId || approval?.status !== "pending") {
        continue;
      }
      const sessionId = taskSessionMap.get(approval.taskId) || "__global__";
      const current = approvalBySession.get(sessionId);
      if (!current || Date.parse(approval.requestedAt || "") >= Date.parse(current.requestedAt || "")) {
        approvalBySession.set(sessionId, approval);
      }
    }

    const deriveTaskStatus = (sessionTasks: any[]): TaskRunState => {
      if (sessionTasks.some((task) => task?.status === "need-approve")) return "need-approve";
      if (sessionTasks.some((task) => task?.status === "executing")) return "executing";
      const latestTask = [...sessionTasks].sort((left, right) => {
        const leftTime = Number(left?.finishedAt || left?.startedAt || Date.parse(left?.updatedAt || "") || 0);
        const rightTime = Number(right?.finishedAt || right?.startedAt || Date.parse(right?.updatedAt || "") || 0);
        return rightTime - leftTime;
      })[0];
      return (latestTask?.status as TaskRunState) || "idle";
    };

    const toTimelineStatus = (status: TaskRunState): TaskTimelineStatus => {
      if (status === "executing") return "running";
      if (status === "need-approve") return "waiting-approval";
      if (status === "failed") return "failed";
      return "completed";
    };

    const buildTimelineEntries = (sessionTasks: any[]): TaskTimelineEntry[] => {
      return sessionTasks
        .flatMap((task) => {
          if (Array.isArray(task?.timeline) && task.timeline.length > 0) {
            return task.timeline;
          }
          return [{
            id: `${task.taskId}-summary`,
            title: task?.title || "Desktop task",
            detail: task?.summary,
            kind: "run-command",
            riskLevel: "L0",
            status: toTimelineStatus((task?.status as TaskRunState) || "completed"),
            startedAt: Number(task?.startedAt || Date.parse(task?.updatedAt || "") || Date.now()),
            finishedAt: typeof task?.finishedAt === "number" ? task.finishedAt : undefined,
          }];
        })
        .sort((left, right) => Number(left?.startedAt || 0) - Number(right?.startedAt || 0))
        .slice(-12);
    };

    const knownSessionIds = new Set<string>([
      ...tabs.map((tab) => tab.sessionId),
      ...taskGroups.keys(),
      ...approvalBySession.keys(),
    ]);

    setSessionRuntime((prev) => {
      const next = { ...prev };
      for (const sessionId of knownSessionIds) {
        const current = next[sessionId] || createEmptySessionRuntimeState();
        const sessionTasks = taskGroups.get(sessionId) || [];
        const visibleSessionTasks = sessionTasks.filter(isVisibleTask);
        const approval = approvalBySession.get(sessionId) || null;
        next[sessionId] = {
          ...current,
          desktopTaskStatus: visibleSessionTasks.length > 0 ? deriveTaskStatus(visibleSessionTasks) : "idle",
          desktopTimelineEntries: visibleSessionTasks.length > 0 ? buildTimelineEntries(visibleSessionTasks) : [],
          pendingApproval: approval,
          rememberApprovalForSession: approval ? current.rememberApprovalForSession : false,
        };
      }
      return next;
    });
  }, [desktopDeviceId, tabs]);

  const approvalSheetRequest = useMemo(
    () => pendingApproval
      ? {
          title: pendingApproval.title,
          description: pendingApproval.description,
          riskLevel: pendingApproval.riskLevel,
          canRememberForSession: pendingApproval.riskLevel !== "L3" && Boolean(pendingApproval.sessionKey),
        }
      : null,
    [pendingApproval],
  );

  const setRememberApprovalForSession = useCallback((value: boolean) => {
    patchSessionRuntime(sessionIdRef.current, { rememberApprovalForSession: value });
  }, [patchSessionRuntime]);

  const activeCheckpoint = useMemo<TaskCheckpoint | null>(() => {
    if (!sessionIdRef.current) {
      return null;
    }

    const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant" && message.content.trim().length > 0);
    return {
      sessionId: sessionIdRef.current,
      updatedAt: lastCheckpointAt || messages[messages.length - 1]?.createdAt || Date.now(),
      messageCount: messages.length,
      lastAssistantPreview: lastAssistant?.content ? lastAssistant.content.slice(0, 220) : undefined,
      planStatus: activePlan?.status || null,
      taskStatus: desktopTaskStatus,
    };
  }, [activePlan?.status, desktopTaskStatus, lastCheckpointAt, messages]);

  // Load workspace directory
  useEffect(() => {
    getWorkspaceDir().then(setWorkspaceDirState).catch(() => {});
    const onSettings = () => getWorkspaceDir().then(setWorkspaceDirState).catch(() => {});
    window.addEventListener("agentrix:workspace-changed", onSettings);
    return () => window.removeEventListener("agentrix:workspace-changed", onSettings);
  }, []);

  useEffect(() => {
    if (!token) {
      setModels([]);
      return;
    }

    fetchModels(token)
      .then((fetchedModels) => {
        if (Array.isArray(fetchedModels)) {
          setModels(fetchedModels);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    localStorage.setItem("agentrix_chat_mode", chatMode);
  }, [chatMode]);

  useEffect(() => {
    if (!token) {
      setSessionRuntime({});
      setSessionPlans({});
      return;
    }
    fetchDesktopSyncState(token).then(applyDesktopSyncState).catch(() => {});
  }, [token, activeTabId, applyDesktopSyncState]);

  useEffect(() => {
    const activeInst = instances.find((i) => i.id === activeInstanceId);
    const normalizedResolvedModel = activeInst?.resolvedModel
      ? normalizeDesktopLocalModelId(activeInst.resolvedModel)
      : "";

    if (hasPendingManualModelSelection(activeInstanceId || null, normalizedResolvedModel)) {
      return;
    }

    if (isDesktopLocalModelId(selectedModel)) {
      return;
    }

    if (normalizedResolvedModel && normalizedResolvedModel !== selectedModel) {
      setSelectedModel(normalizedResolvedModel);
      try {
        localStorage.setItem("agentrix_desktop_selected_model", normalizedResolvedModel);
      } catch {}
      return;
    }

    if (!selectedModel && models.length > 0) {
      const fallbackModelId = models[0]?.id || "";
      setSelectedModel(fallbackModelId);
      try {
        localStorage.setItem("agentrix_desktop_selected_model", fallbackModelId);
      } catch {}
    }
  }, [instances, activeInstanceId, hasPendingManualModelSelection, models, selectedModel]);

  useEffect(() => {
    const pendingSelection = manualModelSelectionRef.current;
    if (pendingSelection && pendingSelection.instanceId !== (activeInstanceId || null)) {
      manualModelSelectionRef.current = null;
    }
  }, [activeInstanceId]);

  useEffect(() => {
    if (!isDesktopLocalModelId(selectedModel)) {
      void localSidecarRef.current?.stop().catch(() => {});
      return;
    }

    let cancelled = false;
    const sidecar = localSidecarRef.current || new LocalLLMSidecar();
    localSidecarRef.current = sidecar;

    void (async () => {
      const readiness = await checkDesktopLocalModelReady().catch(() => null);
      if (cancelled || !readiness?.ready) {
        return;
      }

      await ensureDesktopLocalSidecar(sidecar).catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedModel]);

  useEffect(() => {
    return () => {
      void localSidecarRef.current?.stop().catch(() => {});
    };
  }, []);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Tab initialization from persistence ──────────────
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const savedTabs = await loadTabs();
        const savedActiveId = await loadActiveTabId();

        if (cancelled) {
          return;
        }

        if (savedTabs.length > 0) {
          const chatTabs: ChatTab[] = savedTabs.map((tab) => ({ ...tab, unread: false }));
          setTabs(chatTabs);
          const activeId = savedActiveId && chatTabs.find((tab) => tab.id === savedActiveId)
            ? savedActiveId
            : chatTabs[0].id;
          setActiveTabId(activeId);
          const activeTab = chatTabs.find((tab) => tab.id === activeId)!;
          sessionIdRef.current = activeTab.sessionId;
          const msgs = await loadSessionMessages(activeTab.sessionId);
          if (cancelled) {
            return;
          }
          setMessages(msgs);
          tabMessagesCache.current[activeTab.sessionId] = msgs;
        } else {
          const msgs = await loadSessionMessages(sessionIdRef.current);
          if (cancelled) {
            return;
          }
          setMessages(msgs);
          tabMessagesCache.current[sessionIdRef.current] = msgs;
        }
      } finally {
        if (!cancelled) {
          setTabsHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Tab management helpers ────────────────────────────
  const createNewTab = useCallback(() => {
    const id = `tab-${Date.now()}`;
    const sid = `session-${Date.now()}`;
    const newTab: ChatTab = { id, sessionId: sid, title: "New Chat", unread: false };
    // Cache current messages before switching
    tabMessagesCache.current[sessionIdRef.current] = messages;
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    sessionIdRef.current = sid;
    abortRef.current = null;
    setMessages([]);
    setPendingAttachments([]);
    setInput("");
    setBallState("idle");
    audioPlayerRef.current?.stopAll();
    sentenceAccRef.current?.reset();
    trackEvent("tab_new");
  }, [messages]);

  const switchTab = useCallback(async (tabId: string) => {
    if (tabId === activeTabId) return;
    // Save current tab's messages to cache
    tabMessagesCache.current[sessionIdRef.current] = messages;
    audioPlayerRef.current?.stopAll();
    sentenceAccRef.current?.reset();
    // Find target tab
    const target = tabs.find(t => t.id === tabId);
    if (!target) return;
    setActiveTabId(tabId);
    sessionIdRef.current = target.sessionId;
    // Mark as read
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, unread: false } : t));
    // Load messages from cache or store
    const cached = tabMessagesCache.current[target.sessionId];
    if (cached) {
      setMessages(cached);
    } else {
      const stored = await loadSessionMessages(target.sessionId);
      setMessages(stored);
      tabMessagesCache.current[target.sessionId] = stored;
    }
    abortRef.current = sessionAbortControllersRef.current[target.sessionId] || null;
    setPendingAttachments([]);
    setInput("");
    setBallState((sessionRuntimeRef.current[target.sessionId] || createEmptySessionRuntimeState()).sending ? "thinking" : "idle");
  }, [activeTabId, tabs, messages]);

  const closeTab = useCallback(async (tabId: string) => {
    if (tabs.length <= 1) return; // keep at least one tab
    const idx = tabs.findIndex(t => t.id === tabId);
    const closingTab = tabs[idx];
    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);
    if (closingTab) {
      abortSession(closingTab.sessionId);
      setSessionRuntime((prev) => {
        const next = { ...prev };
        delete next[closingTab.sessionId];
        return next;
      });
      setSessionPlans((prev) => {
        const next = { ...prev };
        delete next[closingTab.sessionId];
        return next;
      });
      delete tabMessagesCache.current[closingTab.sessionId];
    }
    // If closing active tab, switch to adjacent
    if (tabId === activeTabId) {
      const nextIdx = Math.min(idx, newTabs.length - 1);
      const nextTab = newTabs[nextIdx];
      setActiveTabId(nextTab.id);
      sessionIdRef.current = nextTab.sessionId;
      const cached = tabMessagesCache.current[nextTab.sessionId];
      if (cached) {
        setMessages(cached);
      } else {
        const stored = await loadSessionMessages(nextTab.sessionId);
        setMessages(stored);
      }
      abortRef.current = sessionAbortControllersRef.current[nextTab.sessionId] || null;
      setPendingAttachments([]);
      setInput("");
      setBallState((sessionRuntimeRef.current[nextTab.sessionId] || createEmptySessionRuntimeState()).sending ? "thinking" : "idle");
    }
  }, [tabs, activeTabId, abortSession]);

  // Persist tabs whenever they change
  useEffect(() => {
    if (!tabsHydrated) {
      return;
    }
    const persisted: PersistedTab[] = tabs.map(t => ({ id: t.id, sessionId: t.sessionId, title: t.title }));
    void saveTabs(persisted);
    void saveActiveTabId(activeTabId);
  }, [tabs, activeTabId, tabsHydrated]);

  // Persist current session to localStorage + push to cross-device sync
  useEffect(() => {
    if (!tabsHydrated) {
      return;
    }
    if (messages.length > 0) {
      void persistSession(sessionIdRef.current, messages).then(() => refreshHistory());
      // Update current tab title
      const firstUser = messages.find(m => m.role === "user");
      const title = firstUser?.content?.slice(0, 50) || "New Chat";
      setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, title } : t));
      // Update cache
      tabMessagesCache.current[sessionIdRef.current] = messages;
      // Push to cross-device sync
      pushSessionSync(sessionIdRef.current, messages, title);
    }
  }, [messages, refreshHistory, activeTabId, tabsHydrated]);

  useEffect(() => {
    if (historyOpen) {
      void refreshHistory();
    }
  }, []);

  const applyIncomingHandoff = useCallback((payload: IncomingHandoffEvent | null | undefined) => {
    if (!payload) return;

    const snapshot = payload.contextSnapshot;
    const restoredMessages: ChatMessage[] = Array.isArray(snapshot?.messages)
      ? snapshot.messages
          .filter((message) => message?.role === "user" || message?.role === "assistant")
          .map((message, index) => ({
            id: `handoff-${Date.now()}-${index}`,
            role: (message.role || "assistant") as "user" | "assistant",
            content: message.content || "",
            createdAt: message.createdAt || Date.now(),
          }))
      : [];

    const nextTabId = `tab-${Date.now()}`;
    const nextSessionId = payload.sessionId || `handoff-${Date.now()}`;
    const nextTitle = snapshot?.title || `Handoff from ${payload.sourceDeviceId || "mobile"}`;

    tabMessagesCache.current[sessionIdRef.current] = messages;
    audioPlayerRef.current?.stopAll();
    sentenceAccRef.current?.reset();

    setTabs((prev) => [...prev, { id: nextTabId, sessionId: nextSessionId, title: nextTitle, unread: false }]);
    setActiveTabId(nextTabId);
    sessionIdRef.current = nextSessionId;
    abortRef.current = null;
    setPendingAttachments([]);
    setInput("");
    setBallState("idle");
    setMessages(
      restoredMessages.length > 0
        ? restoredMessages
        : [{ id: `sys-${Date.now()}`, role: "assistant", content: `Incoming handoff from ${payload.sourceDeviceId || "mobile"}.`, createdAt: Date.now() }],
    );

    // Activate the agent that initiated the handoff so replies are routed correctly
    if (payload.agentId) {
      setActiveAgent(payload.agentId);
    }

    if (payload.handoffId) {
      acceptHandoffWs(payload.handoffId);
    }

    localStorage.removeItem("agentrix_pending_handoff");
    trackEvent("handoff_received", { sourceDeviceId: payload.sourceDeviceId || "mobile", agentId: payload.agentId || "none" });
  }, [messages]);

  useEffect(() => {
    const consumePendingHandoff = () => {
      try {
        const raw = localStorage.getItem("agentrix_pending_handoff");
        if (!raw) return;
        applyIncomingHandoff(JSON.parse(raw) as IncomingHandoffEvent);
      } catch {
        localStorage.removeItem("agentrix_pending_handoff");
      }
    };

    const onIncomingHandoff = (event: Event) => {
      applyIncomingHandoff((event as CustomEvent<IncomingHandoffEvent>).detail);
    };

    consumePendingHandoff();
    window.addEventListener("agentrix:handoff-incoming", onIncomingHandoff as EventListener);
    return () => window.removeEventListener("agentrix:handoff-incoming", onIncomingHandoff as EventListener);
  }, [applyIncomingHandoff]);

  const serializeMessageForModel = useCallback(
    (content: string, attachments: ChatAttachment[] = []) => {
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
      // Add workspace context for coding tasks
      if (workspaceDir) {
        result += `\n\n[Desktop Workspace: ${workspaceDir}]\nYou have access to read and write files in this workspace. When performing coding tasks, reference files by relative path. Use code blocks with file paths to suggest edits.`;
      }
      return result;
    },
    [workspaceDir],
  );

  const appendChunk = useCallback((sessionId: string, msgId: string, chunk: string) => {
    updateSessionMessages(sessionId, (prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, content: m.content + chunk } : m,
      ),
    );
  }, [updateSessionMessages]);

  const finalizeMessage = useCallback((sessionId: string, msgId: string) => {
    const updated = updateSessionMessages(
      sessionId,
      (prev) => prev.map((m) => {
        if (m.id !== msgId) {
          return m;
        }

        if (m.content.trim().length > 0) {
          return { ...m, streaming: false };
        }

        const runtime = sessionRuntimeRef.current[sessionId] || createEmptySessionRuntimeState();
        const fallbackContent = runtime.desktopTimelineEntries.length > 0
          || runtime.desktopTaskStatus === "executing"
          || runtime.desktopTaskStatus === "need-approve"
          ? "任务已执行，但本轮没有返回可展示的正文。你可以继续追问，让它基于当前进度继续输出。"
          : "本轮没有返回可展示的正文。你可以继续追问，让它从当前进度继续。";

        return {
          ...m,
          content: fallbackContent,
          streaming: false,
        };
      }),
      { persist: true, markUnread: true },
    );
    const msg = updated.find((m) => m.id === msgId);
    if (msg) {
      notifyIfBackground("Agentrix", msg.content.slice(0, 100));
    }
  }, [updateSessionMessages]);

  const addSystemMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}`,
      role: "assistant" as const,
      content,
      createdAt: Date.now(),
    }]);
  }, [abortSession]);

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
  }, [addSystemMessage, finalizeMessage, patchSessionRuntime, updateSessionMessages, voiceState]);

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
  }, [patchSessionRuntime, settleRealtimeVoiceTurn, updateSessionMessages]);

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
  }, [appendChunk]);

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
  }, []);

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
  }, [addSystemMessage]);

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
  }, []);

  const persistSelectedModel = useCallback(async (modelId: string, options?: { announce?: boolean }) => {
    const normalizedModelId = normalizeDesktopLocalModelId(modelId);
    const previousModelId = selectedModel;
    setSelectedModel(normalizedModelId);

    try {
      localStorage.setItem("agentrix_desktop_selected_model", normalizedModelId);
    } catch {}

    if (isDesktopLocalModelId(normalizedModelId)) {
      manualModelSelectionRef.current = null;
      if (options?.announce) {
        addSystemMessage(`✅ Switched to model: ${getDesktopLocalModelLabel(modelId)}`);
      }
      return true;
    }

    if (!activeInstanceId || !token) {
      manualModelSelectionRef.current = null;
      if (options?.announce) {
        const label = models.find((model) => model.id === normalizedModelId)?.label || normalizedModelId;
        addSystemMessage(`✅ Switched to model: ${label}`);
      }
      return true;
    }

    manualModelSelectionRef.current = {
      modelId: normalizedModelId,
      instanceId: activeInstanceId,
      expiresAt: Date.now() + MANUAL_MODEL_SELECTION_GRACE_MS,
    };

    try {
      const response = await apiFetch(`${API_BASE}/openclaw/instances/${activeInstanceId}/model`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ modelId: normalizedModelId }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(errorText || `Model switch failed (${response.status})`);
      }

      await loadToken();

      if (options?.announce) {
        const label = models.find((model) => model.id === normalizedModelId)?.label || normalizedModelId;
        addSystemMessage(`✅ Switched to model: ${label}`);
      }

      return true;
    } catch (error: any) {
      manualModelSelectionRef.current = null;
      setSelectedModel(previousModelId);
      try {
        localStorage.setItem("agentrix_desktop_selected_model", previousModelId);
      } catch {}
      if (options?.announce) {
        addSystemMessage(`❌ ${error?.message || error}`);
      }
      setStreamFeedback({
        tone: "error",
        label: "模型切换失败",
        detail: error?.message || String(error),
      });
      return false;
    }
  }, [activeInstanceId, addSystemMessage, loadToken, models, token]);

  // Handle slash commands locally
  const handleSlashCommand = useCallback(async (text: string): Promise<boolean> => {
    const trimmed = text.trim();

    // /new — new chat
    if (trimmed === "/new" || trimmed === "/clear") {
      abortSession(sessionIdRef.current);
      audioPlayerRef.current?.stopAll();
      sentenceAccRef.current?.reset();
      sessionIdRef.current = `session-${Date.now()}`;
      abortRef.current = null;
      setMessages([]);
      setPendingAttachments([]);
      setBallState("idle");
      return true;
    }

    // /ls [path] — list workspace directory
    if (trimmed.startsWith("/ls")) {
      const relPath = trimmed.slice(3).trim();
      try {
        const entries = await listWorkspaceDir(relPath);
        const listing = entries.map(e => `${e.is_dir ? "📁" : "📄"} ${e.name}${e.is_dir ? "/" : ` (${formatBytes(e.size)})`}`).join("\n");
        addSystemMessage(`📂 ${relPath || "."}\n\n${listing || "(empty)"}`);
      } catch (err: any) {
        addSystemMessage(`❌ ${err?.message || err}`);
      }
      return true;
    }

    // /read <path> — read file content
    if (trimmed.startsWith("/read ")) {
      const relPath = trimmed.slice(6).trim();
      try {
        const content = await readWorkspaceFile(relPath);
        const ext = relPath.split(".").pop() || "";
        addSystemMessage(`📄 ${relPath}\n\n\`\`\`${ext}\n${content}\n\`\`\``);
      } catch (err: any) {
        addSystemMessage(`❌ ${err?.message || err}`);
      }
      return true;
    }

    // /write <path> <content> — write file (content after first space of path)
    if (trimmed.startsWith("/write ")) {
      const rest = trimmed.slice(7).trim();
      const spaceIdx = rest.indexOf(" ");
      if (spaceIdx < 0) {
        addSystemMessage("Usage: /write <path> <content>");
        return true;
      }
      const relPath = rest.slice(0, spaceIdx);
      const content = rest.slice(spaceIdx + 1);
      try {
        await writeWorkspaceFile(relPath, content);
        addSystemMessage(`✅ Written to ${relPath}`);
      } catch (err: any) {
        addSystemMessage(`❌ ${err?.message || err}`);
      }
      return true;
    }

    // /model <name> — switch model
    if (trimmed.startsWith("/model ")) {
      const modelArg = trimmed.slice(7).trim();
      const match = models.find(m => m.id === modelArg || m.label?.toLowerCase().includes(modelArg.toLowerCase()));
      if (match) {
        await persistSelectedModel(match.id, { announce: true });
      } else {
        addSystemMessage(`❌ Model not found. Available: ${models.map(m => m.id).join(", ")}`);
      }
      return true;
    }

    // /search <query> — web search via backend
    if (trimmed.startsWith("/search ")) {
      const query = trimmed.slice(8).trim();
      if (!query) { addSystemMessage("Usage: /search <query>"); return true; }
      addSystemMessage(`🔍 Searching: "${query}"...`);
      try {
        const { apiFetch, API_BASE } = await import("../services/store");
        const res = await apiFetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const results = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
        if (results.length === 0) {
          addSystemMessage(`🔍 No results found for "${query}"`);
        } else {
          const formatted = results.slice(0, 5).map((r: any, i: number) =>
            `${i + 1}. **${r.title || r.name || "Result"}**\n   ${r.snippet || r.description || r.url || ""}`
          ).join("\n\n");
          addSystemMessage(`🔍 Search results for "${query}":\n\n${formatted}`);
        }
      } catch (err: any) {
        addSystemMessage(`❌ Search error: ${err?.message || err}`);
      }
      return true;
    }

    // /skill [name] — list or use marketplace skills
    if (trimmed === "/skill" || trimmed.startsWith("/skill ")) {
      const skillArg = trimmed.slice(6).trim();
      try {
        const { apiFetch, API_BASE } = await import("../services/store");
        if (!skillArg) {
          // List available skills
          const res = await apiFetch(`${API_BASE}/skills`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const skills = Array.isArray(data.skills) ? data.skills : (Array.isArray(data) ? data : []);
          if (skills.length === 0) {
            addSystemMessage("🧩 No skills available. Visit the marketplace to install skills.");
          } else {
            const list = skills.slice(0, 10).map((s: any) =>
              `• **${s.name || s.id}** — ${s.description || "No description"}`
            ).join("\n");
            addSystemMessage(`🧩 Available Skills:\n\n${list}\n\nUse \`/skill <name>\` to activate.`);
          }
        } else {
          // Activate a specific skill
          addSystemMessage(`🧩 Activating skill: "${skillArg}"...`);
          const res = await apiFetch(`${API_BASE}/skills/${encodeURIComponent(skillArg)}/activate`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          addSystemMessage(`✅ Skill "${skillArg}" activated. ${data.message || ""}`);
        }
      } catch (err: any) {
        addSystemMessage(`❌ Skill error: ${err?.message || err}`);
      }
      return true;
    }

    // /git status — show git status
    if (trimmed === "/git status" || trimmed === "/gs") {
      try {
        const st = await gitStatus();
        const lines = [`🔀 Branch: **${st.branch}**`];
        if (st.ahead > 0 || st.behind > 0) lines.push(`↑${st.ahead} ↓${st.behind}`);
        if (st.isClean) {
          lines.push("✅ Working tree clean");
        } else {
          lines.push(`📝 ${st.changes.length} change(s):`);
          st.changes.slice(0, 20).forEach(c => lines.push(`  ${c.status} ${c.file}`));
          if (st.changes.length > 20) lines.push(`  ... and ${st.changes.length - 20} more`);
        }
        addSystemMessage(lines.join("\n"));
      } catch (err: any) { addSystemMessage(`❌ ${err?.message || err}`); }
      return true;
    }

    // /git diff [--staged] [file] — show diff
    if (trimmed.startsWith("/git diff") || trimmed === "/gd") {
      try {
        const args = trimmed.replace("/gd", "/git diff").slice(10).trim();
        const staged = args.includes("--staged") || args.includes("--cached");
        const filePath = args.replace("--staged", "").replace("--cached", "").trim() || undefined;
        const diff = await gitDiff(staged, filePath);
        addSystemMessage(diff ? `\`\`\`diff\n${diff.slice(0, 3000)}\n\`\`\`` : "No changes to diff.");
      } catch (err: any) { addSystemMessage(`❌ ${err?.message || err}`); }
      return true;
    }

    // /git log [n] — show recent commits
    if (trimmed.startsWith("/git log") || trimmed === "/gl") {
      try {
        const countArg = trimmed.replace("/gl", "/git log").slice(9).trim();
        const count = parseInt(countArg) || 10;
        const entries = await gitLog(count);
        const lines = entries.map(e => `\`${e.shortHash}\` ${e.message} — *${e.author}* (${e.date.slice(0, 10)})`);
        addSystemMessage(lines.length ? lines.join("\n") : "No commits found.");
      } catch (err: any) { addSystemMessage(`❌ ${err?.message || err}`); }
      return true;
    }

    // /git commit <message> — add all and commit
    if (trimmed.startsWith("/git commit ") || trimmed.startsWith("/gc ")) {
      try {
        const msg = trimmed.startsWith("/gc ") ? trimmed.slice(4).trim() : trimmed.slice(12).trim();
        if (!msg) { addSystemMessage("Usage: /git commit <message>"); return true; }
        const result = await gitCommit(msg, true);
        addSystemMessage(`✅ Committed \`${result.hash.slice(0, 8)}\`: ${result.message} (${result.filesChanged} file(s))`);
      } catch (err: any) { addSystemMessage(`❌ ${err?.message || err}`); }
      return true;
    }

    // /git branch — list branches
    if (trimmed === "/git branch" || trimmed === "/gb") {
      try {
        const branches = await gitBranchList();
        addSystemMessage(branches.length ? branches.join("\n") : "No branches found.");
      } catch (err: any) { addSystemMessage(`❌ ${err?.message || err}`); }
      return true;
    }

    // /screenshot — capture screen
    if (trimmed === "/screenshot" || trimmed === "/ss") {
      try {
        addSystemMessage("📸 Capturing screen...");
        const result = await captureScreen(true);
        addSystemMessage(`✅ Screenshot captured (${result.width}×${result.height})${result.filePath ? `\nSaved: ${result.filePath}` : ""}`);
      } catch (err: any) { addSystemMessage(`❌ ${err?.message || err}`); }
      return true;
    }

    // /help — show available commands
    if (trimmed === "/help") {
      addSystemMessage(
        "📖 **Available Commands:**\n\n" +
        "• `/new` or `/clear` — Start new chat\n" +
        "• `/ls [path]` — List workspace directory\n" +
        "• `/read <path>` — Read file content\n" +
        "• `/write <path> <content>` — Write to file\n" +
        "• `/model <name>` — Switch AI model\n" +
        "• `/search <query>` — Web search\n" +
        "• `/skill [name]` — List or activate skills\n" +
        "• `/git status` `/gs` — Git status\n" +
        "• `/git diff` `/gd` — Git diff\n" +
        "• `/git log [n]` `/gl` — Recent commits\n" +
        "• `/git commit <msg>` `/gc` — Commit all\n" +
        "• `/git branch` `/gb` — List branches\n" +
        "• `/screenshot` `/ss` — Capture screen\n" +
        "• `/history` — Show session info\n" +
        "• `/export [format]` — Export session (markdown/json)\n" +
        "• `/fork [index]` — Fork session from a message\n" +
        "• `/find <query>` — Search across all sessions\n" +
        "• `/context` — Show context window usage\n" +
        "• `/help` — Show this help"
      );
      return true;
    }

    // /history — show session info
    if (trimmed === "/history") {
      addSystemMessage(`Session: ${sessionIdRef.current}\nMessages: ${messages.length}\nAgent: ${activeAgent?.name || activeAgentId || "none"}`);
      return true;
    }

    // /export [format] — export session as markdown or JSON (P7.4)
    if (trimmed === "/export" || trimmed.startsWith("/export ")) {
      const format = trimmed.slice(7).trim() || "markdown";
      if (!token) { addSystemMessage("❌ Not logged in"); return true; }
      try {
        addSystemMessage("📤 Exporting session...");
        const { exportSession } = await import("../services/extensionApi");
        const data = await exportSession(token, sessionIdRef.current, format as any);
        if (data.markdown) {
          addSystemMessage(`📋 **Session Export (Markdown)**\n\n${data.markdown.substring(0, 3000)}${data.markdown.length > 3000 ? "\n\n... (truncated)" : ""}`);
        } else {
          addSystemMessage(`📋 **Session Export (JSON)**\n\n\`\`\`json\n${JSON.stringify(data, null, 2).substring(0, 2000)}\n\`\`\``);
        }
      } catch (err: any) {
        addSystemMessage(`❌ Export failed: ${err?.message || err}`);
      }
      return true;
    }

    // /fork [messageIndex] — fork session from a point (P7.4)
    if (trimmed === "/fork" || trimmed.startsWith("/fork ")) {
      const indexArg = trimmed.slice(5).trim();
      if (!token) { addSystemMessage("❌ Not logged in"); return true; }
      try {
        const { forkSession } = await import("../services/extensionApi");
        const fromIdx = indexArg ? parseInt(indexArg) : undefined;
        const result = await forkSession(token, sessionIdRef.current, fromIdx);
        addSystemMessage(`✅ Session forked! New session: ${result.newSessionId} (${result.messageCount} messages copied)`);
      } catch (err: any) {
        addSystemMessage(`❌ Fork failed: ${err?.message || err}`);
      }
      return true;
    }

    // /find <query> — search across all sessions (P7.4)
    if (trimmed.startsWith("/find ")) {
      const query = trimmed.slice(6).trim();
      if (!query) { addSystemMessage("Usage: /find <search query>"); return true; }
      if (!token) { addSystemMessage("❌ Not logged in"); return true; }
      try {
        const { searchMessages } = await import("../services/extensionApi");
        const result = await searchMessages(token, query, 10);
        if (result.results.length === 0) {
          addSystemMessage(`🔍 No messages found matching "${query}"`);
        } else {
          const lines = result.results.map((r: any, i: number) =>
            `${i + 1}. **${r.sessionTitle}** (${r.role})\n   ${r.snippet}`
          ).join("\n\n");
          addSystemMessage(`🔍 Found ${result.total} result(s) for "${query}":\n\n${lines}`);
        }
      } catch (err: any) {
        addSystemMessage(`❌ Search failed: ${err?.message || err}`);
      }
      return true;
    }

    // /context — show context window usage (P7.5)
    if (trimmed === "/context") {
      if (!token) { addSystemMessage("❌ Not logged in"); return true; }
      try {
        const { apiFetch, API_BASE } = await import("../services/store");
        const res = await apiFetch(`${API_BASE}/agent-intelligence/sessions/${encodeURIComponent(sessionIdRef.current)}/context-usage`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const usage = await res.json();
        const bar = "█".repeat(Math.round(usage.usagePercent / 5)) + "░".repeat(20 - Math.round(usage.usagePercent / 5));
        const lines = [
          `📊 **Context Window Usage**`,
          `\`[${bar}]\` ${usage.usagePercent}%`,
          `Tokens: ${usage.estimatedTokens.toLocaleString()} / ${usage.contextWindowSize.toLocaleString()}`,
          `Messages: ${usage.messageCount}`,
          ``,
          `**Breakdown:**`,
          `• System Prompt: ${usage.breakdown?.systemPrompt || 0} tokens`,
          `• Chat History: ${usage.breakdown?.history || 0} tokens`,
          `• Memories: ${usage.breakdown?.memories || 0} tokens`,
          `• Tool Schemas: ${usage.breakdown?.toolSchemas || 0} tokens`,
          `• Active Plan: ${usage.breakdown?.plan || 0} tokens`,
        ];
        if (usage.recommendations?.length > 0) {
          lines.push(``, `**Recommendations:**`);
          usage.recommendations.forEach((r: string) => lines.push(`💡 ${r}`));
        }
        addSystemMessage(lines.join("\n"));
      } catch (err: any) {
        addSystemMessage(`❌ Context usage failed: ${err?.message || err}`);
      }
      return true;
    }

    // P6.2: Try resolving custom slash commands via backend
    if (token && trimmed.startsWith("/")) {
      const cmdName = trimmed.split(/\s+/)[0].slice(1); // e.g. "review" from "/review foo"
      const cmdArgs = trimmed.slice(cmdName.length + 2).trim();
      try {
        const { resolveSlashCommand } = await import("../services/extensionApi");
        const result = await resolveSlashCommand(token, cmdName, cmdArgs);
        if (result.prompt && !result.error) {
          // Custom command resolved — send the expanded prompt as a chat message
          addSystemMessage(`🔧 Running custom command: /${result.command}`);
          // Don't return true — let it fall through to handleSend with the expanded prompt
          // We'll handle this by directly sending the resolved prompt
          setTimeout(() => handleSend(result.prompt), 50);
          return true;
        }
      } catch {
        // Not a custom command — fall through
      }
    }

    return false;
  }, [models, messages, activeAgent, activeAgentId, token, persistSelectedModel]);

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText || input).trim();
      const targetSessionId = sessionIdRef.current;
      const targetRuntime = sessionRuntimeRef.current[targetSessionId] || createEmptySessionRuntimeState();
      const isSyntheticContinueTurn = isSyntheticContinuePrompt(text);
      const useDesktopLocalModel = isDesktopLocalModelId(selectedModel);
      const activeInst = activeInstanceId
        ? instances.find((instance) => instance.id === activeInstanceId)
        : undefined;
      const fallbackCloudModel = activeInst?.resolvedModel && !isDesktopLocalModelId(activeInst.resolvedModel)
        ? activeInst.resolvedModel
        : undefined;

      if ((!text && pendingAttachments.length === 0) || targetRuntime.sending || uploadingAttachments) {
        return;
      }

      clearAutoContinueTimer();
      clearPendingAutoContinue();
      if (!isSyntheticContinueTurn) {
        autoContinueCountRef.current = 0;
      }

      if (!overrideText) {
        setInput("");
      }

      if (text.startsWith("/") && pendingAttachments.length === 0) {
        const handled = await handleSlashCommand(text);
        if (handled) {
          return;
        }
      }

      const outboundText = serializeMessageForModel(text, pendingAttachments);
      const effectiveChatMode = resolveEffectiveChatMode(
        chatMode,
        text,
        pendingAttachments.length,
        Boolean(activePlan),
      );
      const shouldEscalateLocalTurn = useDesktopLocalModel
        && shouldEscalateDesktopLocalTurn(effectiveChatMode, Boolean(token));
      const currentMessagesForSession = tabMessagesCache.current[targetSessionId] || messages;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text || `Sent ${pendingAttachments.length} attachment${pendingAttachments.length > 1 ? "s" : ""}`,
        attachments: pendingAttachments,
        createdAt: Date.now(),
      };
      const assistantId = `a-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        createdAt: Date.now(),
      };

      updateSessionMessages(
        targetSessionId,
        (prev) => [...prev, ...(isSyntheticContinueTurn ? [] : [userMsg]), assistantMsg],
        { persist: true },
      );
      responseInterruptedRef.current = false;
      setPendingAttachments([]);
      setSendStartedAt(Date.now());
      setActiveToolRun(null);
      setContinuePrompt(null);
      setStreamFeedback({
        tone: "info",
        label: effectiveChatMode === "agent" ? "Agent 正在处理任务" : "正在生成回复",
        detail: effectiveChatMode === chatMode
          ? "等待首个响应分片"
          : "检测到普通对话，已跳过工具链",
      });
      patchSessionRuntime(targetSessionId, { sending: true });
      if (targetSessionId === sessionIdRef.current) {
        setBallState("thinking");
      }

      trackEvent("chat_send", {
        hasAttachments: pendingAttachments.length > 0,
        model: selectedModel,
        mode: effectiveChatMode,
        requestedMode: chatMode,
      });

      const shouldStreamTTS = ttsEnabled && token && voiceInitiatedRef.current;
      let audioPlayer: AudioQueuePlayer | null = null;
      let sentenceAcc: SentenceAccumulator | null = null;

      if (shouldStreamTTS) {
        audioPlayer = new AudioQueuePlayer(
          token!,
          () => setBallState("idle"),
          (playing) => {
            if (playing) {
              setBallState("speaking");
            }
          },
          (message) => {
            setStreamFeedback({
              tone: "warning",
              label: "语音播报不可用",
              detail: message,
            });
          },
        );
        audioPlayerRef.current = audioPlayer;
        sentenceAcc = new SentenceAccumulator((sentence) => {
          audioPlayer!.enqueue(sentence, detectLang(sentence));
        });
        sentenceAccRef.current = sentenceAcc;
      }

      if (token || useDesktopLocalModel) {
        const authToken = token;
        const history = currentMessagesForSession.slice(-25).map((message) => ({
          role: message.role,
          content: serializeMessageForModel(message.content, message.attachments || []),
        }));
        const currentModelLabel = getConversationModelLabel(selectedModel, models, activeInst);
        const systemMessages = buildConversationSystemMessages(activeAgent, currentModelLabel);

        if (systemMessages.length > 0) {
          history.unshift(...systemMessages);
        }
        history.push({ role: "user", content: outboundText });

        const chunkHandler = (chunk: string) => {
          if (targetSessionId === sessionIdRef.current && !audioPlayer?.playing) {
            setBallState("speaking");
          }
          setStreamFeedback((current) => {
            if (current?.tone === "error") return current;
            if (current?.label === "正在输出回复") return current;
            return {
              tone: "info",
              label: "正在输出回复",
              detail: "内容持续生成中",
            };
          });
          appendChunk(targetSessionId, assistantId, chunk);
          sentenceAcc?.push(chunk);
        };

        const metaHandler = (meta: { resolvedModel?: string; resolvedModelLabel?: string; plan?: AgentPlan }) => {
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
        };

        // P0: Real-time SSE event handler — captures usage, turn_info, approval events
        const eventHandler = (event: StreamEvent) => {
          if (event.type === "usage") {
            setStreamCost({
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              cacheReadTokens: event.cacheReadTokens || 0,
              totalCostUsd: event.totalCostUsd || 0,
              model: event.model || "",
            });
            // Also update the token bar with real-time data
            if (event.inputTokens + event.outputTokens > 0) {
              setTokenUsage((prev) => prev ? {
                ...prev,
                used: event.inputTokens + event.outputTokens,
                percent: prev.total > 0 ? Math.round(((event.inputTokens + event.outputTokens) / prev.total) * 100) : prev.percent,
              } : prev);
            }
          } else if (event.type === "turn_info") {
            if (event.isCompacted) {
              setCompactionInfo({
                isCompacted: true,
                turnIndex: event.turnIndex,
                contextTokens: event.contextTokens,
              });
            }
          } else if (event.type === "thinking") {
            setStreamFeedback({
              tone: "info",
              label: "正在思考",
              detail: event.text || "分析上下文和任务中",
            });
          } else if (event.type === "tool_start") {
            setActiveToolRun({
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              status: "starting",
              startedAt: Date.now(),
            });
            setStreamFeedback({
              tone: "info",
              label: `正在执行 ${event.toolName}`,
              detail: summarizeToolInput(event.input),
            });
          } else if (event.type === "tool_progress") {
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
          } else if (event.type === "tool_result") {
            setActiveToolRun(null);
            setStreamFeedback({
              tone: event.success ? "success" : "error",
              label: event.success ? `${event.toolName} 已完成` : `${event.toolName} 执行失败`,
              detail: event.success
                ? `${Math.max(1, Math.round(event.durationMs / 1000))}s`
                : event.error,
            });
          } else if (event.type === "tool_error") {
            const timedOut = /timeout|timed out|ETIMEDOUT/i.test(event.error);
            setActiveToolRun(null);
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
          } else if (event.type === "approval_required") {
            // Dispatch event for FloatingBall approval badge
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
          } else if (event.type === "done") {
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
          } else if (event.type === "error") {
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
        };

        const doneHandler = (resolve: () => void) => () => {
          finalizeMessage(targetSessionId, assistantId);
          sentenceAcc?.flush();
          sessionAbortControllersRef.current[targetSessionId] = null;
          if (targetSessionId === sessionIdRef.current) {
            abortRef.current = null;
          }
          patchSessionRuntime(targetSessionId, { sending: false });
          setSendStartedAt(null);
          setActiveToolRun(null);
          // Clear stream cost after completion, refresh token bar
          setStreamCost(null);
          fetchTokenUsage();
          if (authToken) {
            getActivePlan(authToken, targetSessionId)
              .then((plan) => {
                if (plan) {
                  setPlanForSession(targetSessionId, plan);
                }
              })
              .catch(() => {});
          }
          resolve();
        };

        const errorHandler = (resolve: () => void) => (err: string) => {
          updateSessionMessages(
            targetSessionId,
            (prev) => prev.map((message) => (
              message.id === assistantId
                ? {
                    ...message,
                    content: message.content.trim().length > 0 ? message.content : `Error: ${err || '未知错误'}`,
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
        };

        if (useDesktopLocalModel) {
          const controller = new AbortController();
          let shouldFallbackToCloud = false;
          sessionAbortControllersRef.current[targetSessionId] = controller;
          if (targetSessionId === sessionIdRef.current) {
            abortRef.current = controller;
          }

          if (shouldEscalateLocalTurn) {
            shouldFallbackToCloud = true;
            updateSessionMessages(
              targetSessionId,
              (prev) => prev.map((message) => (
                message.id === assistantId
                  ? {
                      ...message,
                      meta: {
                        resolvedModel: fallbackCloudModel || selectedModel,
                        resolvedModelLabel: fallbackCloudModel
                          ? getConversationModelLabel(fallbackCloudModel, models, activeInst) || undefined
                          : "Cloud Tool Orchestration",
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
          } else {
            // Pre-flight: check if local model + binary are available
            const readiness = await checkDesktopLocalModelReady();
            if (!readiness.ready) {
              // No local model available — skip local attempt, fall through to cloud
              shouldFallbackToCloud = Boolean(authToken);
              if (!shouldFallbackToCloud) {
                updateSessionMessages(
                  targetSessionId,
                  (prev) => prev.map((existing) => (
                    existing.id === assistantId
                      ? {
                          ...existing,
                          content: `⚠️ ${readiness.message || '本地模型不可用'}`,
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

              if (!shouldFallbackToCloud) {
                sessionAbortControllersRef.current[targetSessionId] = null;
                if (targetSessionId === sessionIdRef.current) {
                  abortRef.current = null;
                }
                patchSessionRuntime(targetSessionId, { sending: false });
                setSendStartedAt(null);
                setActiveToolRun(null);
                voiceInitiatedRef.current = false;
                if (targetSessionId === sessionIdRef.current && !audioPlayer?.playing) {
                  setBallState("idle");
                }
                return;
              }
            }

            if (readiness.ready) {
              updateSessionMessages(
                targetSessionId,
                (prev) => prev.map((message) => (
                  message.id === assistantId
                    ? {
                        ...message,
                        meta: {
                          resolvedModel: normalizeDesktopLocalModelId(selectedModel),
                          resolvedModelLabel: getDesktopLocalModelLabel(selectedModel),
                        },
                      }
                    : message
                )),
              );

              try {
                const localSidecar = localSidecarRef.current || new LocalLLMSidecar();
                localSidecarRef.current = localSidecar;
                const localModelLabel = getDesktopLocalModelLabel(selectedModel);
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

                for await (const chunk of localSidecar.chatStream(history)) {
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

                if (!controller.signal.aborted) {
                  finalizeMessage(targetSessionId, assistantId);
                  sentenceAcc?.flush();
                  setStreamFeedback(null);

                  if (authToken) {
                    let syncMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
                    syncMessages.push({ role: 'user', content: outboundText });
                    updateSessionMessages(targetSessionId, (prev) => {
                      const aMsg = prev.find((m) => m.id === assistantId);
                      if (aMsg?.content?.trim()) {
                        syncMessages.push({ role: 'assistant', content: aMsg.content });
                      }
                      return prev;
                    });
                    if (syncMessages.length > 1) {
                      void syncLocalConversation(authToken, targetSessionId, syncMessages, normalizeDesktopLocalModelId(selectedModel));
                    }
                  }
                }
              } catch (error: any) {
                const message = error?.message || String(error);
                shouldFallbackToCloud = Boolean(authToken);
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
                  patchSessionRuntime(targetSessionId, { sending: false });
                  setSendStartedAt(null);
                  setActiveToolRun(null);
                  voiceInitiatedRef.current = false;
                  if (targetSessionId === sessionIdRef.current && !audioPlayer?.playing) {
                    setBallState("idle");
                  }
                }
              }
            }
          }

          if (!shouldFallbackToCloud) {
            return;
          }
        }

        if (!authToken) {
          updateSessionMessages(
            targetSessionId,
            (prev) => prev.map((message) => (
              message.id === assistantId
                ? {
                    ...message,
                    content: 'Error: Authentication token is required for cloud chat.',
                    error: true,
                    streaming: false,
                  }
                : message
            )),
            { persist: true, markUnread: true },
          );
          patchSessionRuntime(targetSessionId, { sending: false });
          setSendStartedAt(null);
          setActiveToolRun(null);
          voiceInitiatedRef.current = false;
          if (targetSessionId === sessionIdRef.current && !audioPlayer?.playing) {
            setBallState('idle');
          }
          return;
        }

        await new Promise<void>((resolve) => {
          let controller: AbortController;
          if (activeInstanceId) {
            controller = streamChat({
              instanceId: activeInstanceId,
              message: outboundText,
              sessionId: targetSessionId,
              token: authToken,
              model: useDesktopLocalModel ? fallbackCloudModel : selectedModel || undefined,
              mode: effectiveChatMode,
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
              model: useDesktopLocalModel ? fallbackCloudModel : selectedModel || undefined,
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
      }

      patchSessionRuntime(targetSessionId, { sending: false });
      setSendStartedAt(null);

      const autoContinuePrompt = pendingAutoContinuePromptRef.current;
      const autoContinueReason = pendingAutoContinueReasonRef.current;
      const autoContinueSessionId = pendingAutoContinueSessionIdRef.current;
      if (
        !responseInterruptedRef.current
        && autoContinuePrompt
        && autoContinueReason
        && autoContinueSessionId === targetSessionId
        && autoContinueCountRef.current < CHAT_AUTO_CONTINUE_LIMIT
      ) {
        autoContinueCountRef.current += 1;
        clearPendingAutoContinue();
        setStreamFeedback({
          tone: "warning",
          label: autoContinueReason === "tool_use" ? "自动继续任务" : "自动续写中",
          detail: autoContinueReason === "tool_use"
            ? "继续未完成的步骤，避免任务中断"
            : "继续补全被长度上限截断的回复",
        });
        autoContinueTimerRef.current = window.setTimeout(() => {
          autoContinueTimerRef.current = null;
          if (sessionIdRef.current !== targetSessionId) {
            return;
          }
          void handleSend(autoContinuePrompt);
        }, 180);
      } else if (
        autoContinuePrompt
        && autoContinueReason
        && autoContinueSessionId === targetSessionId
        && autoContinueCountRef.current >= CHAT_AUTO_CONTINUE_LIMIT
      ) {
        setStreamFeedback({
          tone: "warning",
          label: autoContinueReason === "tool_use" ? "任务仍可继续" : "回复仍可继续",
          detail: "自动续写达到当前上限，可点击 Continue 继续",
        });
      }

      voiceInitiatedRef.current = false;
      if (targetSessionId === sessionIdRef.current && !audioPlayer?.playing) {
        setBallState("idle");
      }
    },
    [
      input,
      activeAgent,
      activeAgentId,
      activeInstanceId,
      token,
      selectedModel,
      instances,
      messages,
      pendingAttachments,
      appendChunk,
      clearAutoContinueTimer,
      clearPendingAutoContinue,
      finalizeMessage,
      patchSessionRuntime,
      setPlanForSession,
      ttsEnabled,
      serializeMessageForModel,
      uploadingAttachments,
      handleSlashCommand,
      chatMode,
      activePlan,
      updateSessionMessages,
      queueAutoContinue,
    ],
  );

  const handleContinue = useCallback(() => {
    if (!continuePrompt || sending) return;
    autoContinueCountRef.current = 0;
    clearAutoContinueTimer();
    clearPendingAutoContinue();
    void handleSend(continuePrompt);
  }, [clearAutoContinueTimer, clearPendingAutoContinue, continuePrompt, handleSend, sending]);

  const pendingAttachmentSummary = useMemo(
    () => pendingAttachments.map((attachment) => attachment.originalName).join(", "),
    [pendingAttachments],
  );

  const handleAttachmentChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (!files.length || !token) return;

      try {
        setUploadingAttachments(true);
        const uploaded = await Promise.all(files.map((file) => uploadChatAttachment(file, token)));
        setPendingAttachments((prev) => [...prev, ...uploaded]);
      } catch (error: any) {
        window.alert(error?.message || "Failed to upload attachment");
      } finally {
        setUploadingAttachments(false);
      }
    },
    [token],
  );

  const removePendingAttachment = useCallback((fileName: string) => {
    setPendingAttachments((prev) => prev.filter((attachment) => attachment.fileName !== fileName));
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (!files.length || !token) return;
      try {
        setUploadingAttachments(true);
        const uploaded = await Promise.all(files.map((file) => uploadChatAttachment(file, token)));
        setPendingAttachments((prev) => [...prev, ...uploaded]);
      } catch (error: any) {
        window.alert(error?.message || "Failed to upload attachment");
      } finally {
        setUploadingAttachments(false);
      }
    },
    [token],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only hide overlay when leaving the panel itself
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  // Sync voiceState with ballState
  useEffect(() => {
    if (voiceState === "recording") setBallState("recording");
    else if (voiceState === "processing") setBallState("thinking");
    else if (voiceState === "speaking") setBallState("speaking");
    else if (!sending) setBallState("idle");
  }, [sending, voiceState]);

  // Handle voice transcript — auto-send with TTS
  const handleVoiceTranscript = useCallback(
    (text: string) => {
      voiceInitiatedRef.current = true;
      setInput(text);
      handleSend(text);
    },
    [handleSend],
  );

  const handleDesktopApprovalDecision = useCallback(
    async (decision: "approved" | "rejected") => {
      if (!token || !pendingApproval) {
        return;
      }

      try {
        const response = await respondDesktopApproval(token, pendingApproval.approvalId, {
          decision,
          rememberForSession: decision === "approved" ? rememberApprovalForSession : false,
        });
        window.dispatchEvent(new CustomEvent("agentrix:approval-response-local", { detail: response.approval }));
        await fetchDesktopSyncState(token).then(applyDesktopSyncState).catch(() => {});
      } catch (error: any) {
        window.alert(error?.message || "Failed to submit approval decision");
      }
    },
    [applyDesktopSyncState, pendingApproval, rememberApprovalForSession, token],
  );

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      onClose();
    }
    // Ctrl+T → new tab
    if (e.ctrlKey && e.key === "t") {
      e.preventDefault();
      createNewTab();
    }
    // Ctrl+W → close current tab
    if (e.ctrlKey && e.key === "w") {
      e.preventDefault();
      closeTab(activeTabId);
    }
  };

  const handleNewChat = () => {
    createNewTab();
    setHistoryOpen(false);
    setFileTreeOpen(false);
  };

  const loadSession = useCallback(async (sid: string) => {
    const stored = await loadSessionMessages(sid);
    if (stored.length === 0) return;
    abortSession(sessionIdRef.current);
    audioPlayerRef.current?.stopAll();
    sentenceAccRef.current?.reset();
    sessionIdRef.current = sid;
    abortRef.current = sessionAbortControllersRef.current[sid] || null;
    setMessages(stored);
    setPendingAttachments([]);
    setInput("");
    setBallState("idle");
    setHistoryOpen(false);
  }, [abortSession]);

  const deleteSession = useCallback(async (sid: string) => {
    await removeSession(sid);
    await refreshHistory();
    if (sid === sessionIdRef.current) {
      handleNewChat();
    }
  }, [refreshHistory]);

  // Listen for custom events from tray / floating ball context menu
  useEffect(() => {
    const onNewChat = () => handleNewChat();
    const onOpenSettings = () => setSettingsOpen(true);
    window.addEventListener("agentrix:new-chat", onNewChat);
    window.addEventListener("agentrix:open-settings", onOpenSettings);
    return () => {
      window.removeEventListener("agentrix:new-chat", onNewChat);
      window.removeEventListener("agentrix:open-settings", onOpenSettings);
    };
  }, []);

  // Listen for sync connection status changes
  useEffect(() => {
    const handler = (e: Event) => {
      const { connected } = (e as CustomEvent).detail || {};
      setSyncConnected(!!connected);
    };
    window.addEventListener("agentrix:sync-status", handler);
    return () => window.removeEventListener("agentrix:sync-status", handler);
  }, []);

  // Subscribe to notification count changes
  useEffect(() => {
    return subscribeNotifications(() => setUnreadNotifCount(getUnreadCount()));
  }, []);

  // Offline cache lifecycle
  useEffect(() => {
    startOfflineCache();
    const checkQueue = setInterval(() => {
      getQueueLength().then(setOfflineQueueCount).catch(() => {});
    }, 10_000);
    return () => {
      stopOfflineCache();
      clearInterval(checkQueue);
    };
  }, []);

  useEffect(() => {
    const handleState = (event: Event) => {
      applyDesktopSyncState((event as CustomEvent).detail);
    };
    const handleApprovalNew = (event: Event) => {
      const approval = (event as CustomEvent).detail as DesktopRemoteApproval | undefined;
      if (approval?.deviceId === desktopDeviceId && approval.status === "pending" && token) {
        fetchDesktopSyncState(token).then(applyDesktopSyncState).catch(() => {});
      }
    };
    const handleApprovalResponse = (event: Event) => {
      const approval = (event as CustomEvent).detail as DesktopRemoteApproval | undefined;
      if (approval?.approvalId && approval.status !== "pending" && token) {
        fetchDesktopSyncState(token).then(applyDesktopSyncState).catch(() => {});
      }
    };

    window.addEventListener("agentrix:desktop-sync-state", handleState);
    window.addEventListener("agentrix:approval-new", handleApprovalNew as EventListener);
    window.addEventListener("agentrix:approval-response-local", handleApprovalResponse as EventListener);
    return () => {
      window.removeEventListener("agentrix:desktop-sync-state", handleState);
      window.removeEventListener("agentrix:approval-new", handleApprovalNew as EventListener);
      window.removeEventListener("agentrix:approval-response-local", handleApprovalResponse as EventListener);
    };
  }, [applyDesktopSyncState, desktopDeviceId, token]);

  useEffect(() => {
    const handleSocketEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as { event?: string; data?: any } | undefined;
      const eventName = detail?.event;
      const data = detail?.data;
      if (!eventName || !data) {
        return;
      }

      const eventSessionId = typeof data.sessionId === "string" && data.sessionId
        ? data.sessionId
        : undefined;
      const payload = data.payload || data;
      const timestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now();

      if (eventName === "agent:plan_update" && eventSessionId && payload) {
        setPlanForSession(eventSessionId, payload as AgentPlan);
        pushWorkbenchEvent(eventSessionId, {
          id: `plan-${eventSessionId}-${timestamp}`,
          title: "Plan updated",
          detail: typeof payload?.goal === "string" ? payload.goal : "The active plan changed.",
          tone: payload?.status === "failed" ? "error" : payload?.status === "completed" ? "success" : "info",
          createdAt: timestamp,
        });
        if (eventSessionId === sessionIdRef.current && (payload?.status === "awaiting_approval" || payload?.status === "executing")) {
          setTaskWorkbenchOpen(true);
        }
        return;
      }

      if (eventName === "agent:subtask_update") {
        const sessionId = eventSessionId || payload?.subtask?.parentSessionId || sessionIdRef.current;
        if (!sessionId) {
          return;
        }
        pushWorkbenchEvent(sessionId, {
          id: `subtask-${payload?.subtask?.id || timestamp}`,
          title: payload?.action === "created" ? "Subtask created" : "Subtask updated",
          detail: payload?.subtask?.title || payload?.title || "A delegated subtask changed state.",
          tone: "info",
          createdAt: timestamp,
        });
        return;
      }

      if (eventName === "agent:session_update" && eventSessionId) {
        if (payload?.type === "video_task_completed") {
          pushWorkbenchEvent(eventSessionId, {
            id: `video-complete-${payload.taskId || timestamp}`,
            title: "Video task completed",
            detail: payload?.outputUrl || "Background video generation finished.",
            tone: "success",
            createdAt: timestamp,
          });
          if (payload?.message && typeof payload.message.content === "string") {
            updateSessionMessages(eventSessionId, (prev) => {
              if (prev.some((message) => message.id === payload.message.id)) {
                return prev;
              }
              return [
                ...prev,
                {
                  id: payload.message.id || `video-task-${payload.taskId || timestamp}`,
                  role: "assistant",
                  content: payload.message.content,
                  createdAt: payload.message.createdAt || timestamp,
                },
              ];
            }, { persist: true, markUnread: eventSessionId !== sessionIdRef.current });
          }
          if (eventSessionId === sessionIdRef.current) {
            setTaskWorkbenchOpen(true);
          }
          return;
        }

        if (payload?.type === "video_task_failed") {
          pushWorkbenchEvent(eventSessionId, {
            id: `video-failed-${payload.taskId || timestamp}`,
            title: "Video task failed",
            detail: payload?.error || "Background video generation failed.",
            tone: "error",
            createdAt: timestamp,
          });
          if (eventSessionId === sessionIdRef.current) {
            setTaskWorkbenchOpen(true);
          }
          return;
        }

        if (payload?.type === "new_message") {
          pushWorkbenchEvent(eventSessionId, {
            id: `session-message-${eventSessionId}-${timestamp}`,
            title: "Session updated",
            detail: payload?.hasToolCalls ? "Assistant completed a tool-backed turn." : "Assistant completed a turn.",
            tone: "info",
            createdAt: timestamp,
          });
        }
        return;
      }

      if (eventName === "agent:task-completed" && data?.sessionId) {
        pushWorkbenchEvent(data.sessionId, {
          id: `task-completed-${data.sessionId}-${timestamp}`,
          title: "Background task completed",
          detail: data.summary || "An agent task completed on another surface.",
          tone: "success",
          createdAt: timestamp,
        });
        if (data.sessionId === sessionIdRef.current) {
          setTaskWorkbenchOpen(true);
        }
      }
    };

    window.addEventListener("agentrix:socket-event", handleSocketEvent as EventListener);
    return () => window.removeEventListener("agentrix:socket-event", handleSocketEvent as EventListener);
  }, [pushWorkbenchEvent, setPlanForSession, updateSessionMessages]);

  // Listen for clipboard quick-action sends from FloatingBall
  useEffect(() => {
    const handler = (e: Event) => {
      const { prompt } = (e as CustomEvent).detail || {};
      if (prompt) {
        trackEvent("clipboard_action");
        handleSend(prompt);
      }
    };
    window.addEventListener("agentrix:clipboard-send", handler);
    return () => window.removeEventListener("agentrix:clipboard-send", handler);
  }, [handleSend]);

  // Listen for remote session sync updates
  useEffect(() => {
    const handler = (e: Event) => {
      const snapshot = (e as CustomEvent).detail;
      if (snapshot?.sessionId === sessionIdRef.current && snapshot?.messages) {
        // Merge remote messages into current session if it's the active one
        setMessages(snapshot.messages);
      }
    };
    window.addEventListener("agentrix:session-synced", handler);
    return () => window.removeEventListener("agentrix:session-synced", handler);
  }, []);

  // Auto-close chat-panel window when it loses focus (click outside)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        if (win.label === "chat-panel") {
          unlisten = await win.onFocusChanged(({ payload: focused }) => {
            if (!focused && !effectiveProMode) {
              onClose();
            }
          });
        }
      } catch {
        // Not in Tauri — no-op
      }
    })();
    return () => unlisten?.();
  }, [effectiveProMode, onClose]);

  const tauriWindowRef = useRef<Awaited<typeof import('@tauri-apps/api/window')> | null>(null);
  useEffect(() => {
    import('@tauri-apps/api/window').then((mod) => { tauriWindowRef.current = mod; }).catch(() => {});
  }, []);

  const handleTitleBarMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-no-drag='true'], button, select, input, textarea, a")) {
      return;
    }

    event.preventDefault();

    try {
      tauriWindowRef.current?.getCurrentWindow().startDragging();
    } catch {
      // Not in Tauri or drag API unavailable.
    }
  }, []);

  const handleTitleBarDoubleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-no-drag='true'], button, select, input, textarea, a")) {
      return;
    }

    event.preventDefault();
    void toggleWindowMaximize();
  }, [toggleWindowMaximize]);

  const panel: CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: effectiveProMode ? "none" : 480,
    height: "100%",
    maxHeight: effectiveProMode ? "none" : 640,
    background: "var(--bg-panel)",
    borderRadius: windowChromeState.fullscreen ? 0 : "var(--radius)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 8px 40px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255,255,255,0.06)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    animation: effectiveProMode ? "none" : "slideIn 0.2s ease-out",
  };

  return (
    <div
      style={panel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-and-drop overlay */}
      {isDragOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(99, 102, 241, 0.15)",
            border: "2px dashed var(--accent)",
            borderRadius: "inherit",
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--accent)" }}>
            Drop files here to attach
          </div>
        </div>
      )}

      {/* Tab bar */}
      {tabs.length > 1 && (
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onSelect={switchTab}
          onClose={closeTab}
          onNew={createNewTab}
        />
      )}

      {/* Dedicated drag bar for PRO mode (titlebar is too packed with buttons) */}
      {effectiveProMode && (
        <div
          data-tauri-drag-region
          onMouseDown={handleTitleBarMouseDown}
          onDoubleClick={handleTitleBarDoubleClick}
          style={{
            height: 8,
            width: "100%",
            cursor: "grab",
            WebkitAppRegion: "drag",
            background: "transparent",
            flexShrink: 0,
          }}
        />
      )}

      {/* Title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          gap: 10,
          WebkitAppRegion: "drag",
        }}
        onMouseDown={handleTitleBarMouseDown}
        onDoubleClick={handleTitleBarDoubleClick}
        data-tauri-drag-region
      >
        <div data-no-drag="true" style={{ display: "flex", WebkitAppRegion: "no-drag" }}>
          <FloatingBall onTap={onClose} state={ballState} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {compactTitleBar ? (
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--text)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {compactHeaderTitle}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-dim)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {compactHeaderSubtitle}
              </div>
            </div>
          ) : (
            <>
              {/* Instance selector (synced from mobile OpenClaw instances) */}
              <select
                value={activeInstanceId || ""}
                onChange={(e) => setActiveInstance(e.target.value)}
                data-no-drag="true"
                style={{
                  background: "transparent",
                  color: "var(--text)",
                  border: "none",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  maxWidth: 220,
                  WebkitAppRegion: "no-drag",
                }}
              >
                {instances.length === 0 && <option value="">No agent selected</option>}
                {instances.map((inst) => {
                  const label = inst.resolvedModelLabel || inst.resolvedModel || inst.capabilities?.activeModel || "";
                  const provider = inst.resolvedProvider || inst.capabilities?.llmProvider || "";
                  const suffix = label ? ` — ${label}${provider ? ` (${provider})` : ""}` : "";
                  return (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}{suffix}
                    </option>
                  );
                })}
              </select>
              {/* Model selector — always visible so user can switch between custom and platform models */}
              <select
                value={selectedModel}
                onChange={(e) => { void persistSelectedModel(e.target.value); }}
                data-no-drag="true"
                style={{
                  background: "transparent",
                  color: "var(--text-dim)",
                  border: "none",
                  fontSize: 11,
                  cursor: "pointer",
                  marginLeft: 8,
                  maxWidth: 180,
                  WebkitAppRegion: "no-drag",
                }}
              >
                {/* If user has a custom provider model not in platform list, show it as first option */}
                {(() => {
                  const userModel = activeHeaderInstance?.resolvedModel;
                  const userLabel = activeHeaderInstance?.resolvedModelLabel;
                  if (userModel && !models.some((m: any) => m.id === userModel) && !isDesktopLocalModelId(userModel)) {
                    return <option key={userModel} value={userModel}>{userLabel || userModel}</option>;
                  }
                  return null;
                })()}
                <option value={DESKTOP_LOCAL_MODEL_ID}>{DESKTOP_LOCAL_MODEL_LABEL}</option>
                {models.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.label || m.id}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        {!compactTitleBar && (
          <div
            data-no-drag="true"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              WebkitAppRegion: "no-drag",
            }}
          >
            <button onClick={handleNewChat} style={iconBtnStyle} title="New Chat">
              ＋
            </button>
            <button onClick={() => { setFileTreeOpen(!fileTreeOpen); setHistoryOpen(false); }} style={iconBtnStyle} title="Workspace Files">
              📁
            </button>
            <button onClick={() => { setHistoryOpen(!historyOpen); setFileTreeOpen(false); }} style={iconBtnStyle} title="Chat History">
              📋
            </button>
            <div data-no-drag="true" style={{ display: "flex", WebkitAppRegion: "no-drag" }}>
              <NotificationBadge count={unreadNotifCount} onClick={() => { setNotifOpen(!notifOpen); setHistoryOpen(false); setFileTreeOpen(false); }} />
            </div>
            <button onClick={() => setCrossDeviceOpen(true)} style={iconBtnStyle} title="Cross-Device Hub">
              🔗
            </button>
            <button onClick={() => setTaskWorkbenchOpen(true)} style={iconBtnStyle} title="Task Workbench">
              🗂
            </button>
            <button onClick={() => setEconomyPanelOpen(true)} style={iconBtnStyle} title="Agent Economy">
              💰
            </button>
            <button onClick={() => setMemoryPanelOpen(true)} style={iconBtnStyle} title="Memory">
              🧠
            </button>
            <button onClick={() => setDreamPanelOpen(true)} style={iconBtnStyle} title="Dreaming">
              💤
            </button>
            <button onClick={() => setPluginPanelOpen(true)} style={iconBtnStyle} title="Plugin Hub">
              🧩
            </button>
            <button onClick={() => setWikiPanelOpen(true)} style={iconBtnStyle} title="Memory Wiki">
              📝
            </button>
            <button onClick={() => setMcpPanelOpen(true)} style={iconBtnStyle} title="MCP Manager">
              🔌
            </button>
          </div>
        )}
        <div
          data-no-drag="true"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            WebkitAppRegion: "no-drag",
          }}
        >
          <button onClick={() => setSettingsOpen(true)} style={iconBtnStyle} title="Settings">
            ⚙
          </button>
          {!effectiveProMode && (
            <button onClick={() => void enterWindowProMode()} style={windowActionBtnStyle} title="Enter Pro mode">
              Pro
            </button>
          )}
          <button
            onClick={() => void toggleWindowMaximize()}
            style={windowActionBtnStyle}
            title={windowChromeState.maximized ? "Restore window" : "Maximize window (F11 for fullscreen)"}
          >
            {windowChromeState.maximized ? "Restore" : "Max"}
          </button>
          {/* Sync status indicator */}
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: syncConnected ? "#00D2D3" : "var(--text-dim)",
              opacity: syncConnected ? 1 : 0.3,
              transition: "background 0.3s, opacity 0.3s",
            }}
            title={syncConnected ? "Synced across devices" : "Sync disconnected"}
          />
          <button onClick={onClose} style={iconBtnStyle} title="Close (Esc)">
            ✕
          </button>
        </div>
      </div>

      {/* Offline / degraded banner */}
      {networkStatus !== "online" && (
        <div
          style={{
            padding: "6px 16px",
            background: networkStatus === "offline" ? "#FF6B6B22" : "#FECA5722",
            borderBottom: "1px solid var(--border)",
            fontSize: 12,
            color: networkStatus === "offline" ? "#FF6B6B" : "#FECA57",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>{networkStatus === "offline" ? "⚡" : "⚠️"}</span>
          <span>
            {networkStatus === "offline"
              ? "You're offline — messages will sync when reconnected"
              : "Connection unstable — some features may be limited"}
          </span>
        </div>
      )}

      {/* Settings overlay */}
      {settingsOpen && (
        <SettingsPanel
          ttsEnabled={ttsEnabled}
          onTtsToggle={setTtsEnabled}
          onClose={() => setSettingsOpen(false)}
          models={models}
          selectedModel={selectedModel}
          onModelChange={(id) => { void persistSelectedModel(id); }}
        />
      )}

      {/* File tree sidebar */}
      {fileTreeOpen && (
        <FileTreePanel
          workspaceDir={workspaceDir}
          onFileSelect={(path, content) => {
            const ext = path.split(".").pop() || "";
            const preview = content.length > 3000 ? content.slice(0, 3000) + "\n... (truncated)" : content;
            setMessages((prev) => [...prev, {
              id: `sys-${Date.now()}`,
              role: "assistant" as const,
              content: `📄 **${path}**\n\n\`\`\`${ext}\n${preview}\n\`\`\``,
              createdAt: Date.now(),
            }]);
            setFileTreeOpen(false);
          }}
          onClose={() => setFileTreeOpen(false)}
        />
      )}

      {/* Notification center */}
      <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />

      {/* Cross-device hub */}
      {crossDeviceOpen && (
        <CrossDevicePanel
          onClose={() => setCrossDeviceOpen(false)}
          onResumeSession={(sessionId, msgs) => {
            sessionIdRef.current = sessionId;
            setMessages(msgs);
          }}
        />
      )}

      {/* Agent Economy panel */}
      <AgentEconomyPanel open={economyPanelOpen} onClose={() => setEconomyPanelOpen(false)} />

      {/* Memory panel */}
      <MemoryPanel
        open={memoryPanelOpen}
        onClose={() => setMemoryPanelOpen(false)}
        token={token}
        sessionId={sessionIdRef.current}
      />

      <TaskWorkbenchPanel
        open={taskWorkbenchOpen}
        onClose={() => setTaskWorkbenchOpen(false)}
        plan={activePlan}
        taskStatus={desktopTaskStatus}
        timelineEntries={desktopTimelineEntries}
        pendingApproval={pendingApproval}
        events={workbenchEvents}
        checkpoint={activeCheckpoint}
        onApprovePlan={async () => {
          if (!token) return;
          const updated = await approvePlanApi(token, sessionIdRef.current);
          if (updated) setPlanForSession(sessionIdRef.current, updated);
          if (chatMode === "plan") setChatMode("agent");
          handleSend("approve");
        }}
        onRejectPlan={async () => {
          if (!token) return;
          const updated = await rejectPlanApi(token, sessionIdRef.current, "rejected by user");
          if (updated) setPlanForSession(sessionIdRef.current, updated);
        }}
        onOpenApprovals={() => {
          setTaskWorkbenchOpen(false);
          setCrossDeviceOpen(true);
        }}
        onResumeFromCheckpoint={() => {
          if (!token) {
            return;
          }

          void resumeSessionApi(token, sessionIdRef.current)
            .then((data: any) => {
              const resumedSessionId = data?.session?.sessionId || sessionIdRef.current;
              const resumedMessages = Array.isArray(data?.messages)
                ? data.messages.map((message: any) => ({
                    id: String(message.id || `${resumedSessionId}-${message.sequenceNumber || Date.now()}`),
                    role: message.role === "assistant" || message.role === "system" ? message.role : "user",
                    content: String(message.content || ""),
                    createdAt: Date.parse(message.createdAt || "") || Date.now(),
                  }))
                : [];

              if (resumedMessages.length > 0) {
                updateSessionMessages(resumedSessionId, () => resumedMessages, { persist: true });
              }
              if (data?.plan) {
                setPlanForSession(resumedSessionId, data.plan);
              }
              pushWorkbenchEvent(resumedSessionId, {
                id: `resume-${resumedSessionId}-${Date.now()}`,
                title: "Checkpoint restored",
                detail: `Loaded ${resumedMessages.length} messages and current plan state from the server.`,
                tone: "success",
                createdAt: Date.now(),
              });
              setTaskWorkbenchOpen(false);
            })
            .catch(() => {
              setTaskWorkbenchOpen(false);
              if (continuePrompt) {
                handleContinue();
                return;
              }
              handleSend(CHECKPOINT_CONTINUE_PROMPT);
            });
        }}
      />

      {/* OpenClaw 4.5 panels */}
      <DreamPanel open={dreamPanelOpen} onClose={() => setDreamPanelOpen(false)} />
      <PluginPanel open={pluginPanelOpen} onClose={() => setPluginPanelOpen(false)} />
      <MemoryWikiPanel open={wikiPanelOpen} onClose={() => setWikiPanelOpen(false)} />
      <McpPanel open={mcpPanelOpen} onClose={() => setMcpPanelOpen(false)} />

      {/* History sidebar */}
      {historyOpen && (
        <div style={{
          position: "absolute",
          top: 52,
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--bg-panel)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          borderTop: "1px solid var(--border)",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Chat History</span>
            <button onClick={() => setHistoryOpen(false)} style={iconBtnStyle}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {historyEntries.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text-dim)", padding: 40, fontSize: 13 }}>
                No saved conversations yet
              </div>
            ) : (
              historyEntries
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: s.id === sessionIdRef.current ? "rgba(108,92,231,0.15)" : "transparent",
                    border: s.id === sessionIdRef.current ? "1px solid rgba(108,92,231,0.3)" : "1px solid transparent",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "background 0.15s",
                  }}
                  onClick={() => void loadSession(s.id)}
                  onMouseEnter={(e) => { if (s.id !== sessionIdRef.current) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseLeave={(e) => { if (s.id !== sessionIdRef.current) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>
                      {s.messageCount} messages · {new Date(s.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); void deleteSession(s.id); }}
                    style={{ ...iconBtnStyle, width: 20, height: 20, fontSize: 10, opacity: 0.5 }}
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {(desktopTaskStatus !== "idle" || activePlan || pendingApproval) && (
        <div style={taskWorkbenchBannerStyle}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "#7dd3fc", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>
              Task Workbench
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {pendingApproval
                ? `Approval pending · ${pendingApproval.title}`
                : activePlan
                  ? `Plan ${activePlan.status.replace(/_/g, " ")}`
                  : `${desktopTimelineEntries.length} timeline step${desktopTimelineEntries.length === 1 ? "" : "s"} tracked`}
            </div>
          </div>
          <button onClick={() => setTaskWorkbenchOpen(true)} style={taskWorkbenchBannerButtonStyle}>
            Open
          </button>
        </div>
      )}

      {/* Cross-device handoff banner */}
      <div style={{ padding: "0 16px" }}>
        <HandoffBanner
          onAccept={(handoffId, ctx) => {
            const msgs = (ctx as any)?.messages;
            if (Array.isArray(msgs)) {
              setMessages(msgs.map((m: any, i: number) => ({
                id: m.id || `handoff-${i}`,
                role: m.role || "user",
                content: m.content || "",
                createdAt: m.createdAt || Date.now(),
              })));
            }
          }}
        />
        <WearableNotification />
      </div>

      {/* Offline queue indicator */}
      {offlineQueueCount > 0 && networkStatus !== "online" && (
        <div style={{
          margin: "4px 16px", padding: "6px 10px", borderRadius: 6,
          background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)",
          fontSize: 11, color: "#fbbf24", display: "flex", alignItems: "center", gap: 6,
        }}>
          <span>📤</span>
          <span>{offlineQueueCount} 条消息排队中，恢复网络后自动发送</span>
        </div>
      )}

      {/* Compaction status hint */}
      {compactionInfo?.isCompacted && (
        <div style={{
          margin: "8px 16px", padding: "8px 12px", borderRadius: 8,
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
          fontSize: 12, color: "#fbbf24", display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>🗜️</span>
          <span>上下文已自动压缩 · Turn {compactionInfo.turnIndex} · {(compactionInfo.contextTokens / 1000).toFixed(1)}K tokens</span>
          <button
            onClick={() => setCompactionInfo(null)}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#fbbf24", cursor: "pointer", fontSize: 14 }}
          >✕</button>
        </div>
      )}

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "var(--text-dim)",
              marginTop: 80,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
            <div>Ask me anything</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>
              Ctrl+Shift+A for voice · Type / for commands
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onRetry={() => {
            if (msg.error) {
              // Remove error message and re-send the last user message
              const lastUserMsg = messages.filter(m => m.role === 'user').pop();
              if (lastUserMsg) {
                setMessages(prev => prev.filter(m => m.id !== msg.id));
                handleSend(lastUserMsg.content);
              }
            }
          }} />
        ))}
        {activePlan && (
          <PlanPanel
            plan={activePlan}
            onApprove={async () => {
              if (!token) return;
              const updated = await approvePlanApi(token, sessionIdRef.current);
              if (updated) setPlanForSession(sessionIdRef.current, updated);
              // Auto-switch to agent mode to track execution
              if (chatMode === "plan") setChatMode("agent");
              handleSend("approve");
            }}
            onReject={async () => {
              if (!token) return;
              const updated = await rejectPlanApi(token, sessionIdRef.current, "rejected by user");
              if (updated) setPlanForSession(sessionIdRef.current, updated);
            }}
          />
        )}
        {token && sessionIdRef.current && (
          <ContextVisualizer
            sessionId={sessionIdRef.current}
            token={token}
            instanceId={activeInstanceId || undefined}
          />
        )}
        <div ref={listEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* Token usage bar + real-time cost */}
        {(tokenUsage || streamCost) && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "var(--text-dim)", flexShrink: 0 }}>Context</span>
            <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2, transition: "width 0.4s ease",
                width: `${Math.min(tokenUsage?.percent ?? 0, 100)}%`,
                background: (tokenUsage?.percent ?? 0) > 75 ? "#ef4444" : (tokenUsage?.percent ?? 0) > 50 ? "#f59e0b" : "#6C5CE7",
              }} />
            </div>
            <span style={{ fontSize: 9, color: "var(--text-dim)", flexShrink: 0 }}>
              {tokenUsage ? `${tokenUsage.percent}% · ${(tokenUsage.used / 1000).toFixed(1)}k/${(tokenUsage.total / 1000).toFixed(0)}k` : ""}
              {streamCost ? ` · $${streamCost.totalCostUsd.toFixed(4)}` : ""}
              {streamCost?.cacheReadTokens ? " ♻️" : ""}
              {streamCost?.model ? ` · ${streamCost.model.split("/").pop()?.split("-").slice(0, 3).join("-") || streamCost.model}` : ""}
            </span>
          </div>
        )}
        {(visibleStreamFeedback || continuePrompt) && (
          <div
            style={{
              ...getStreamFeedbackStyle(visibleStreamFeedback?.tone || "warning"),
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                {visibleStreamFeedback?.label || "回复可继续"}
              </div>
              {(visibleStreamFeedback?.detail || continuePrompt) && (
                <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {visibleStreamFeedback?.detail || "从当前上下文继续输出，避免重复前文。"}
                </div>
              )}
            </div>
            {continuePrompt && (
              <button
                onClick={handleContinue}
                disabled={sending}
                style={{
                  ...continueActionBtnStyle,
                  opacity: sending ? 0.6 : 1,
                  cursor: sending ? "default" : "pointer",
                }}
              >
                Continue
              </button>
            )}
          </div>
        )}
        <div style={inputToolbarStyle}>
          <div style={modeRailStyle}>
            {CHAT_MODE_OPTIONS.map((option) => {
              const active = option.id === chatMode;
              return (
                <button
                  key={option.id}
                  onClick={() => setChatMode(option.id)}
                  style={{
                    ...modeChipStyle,
                    ...(active ? modeChipActiveStyle : {}),
                  }}
                  title={option.description}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {pendingApproval && (
            <button
              onClick={() => setTaskWorkbenchOpen(true)}
              style={pendingApprovalButtonStyle}
              title="Open the Task Workbench to review approvals"
            >
              Approval pending
            </button>
          )}
          {(desktopTaskStatus !== "idle" || activePlan) && (
            <button
              onClick={() => setTaskWorkbenchOpen(true)}
              style={taskWorkbenchPillStyle}
              title="Open Task Workbench"
            >
              Workbench
            </button>
          )}
          {activePlan && chatMode === "plan" && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "4px 8px", borderRadius: 999,
              border: "1px solid rgba(134,239,172,0.3)", background: "rgba(134,239,172,0.08)", color: "#86efac",
            }}>
              📋 Plan {activePlan.status === "pending" ? "ready" : activePlan.status}
            </span>
          )}
        </div>
        {/* Deep-think indicator */}
        {deepThinkActive && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 12px", borderRadius: 8,
            background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.3)",
            animation: "pulse 2s ease-in-out infinite",
          }}>
            <span style={{ fontSize: 16 }}>🧠</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#c084fc" }}>
              深度思考中…
            </span>
            {deepThinkTargetModel && (
              <span style={{ fontSize: 10, color: "rgba(192,132,252,0.7)" }}>
                → {deepThinkTargetModel}
              </span>
            )}
          </div>
        )}
        {/* Fabric device bar */}
        {fabricDevices.length > 1 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 8,
            background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)",
          }}>
            <span style={{ fontSize: 12, color: "#93c5fd", fontWeight: 600 }}>
              🔗 {fabricDevices.length} 设备
            </span>
            {fabricDevices.map((d, i) => (
              <span key={i} style={{
                fontSize: 11, padding: "2px 6px", borderRadius: 999,
                background: d.isPrimary ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.06)",
                color: d.isPrimary ? "#60a5fa" : "var(--text-dim)",
                border: d.isPrimary ? "1px solid rgba(59,130,246,0.4)" : "1px solid transparent",
              }}>
                {d.isPrimary ? "👑 " : ""}{d.deviceType}
              </span>
            ))}
          </div>
        )}
        {!!pendingAttachments.length && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} title={pendingAttachmentSummary}>
            {pendingAttachments.map((attachment) => (
              <div
                key={attachment.fileName}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)",
                  maxWidth: 260,
                }}
              >
                <span style={{ fontSize: 14 }}>
                  {attachment.kind === "image"
                    ? "🖼️"
                    : attachment.kind === "video"
                      ? "🎬"
                      : attachment.kind === "audio"
                        ? "🎵"
                        : "📎"}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {attachment.originalName}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{formatBytes(attachment.size)}</div>
                </div>
                <button onClick={() => removePendingAttachment(attachment.fileName)} style={chipCloseBtnStyle}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (/ for commands)"
          rows={1}
          style={{
            flex: 1,
            background: "var(--bg-input)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            fontSize: 14,
            resize: "none",
            outline: "none",
            minHeight: 40,
            maxHeight: 120,
            fontFamily: "inherit",
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleAttachmentChange}
          style={{ display: "none" }}
          accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!token || uploadingAttachments}
          style={{
            ...iconBtnStyle,
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "var(--bg-input)",
            border: "1px solid var(--border)",
            opacity: !token || uploadingAttachments ? 0.5 : 1,
          }}
          title="Attach image or file"
        >
          {uploadingAttachments ? "⏳" : "📎"}
        </button>
        <VoiceButton
          onTranscript={handleVoiceTranscript}
          voiceState={voiceState}
          onStateChange={setVoiceState}
          onBargeIn={() => {
            audioPlayerRef.current?.stopAll();
            sentenceAccRef.current?.reset();
          }}
          realtime={{
            enabled: Boolean(token && activeInstanceId),
            instanceId: activeInstanceId || undefined,
            model: selectedModel || undefined,
            onTranscriptFinal: handleRealtimeVoiceTranscript,
            onAgentText: handleRealtimeVoiceAgentText,
            onAgentEnd: handleRealtimeVoiceAgentEnd,
            onDeepThinkStart: handleRealtimeDeepThinkStart,
            onDeepThinkDone: handleRealtimeDeepThinkDone,
            onFabricDevicesChanged: handleRealtimeFabricDevicesChanged,
            onError: handleRealtimeVoiceError,
          }}
        />
        <button
          onClick={() => handleSend()}
          disabled={(!input.trim() && pendingAttachments.length === 0) || sending || uploadingAttachments}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background:
              (input.trim() || pendingAttachments.length > 0) && !sending && !uploadingAttachments ? "var(--accent)" : "var(--bg-input)",
            color: "white",
            border: "none",
            cursor: (input.trim() || pendingAttachments.length > 0) && !sending && !uploadingAttachments ? "pointer" : "default",
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          {sending || uploadingAttachments ? "⏳" : "➤"}
        </button>
        </div>
      </div>

      <ApprovalSheet
        request={approvalSheetRequest}
        rememberForSession={rememberApprovalForSession}
        onRememberChange={setRememberApprovalForSession}
        onApprove={() => void handleDesktopApprovalDecision("approved")}
        onReject={() => void handleDesktopApprovalDecision("rejected")}
      />
    </div>
  );
}

function formatBytes(size: number) {
  if (!size) return "Unknown size";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function buildContinuePrompt() {
  return "Continue from exactly where you stopped. Do not repeat completed content. Preserve the same language, structure, and formatting. If you were in the middle of a tool-driven task, resume the unfinished steps first and only summarize after the task is complete.";
}

function isSyntheticContinuePrompt(value: string) {
  return value === buildContinuePrompt() || value === CHECKPOINT_CONTINUE_PROMPT;
}

function summarizeToolInput(input: unknown) {
  if (input == null) return "准备执行工具";
  if (typeof input === "string") return truncateMiddle(input, 120);
  try {
    return truncateMiddle(JSON.stringify(input), 120);
  } catch {
    return "工具参数已准备";
  }
}

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function getStreamFeedbackStyle(tone: StreamFeedbackTone): CSSProperties {
  if (tone === "success") {
    return {
      padding: "10px 12px",
      borderRadius: 10,
      background: "rgba(74, 222, 128, 0.12)",
      border: "1px solid rgba(74, 222, 128, 0.28)",
      color: "#86efac",
    };
  }

  if (tone === "error") {
    return {
      padding: "10px 12px",
      borderRadius: 10,
      background: "rgba(248, 113, 113, 0.12)",
      border: "1px solid rgba(248, 113, 113, 0.3)",
      color: "#fca5a5",
    };
  }

  if (tone === "warning") {
    return {
      padding: "10px 12px",
      borderRadius: 10,
      background: "rgba(251, 191, 36, 0.12)",
      border: "1px solid rgba(251, 191, 36, 0.3)",
      color: "#fcd34d",
    };
  }

  return {
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(96, 165, 250, 0.12)",
    border: "1px solid rgba(96, 165, 250, 0.28)",
    color: "#93c5fd",
  };
}

const iconBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  background: "transparent",
  color: "var(--text-dim)",
  border: "none",
  cursor: "pointer",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  WebkitAppRegion: "no-drag",
};

const windowActionBtnStyle: CSSProperties = {
  minWidth: 44,
  height: 28,
  borderRadius: 999,
  background: "rgba(255,255,255,0.04)",
  color: "var(--text-dim)",
  border: "1px solid var(--border)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
  padding: "0 10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  WebkitAppRegion: "no-drag",
};

const continueActionBtnStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  background: "rgba(255,255,255,0.12)",
  color: "inherit",
  fontSize: 11,
  fontWeight: 700,
  padding: "8px 12px",
  flexShrink: 0,
};

const chipCloseBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
};

const CHAT_MODE_OPTIONS: Array<{ id: ChatMode; label: string; description: string }> = [
  { id: "ask", label: "Ask", description: "Fast reply mode without tool execution" },
  { id: "agent", label: "Agent", description: "Tool-enabled desktop agent mode" },
  { id: "plan", label: "Plan", description: "Plan-first mode for longer multi-step tasks" },
];

const inputToolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const modeRailStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: 4,
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.04)",
};

const modeChipStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  background: "transparent",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  padding: "6px 10px",
};

const modeChipActiveStyle: CSSProperties = {
  background: "var(--accent)",
  color: "white",
};

const pendingApprovalButtonStyle: CSSProperties = {
  border: "1px solid rgba(251,191,36,0.35)",
  borderRadius: 999,
  background: "rgba(251,191,36,0.08)",
  color: "#fbbf24",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 600,
  padding: "6px 10px",
};

const taskWorkbenchPillStyle: CSSProperties = {
  border: "1px solid rgba(125,211,252,0.32)",
  borderRadius: 999,
  background: "rgba(125,211,252,0.08)",
  color: "#7dd3fc",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
  padding: "6px 10px",
};

const taskWorkbenchBannerStyle: CSSProperties = {
  margin: "8px 16px 0",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(125,211,252,0.18)",
  background: "linear-gradient(90deg, rgba(14,116,144,0.16), rgba(8,47,73,0.12))",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const taskWorkbenchBannerButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  background: "#38bdf8",
  color: "#082f49",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
  padding: "7px 12px",
  flexShrink: 0,
};
