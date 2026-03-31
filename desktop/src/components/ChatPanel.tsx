import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type CSSProperties,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import {
  useAuthStore,
  streamDirectChat,
  streamChat,
  fetchModels,
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
import { gitStatus, gitDiff, gitLog, gitCommit, gitBranchList } from "../services/git";
import { captureScreen } from "../services/screenshot";
import NotificationCenter, { NotificationBadge } from "./NotificationCenter";
import { subscribe as subscribeNotifications, getUnreadCount } from "../services/notifications";
import { type VoiceState } from "../services/voice";
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
import { pushSessionSync, isSessionSyncConnected } from "../services/sessionSync";
import { trackEvent } from "../services/analytics";
import {
  getActivePlan,
  approvePlan as approvePlanApi,
  rejectPlan as rejectPlanApi,
  type AgentPlan,
} from "../services/agentIntelligence";
import PlanPanel from "./PlanPanel";
import { ContextVisualizer } from "./ContextVisualizer";
import CrossDevicePanel from "./CrossDevicePanel";
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
}

type BallState = "idle" | "recording" | "thinking" | "speaking";

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

export default function ChatPanel({ onClose, networkStatus = "online" }: Props) {
  const { token, activeAgentId, agents, setActiveAgent, instances, activeInstanceId, setActiveInstance } =
    useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [ballState, setBallState] = useState<BallState>("idle");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [workspaceDir, setWorkspaceDirState] = useState<string | null>(null);
  const [fileTreeOpen, setFileTreeOpen] = useState(false);
  const [syncConnected, setSyncConnected] = useState(isSessionSyncConnected());
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [historyEntries, setHistoryEntries] = useState<SessionEntry[]>([]);
  const [activePlan, setActivePlan] = useState<AgentPlan | null>(null);
  const [crossDeviceOpen, setCrossDeviceOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'ask' | 'agent' | 'plan'>('agent');
  const activeAgent = useMemo<DesktopAgent | null>(
    () => agents.find((agent) => agent.id === activeAgentId) || null,
    [agents, activeAgentId],
  );

  // ── Multi-tab state ─────────────────────────────────────
  const defaultTabId = `tab-${Date.now()}`;
  const defaultSessionId = `session-${Date.now()}`;
  const [tabs, setTabs] = useState<ChatTab[]>([{ id: defaultTabId, sessionId: defaultSessionId, title: "New Chat", unread: false }]);
  const [activeTabId, setActiveTabId] = useState(defaultTabId);
  const tabMessagesCache = useRef<Record<string, ChatMessage[]>>({});

  const sessionIdRef = useRef(defaultSessionId);
  const abortRef = useRef<AbortController | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioPlayerRef = useRef<AudioQueuePlayer | null>(null);
  const sentenceAccRef = useRef<SentenceAccumulator | null>(null);
  // Track whether the current send was voice-initiated for auto-TTS
  const voiceInitiatedRef = useRef(false);

  const refreshHistory = useCallback(async () => {
    setHistoryEntries(await listSessionEntries());
  }, []);

  // Load workspace directory
  useEffect(() => {
    getWorkspaceDir().then(setWorkspaceDirState).catch(() => {});
    const onSettings = () => getWorkspaceDir().then(setWorkspaceDirState).catch(() => {});
    window.addEventListener("agentrix:workspace-changed", onSettings);
    return () => window.removeEventListener("agentrix:workspace-changed", onSettings);
  }, []);

  useEffect(() => {
    if (token) {
      fetchModels(token).then((m) => {
        if (Array.isArray(m) && m.length) {
          setModels(m);
          // Use user's resolved model from any source (subscription, custom provider, agent-account)
          const activeInst = instances.find((i) => i.id === activeInstanceId);
          if (activeInst?.resolvedModel) {
            setSelectedModel(activeInst.resolvedModel);
          } else {
            setSelectedModel(m[0]?.id || "");
          }
        }
      });
    }
  }, [token]);

  // Sync selected model when instances refresh (e.g., model changed from mobile)
  useEffect(() => {
    const activeInst = instances.find((i) => i.id === activeInstanceId);
    if (activeInst?.resolvedModel && activeInst.resolvedModel !== selectedModel) {
      setSelectedModel(activeInst.resolvedModel);
    }
  }, [instances, activeInstanceId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Tab initialization from persistence ──────────────
  useEffect(() => {
    (async () => {
      const savedTabs = await loadTabs();
      const savedActiveId = await loadActiveTabId();
      if (savedTabs.length > 0) {
        const chatTabs: ChatTab[] = savedTabs.map(t => ({ ...t, unread: false }));
        setTabs(chatTabs);
        const activeId = savedActiveId && chatTabs.find(t => t.id === savedActiveId) ? savedActiveId : chatTabs[0].id;
        setActiveTabId(activeId);
        const activeTab = chatTabs.find(t => t.id === activeId)!;
        sessionIdRef.current = activeTab.sessionId;
        const msgs = await loadSessionMessages(activeTab.sessionId);
        setMessages(msgs);
        tabMessagesCache.current[activeTab.sessionId] = msgs;
      } else {
        const msgs = await loadSessionMessages(sessionIdRef.current);
        setMessages(msgs);
      }
    })();
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
    setMessages([]);
    setPendingAttachments([]);
    setBallState("idle");
    abortRef.current?.abort();
    audioPlayerRef.current?.stopAll();
    sentenceAccRef.current?.reset();
    trackEvent("tab_new");
  }, [messages]);

  const switchTab = useCallback(async (tabId: string) => {
    if (tabId === activeTabId) return;
    // Save current tab's messages to cache
    tabMessagesCache.current[sessionIdRef.current] = messages;
    abortRef.current?.abort();
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
    setPendingAttachments([]);
    setBallState("idle");
  }, [activeTabId, tabs, messages]);

  const closeTab = useCallback(async (tabId: string) => {
    if (tabs.length <= 1) return; // keep at least one tab
    const idx = tabs.findIndex(t => t.id === tabId);
    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);
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
      setPendingAttachments([]);
      setBallState("idle");
    }
  }, [tabs, activeTabId]);

  // Persist tabs whenever they change
  useEffect(() => {
    const persisted: PersistedTab[] = tabs.map(t => ({ id: t.id, sessionId: t.sessionId, title: t.title }));
    void saveTabs(persisted);
    void saveActiveTabId(activeTabId);
  }, [tabs, activeTabId]);

  // Persist current session to localStorage + push to cross-device sync
  useEffect(() => {
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
  }, [messages, refreshHistory, activeTabId]);

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
    abortRef.current?.abort();
    audioPlayerRef.current?.stopAll();
    sentenceAccRef.current?.reset();

    setTabs((prev) => [...prev, { id: nextTabId, sessionId: nextSessionId, title: nextTitle, unread: false }]);
    setActiveTabId(nextTabId);
    sessionIdRef.current = nextSessionId;
    setPendingAttachments([]);
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
          const label = attachment.kind === "image" ? "Image" : "File";
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

  const appendChunk = useCallback((msgId: string, chunk: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, content: m.content + chunk } : m,
      ),
    );
  }, []);

  const finalizeMessage = useCallback((msgId: string) => {
    setMessages((prev) => {
      const updated = prev.map((m) =>
        m.id === msgId ? { ...m, streaming: false } : m,
      );
      // Notify if window not focused
      const msg = updated.find((m) => m.id === msgId);
      if (msg) {
        notifyIfBackground("Agentrix", msg.content.slice(0, 100));
      }
      return updated;
    });
  }, []);

  // Handle slash commands locally
  const handleSlashCommand = useCallback(async (text: string): Promise<boolean> => {
    const trimmed = text.trim();

    // /new — new chat
    if (trimmed === "/new" || trimmed === "/clear") {
      abortRef.current?.abort();
      audioPlayerRef.current?.stopAll();
      sentenceAccRef.current?.reset();
      sessionIdRef.current = `session-${Date.now()}`;
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
        setSelectedModel(match.id);
        addSystemMessage(`✅ Switched to model: ${match.label || match.id}`);
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
  }, [models, messages, activeAgent, activeAgentId, token]);

  const addSystemMessage = useCallback((content: string) => {
    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}`,
      role: "assistant" as const,
      content,
      createdAt: Date.now(),
    }]);
  }, []);

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText || input).trim();
      if ((!text && pendingAttachments.length === 0) || sending || uploadingAttachments) return;
      if (!overrideText) setInput("");

      // Handle slash commands locally
      if (text.startsWith("/") && pendingAttachments.length === 0) {
        const handled = await handleSlashCommand(text);
        if (handled) return;
      }

      const outboundText = serializeMessageForModel(text, pendingAttachments);

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

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setPendingAttachments([]);
      setSending(true);
      setBallState("thinking");
      trackEvent("chat_send", { hasAttachments: pendingAttachments.length > 0, model: selectedModel });

      // Set up streaming TTS if enabled and voice-initiated
      const shouldStreamTTS = ttsEnabled && token && voiceInitiatedRef.current;
      let audioPlayer: AudioQueuePlayer | null = null;
      let sentenceAcc: SentenceAccumulator | null = null;

      if (shouldStreamTTS) {
        audioPlayer = new AudioQueuePlayer(
          token!,
          () => setBallState("idle"),
          (playing) => { if (playing) setBallState("speaking"); },
        );
        audioPlayerRef.current = audioPlayer;
        sentenceAcc = new SentenceAccumulator((sentence) => {
          audioPlayer!.enqueue(sentence, detectLang(sentence));
        });
        sentenceAccRef.current = sentenceAcc;
      }

      if (token) {
        const history = messages.slice(-10).map((m) => ({
          role: m.role,
          content: serializeMessageForModel(m.content, m.attachments || []),
        }));
        if (activeAgent) {
          history.unshift({
            role: "system",
            content: `You are responding as the desktop agent \"${activeAgent.name}\". Keep replies aligned with this agent identity while preserving the user's intent.`,
          });
        }
        history.push({ role: "user", content: outboundText });

        const chunkHandler = (chunk: string) => {
          if (!audioPlayer?.playing) setBallState("speaking");
          appendChunk(assistantId, chunk);
          sentenceAcc?.push(chunk);
        };
        const metaHandler = (meta: { resolvedModel?: string; resolvedModelLabel?: string; plan?: AgentPlan }) => {
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, meta } : m),
          );
          if (meta.plan) setActivePlan(meta.plan);
        };
        const doneHandler = (resolve: () => void) => () => {
          finalizeMessage(assistantId);
          sentenceAcc?.flush();
          // Check for plan in the final message content
          if (token) {
            getActivePlan(token, sessionIdRef.current)
              .then((p) => { if (p) setActivePlan(p); })
              .catch(() => {});
          }
          resolve();
        };
        const errorHandler = (resolve: () => void) => (err: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Error: ${err}`, error: true, streaming: false }
                : m,
            ),
          );
          resolve();
        };

        await new Promise<void>((resolve) => {
          let ac: AbortController;
          if (activeInstanceId) {
            // Route through OpenClaw proxy — uses this instance's model/API config
            ac = streamChat({
              instanceId: activeInstanceId,
              message: outboundText,
              sessionId: sessionIdRef.current,
              token,
              model: selectedModel || undefined,
              mode: chatMode,
              onChunk: chunkHandler,
              onMeta: metaHandler,
              onDone: doneHandler(resolve),
              onError: errorHandler(resolve),
            });
          } else {
            // Fallback: direct Claude chat (no instance)
            ac = streamDirectChat({
              messages: history,
              sessionId: sessionIdRef.current,
              agentId: activeAgentId,
              token,
              onChunk: chunkHandler,
              onDone: doneHandler(resolve),
              onError: errorHandler(resolve),
            });
          }
          abortRef.current = ac;
        });
      }

      setSending(false);
      voiceInitiatedRef.current = false;
      // If no audio queued, reset ball state immediately
      if (!audioPlayer?.playing) {
        setBallState("idle");
      }
    },
    [
      input,
      sending,
      activeAgent,
      activeInstanceId,
      token,
      selectedModel,
      messages,
      pendingAttachments,
      appendChunk,
      finalizeMessage,
      ttsEnabled,
      serializeMessageForModel,
      uploadingAttachments,
      handleSlashCommand,
    ],
  );

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
  }, [voiceState]);

  // Handle voice transcript — auto-send with TTS
  const handleVoiceTranscript = useCallback(
    (text: string) => {
      voiceInitiatedRef.current = true;
      setInput(text);
      handleSend(text);
    },
    [handleSend],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
    abortRef.current?.abort();
    audioPlayerRef.current?.stopAll();
    sentenceAccRef.current?.reset();
    sessionIdRef.current = sid;
    setMessages(stored);
    setPendingAttachments([]);
    setBallState("idle");
    setHistoryOpen(false);
  }, []);

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
            if (!focused) {
              onClose();
            }
          });
        }
      } catch {
        // Not in Tauri — no-op
      }
    })();
    return () => unlisten?.();
  }, [onClose]);

  const panel: CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: 480,
    height: "100%",
    maxHeight: 640,
    background: "var(--bg-panel)",
    borderRadius: "var(--radius)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 8px 40px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255,255,255,0.06)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    animation: "slideIn 0.2s ease-out",
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
      >
        <FloatingBall onTap={onClose} state={ballState} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Instance selector (synced from mobile OpenClaw instances) */}
          <select
            value={activeInstanceId || ""}
            onChange={(e) => setActiveInstance(e.target.value)}
            style={{
              background: "transparent",
              color: "var(--text)",
              border: "none",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              maxWidth: 200,
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
          {models.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                background: "transparent",
                color: "var(--text-dim)",
                border: "none",
                fontSize: 11,
                cursor: "pointer",
                marginLeft: 8,
                WebkitAppRegion: "no-drag",
              }}
            >
              {/* If user has a custom provider model not in platform list, show it as first option */}
              {(() => {
                const activeInst = instances.find((i) => i.id === activeInstanceId);
                const userModel = activeInst?.resolvedModel;
                const userLabel = activeInst?.resolvedModelLabel;
                if (userModel && !models.some((m: any) => m.id === userModel)) {
                  return <option key={userModel} value={userModel}>{userLabel || userModel}</option>;
                }
                return null;
              })()}
              {models.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.label || m.id}
                </option>
              ))}
            </select>
          )}
        </div>
        <button onClick={handleNewChat} style={iconBtnStyle} title="New Chat">
          ＋
        </button>
        <button onClick={() => { setFileTreeOpen(!fileTreeOpen); setHistoryOpen(false); }} style={iconBtnStyle} title="Workspace Files">
          📁
        </button>
        <button onClick={() => { setHistoryOpen(!historyOpen); setFileTreeOpen(false); }} style={iconBtnStyle} title="Chat History">
          📋
        </button>
        <NotificationBadge count={unreadNotifCount} onClick={() => { setNotifOpen(!notifOpen); setHistoryOpen(false); setFileTreeOpen(false); }} />
        <button onClick={() => setCrossDeviceOpen(true)} style={iconBtnStyle} title="Cross-Device Hub">
          🔗
        </button>
        <button onClick={() => setSettingsOpen(true)} style={iconBtnStyle} title="Settings">
          ⚙
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
          onModelChange={setSelectedModel}
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
              if (updated) setActivePlan(updated);
              handleSend("approve");
            }}
            onReject={async () => {
              if (!token) return;
              const updated = await rejectPlanApi(token, sessionIdRef.current, "rejected by user");
              if (updated) setActivePlan(updated);
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
        {/* Agent mode selector */}
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 2 }}>
          {([
            { key: 'ask' as const, label: '💬 Ask', desc: 'Quick Q&A, no tools' },
            { key: 'agent' as const, label: '🤖 Agent', desc: 'Full agent with tools' },
            { key: 'plan' as const, label: '📋 Plan', desc: 'Multi-step plan + approve' },
          ]).map(m => (
            <button
              key={m.key}
              onClick={() => setChatMode(m.key)}
              title={m.desc}
              style={{
                flex: 1,
                padding: '5px 8px',
                borderRadius: 6,
                border: 'none',
                fontSize: 12,
                fontWeight: chatMode === m.key ? 600 : 400,
                background: chatMode === m.key ? 'var(--accent)' : 'transparent',
                color: chatMode === m.key ? '#fff' : 'var(--text-dim)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
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
                <span style={{ fontSize: 14 }}>{attachment.isImage ? "🖼️" : "📎"}</span>
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
    </div>
  );
}

function formatBytes(size: number) {
  if (!size) return "Unknown size";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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

const chipCloseBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
};
