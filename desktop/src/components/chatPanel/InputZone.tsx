import type {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  RefObject,
} from "react";
import type { ChatAttachment } from "../../services/store";
import type { GitFileChange } from "../../services/git";
import type { FabricDevice } from "../../services/realtimeVoice";
import type { ExecutionMode } from "../../services/turnRouter";
import ChatInputComposer from "./ChatInputComposer";
import FileContextZone from "./FileContextZone";
import {
  ChatQuickActions,
  StreamStatusBanner,
} from "./taskStatusUi";

type ChatMode = "ask" | "agent" | "plan";

interface StreamFeedbackState {
  tone: "info" | "warning" | "error" | "success";
  label: string;
  detail?: string;
}

interface Props {
  tokenUsage: { percent: number; used: number; total: number } | null;
  streamCost: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    totalCostUsd: number;
    model: string;
  } | null;
  visibleStreamFeedback: StreamFeedbackState | null;
  continuePrompt: string | null;
  sending: boolean;
  chatMode: ChatMode;
  chatModeOptions: Array<{ id: ChatMode; label: string; description: string }>;
  setChatMode: (mode: ChatMode) => void;
  pendingApproval: boolean;
  approvalSubmitting: boolean;
  hasActiveWorkbench: boolean;
  workspaceChanges: GitFileChange[];
  onOpenWorkbench: () => void;
  onContinue: () => void;
  activePlanStatus?: string | null;
  deepThinkActive: boolean;
  deepThinkTargetModel?: string | null;
  fabricDevices: FabricDevice[];
  pendingAttachments: ChatAttachment[];
  pendingAttachmentSummary: string;
  removePendingAttachment: (fileName: string) => void;
  executionMode: ExecutionMode;
  setExecutionMode: (mode: ExecutionMode) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
  fileInputRef: RefObject<HTMLInputElement>;
  onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onAttachmentChange: (event: ChangeEvent<HTMLInputElement>) => void;
  attachDisabled: boolean;
  uploadingAttachments: boolean;
  onSend: () => void;
  onStop: () => void;
  iconButtonStyle: CSSProperties;
  voiceButton: ReactNode;
}

export default function InputZone({
  tokenUsage,
  streamCost,
  visibleStreamFeedback,
  continuePrompt,
  sending,
  chatMode,
  chatModeOptions,
  setChatMode,
  pendingApproval,
  approvalSubmitting,
  hasActiveWorkbench,
  workspaceChanges,
  onOpenWorkbench,
  onContinue,
  activePlanStatus,
  deepThinkActive,
  deepThinkTargetModel,
  fabricDevices,
  pendingAttachments,
  pendingAttachmentSummary,
  removePendingAttachment,
  executionMode,
  setExecutionMode,
  textareaRef,
  fileInputRef,
  onKeyDown,
  onAttachmentChange,
  attachDisabled,
  uploadingAttachments,
  onSend,
  onStop,
  iconButtonStyle,
  voiceButton,
}: Props) {
  return (
    <div
      style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {(tokenUsage || streamCost) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "var(--text-dim)", flexShrink: 0 }}>Context</span>
          <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              borderRadius: 2,
              transition: "width 0.4s ease",
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
      <StreamStatusBanner
        feedback={visibleStreamFeedback}
        continuePrompt={continuePrompt}
        sending={sending}
        onContinue={onContinue}
      />
      <div style={inputToolbarStyle}>
        <div style={modeRailStyle}>
          {chatModeOptions.map((option) => {
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
        <ChatQuickActions
          hasPendingApproval={pendingApproval}
          approvalSubmitting={approvalSubmitting}
          hasActiveWorkbench={hasActiveWorkbench}
          workspaceChanges={workspaceChanges}
          continuePrompt={continuePrompt}
          sending={sending}
          onOpenWorkbench={onOpenWorkbench}
          onContinue={onContinue}
        />
        {activePlanStatus && chatMode === "plan" && (
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid rgba(134,239,172,0.3)",
            background: "rgba(134,239,172,0.08)",
            color: "#86efac",
          }}>
            📋 Plan {activePlanStatus === "pending" ? "ready" : activePlanStatus}
          </span>
        )}
      </div>
      {deepThinkActive && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderRadius: 8,
          background: "rgba(168,85,247,0.12)",
          border: "1px solid rgba(168,85,247,0.3)",
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
      {fabricDevices.length > 1 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 8,
          background: "rgba(59,130,246,0.1)",
          border: "1px solid rgba(59,130,246,0.25)",
        }}>
          <span style={{ fontSize: 12, color: "#93c5fd", fontWeight: 600 }}>
            🔗 {fabricDevices.length} 设备
          </span>
          {fabricDevices.map((device, index) => (
            <span key={index} style={{
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 999,
              background: device.isPrimary ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.06)",
              color: device.isPrimary ? "#60a5fa" : "var(--text-dim)",
              border: device.isPrimary ? "1px solid rgba(59,130,246,0.4)" : "1px solid transparent",
            }}>
              {device.isPrimary ? "👑 " : ""}{device.deviceType}
            </span>
          ))}
        </div>
      )}
      <FileContextZone
        pendingAttachments={pendingAttachments}
        pendingAttachmentSummary={pendingAttachmentSummary}
        workspaceChanges={workspaceChanges}
        onRemoveAttachment={removePendingAttachment}
        onOpenWorkbench={onOpenWorkbench}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
          fontSize: 11,
          color: "var(--text-dim)",
        }}
      >
        <span style={{ opacity: 0.7 }}>执行</span>
        {(["local-only", "auto", "cloud-only"] as ExecutionMode[]).map((mode) => {
          const active = executionMode === mode;
          const label = mode === "local-only" ? "🔒 端侧" : mode === "cloud-only" ? "☁️ 云端" : "🤖 智能";
          const hint =
            mode === "local-only"
              ? "强制本地 · 失败不切换云端"
              : mode === "cloud-only"
                ? "强制云端 · 忽略本地模型"
                : "自动 · 简单问题本地，复杂用云端";
          return (
            <button
              key={mode}
              onClick={() => setExecutionMode(mode)}
              title={hint}
              style={{
                padding: "3px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: active ? "var(--accent)" : "var(--bg-input)",
                color: active ? "white" : "var(--text-dim)",
                fontSize: 11,
                cursor: "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <ChatInputComposer
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        onKeyDown={onKeyDown}
        onAttachmentChange={onAttachmentChange}
        onOpenFilePicker={() => fileInputRef.current?.click()}
        attachDisabled={attachDisabled}
        uploadingAttachments={uploadingAttachments}
        sending={sending}
        onSend={onSend}
        onStop={onStop}
        iconButtonStyle={iconButtonStyle}
        voiceButton={voiceButton}
      />
    </div>
  );
}

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