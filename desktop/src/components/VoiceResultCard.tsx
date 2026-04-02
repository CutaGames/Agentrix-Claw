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

const textStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 180,
  overflow: "auto",
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
  width: 28,
  height: 28,
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
