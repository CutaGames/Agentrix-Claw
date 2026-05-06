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
  fetchModels,
  apiFetch,
  API_BASE,
  type ChatMessage,
  type ChatAttachment,
  type DesktopAgent,
  type OpenClawInstance,
  uploadChatAttachment,
} from "../services/store";
import VoiceButton from "./VoiceButton";
import SettingsPanel from "./SettingsPanel";
import VideoStudioPanel from "./VideoStudioPanel";
import PetCreatorPanel from "./PetCreatorPanel";
import SoulPicker from "./SoulPicker";
import WardrobePanel from "./WardrobePanel";
import FileTreePanel from "./FileTreePanel";
import { type TaskRunState, type TaskTimelineEntry, type TaskTimelineStatus } from "./TaskTimeline";
import { gitStatus, gitDiff, gitLog, gitCommit, gitBranchList, type GitFileChange } from "../services/git";
import { captureScreen } from "../services/screenshot";
import NotificationCenter from "./NotificationCenter";
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
  autoAttachMentionedFiles,
} from "../services/workspace";
import { getDesktopDeviceId } from "../services/desktop";
import {
  fetchDesktopSyncState,
  respondDesktopApproval,
  type DesktopRemoteApproval,
} from "../services/desktopSync";
import { pushSessionSync, isSessionSyncConnected } from "../services/sessionSync";
import { trackEvent } from "../services/analytics";
import { compactChatMessagesForContext } from "../services/contextWindow";
import {
  approvePlan as approvePlanApi,
  rejectPlan as rejectPlanApi,
  resumeSession as resumeSessionApi,
  type AgentPlan,
} from "../services/agentIntelligence";
import { fetchOperationsContinuity, fetchOperationsOverview, type OperationsContinuity, type OperationsOverview } from "../services/operations";
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
import WorktreePanel from "./WorktreePanel";
import SkillCanvasPanel from "./SkillCanvasPanel";
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
import DragDropOverlay from "./chatPanel/DragDropOverlay";
import OfflineStatusBanner from "./chatPanel/OfflineStatusBanner";
import WindowDragHandle from "./chatPanel/WindowDragHandle";
import {
  extractDesktopApprovalEventDetail,
  getDesktopApprovalId,
  normalizeDesktopApproval,
  parseDesktopApprovalDecision,
} from "./chatPanel/approvalState";
import MessageList from "./chatPanel/MessageList";
import ToolExecutionBlock from "./chatPanel/ToolExecutionBlock";
import InputZone from "./chatPanel/InputZone";
import ApprovalModal from "./chatPanel/ApprovalModal";
import ChatTitleBar from "./chatPanel/ChatTitleBar";
import DeepOsPanel from "./chatPanel/DeepOsPanel";
import {
  DESKTOP_LOCAL_MODEL_ID,
  ensureDesktopLocalSidecar,
  getDesktopLocalModelLabel,
  isDesktopLocalModelId,
  normalizeDesktopLocalModelId,
  checkDesktopLocalModelReady,
} from "../services/localChat";
import { LocalLLMSidecar } from "../services/localLLM";
import {
  classifyTurnForAuto,
  DEFAULT_EXECUTION_MODE,
  parseExplicitTierHint,
  readExecutionMode,
  resolveExecutionTier,
  writeExecutionMode,
  type ExecutionMode,
} from "../services/turnRouter";
import {
  trimChatMessagesForDesktopMemory,
  trimSessionMessageCache,
} from "./chatPanel/messageRetention";
import {
  buildContinuePrompt,
  isSyntheticContinuePrompt,
} from "./chatPanel/continuePrompt";
import {
  APPROX_CHARS_PER_TOKEN,
  CHECKPOINT_CONTINUE_PROMPT,
  DESKTOP_DIRECT_CONTEXT_BUDGET_TOKENS,
  DESKTOP_LOCAL_CONTEXT_BUDGET_TOKENS,
  MANUAL_MODEL_SELECTION_GRACE_MS,
  RECENT_DESKTOP_FAILURE_WINDOW_MS,
  STALE_DESKTOP_TASK_WINDOW_MS,
  STREAM_CHUNK_FLUSH_MS,
  TASK_LIKE_PROMPT_PATTERN,
} from "./chatPanel/contextBudget";
import { createEmptySessionRuntimeState, type SessionRuntimeState } from "./chatPanel/sessionRuntime";
import { buildToolTimelineEntry, buildToolWorkbenchEvent } from "./chatPanel/toolTimeline";
import { useDesktopSyncRuntime } from "./chatPanel/useDesktopSyncRuntime";
import { useChatPanelRuntimeStore } from "./chatPanel/runtimeStore";
import { useAutoContinue } from "./chatPanel/useAutoContinue";
import { useStreamingTurn } from "./chatPanel/useStreamingTurn";
import { useWorkspaceChangeRevert } from "./chatPanel/useWorkspaceChangeRevert";
import { useRealtimeVoiceTurn } from "./chatPanel/useRealtimeVoiceTurn";

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

function filterWorkspaceChangeList(changes: GitFileChange[]) {
  return changes.filter((change) => !change.file.startsWith(".agentrix/backup/"));
}

