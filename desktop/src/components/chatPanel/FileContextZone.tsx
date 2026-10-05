import type { CSSProperties } from "react";
import type { ChatAttachment } from "../../services/store";
import type { GitFileChange } from "../../services/git";

interface Props {
  pendingAttachments: ChatAttachment[];
  pendingAttachmentSummary: string;
  workspaceChanges: GitFileChange[];
  onRemoveAttachment: (fileName: string) => void;
  onOpenWorkbench: () => void;
}

function formatBytes(size: number) {
  if (!size) return "Unknown size";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileContextZone({
  pendingAttachments,
  pendingAttachmentSummary,
  workspaceChanges,
  onRemoveAttachment,
  onOpenWorkbench,
}: Props) {
  if (!pendingAttachments.length && workspaceChanges.length === 0) {
    return null;
  }

  return (
    <div style={containerStyle}>
      {!!pendingAttachments.length && (
        <div style={attachmentWrapStyle} title={pendingAttachmentSummary}>
          {pendingAttachments.map((attachment) => (
            <div key={attachment.fileName} style={attachmentChipStyle}>
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
                <div style={attachmentNameStyle}>{attachment.originalName}</div>
                <div style={attachmentMetaStyle}>{formatBytes(attachment.size)}</div>
              </div>
              <button onClick={() => onRemoveAttachment(attachment.fileName)} style={chipCloseBtnStyle}>✕</button>
            </div>
          ))}
        </div>
      )}
      {workspaceChanges.length > 0 && (
        <button onClick={onOpenWorkbench} style={workspaceCardStyle}>
          <span style={workspaceEyebrowStyle}>Workspace</span>
          <span style={workspaceTitleStyle}>
            {workspaceChanges.length} changed file{workspaceChanges.length === 1 ? "" : "s"}
          </span>
          <span style={workspaceActionStyle}>Review →</span>
        </button>
      )}
    </div>
  );
}

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const attachmentWrapStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const attachmentChipStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  background: "var(--bg-overlay-light)",
  border: "1px solid var(--border)",
  maxWidth: 280,
};

const attachmentNameStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const attachmentMetaStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--text-dim)",
};

const chipCloseBtnStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 12,
  padding: 0,
};

const workspaceCardStyle: CSSProperties = {
  // v0.7.8 — single-line workspace chip instead of 3-line card.
  // Was: 80px tall card in chat input zone, eating screen real estate
  // duplicated with TASK WORKBENCH banner above. Now: 1 row inline
  // pill that scrolls with the input area.
  display: "flex",
  alignItems: "center",
  gap: 8,
  borderRadius: 999,
  border: "1px solid var(--tone-info-border)",
  background: "var(--tone-info-bg)",
  padding: "5px 12px",
  cursor: "pointer",
  textAlign: "left",
  width: "fit-content",
  maxWidth: "100%",
};

const workspaceEyebrowStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--tone-info-text)",
  textTransform: "uppercase",
  letterSpacing: 0.6,
  fontWeight: 700,
};

const workspaceTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const workspacePreviewStyle: CSSProperties = {
  display: "none", // v0.7.8 — folded into the workbench review screen instead.
};

const workspaceActionStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--tone-info-text)",
  marginLeft: "auto",
};