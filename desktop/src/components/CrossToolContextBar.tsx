// Sprint Pre-launch P-4 (2026-05-23) — Cross-tool context bar.
//
// Compact pill that lives next to the floating pet (PetCompanionWindow).
// Shows the LATEST captured cross-tool context — title of the window
// the user was just on (not Agentrix). Click expands a short timeline
// of the last 5 entries. This makes the differentiation "Agentrix sees
// what you do across tools, Cursor only sees its own window" visible.
//
// Source: `services/crossToolContext.ts` polls active-window every 8 s
// and persists to localStorage. We subscribe to the
// `agentrix:cross-tool-context` event so the bar refreshes immediately
// after a new sample.

import { useEffect, useState, type CSSProperties } from "react";
import {
  getCrossToolContext,
  getLatestCrossToolContext,
  type CrossToolContextEntry,
  type ToolApp,
} from "../services/crossToolContext";

const APP_LABEL: Record<ToolApp, string> = {
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  vscode: "VS Code",
  cursor: "Cursor",
  windsurf: "Windsurf",
  office: "Office",
  terminal: "终端",
  agentrix: "Agentrix",
  other: "App",
};

const APP_ICON: Record<ToolApp, string> = {
  chrome: "🌐",
  edge: "🌐",
  firefox: "🦊",
  vscode: "💻",
  cursor: "💻",
  windsurf: "💻",
  office: "📄",
  terminal: "▷",
  agentrix: "🐾",
  other: "🪟",
};

interface Props {
  /** When true, renders for the pet-companion overlay (smaller, transparent fit). */
  compact?: boolean;
}

export default function CrossToolContextBar({ compact = false }: Props) {
  const [latest, setLatest] = useState<CrossToolContextEntry | null>(getLatestCrossToolContext);
  const [entries, setEntries] = useState<CrossToolContextEntry[]>(getCrossToolContext);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.latest) setLatest(detail.latest as CrossToolContextEntry);
      if (Array.isArray(detail.all)) setEntries(detail.all as CrossToolContextEntry[]);
    };
    window.addEventListener("agentrix:cross-tool-context", onUpdate);
    return () => window.removeEventListener("agentrix:cross-tool-context", onUpdate);
  }, []);

  if (!latest) return null;

  const recent = entries.slice(-5).reverse();

  return (
    <div
      style={{ ...wrapperStyle, ...(compact ? compactWrapperStyle : {}) }}
      data-testid="cross-tool-context-bar"
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{ ...pillStyle, ...(compact ? compactPillStyle : {}) }}
        title={latest.title}
        aria-expanded={expanded}
      >
        <span style={iconStyle}>{APP_ICON[latest.app]}</span>
        <span style={textStyle}>
          <span style={leadStyle}>{APP_LABEL[latest.app]}:</span>{" "}
          {truncate(latest.title, compact ? 28 : 60)}
        </span>
        <span style={chevronStyle}>{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div style={{ ...timelineStyle, ...(compact ? compactTimelineStyle : {}) }}>
          <div style={timelineHeader}>
            最近你在
          </div>
          {recent.map((entry, idx) => (
            <div key={`${entry.capturedAt}-${idx}`} style={timelineRowStyle}>
              <span style={iconStyle}>{APP_ICON[entry.app]}</span>
              <span style={timelineLabelStyle}>{APP_LABEL[entry.app]}</span>
              <span style={timelineTitleStyle}>{truncate(entry.title, compact ? 32 : 80)}</span>
              <span style={timelineTimeStyle}>{relativeTime(entry.capturedAt)}</span>
            </div>
          ))}
          {recent.length === 0 && (
            <div style={{ ...timelineRowStyle, color: "var(--text-muted)" }}>
              暂无跨工具记录
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(ts).toLocaleDateString();
}

// ── Styles ──────────────────────────────────────────────────────────────────

const wrapperStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  pointerEvents: "auto",
};

const compactWrapperStyle: CSSProperties = {
  maxWidth: 280,
};

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 10px",
  borderRadius: 999,
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: 11,
  cursor: "pointer",
  boxShadow: "var(--shadow)",
  backdropFilter: "blur(8px)",
};

const compactPillStyle: CSSProperties = {
  fontSize: 10,
  padding: "3px 8px",
};

const iconStyle: CSSProperties = {
  fontSize: 12,
  flexShrink: 0,
};

const textStyle: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: 320,
};

const leadStyle: CSSProperties = {
  color: "var(--accent-eyebrow)",
  fontWeight: 700,
  marginRight: 2,
};

const chevronStyle: CSSProperties = {
  fontSize: 9,
  color: "var(--text-muted)",
  flexShrink: 0,
};

const timelineStyle: CSSProperties = {
  marginTop: 6,
  padding: 8,
  borderRadius: 12,
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 280,
};

const compactTimelineStyle: CSSProperties = {
  minWidth: 240,
};

const timelineHeader: CSSProperties = {
  fontSize: 10,
  color: "var(--accent-eyebrow)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  fontWeight: 700,
};

const timelineRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  color: "var(--text)",
};

const timelineLabelStyle: CSSProperties = {
  fontWeight: 600,
  color: "var(--accent-eyebrow)",
  flexShrink: 0,
  minWidth: 48,
};

const timelineTitleStyle: CSSProperties = {
  flex: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const timelineTimeStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
  flexShrink: 0,
};