interface Props {
  onClose: () => void;
  networkStatus?: NetworkStatus;
  proMode?: boolean;
  onEnterProMode?: () => void;
  restorePersistedTabs?: boolean;
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

function looksIncompleteAssistantOutput(text: string): boolean {
  const value = text.trim();
  if (value.length < 24) return false;

  const codeFenceCount = (value.match(/```/g) || []).length;
  if (codeFenceCount % 2 === 1) return true;

  const lastLine = value.split(/\r?\n/).filter(Boolean).pop() || value;
  if (/[。！？.!?…」』】》`]$/.test(lastLine)) return false;

  if (/[：:]$/.test(lastLine)) return true;
  if (/([（(\[{「『《]$|[,，、;；]$)/.test(lastLine)) return true;
  if (/(让我|我来|我会|现在|接下来|下一步|首先|然后|继续|准备|开始|正在|请稍等|let me|i will|i'll|next|first|then)\s*[：:]?$/i.test(lastLine)) {
    return true;
  }
  if (/[-*]\s*$/.test(lastLine)) return true;

  return false;
}

// Tiny TTL cache so we don't re-hit /openclaw/proxy/:id/skills on every turn.
// Keyed by instance id; cleared every 60s.
const _installedSkillsCache: Map<string, { at: number; skills: Array<{ id?: string; name?: string; version?: string }> }> = new Map();
const INSTALLED_SKILLS_TTL_MS = 60_000;

async function fetchInstalledSkillsCached(
  instanceId: string,
  token: string,
): Promise<Array<{ id?: string; name?: string; version?: string }> | null> {
  if (!instanceId || !token) return null;
  const hit = _installedSkillsCache.get(instanceId);
  const now = Date.now();
  if (hit && now - hit.at < INSTALLED_SKILLS_TTL_MS) return hit.skills;
  try {
    const res = await apiFetch(`${API_BASE}/openclaw/proxy/${instanceId}/skills`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return hit?.skills || null;
    const data = await res.json();
    const enabled = (Array.isArray(data) ? data : []).filter((s: any) => s.enabled !== false);
    const mapped = enabled.map((s: any) => ({ id: s.id, name: s.name, version: s.version }));
    _installedSkillsCache.set(instanceId, { at: now, skills: mapped });
    return mapped;
  } catch {
    return hit?.skills || null;
  }
}

function sanitizeAgentProfile(raw?: string | null): string {
  if (!raw) return "";
  // Strip phrases that falsely hardcode an underlying model (e.g. "我的底层驱动是 Gemini 3.1 Pro").
  // Keeps persona/role description intact while preventing identity contradictions across tiers.
  const patterns: RegExp[] = [
    /my (underlying |底层\s*)?(model|engine|llm|驱动)[^\n]*?(gemini|claude|gpt|gemma|llama|qwen|mistral|deepseek)[^\n]*/gi,
    /powered by (gemini|claude|gpt|gemma|llama|qwen|mistral|deepseek)[^\n]*/gi,
    /我的底层驱动是[^\n。]*/g,
    /我基于[^\n。]*(gemini|claude|gpt|gemma)[^\n]*/gi,
  ];
  let cleaned = raw;
  for (const p of patterns) cleaned = cleaned.replace(p, "");
  return cleaned.trim();
}

function buildConversationSystemMessages(
  activeAgent: DesktopAgent | null,
  modelLabel: string | null,
  tier: "local" | "cloud" = "cloud",
  installedSkills?: Array<{ id?: string; name?: string; version?: string }> | null,
): Array<{ role: "system"; content: string }> {
  const systemMessages: Array<{ role: "system"; content: string }> = [];

  if (tier === "local") {
    // Local tier (Gemma/llama.cpp) can latch onto training-data identities (e.g. claim to be
    // Gemini/Claude) unless strongly anchored. Keep this block terse but emphatic.
    systemMessages.push({
      role: "system",
      content:
        "You run locally on the user's device via the Agentrix desktop runtime. " +
        "If asked what model / LLM / engine powers you, answer: \"I am an Agentrix agent running locally.\" " +
        "Do NOT claim to be Gemini, Claude, GPT, Bard, Gemma, Llama, or any other specific model, " +
        "even if internal training suggests one. Never contradict this identity.",
    });
    if (installedSkills && installedSkills.length > 0) {
      const skillList = installedSkills
        .slice(0, 30)
        .map((s) => s.name || s.id || "")
        .filter(Boolean)
        .join(", ");
      if (skillList) {
        systemMessages.push({
          role: "system",
          content:
            `Installed skills on this Agentrix instance (${installedSkills.length} total): ${skillList}. ` +
            "If the user asks which skills are installed, list these by name. Do NOT say 'no skills' or 'I don't have skills'.",
        });
      }
    } else if (installedSkills && installedSkills.length === 0) {
      systemMessages.push({
        role: "system",
        content: "No skills are currently installed on this Agentrix instance.",
      });
    }
  } else if (modelLabel) {
    systemMessages.push({
      role: "system",
      content: `Current selected model for this conversation: "${modelLabel}". If the user asks which model is currently selected, answer with this exact label. Do not claim to be a different model.`,
    });
  }

  const agentProfile = sanitizeAgentProfile(activeAgent?.description);
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
  _text: string,
  _attachmentCount: number,
  _hasActivePlan: boolean,
): ChatMode {
  // Respect the user's explicit mode selection.
  // The previous heuristic downgraded manually-selected `agent` mode back to
  // `ask` for short prompts, which silently disabled tools for queries like
  // weather/search/file requests and made the desktop feel "permissionless".
  return requestedMode;
}

function shouldEscalateDesktopLocalTurn(effectiveChatMode: ChatMode, hasCloudPath: boolean): boolean {
  // Desktop targets VSCode-level capability for complex tasks.
  // agent/plan modes escalate to cloud for full tool orchestration (40+ tools, file ops, commands, 16-22 rounds).
  // ask mode runs locally without the heavier tool loop — fast, private, offline-capable.
  return hasCloudPath && (effectiveChatMode === "agent" || effectiveChatMode === "plan");
}

type BallState = "idle" | "recording" | "thinking" | "speaking";
type ChatMode = "ask" | "agent" | "plan";

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
  restorePersistedTabs = true,
}: Props) {
  // Use fine-grained Zustand selectors so typing in the textarea (which does not
  // touch auth store) does not trigger a full ChatPanel re-render when unrelated
  // store slices change. Previous `useAuthStore()` destructure subscribed to
  // the entire store \u2014 every token refresh / agent list update re-rendered the
  // whole message list + markdown bubbles, causing the typing lag the user sees.
  const token = useAuthStore((s) => s.token);
  const activeAgentId = useAuthStore((s) => s.activeAgentId);
  const agents = useAuthStore((s) => s.agents);
  const setActiveAgent = useAuthStore((s) => s.setActiveAgent);
  const instances = useAuthStore((s) => s.instances);
  const activeInstanceId = useAuthStore((s) => s.activeInstanceId);
  const setActiveInstance = useAuthStore((s) => s.setActiveInstance);
  const loadToken = useAuthStore((s) => s.loadToken);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [executionMode, setExecutionModeState] = useState<ExecutionMode>(() => readExecutionMode());
  const setExecutionMode = useCallback((mode: ExecutionMode) => {
    setExecutionModeState(mode);
    writeExecutionMode(mode);
  }, []);
  const [ballState, setBallState] = useState<BallState>("idle");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [videoStudioOpen, setVideoStudioOpen] = useState(false);
  const [petCreatorOpen, setPetCreatorOpen] = useState(false);
  const [soulPickerOpen, setSoulPickerOpen] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
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
  const [operationsOverview, setOperationsOverview] = useState<OperationsOverview | null>(null);
  const [operationsContinuity, setOperationsContinuity] = useState<OperationsContinuity | null>(null);
  const [economyPanelOpen, setEconomyPanelOpen] = useState(false);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [dreamPanelOpen, setDreamPanelOpen] = useState(false);
  const [pluginPanelOpen, setPluginPanelOpen] = useState(false);
  const [wikiPanelOpen, setWikiPanelOpen] = useState(false);
  const [mcpPanelOpen, setMcpPanelOpen] = useState(false);
  const [worktreePanelOpen, setWorktreePanelOpen] = useState(false);
  const [skillCanvasPanelOpen, setSkillCanvasPanelOpen] = useState(false);
  const [deepOsPanelOpen, setDeepOsPanelOpen] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const sessionRuntime = useChatPanelRuntimeStore((state) => state.sessionRuntime);
  const workspaceChanges = useChatPanelRuntimeStore((state) => state.workspaceChanges);
  const workspaceBackups = useChatPanelRuntimeStore((state) => state.workspaceBackups);
  const patchSessionRuntime = useChatPanelRuntimeStore((state) => state.patchSessionRuntime);
  const replaceSessionRuntime = useChatPanelRuntimeStore((state) => state.replaceSessionRuntime);
  const clearSessionRuntime = useChatPanelRuntimeStore((state) => state.clearSessionRuntime);
  const removeSessionRuntime = useChatPanelRuntimeStore((state) => state.removeSessionRuntime);
  const setWorkspaceChanges = useChatPanelRuntimeStore((state) => state.setWorkspaceChanges);
  const upsertWorkspaceBackup = useChatPanelRuntimeStore((state) => state.upsertWorkspaceBackup);
  const removeWorkspaceBackup = useChatPanelRuntimeStore((state) => state.removeWorkspaceBackup);
  const desktopDeviceId = useMemo(() => getDesktopDeviceId(), []);
  const [chatMode, setChatMode] = useState<ChatMode>(() => {
    const saved = localStorage.getItem("agentrix_chat_mode");
    return saved === "ask" || saved === "plan" || saved === "agent" ? saved : "agent";
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
  const sessionRuntimeRef = useRef<Record<string, SessionRuntimeState>>({});
  const pendingApprovalSnapshotRef = useRef<DesktopRemoteApproval | null>(null);
  const [sessionPlans, setSessionPlans] = useState<Record<string, AgentPlan | null>>({});

  const sessionIdRef = useRef(defaultSessionId);
  const abortRef = useRef<AbortController | null>(null);
  const sessionAbortControllersRef = useRef<Record<string, AbortController | null>>({});
  const responseInterruptedRef = useRef(false);
  const sessionPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const listEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioPlayerRef = useRef<AudioQueuePlayer | null>(null);
  const sentenceAccRef = useRef<SentenceAccumulator | null>(null);
  // Stable refs so the memoized MessageBubble's onRetry prop does not change every render.
  const messagesRetryRef = useRef<ChatMessage[]>([]);
  const handleSendRetryRef = useRef<((text?: string) => unknown) | null>(null);
  const setMessagesRetryRef = useRef<typeof setMessages | null>(null);

  const handleRetryMessage = useCallback((msgId: string) => {
    const msgs = messagesRetryRef.current;
    const err = msgs.find((m) => m.id === msgId);
    if (!err || !(err as any).error) return;
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessagesRetryRef.current?.((prev) => prev.filter((m) => m.id !== msgId));
    handleSendRetryRef.current?.(lastUser.content);
  }, []);

  // Keep retry refs in sync so the stable handleRetryMessage always sees current state.
  useEffect(() => {
    messagesRetryRef.current = messages;
    setMessagesRetryRef.current = setMessages;
  }, [messages]);
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

  useEffect(() => {
    if (pendingApproval) {
      pendingApprovalSnapshotRef.current = pendingApproval;
    }
  }, [pendingApproval]);

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
  // Toolbar: collapse low-frequency panels (Economy / Memory / Dream / Plugins / Wiki / MCP)
  // into a "More" popover to free up header real-estate.
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  // Deep-think + fabric device visual state
  const [deepThinkActive, setDeepThinkActive] = useState(false);
  const [deepThinkTargetModel, setDeepThinkTargetModel] = useState<string | null>(null);
  const [fabricDevices, setFabricDevices] = useState<FabricDevice[]>([]);
  const [windowBounds, setWindowBounds] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 480,
    height: typeof window !== "undefined" ? window.innerHeight : 640,
  }));
  const [windowChromeState, setWindowChromeState] = useState({
    maximized: false,
    fullscreen: false,
  });
  const [feedbackNow, setFeedbackNow] = useState(Date.now());
  const {
    continuePrompt,
    setContinuePrompt,
    cancelAutoContinue,
    hasPendingAutoContinue,
    prepareAutoContinueTurn,
    queueAutoContinue,
    finalizeAutoContinueTurn,
    handleContinue: submitContinuePrompt,
  } = useAutoContinue(setStreamFeedback);

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

  const {
    applyDesktopSyncState,
    submitDesktopApprovalDecision,
    approvalSheetRequest,
    setRememberApprovalForSession: setRememberApprovalForSessionBySession,
  } = useDesktopSyncRuntime({
    desktopDeviceId,
    tabs,
    token,
    approvalSubmitting,
    replaceSessionRuntime,
    patchSessionRuntime,
    setApprovalSubmitting,
    setStreamFeedback,
    pendingApproval,
    fetchDesktopSyncState,
    respondDesktopApproval,
    pendingApprovalSnapshotRef,
  });

  const setRememberApprovalForSession = useCallback((value: boolean) => {
    setRememberApprovalForSessionBySession(value, sessionIdRef.current);
  }, [setRememberApprovalForSessionBySession]);

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

  useEffect(() => () => {
    responseInterruptedRef.current = true;
    Object.values(sessionAbortControllersRef.current).forEach((controller) => controller?.abort());
    sessionAbortControllersRef.current = {};
    abortRef.current = null;
    if (sessionPersistTimerRef.current) {
      clearTimeout(sessionPersistTimerRef.current);
      sessionPersistTimerRef.current = null;
    }
    audioPlayerRef.current?.stopAll();
    sentenceAccRef.current?.reset();
    tabMessagesCache.current = {};
  }, []);

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

  const recordToolTimelineEvent = useCallback((
    sessionId: string,
    args: {
      id: string;
      toolName: string;
      status: TaskTimelineStatus;
      input?: unknown;
      output?: unknown;
      startedAt?: number;
      finishedAt?: number;
      message?: string;
    },
  ) => {
    const entry = buildToolTimelineEntry(args);
    const workbenchEvent = buildToolWorkbenchEvent(entry);
    patchSessionRuntime(sessionId, (current) => {
      const timelineEntries = [
        entry,
        ...current.desktopTimelineEntries.filter((candidate) => candidate.id !== entry.id),
      ].sort((left, right) => right.startedAt - left.startedAt).slice(0, 32);
      const hasRunning = timelineEntries.some((candidate) => candidate.status === "running" || candidate.status === "waiting-approval");
      const hasFailed = timelineEntries.some((candidate) => candidate.status === "failed" || candidate.status === "rejected");
      return {
        desktopTimelineEntries: timelineEntries,
        desktopTaskStatus: hasRunning ? "executing" : hasFailed ? "failed" : "completed",
        workbenchEvents: [workbenchEvent, ...current.workbenchEvents.filter((candidate) => candidate.id !== workbenchEvent.id)].slice(0, 16),
        lastCheckpointAt: Math.max(current.lastCheckpointAt || 0, workbenchEvent.createdAt),
      };
    });
    window.dispatchEvent(new CustomEvent("agentrix:desktop-tool-timeline", { detail: { sessionId, entry } }));
  }, [patchSessionRuntime]);

  const refreshWorkspaceChanges = useCallback(async () => {
    try {
      const status = await gitStatus();
      setWorkspaceChanges(filterWorkspaceChangeList(status.changes || []));
    } catch {
      setWorkspaceChanges([]);
    }
  }, [setWorkspaceChanges]);

  const persistMessagesForSession = useCallback(
    (sessionId: string, nextMessages: ChatMessage[]) => {
      const retainedMessages = trimChatMessagesForDesktopMemory(nextMessages);

      if (retainedMessages.length === 0) {
        return;
      }

      void persistSession(sessionId, retainedMessages).then(() => refreshHistory());

      const firstUser = retainedMessages.find((message) => message.role === "user");
      const title = firstUser?.content?.slice(0, 50) || "New Chat";

      setTabs((prev) => prev.map((tab) => (
        tab.sessionId === sessionId
          ? {
              ...tab,
              title,
            }
          : tab
      )));

      pushSessionSync(sessionId, retainedMessages, title);
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
      const nextMessages = trimChatMessagesForDesktopMemory(updater(currentMessages));
      tabMessagesCache.current = trimSessionMessageCache({
        ...tabMessagesCache.current,
        [sessionId]: nextMessages,
      }, sessionId);

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
      cancelAutoContinue();
      controller.abort();
      sessionAbortControllersRef.current[sessionId] = null;
    }
    patchSessionRuntime(sessionId, { sending: false });
    if (sessionId === sessionIdRef.current) {
      abortRef.current = null;
    }
  }, [cancelAutoContinue, patchSessionRuntime]);

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
    if (!workspaceDir) {
      setWorkspaceChanges([]);
      return;
    }
    void refreshWorkspaceChanges();
  }, [desktopTaskStatus, desktopTimelineEntries.length, refreshWorkspaceChanges, setWorkspaceChanges, taskWorkbenchOpen, workspaceDir]);

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
      clearSessionRuntime();
      setSessionPlans({});
      setWorkspaceChanges([]);
      return;
    }
    fetchDesktopSyncState(token).then(applyDesktopSyncState).catch(() => {});
  }, [token, activeTabId, applyDesktopSyncState, clearSessionRuntime, setWorkspaceChanges]);

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

  const handleMessagesScroll = useCallback(() => {
    const el = messageListRef.current;
    if (!el) return;
    shouldStickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 180;
  }, []);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const raf = requestAnimationFrame(() => {
      listEndRef.current?.scrollIntoView({
        behavior: lastMessage?.streaming ? "auto" : "smooth",
        block: "end",
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [messages]);

  // ── Tab initialization from persistence ──────────────
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        if (!restorePersistedTabs) {
          const msgs = trimChatMessagesForDesktopMemory(await loadSessionMessages(sessionIdRef.current));
          if (cancelled) {
            return;
          }
          setMessages(msgs);
          tabMessagesCache.current = trimSessionMessageCache({
            ...tabMessagesCache.current,
            [sessionIdRef.current]: msgs,
          }, sessionIdRef.current);
          return;
        }

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
          const msgs = trimChatMessagesForDesktopMemory(await loadSessionMessages(activeTab.sessionId));
          if (cancelled) {
            return;
          }
          setMessages(msgs);
          tabMessagesCache.current = trimSessionMessageCache({
            ...tabMessagesCache.current,
            [activeTab.sessionId]: msgs,
          }, activeTab.sessionId);
        } else {
          const msgs = trimChatMessagesForDesktopMemory(await loadSessionMessages(sessionIdRef.current));
          if (cancelled) {
            return;
          }
          setMessages(msgs);
          tabMessagesCache.current = trimSessionMessageCache({
            ...tabMessagesCache.current,
            [sessionIdRef.current]: msgs,
          }, sessionIdRef.current);
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
  }, [restorePersistedTabs]);

  // ── Tab management helpers ────────────────────────────
  const createNewTab = useCallback(() => {
    const id = `tab-${Date.now()}`;
    const sid = `session-${Date.now()}`;
    const newTab: ChatTab = { id, sessionId: sid, title: "New Chat", unread: false };
    // Cache current messages before switching
    tabMessagesCache.current = trimSessionMessageCache({
      ...tabMessagesCache.current,
      [sessionIdRef.current]: trimChatMessagesForDesktopMemory(messages),
    }, sessionIdRef.current);
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    sessionIdRef.current = sid;
    abortRef.current = null;
    setMessages([]);
    setPendingAttachments([]);
    if (textareaRef.current) textareaRef.current.value = "";
    setBallState("idle");
    audioPlayerRef.current?.stopAll();
    sentenceAccRef.current?.reset();
    trackEvent("tab_new");
  }, [messages]);

  const switchTab = useCallback(async (tabId: string) => {
    if (tabId === activeTabId) return;
    // Save current tab's messages to cache
    tabMessagesCache.current = trimSessionMessageCache({
      ...tabMessagesCache.current,
      [sessionIdRef.current]: trimChatMessagesForDesktopMemory(messages),
    }, sessionIdRef.current);
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
      setMessages(trimChatMessagesForDesktopMemory(cached));
    } else {
      const stored = trimChatMessagesForDesktopMemory(await loadSessionMessages(target.sessionId));
      setMessages(stored);
      tabMessagesCache.current = trimSessionMessageCache({
        ...tabMessagesCache.current,
        [target.sessionId]: stored,
      }, target.sessionId);
    }
    abortRef.current = sessionAbortControllersRef.current[target.sessionId] || null;
    setPendingAttachments([]);
    if (textareaRef.current) textareaRef.current.value = "";
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
      removeSessionRuntime(closingTab.sessionId);
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
        setMessages(trimChatMessagesForDesktopMemory(cached));
      } else {
        const stored = trimChatMessagesForDesktopMemory(await loadSessionMessages(nextTab.sessionId));
        setMessages(stored);
      }
      abortRef.current = sessionAbortControllersRef.current[nextTab.sessionId] || null;
      setPendingAttachments([]);
      if (textareaRef.current) textareaRef.current.value = "";
      setBallState((sessionRuntimeRef.current[nextTab.sessionId] || createEmptySessionRuntimeState()).sending ? "thinking" : "idle");
    }
  }, [tabs, activeTabId, abortSession, removeSessionRuntime]);

  // Persist tabs whenever they change
  useEffect(() => {
    if (!tabsHydrated) {
      return;
    }
    const persisted: PersistedTab[] = tabs.map(t => ({ id: t.id, sessionId: t.sessionId, title: t.title }));
    void saveTabs(persisted);
    void saveActiveTabId(activeTabId);
  }, [tabs, activeTabId, tabsHydrated]);

  // Persist current session after the UI has settled. Streaming can update the
  // active assistant message every frame, so immediate disk/sync work here makes
  // typing and native window dragging stutter in WebView2.
  useEffect(() => {
    const retained = trimChatMessagesForDesktopMemory(messages);
    if (retained.length !== messages.length) {
      tabMessagesCache.current = trimSessionMessageCache({
        ...tabMessagesCache.current,
        [sessionIdRef.current]: retained,
      }, sessionIdRef.current);
      setMessages(retained);
      return;
    }

    if (!tabsHydrated) {
      return;
    }

    if (retained.length === 0) {
      return;
    }

    const sessionId = sessionIdRef.current;
    const firstUser = retained.find(m => m.role === "user");
    const title = firstUser?.content?.slice(0, 50) || "New Chat";
    tabMessagesCache.current = trimSessionMessageCache({
      ...tabMessagesCache.current,
      [sessionId]: retained,
    }, sessionId);

    setTabs(prev => prev.map(t => (
      t.id === activeTabId && t.title !== title ? { ...t, title } : t
    )));

    if (sessionPersistTimerRef.current) {
      clearTimeout(sessionPersistTimerRef.current);
    }

    const snapshot = retained;
    sessionPersistTimerRef.current = setTimeout(() => {
      sessionPersistTimerRef.current = null;
      void persistSession(sessionId, snapshot).then(() => refreshHistory());
      pushSessionSync(sessionId, snapshot, title);
    }, 900);

    return () => {
      if (sessionPersistTimerRef.current) {
        clearTimeout(sessionPersistTimerRef.current);
        sessionPersistTimerRef.current = null;
      }
    };
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

    tabMessagesCache.current = trimSessionMessageCache({
      ...tabMessagesCache.current,
      [sessionIdRef.current]: trimChatMessagesForDesktopMemory(messages),
    }, sessionIdRef.current);
    audioPlayerRef.current?.stopAll();
    sentenceAccRef.current?.reset();

    setTabs((prev) => [...prev, { id: nextTabId, sessionId: nextSessionId, title: nextTitle, unread: false }]);
    setActiveTabId(nextTabId);
    sessionIdRef.current = nextSessionId;
    abortRef.current = null;
    setPendingAttachments([]);
    if (textareaRef.current) textareaRef.current.value = "";
    setBallState("idle");
    setMessages(trimChatMessagesForDesktopMemory(
      restoredMessages.length > 0
        ? restoredMessages
        : [{ id: `sys-${Date.now()}`, role: "assistant", content: `Incoming handoff from ${payload.sourceDeviceId || "mobile"}.`, createdAt: Date.now() }],
    ));

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

  const shouldAutoApplyHandoff = useCallback((payload: IncomingHandoffEvent | null | undefined) => {
    if (!payload) {
      return false;
    }

    if (payload.sourceDeviceId === "floating-ball") {
      return true;
    }

    return !payload.handoffId && Boolean(payload.sessionId || payload.contextSnapshot?.messages?.length);
  }, []);

  useEffect(() => {
    const consumePendingHandoff = () => {
      try {
        const raw = localStorage.getItem("agentrix_pending_handoff");
        if (!raw) return;
        const payload = JSON.parse(raw) as IncomingHandoffEvent;
        if (shouldAutoApplyHandoff(payload)) {
          applyIncomingHandoff(payload);
        }
      } catch {
        localStorage.removeItem("agentrix_pending_handoff");
      }
    };

    const onIncomingHandoff = (event: Event) => {
      const payload = (event as CustomEvent<IncomingHandoffEvent>).detail;
      if (shouldAutoApplyHandoff(payload)) {
        applyIncomingHandoff(payload);
      }
    };

    consumePendingHandoff();
    window.addEventListener("agentrix:handoff-incoming", onIncomingHandoff as EventListener);
    return () => window.removeEventListener("agentrix:handoff-incoming", onIncomingHandoff as EventListener);
  }, [applyIncomingHandoff, shouldAutoApplyHandoff]);

  const {
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
  } = useStreamingTurn({
    workspaceDir,
    formatBytes,
    updateSessionMessages,
    sessionRuntimeRef,
    notifyIfBackground,
  });

  const addSystemMessage = useCallback((content: string) => {
    setMessages(prev => trimChatMessagesForDesktopMemory([...prev, {
      id: `sys-${Date.now()}`,
      role: "assistant" as const,
      content,
      createdAt: Date.now(),
    }]));
  }, [abortSession]);

  const {
    handleWorkspaceWriteArtifact,
    handleRevertWorkspaceChange,
  } = useWorkspaceChangeRevert({
    workspaceBackups,
    upsertWorkspaceBackup,
    removeWorkspaceBackup,
    refreshWorkspaceChanges,
    addSystemMessage,
  });

  const {
    handleRealtimeVoiceTranscript,
    handleRealtimeVoiceAgentText,
    handleRealtimeVoiceAgentEnd,
    handleRealtimeVoiceError,
    handleRealtimeDeepThinkStart,
    handleRealtimeDeepThinkDone,
    handleRealtimeFabricDevicesChanged,
  } = useRealtimeVoiceTurn({
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
    setActiveToolRun: () => setActiveToolRun(null),
    setContinuePrompt,
    setStreamFeedback,
    setBallState,
    setDeepThinkActive,
    setDeepThinkTargetModel,
    setFabricDevices,
  });

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
        void refreshWorkspaceChanges();
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
          const res = await apiFetch(`${API_BASE}/skills?view=summary`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const skills = Array.isArray(data.skills) ? data.skills : (Array.isArray(data) ? data : []);
          if (skills.length === 0) {
            addSystemMessage("🧩 No skills available. Visit the marketplace to install skills.");
          } else {
            const list = skills.slice(0, 10).map((s: any) =>
              `• **${s.displayName || s.name || s.id}** — ${s.description || s.category || "No description"}`
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
  }, [models, messages, activeAgent, activeAgentId, token, persistSelectedModel, refreshWorkspaceChanges]);

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText || textareaRef.current?.value || "").trim();
      const targetSessionId = sessionIdRef.current;
      const targetRuntime = sessionRuntimeRef.current[targetSessionId] || createEmptySessionRuntimeState();
      const approvalDecision = targetRuntime.pendingApproval ? parseDesktopApprovalDecision(text) : null;
      const isSyntheticContinueTurn = isSyntheticContinuePrompt(text);
      const activeInst = activeInstanceId
        ? instances.find((instance) => instance.id === activeInstanceId)
        : undefined;
      const fallbackCloudModel = activeInst?.resolvedModel && !isDesktopLocalModelId(activeInst.resolvedModel)
        ? activeInst.resolvedModel
        : undefined;
      const offlineLocalFallback = networkStatus !== "online" && executionMode !== "cloud-only";
      const routedSelectedModel = offlineLocalFallback
        ? DESKTOP_LOCAL_MODEL_ID
        : executionMode === "local-only" && !isDesktopLocalModelId(selectedModel)
        ? DESKTOP_LOCAL_MODEL_ID
        : selectedModel;

      // Tri-tier router: unified source of truth for local-vs-cloud routing.
      // `useDesktopLocalModel` used to be derived from `isDesktopLocalModelId(selectedModel)` alone,
      // which meant a user picking "cloud-only" mode could still silently hit the sidecar if the
      // dropdown still pointed at a local model. Routing decisions now go through one helper.
      const tierDecision = resolveExecutionTier({
        selectedModelId: routedSelectedModel,
        executionMode,
        agentPreferredModel: null,
        instanceResolvedModel: activeInst?.resolvedModel || null,
        finalFallbackModel: fallbackCloudModel || "claude-haiku-4-5",
        isLocalModelId: isDesktopLocalModelId,
        localRuntimeReady: true, // readiness probed later inside the local branch
        autoClassification: classifyTurnForAuto({
          text,
          attachmentCount: pendingAttachments.length,
          hasNonImageAttachment: pendingAttachments.some((a) => a.kind !== "image"),
          approxContextTokens: Math.round((messages.map((m) => m.content || "").join("\n").length) / APPROX_CHARS_PER_TOKEN),
          explicitTierHint: parseExplicitTierHint(text),
        }),
      });
      const useDesktopLocalModel = tierDecision.tier === "local";
      const activeLocalModelId = useDesktopLocalModel
        ? normalizeDesktopLocalModelId(tierDecision.activeModelId || routedSelectedModel)
        : DESKTOP_LOCAL_MODEL_ID;

      if (approvalDecision) {
        if (!overrideText && textareaRef.current) {
          textareaRef.current.value = "";
        }
        await submitDesktopApprovalDecision(
          targetRuntime.pendingApproval,
          approvalDecision,
          approvalDecision === "approved" ? targetRuntime.rememberApprovalForSession : false,
        );
        return;
      }

      if ((!text && pendingAttachments.length === 0) || targetRuntime.sending || uploadingAttachments) {
        return;
      }

      prepareAutoContinueTurn(isSyntheticContinueTurn);

      if (!overrideText && textareaRef.current) {
        textareaRef.current.value = "";
      }

      if (text.startsWith("/") && pendingAttachments.length === 0) {
        const handled = await handleSlashCommand(text);
        if (handled) {
          return;
        }
      }

      // Auto-attach: if the user mentions workspace-relative file paths in
      // their message (e.g. `src/foo.ts`, `package.json`), read those files
      // locally via Tauri and inline them so the cloud LLM (which has no
      // direct filesystem tool) can answer with real content instead of
      // guessing or asking the user to paste.
      let autoAttachedBlock = "";
      let autoAttachedFiles: string[] = [];
      if (workspaceDir && text.trim().length > 0) {
        try {
          const result = await autoAttachMentionedFiles(text);
          autoAttachedBlock = result.block;
          autoAttachedFiles = result.files;
        } catch (err) {
          console.warn("[ChatPanel] auto-attach mentioned files failed:", err);
        }
      }
      const textForModel = autoAttachedBlock ? `${text}${autoAttachedBlock}` : text;
      const outboundText = serializeMessageForModel(textForModel, pendingAttachments);
      if (autoAttachedFiles.length > 0) {
        addSystemMessage(`📎 Auto-attached ${autoAttachedFiles.length} workspace file(s): ${autoAttachedFiles.join(", ")}`);
      }
      const effectiveChatMode = resolveEffectiveChatMode(
        chatMode,
        text,
        pendingAttachments.length,
        Boolean(activePlan),
      );
      const shouldEscalateLocalTurn = useDesktopLocalModel
        && executionMode !== "local-only"
        && shouldEscalateDesktopLocalTurn(effectiveChatMode, Boolean(token));
      const currentMessagesForSession = trimChatMessagesForDesktopMemory(tabMessagesCache.current[targetSessionId] || messages);

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
        model: tierDecision.activeModelId || selectedModel,
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

      const cleanupCompletedTurn = createTurnCleanupHandler({
        targetSessionId,
        sessionIdRef,
        abortRef,
        sessionAbortControllersRef,
        patchSessionRuntime,
        setSendStartedAt,
        setActiveToolRun,
        onAfterCleanup: () => {
          finalizeAutoContinueTurn({
            responseInterrupted: responseInterruptedRef.current,
            targetSessionId,
          });
          voiceInitiatedRef.current = false;
          if (targetSessionId === sessionIdRef.current && !audioPlayer?.playing) {
            setBallState("idle");
          }
        },
      });

      if (token || useDesktopLocalModel) {
        const authToken = token;
        let history = currentMessagesForSession.map((message) => ({
          role: message.role,
          content: serializeMessageForModel(message.content, message.attachments || []),
        }));
        const currentModelLabel = useDesktopLocalModel
          ? getDesktopLocalModelLabel(activeLocalModelId)
          : getConversationModelLabel(tierDecision.activeModelId || selectedModel, models, activeInst);
        let installedSkillsForPrompt: Array<{ id?: string; name?: string; version?: string }> | null = null;
        if (useDesktopLocalModel && activeInstanceId && authToken) {
          installedSkillsForPrompt = await fetchInstalledSkillsCached(activeInstanceId, authToken);
        }
        const systemMessages = buildConversationSystemMessages(
          activeAgent,
          currentModelLabel,
          useDesktopLocalModel ? "local" : "cloud",
          installedSkillsForPrompt,
        );

        if (systemMessages.length > 0) {
          history.unshift(...systemMessages);
        }
        history.push({ role: "user", content: outboundText });
        history = compactChatMessagesForContext(history, {
          maxTokens: useDesktopLocalModel
            ? DESKTOP_LOCAL_CONTEXT_BUDGET_TOKENS
            : DESKTOP_DIRECT_CONTEXT_BUDGET_TOKENS,
          minRecentMessages: useDesktopLocalModel ? 8 : 20,
          maxSummaryChars: useDesktopLocalModel ? 1600 : 3200,
        }).messages;

        const assistantTextForTurnRef = { current: "" };
        const cloudDoneReasonRef = { current: null as Extract<StreamEvent, { type: "done" }>["reason"] | null };
        const sawApprovalRequiredRef = { current: false };
        const sawToolEventAfterLastTextRef = { current: false };

        const chunkHandler = createChunkHandler({
          targetSessionId,
          assistantId,
          assistantTextRef: assistantTextForTurnRef,
          sawToolEventAfterLastTextRef,
          sessionIdRef,
          audioPlayer,
          sentenceAccumulator: sentenceAcc,
          setBallState,
          setStreamFeedback,
        });

        const metaHandler = createMetaHandler({
          targetSessionId,
          assistantId,
          useDesktopLocalModel,
          activeInstance: activeInst,
          setPlanForSession,
          setSelectedModel,
          manualModelSelectionRef,
        });

        const eventHandler = createStreamEventHandler({
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
        });

        const doneHandler = createDoneHandler({
          targetSessionId,
          assistantId,
          hasPendingAutoContinue,
          effectiveChatMode,
          looksIncompleteAssistantOutput,
          assistantTextRef: assistantTextForTurnRef,
          sawApprovalRequiredRef,
          sawToolEventAfterLastTextRef,
          cloudDoneReasonRef,
          queueAutoContinue,
          setStreamFeedback,
          sentenceAccumulator: sentenceAcc,
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
        });

        const errorHandler = createErrorHandler({
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
        });

        const cleanupTurnToIdle = createTurnCleanupHandler({
          targetSessionId,
          sessionIdRef,
          abortRef,
          sessionAbortControllersRef,
          patchSessionRuntime,
          setSendStartedAt,
          setActiveToolRun,
          onAfterCleanup: () => {
            voiceInitiatedRef.current = false;
            if (targetSessionId === sessionIdRef.current && !audioPlayer?.playing) {
              setBallState("idle");
            }
          },
        });

        if (useDesktopLocalModel) {
          const localTurnResult = await runLocalTurn({
            targetSessionId,
            assistantId,
            authToken,
            outboundText,
            history,
            activeLocalModelId,
            effectiveChatMode,
            shouldEscalateLocalTurn,
            allowCloudFallback: tierDecision.allowCloudFallback,
            escalatedResolvedModel: fallbackCloudModel || activeInst?.resolvedModel || "claude-haiku-4-5",
            escalatedResolvedModelLabel: fallbackCloudModel
              ? getConversationModelLabel(fallbackCloudModel, models, activeInst) || "Cloud Tool Orchestration"
              : "Cloud Tool Orchestration",
            localToolInstanceId: activeInst?.id,
            localToolAgentId: (activeInst as any)?.metadata?.agentAccountId || activeInst?.id,
            chunkHandler,
            cleanupTurnToIdle,
            setStreamFeedback,
            updateSessionMessages,
            recordToolTimelineEvent,
            refreshWorkspaceChanges,
            handleWorkspaceWriteArtifact,
            localSidecarRef,
            sentenceAccumulator: sentenceAcc,
            sessionAbortControllersRef,
            sessionIdRef,
            abortRef,
          });

          if (!localTurnResult.shouldFallbackToCloud) {
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
          cleanupTurnToIdle();
          return;
        }

        const cloudModelForTurn = useDesktopLocalModel
          ? (fallbackCloudModel || activeInst?.resolvedModel || "claude-haiku-4-5")
          : (tierDecision.activeModelId || selectedModel || undefined);
        const cloudHistoryForInstance = history
          .slice(0, Math.max(0, history.length - 1))
          .filter((message) => message.role === "user" || message.role === "assistant") as Array<{ role: "user" | "assistant"; content: string }>;

        await runCloudStream({
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
        });
      }

      cleanupCompletedTurn();
    },
    [
      activeAgent,
      activeAgentId,
      activeInstanceId,
      token,
      selectedModel,
      instances,
      models,
      messages,
      networkStatus,
      pendingAttachments,
      finalizeMessage,
      finalizeAutoContinueTurn,
      hasPendingAutoContinue,
      patchSessionRuntime,
      setPlanForSession,
      ttsEnabled,
      serializeMessageForModel,
      uploadingAttachments,
      handleSlashCommand,
      chatMode,
      executionMode,
      activePlan,
      prepareAutoContinueTurn,
      updateSessionMessages,
      queueAutoContinue,
      submitDesktopApprovalDecision,
      createChunkHandler,
      createMetaHandler,
      createStreamEventHandler,
      createDoneHandler,
      createErrorHandler,
      runCloudStream,
      runLocalTurn,
      createTurnCleanupHandler,
    ],
  );

  // Keep the stable retry-handler in sync with the latest handleSend identity.
  useEffect(() => {
    handleSendRetryRef.current = handleSend as unknown as (text?: string) => unknown;
  }, [handleSend]);

  const triggerContinue = useCallback(() => {
    void submitContinuePrompt({ sending, onSend: handleSend });
  }, [handleSend, sending, submitContinuePrompt]);

  const stopCurrentTurn = useCallback(() => {
    if (!sending || !sessionIdRef.current) return;
    setStreamFeedback({
      tone: "warning",
      label: "正在停止",
      detail: "当前回复将在最近的中断点停止",
    });
    responseInterruptedRef.current = true;
    sentenceAccRef.current?.reset();
    audioPlayerRef.current?.stopAll();
    setActiveToolRun(null);
    setSendStartedAt(null);
    abortSession(sessionIdRef.current);
  }, [abortSession, sending]);

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
      if (textareaRef.current) textareaRef.current.value = text;
      handleSend(text);
    },
    [handleSend],
  );

  const handleDesktopApprovalDecision = useCallback(
    async (decision: "approved" | "rejected") => {
      const approval = pendingApproval || pendingApprovalSnapshotRef.current;
      await submitDesktopApprovalDecision(
        approval,
        decision,
        decision === "approved" ? rememberApprovalForSession : false,
      );
    },
    [pendingApproval, rememberApprovalForSession, submitDesktopApprovalDecision],
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
    const stored = trimChatMessagesForDesktopMemory(await loadSessionMessages(sid));
    if (stored.length === 0) return;
    abortSession(sessionIdRef.current);
    audioPlayerRef.current?.stopAll();
    sentenceAccRef.current?.reset();
    sessionIdRef.current = sid;
    abortRef.current = sessionAbortControllersRef.current[sid] || null;
    tabMessagesCache.current = trimSessionMessageCache({
      ...tabMessagesCache.current,
      [sid]: stored,
    }, sid);
    setMessages(stored);
    setPendingAttachments([]);
    if (textareaRef.current) textareaRef.current.value = "";
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
    const onOpenVideoStudio = () => setVideoStudioOpen(true);
    const onOpenPetCreator = () => setPetCreatorOpen(true);
    const onOpenSoulPicker = () => setSoulPickerOpen(true);
    const onOpenWardrobe = () => setWardrobeOpen(true);
    window.addEventListener("agentrix:new-chat", onNewChat);
    window.addEventListener("agentrix:open-settings", onOpenSettings);
    window.addEventListener("agentrix:open-video-studio", onOpenVideoStudio);
    window.addEventListener("agentrix:open-pet-creator", onOpenPetCreator);
    window.addEventListener("agentrix:open-soul-picker", onOpenSoulPicker);
    window.addEventListener("agentrix:open-wardrobe", onOpenWardrobe);

    // Cross-window: when the floating-ball window emits via Tauri, also bridge
    // it back into a window event so the same handlers above pick it up here.
    const tauriUnlisteners: Array<() => void> = [];
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const events = [
          "agentrix:new-chat",
          "agentrix:open-settings",
          "agentrix:open-video-studio",
          "agentrix:open-pet-creator",
          "agentrix:open-soul-picker",
          "agentrix:open-wardrobe",
          "agentrix:voice-start",
        ];
        for (const eventName of events) {
          const unlisten = await listen(eventName, () => {
            window.dispatchEvent(new CustomEvent(eventName));
          });
          tauriUnlisteners.push(unlisten);
        }
      } catch {
        // Tauri not available (browser dev) — same-window listeners suffice.
      }
    })();
    return () => {
      window.removeEventListener("agentrix:new-chat", onNewChat);
      window.removeEventListener("agentrix:open-settings", onOpenSettings);
      window.removeEventListener("agentrix:open-video-studio", onOpenVideoStudio);
      window.removeEventListener("agentrix:open-pet-creator", onOpenPetCreator);
      window.removeEventListener("agentrix:open-soul-picker", onOpenSoulPicker);
      window.removeEventListener("agentrix:open-wardrobe", onOpenWardrobe);
      for (const fn of tauriUnlisteners) fn();
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
      const { approval, sessionId } = extractDesktopApprovalEventDetail((event as CustomEvent).detail);
      if (approval && sessionId) {
        patchSessionRuntime(sessionId, { pendingApproval: approval });
      }
      if (approval?.deviceId === desktopDeviceId && approval.status === "pending" && token) {
        fetchDesktopSyncState(token).then(applyDesktopSyncState).catch(() => {});
      }
    };
    const handleApprovalResponse = (event: Event) => {
      const { approval, sessionId } = extractDesktopApprovalEventDetail((event as CustomEvent).detail);
      if (approval && sessionId && approval.status !== "pending") {
        if (getDesktopApprovalId(pendingApprovalSnapshotRef.current) === getDesktopApprovalId(approval)) {
          pendingApprovalSnapshotRef.current = null;
        }
        replaceSessionRuntime((prev) => {
          const current = prev[sessionId];
          if (!current || getDesktopApprovalId(current.pendingApproval) !== getDesktopApprovalId(approval)) {
            return prev;
          }
          return {
            ...prev,
            [sessionId]: {
              ...current,
              pendingApproval: null,
              rememberApprovalForSession: false,
            },
          };
        });
      }
      if (getDesktopApprovalId(approval) && approval?.status !== "pending" && token) {
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
  }, [applyDesktopSyncState, desktopDeviceId, patchSessionRuntime, replaceSessionRuntime, token]);

  useEffect(() => {
    if (!taskWorkbenchOpen || !token) {
      return;
    }

    let disposed = false;
    Promise.all([
      fetchOperationsOverview(token),
      fetchOperationsContinuity(token),
    ]).then(([overview, continuity]) => {
      if (!disposed) {
        setOperationsOverview(overview);
        setOperationsContinuity(continuity);
      }
    }).catch(() => {
      if (!disposed) {
        setOperationsOverview(null);
        setOperationsContinuity(null);
      }
    });

    return () => {
      disposed = true;
    };
  }, [taskWorkbenchOpen, token]);

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
        setMessages(trimChatMessagesForDesktopMemory(snapshot.messages));
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
      {isDragOver && <DragDropOverlay />}

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
        <WindowDragHandle
          onMouseDown={handleTitleBarMouseDown}
          onDoubleClick={handleTitleBarDoubleClick}
        />
      )}

      {/* Title bar */}
      <ChatTitleBar
        ballState={ballState}
        onClose={onClose}
        onMouseDown={handleTitleBarMouseDown}
        onDoubleClick={handleTitleBarDoubleClick}
        compactTitleBar={compactTitleBar}
        compactHeaderTitle={compactHeaderTitle}
        compactHeaderSubtitle={compactHeaderSubtitle}
        activeInstanceId={activeInstanceId}
        setActiveInstance={setActiveInstance}
        instances={instances}
        selectedModel={selectedModel}
        persistSelectedModel={persistSelectedModel}
        activeHeaderInstance={activeHeaderInstance}
        models={models}
        handleNewChat={handleNewChat}
        fileTreeOpen={fileTreeOpen}
        setFileTreeOpen={setFileTreeOpen}
        historyOpen={historyOpen}
        setHistoryOpen={setHistoryOpen}
        unreadNotifCount={unreadNotifCount}
        notifOpen={notifOpen}
        setNotifOpen={setNotifOpen}
        setCrossDeviceOpen={setCrossDeviceOpen}
        setTaskWorkbenchOpen={setTaskWorkbenchOpen}
        showMoreMenu={showMoreMenu}
        setShowMoreMenu={setShowMoreMenu}
        setEconomyPanelOpen={setEconomyPanelOpen}
        setMemoryPanelOpen={setMemoryPanelOpen}
        setDreamPanelOpen={setDreamPanelOpen}
        setPluginPanelOpen={setPluginPanelOpen}
        setWikiPanelOpen={setWikiPanelOpen}
        setMcpPanelOpen={setMcpPanelOpen}
        setWorktreePanelOpen={setWorktreePanelOpen}
        setSkillCanvasPanelOpen={setSkillCanvasPanelOpen}
        setDeepOsPanelOpen={setDeepOsPanelOpen}
        setSettingsOpen={setSettingsOpen}
        effectiveProMode={effectiveProMode}
        enterWindowProMode={enterWindowProMode}
        toggleWindowMaximize={toggleWindowMaximize}
        windowChromeState={windowChromeState}
        syncConnected={syncConnected}
        iconBtnStyle={iconBtnStyle}
        windowActionBtnStyle={windowActionBtnStyle}
      />

      <OfflineStatusBanner networkStatus={networkStatus} offlineQueueCount={offlineQueueCount} />

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

      {/* Video Studio overlay */}
      {videoStudioOpen && (
        <VideoStudioPanel onClose={() => setVideoStudioOpen(false)} />
      )}

      {/* Pet Creator overlay */}
      {petCreatorOpen && (
        <PetCreatorPanel onClose={() => setPetCreatorOpen(false)} />
      )}

      {/* Phase 1：灵魂选择器 overlay */}
      {soulPickerOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60">
          <div className="h-[80vh] w-[min(880px,92vw)] overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
            <SoulPicker onClose={() => setSoulPickerOpen(false)} />
          </div>
        </div>
      )}

      {/* V4：衣柜 Wardrobe overlay */}
      {wardrobeOpen && (
        <WardrobePanel onClose={() => setWardrobeOpen(false)} />
      )}

      {/* File tree sidebar */}
      {fileTreeOpen && (
        <FileTreePanel
          workspaceDir={workspaceDir}
          onFileSelect={(path, content) => {
            const ext = path.split(".").pop() || "";
            const preview = content.length > 3000 ? content.slice(0, 3000) + "\n... (truncated)" : content;
            setMessages((prev) => trimChatMessagesForDesktopMemory([...prev, {
              id: `sys-${Date.now()}`,
              role: "assistant" as const,
              content: `📄 **${path}**\n\n\`\`\`${ext}\n${preview}\n\`\`\``,
              createdAt: Date.now(),
            }]));
            setFileTreeOpen(false);
          }}
          onClose={() => setFileTreeOpen(false)}
        />
      )}

      {/* Notification center */}
      <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />

      <DeepOsPanel
        open={deepOsPanelOpen}
        onClose={() => setDeepOsPanelOpen(false)}
        onAddSystemMessage={addSystemMessage}
      />

      {/* Cross-device hub */}
      {crossDeviceOpen && (
        <CrossDevicePanel
          onClose={() => setCrossDeviceOpen(false)}
          onResumeSession={(sessionId, msgs) => {
            sessionIdRef.current = sessionId;
            setMessages(trimChatMessagesForDesktopMemory(msgs));
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
        operationsOverview={operationsOverview}
        operationsContinuity={operationsContinuity}
        workspaceChanges={workspaceChanges}
        workspaceBackups={workspaceBackups}
        onRevertWorkspaceChange={handleRevertWorkspaceChange}
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
                triggerContinue();
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
      <WorktreePanel open={worktreePanelOpen} onClose={() => setWorktreePanelOpen(false)} />
      <SkillCanvasPanel open={skillCanvasPanelOpen} onClose={() => setSkillCanvasPanelOpen(false)} />

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

      <ToolExecutionBlock
        taskStatus={desktopTaskStatus}
        activePlanStatus={activePlan?.status || null}
        pendingApprovalTitle={pendingApproval?.title || null}
        workspaceChanges={workspaceChanges}
        timelineEntries={desktopTimelineEntries}
        onOpenWorkbench={() => setTaskWorkbenchOpen(true)}
      />

      {/* Cross-device handoff banner */}
      <div style={{ padding: "0 16px" }}>
        <HandoffBanner
          onAccept={(handoff) => {
            applyIncomingHandoff({
              handoffId: handoff.handoffId,
              sourceDeviceId: handoff.fromDeviceId,
              agentId: handoff.agentId,
              contextSnapshot: handoff.contextSnapshot as IncomingHandoffSnapshot | undefined,
            });
          }}
        />
        <WearableNotification />
      </div>

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

      <MessageList
        messageListRef={messageListRef}
        listEndRef={listEndRef}
        messages={messages}
        onScroll={handleMessagesScroll}
        onRetry={handleRetryMessage}
        planPanel={activePlan && (
          <PlanPanel
            plan={activePlan}
            onApprove={async () => {
              if (!token) return;
              const updated = await approvePlanApi(token, sessionIdRef.current);
              if (updated) setPlanForSession(sessionIdRef.current, updated);
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
        contextVisualizer={token && sessionIdRef.current ? (
          <ContextVisualizer
            sessionId={sessionIdRef.current}
            token={token}
            instanceId={activeInstanceId || undefined}
          />
        ) : undefined}
      />

      <InputZone
        tokenUsage={tokenUsage}
        streamCost={streamCost}
        visibleStreamFeedback={visibleStreamFeedback}
        continuePrompt={continuePrompt}
        sending={sending}
        chatMode={chatMode}
        chatModeOptions={CHAT_MODE_OPTIONS}
        setChatMode={setChatMode}
        pendingApproval={Boolean(pendingApproval)}
        approvalSubmitting={approvalSubmitting}
        hasActiveWorkbench={desktopTaskStatus !== "idle" || Boolean(activePlan) || workspaceChanges.length > 0}
        workspaceChanges={workspaceChanges}
        onOpenWorkbench={() => setTaskWorkbenchOpen(true)}
        onContinue={triggerContinue}
        activePlanStatus={activePlan?.status || null}
        deepThinkActive={deepThinkActive}
        deepThinkTargetModel={deepThinkTargetModel}
        fabricDevices={fabricDevices}
        pendingAttachments={pendingAttachments}
        pendingAttachmentSummary={pendingAttachmentSummary}
        removePendingAttachment={removePendingAttachment}
        executionMode={executionMode}
        setExecutionMode={setExecutionMode}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        onKeyDown={handleKeyDown}
        onAttachmentChange={handleAttachmentChange}
        attachDisabled={!token}
        uploadingAttachments={uploadingAttachments}
        onSend={() => {
          void handleSend();
        }}
        onStop={stopCurrentTurn}
        iconButtonStyle={iconBtnStyle}
        voiceButton={(
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
        )}
      />

      <ApprovalModal
        request={approvalSheetRequest}
        rememberForSession={rememberApprovalForSession}
        onRememberChange={setRememberApprovalForSession}
        onApprove={() => void handleDesktopApprovalDecision("approved")}
        onReject={() => void handleDesktopApprovalDecision("rejected")}
        submitting={approvalSubmitting}
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

const CHAT_MODE_OPTIONS: Array<{ id: ChatMode; label: string; description: string }> = [
  { id: "ask", label: "Ask", description: "Fast reply mode without tool execution" },
  { id: "agent", label: "Agent", description: "Tool-enabled desktop agent mode" },
  { id: "plan", label: "Plan", description: "Plan-first mode for longer multi-step tasks" },
];

