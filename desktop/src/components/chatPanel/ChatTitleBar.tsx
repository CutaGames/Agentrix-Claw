import type { CSSProperties, MouseEvent } from "react";
import FloatingBall from "../FloatingBall";
import { DESKTOP_LOCAL_MODEL_ID, DESKTOP_LOCAL_MODEL_LABEL, isDesktopLocalModelId } from "../../services/localChat";
import { NotificationBadge } from "../NotificationCenter";
import type { OpenClawInstance } from "../../services/store";
import type { ExecutionMode } from "../../services/turnRouter";

/**
 * Codex-borrow P1 — three-tier executionMode segmented selector.
 * Maps to backend `tier` field: local-only → 'local', auto → 'smart',
 * cloud-only → 'cloud'. The UI labels stay in product Chinese.
 */
const TIER_OPTIONS: Array<{ mode: ExecutionMode; label: string; tip: string }> = [
  { mode: "local-only", label: "端侧", tip: "仅本机运行，数据不离开设备" },
  { mode: "auto",       label: "智能", tip: "后端按复杂度自动选最性价比模型" },
  { mode: "cloud-only", label: "云端", tip: "始终使用云端高能力模型" },
];

interface Props {
  ballState: "idle" | "recording" | "thinking" | "speaking";
  onClose: () => void;
  onMouseDown: (event: MouseEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: MouseEvent<HTMLDivElement>) => void;
  compactTitleBar: boolean;
  compactHeaderTitle: string;
  compactHeaderSubtitle: string;
  activeInstanceId: string | null;
  setActiveInstance: (instanceId: string) => void;
  instances: OpenClawInstance[];
  selectedModel: string;
  persistSelectedModel: (modelId: string) => Promise<boolean> | void;
  /** Codex-borrow P1 — user-facing 3-tier preference. */
  executionMode: ExecutionMode;
  setExecutionMode: (mode: ExecutionMode) => void;
  /** Last TierDecision micro-copy emitted by backend (optional). */
  lastTierMicroCopy?: string | null;
  activeHeaderInstance?: OpenClawInstance;
  models: Array<{ id: string; label?: string }>;
  handleNewChat: () => void;
  fileTreeOpen: boolean;
  setFileTreeOpen: (value: boolean) => void;
  historyOpen: boolean;
  setHistoryOpen: (value: boolean) => void;
  unreadNotifCount: number;
  notifOpen: boolean;
  setNotifOpen: (value: boolean) => void;
  setCrossDeviceOpen: (value: boolean) => void;
  setTaskWorkbenchOpen: (value: boolean) => void;
  showMoreMenu: boolean;
  setShowMoreMenu: (value: boolean | ((prev: boolean) => boolean)) => void;
  setEconomyPanelOpen: (value: boolean) => void;
  setMemoryPanelOpen: (value: boolean) => void;
  setTaskLogPanelOpen: (value: boolean) => void;
  setDreamPanelOpen: (value: boolean) => void;
  setPluginPanelOpen: (value: boolean) => void;
  setWikiPanelOpen: (value: boolean) => void;
  setMcpPanelOpen: (value: boolean) => void;
  setWorktreePanelOpen: (value: boolean) => void;
  setSkillCanvasPanelOpen: (value: boolean) => void;
  setDeepOsPanelOpen: (value: boolean) => void;
  setSettingsOpen: (value: boolean) => void;
  effectiveProMode: boolean;
  enterWindowProMode: () => Promise<void> | void;
  toggleWindowMaximize: () => Promise<void> | void;
  windowChromeState: { maximized: boolean; fullscreen: boolean };
  syncConnected: boolean;
  iconBtnStyle: CSSProperties;
  windowActionBtnStyle: CSSProperties;
}

