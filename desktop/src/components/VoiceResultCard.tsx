/**
 * VoiceResultCard — Floating result card that appears below the floating ball
 * in Voice Mode. Shows agent reply summary with TTS status and quick actions.
 */
import { type CSSProperties, useState, useCallback, useEffect, useRef } from "react";

export interface VoiceResultAction {
  label: string;
  icon: string;
  onClick: () => void;
}

interface Props {
  text: string;
  notice?: string;
  transcript?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Whether TTS is currently playing */
  isSpeaking?: boolean;
  /** Auto-hide after this many ms (0 = no auto-hide) */
  autoHideMs?: number;
  /** Quick action buttons */
  actions?: VoiceResultAction[];
  onDismiss: () => void;
  /** Click to expand into Pro Mode */
  onExpandToPro?: () => void;
  /** Whether the card is streaming (still receiving text) */
  streaming?: boolean;
}

export default function VoiceResultCard({
  text,
  notice,
  transcript,
  history,
  isSpeaking = false,
  autoHideMs = 8000,
  actions,
  onDismiss,
  onExpandToPro,
  streaming = false,
}: Props) {
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyPreview = (history || []).filter((entry) => entry.content.trim()).slice(-4);

  // Auto-hide timer (paused while hovered or speaking or streaming)
  useEffect(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (autoHideMs > 0 && !hovered && !isSpeaking && !streaming) {
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300); // wait for fade-out animation
      }, autoHideMs);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [autoHideMs, hovered, isSpeaking, streaming, onDismiss]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
  }, [text]);

  if (!visible && !streaming) return null;

  // Truncate display text for the card
  const displayText = text.length > 300 ? text.slice(0, 300) + "…" : text;

  return (
    <div
      style={{
        ...cardStyle,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(-8px)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* TTS indicator */}
      {isSpeaking && (
        <div style={speakingIndicator}>
          <span style={speakingDot} />
          <span style={{ fontSize: 10, color: "var(--accent-light, #A29BFE)" }}>Speaking...</span>
        </div>
      )}

      {notice && (
        <div style={noticeStyle}>{notice}</div>
      )}

      {transcript && (
        <div style={contextSection}>
          <div style={sectionLabel}>You said</div>
          <div style={transcriptStyle}>{transcript}</div>
        </div>
      )}

      {historyPreview.length > 0 && (
        <div style={contextSection}>
          <div style={sectionLabel}>Recent history</div>
          <div style={historyListStyle}>
            {historyPreview.map((entry, index) => (
              <div key={`${entry.role}-${index}`} style={historyRowStyle}>
                <span style={historyRoleStyle}>{entry.role === "user" ? "You" : "Agent"}</span>
                <span style={historyTextStyle}>
                  {entry.content.length > 90 ? entry.content.slice(0, 90) + "…" : entry.content}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result text */}
      <div style={textStyle}>
        {displayText}
        {streaming && <span style={{ animation: "dotPulse 1.2s infinite", display: "inline-block" }}>▋</span>}
      </div>

      {/* Action bar */}
      <div style={actionBar}>
        <button onClick={handleCopy} style={actionBtn} title="Copy">
          📋
        </button>
        {onExpandToPro && (
          <button onClick={onExpandToPro} style={actionBtn} title="Expand to Pro Mode">
            🔍
          </button>
        )}
        {actions?.map((action, i) => (
          <button key={i} onClick={action.onClick} style={actionBtn} title={action.label}>
            {action.icon}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {text.length > 300 && onExpandToPro && (
          <button onClick={onExpandToPro} style={expandBtn}>
            Show more →
          </button>
        )}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────

const cardStyle: CSSProperties = {
  background: "rgba(22, 33, 62, 0.95)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 14,
  padding: "12px 16px",
  maxWidth: 420,
  minWidth: 200,
  fontSize: 13,
  color: "var(--text, #eee)",
  lineHeight: 1.6,
  boxShadow: "0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(108,92,231,0.15)",
  animation: "fadeInUp 0.25s ease-out",
  transition: "opacity 0.3s, transform 0.3s",
  cursor: "default",
  userSelect: "text",
};

const speakingIndicator: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 6,
};

const speakingDot: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--accent, #6C5CE7)",
  animation: "dotPulse 1.2s infinite",
};

const noticeStyle: CSSProperties = {
  marginBottom: 10,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(251,191,36,0.28)",
  background: "rgba(245,158,11,0.12)",
  color: "rgba(255,244,214,0.92)",
  fontSize: 12,
  lineHeight: 1.45,
};

const textStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 180,
  overflow: "auto",
};

const contextSection: CSSProperties = {
  marginBottom: 10,
  paddingBottom: 10,
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const sectionLabel: CSSProperties = {
  marginBottom: 6,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-dim, #9CA3AF)",
};

const transcriptStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "rgba(255,255,255,0.92)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const historyListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxHeight: 110,
  overflowY: "auto",
};

const historyRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  fontSize: 11,
  lineHeight: 1.45,
};

const historyRoleStyle: CSSProperties = {
  minWidth: 38,
  color: "var(--accent-light, #A29BFE)",
  fontWeight: 600,
};

const historyTextStyle: CSSProperties = {
  flex: 1,
  color: "rgba(255,255,255,0.82)",
  wordBreak: "break-word",
};

const actionBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginTop: 8,
  paddingTop: 8,
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

const actionBtn: CSSProperties = {
  minWidth: 28,
  height: 28,
  padding: "0 8px",
  borderRadius: 6,
  background: "rgba(255,255,255,0.06)",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--text-dim, #888)",
  transition: "background 0.15s",
};

const expandBtn: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  background: "rgba(108,92,231,0.15)",
  border: "1px solid rgba(108,92,231,0.3)",
  color: "var(--accent-light, #A29BFE)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 500,
};
