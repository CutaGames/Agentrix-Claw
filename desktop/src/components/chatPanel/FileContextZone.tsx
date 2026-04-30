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
          <div style={{ minWidth: 0 }}>
            <div style={workspaceEyebrowStyle}>Workspace Context</div>
            <div style={workspaceTitleStyle}>{workspaceChanges.length} changed file{workspaceChanges.length === 1 ? "" : "s"}</div>
            <div style={workspacePreviewStyle}>
              {workspaceChanges.slice(0, 2).map((change) => `${change.status} ${change.file}`).join(" · ")}
            </div>
          </div>
          <span style={workspaceActionStyle}>Review</span>
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
  background: "rgba(255,255,255,0.06)",
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
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  borderRadius: 12,
  border: "1px solid rgba(125,211,252,0.18)",
  background: "rgba(125,211,252,0.08)",
  padding: "10px 12px",
  cursor: "pointer",
  textAlign: "left",
};

const workspaceEyebrowStyle: CSSProperties = {
  fontSize: 10,
  color: "#7dd3fc",
  textTransform: "uppercase",
  letterSpacing: 0.8,
  fontWeight: 700,
};

const workspaceTitleStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 13,
  fontWeight: 700,
  color: "#e0f2fe",
};

const workspacePreviewStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: "#cbd5e1",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const workspaceActionStyle: CSSProperties = {
  flexShrink: 0,
  fontSize: 11,
  fontWeight: 700,
  color: "#bae6fd",
};