export default function ChatTitleBar({
  ballState,
  onClose,
  onMouseDown,
  onDoubleClick,
  compactTitleBar,
  compactHeaderTitle,
  compactHeaderSubtitle,
  activeInstanceId,
  setActiveInstance,
  instances,
  selectedModel,
  persistSelectedModel,
  executionMode,
  setExecutionMode,
  lastTierMicroCopy,
  activeHeaderInstance,
  models,
  handleNewChat,
  fileTreeOpen,
  setFileTreeOpen,
  historyOpen,
  setHistoryOpen,
  unreadNotifCount,
  notifOpen,
  setNotifOpen,
  setCrossDeviceOpen,
  setTaskWorkbenchOpen,
  showMoreMenu,
  setShowMoreMenu,
  setEconomyPanelOpen,
  setMemoryPanelOpen,
  setTaskLogPanelOpen,
  setDreamPanelOpen,
  setPluginPanelOpen,
  setWikiPanelOpen,
  setMcpPanelOpen,
  setWorktreePanelOpen,
  setSkillCanvasPanelOpen,
  setDeepOsPanelOpen,
  setSettingsOpen,
  effectiveProMode,
  enterWindowProMode,
  toggleWindowMaximize,
  windowChromeState,
  syncConnected,
  iconBtnStyle,
  windowActionBtnStyle,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        gap: 10,
        WebkitAppRegion: "drag",
      }}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
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
            <select
              value={activeInstanceId || ""}
              onChange={(event) => setActiveInstance(event.target.value)}
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
            <select
              data-testid="chat-model-select"
              value={selectedModel}
              onChange={(event) => { void persistSelectedModel(event.target.value); }}
              data-no-drag="true"
              style={{
                background: "var(--surface-2, rgba(255,255,255,0.04))",
                color: "var(--text, #f0f6ff)",
                border: "1px solid var(--border, #2a3a52)",
                borderRadius: 6,
                padding: "3px 6px",
                fontSize: 11,
                cursor: "pointer",
                marginLeft: 8,
                maxWidth: 260,
                WebkitAppRegion: "no-drag",
              }}
            >
              {(() => {
                const userModel = activeHeaderInstance?.resolvedModel;
                const userLabel = activeHeaderInstance?.resolvedModelLabel;
                if (userModel && !models.some((m) => m.id === userModel) && !isDesktopLocalModelId(userModel)) {
                  return <option key={userModel} value={userModel}>{userLabel || userModel}</option>;
                }
                return null;
              })()}
              <option value={DESKTOP_LOCAL_MODEL_ID}>{DESKTOP_LOCAL_MODEL_LABEL}</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label || model.id}
                </option>
              ))}
            </select>
            {/* Codex-borrow P1 — three-tier segmented selector. */}
            <div
              data-testid="chat-tier-selector"
              data-no-drag="true"
              role="radiogroup"
              aria-label="Execution tier"
              style={{
                display: "inline-flex",
                marginLeft: 8,
                border: "1px solid var(--border, #2a3a52)",
                borderRadius: 6,
                overflow: "hidden",
                WebkitAppRegion: "no-drag",
              }}
            >
              {TIER_OPTIONS.map((opt) => {
                const active = executionMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={opt.tip}
                    onClick={() => setExecutionMode(opt.mode)}
                    data-tier-option={opt.mode}
                    style={{
                      background: active ? "var(--accent, #4f8cff)" : "var(--surface-2, rgba(255,255,255,0.04))",
                      color: active ? "#fff" : "var(--text-muted, #b8c5d6)",
                      border: "none",
                      padding: "3px 8px",
                      fontSize: 11,
                      cursor: "pointer",
                      WebkitAppRegion: "no-drag",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {lastTierMicroCopy && (
              <span
                data-testid="chat-tier-microcopy"
                title={lastTierMicroCopy}
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  color: "var(--text-muted, #93a4bd)",
                  maxWidth: 280,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  WebkitAppRegion: "no-drag",
                }}
              >
                {lastTierMicroCopy}
              </span>
            )}
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
          <button onClick={handleNewChat} style={iconBtnStyle} title="New Chat">＋</button>
          <button onClick={() => { setFileTreeOpen(!fileTreeOpen); setHistoryOpen(false); }} style={iconBtnStyle} title="Workspace Files">📁</button>
          <button onClick={() => { setHistoryOpen(!historyOpen); setFileTreeOpen(false); }} style={iconBtnStyle} title="Chat History">📋</button>
          <div data-no-drag="true" style={{ display: "flex", WebkitAppRegion: "no-drag" }}>
            <NotificationBadge count={unreadNotifCount} onClick={() => { setNotifOpen(!notifOpen); setHistoryOpen(false); setFileTreeOpen(false); }} />
          </div>
          <button onClick={() => setCrossDeviceOpen(true)} style={iconBtnStyle} title="Cross-Device Hub">🔗</button>
          <button onClick={() => setTaskWorkbenchOpen(true)} style={iconBtnStyle} title="Task Workbench">🗂</button>
          <button onClick={() => setDeepOsPanelOpen(true)} style={iconBtnStyle} title="Deep OS / Local-first">🧭</button>
          <div style={{ position: "relative" }}>
            <button
              data-testid="chat-toolbar-more"
              aria-label="chat-toolbar-more"
              onClick={() => setShowMoreMenu((value) => !value)}
              style={iconBtnStyle}
              title="More panels"
            >
              ⋯
            </button>
            {showMoreMenu && (
              <>
                <div
                  onClick={() => setShowMoreMenu(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 40, background: "transparent" }}
                />
                <div
                  data-testid="chat-toolbar-more-menu"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    zIndex: 41,
                    minWidth: 180,
                    padding: 6,
                    background: "var(--surface, #1a2235)",
                    border: "1px solid var(--border, #2a3a52)",
                    borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {[
                    { emoji: "🌿", label: "Worktree Board", action: () => setWorktreePanelOpen(true) },
                    { emoji: "🕸", label: "Skill Canvas", action: () => setSkillCanvasPanelOpen(true) },
                    { emoji: "💰", label: "Agent Economy", action: () => setEconomyPanelOpen(true) },
                    { emoji: "📋", label: "Work Log", action: () => setTaskLogPanelOpen(true) },
                    { emoji: "🧠", label: "Memory", action: () => setMemoryPanelOpen(true) },
                    { emoji: "💤", label: "Dreaming", action: () => setDreamPanelOpen(true) },
                    { emoji: "🧩", label: "Plugin Hub", action: () => setPluginPanelOpen(true) },
                    { emoji: "📝", label: "Memory Wiki", action: () => setWikiPanelOpen(true) },
                    { emoji: "🔌", label: "MCP Manager", action: () => setMcpPanelOpen(true) },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => { item.action(); setShowMoreMenu(false); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "transparent",
                        color: "var(--text, #f0f6ff)",
                        cursor: "pointer",
                        textAlign: "left",
                        fontSize: 13,
                        WebkitAppRegion: "no-drag",
                      }}
                      onMouseEnter={(event) => { (event.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                      onMouseLeave={(event) => { (event.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <span style={{ fontSize: 16 }}>{item.emoji}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
        <button onClick={() => setSettingsOpen(true)} style={iconBtnStyle} title="Settings">⚙</button>
        {!effectiveProMode && (
          <button onClick={() => void enterWindowProMode()} style={windowActionBtnStyle} title="Enter Pro mode">Pro</button>
        )}
        <button
          onClick={() => void toggleWindowMaximize()}
          style={windowActionBtnStyle}
          title={windowChromeState.maximized ? "Restore window" : "Maximize window (F11 for fullscreen)"}
        >
          {windowChromeState.maximized ? "Restore" : "Max"}
        </button>
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
        <button onClick={onClose} style={iconBtnStyle} title="Close (Esc)">✕</button>
      </div>
    </div>
  );
}
