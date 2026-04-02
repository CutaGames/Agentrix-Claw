/**
 * TerminalOutput — Renders command execution output with ANSI color support.
 * Strips/converts basic ANSI escape codes to styled spans.
 */
import { type CSSProperties, useState, useMemo, useRef, useEffect } from "react";

interface Props {
  command?: string;
  output: string;
  exitCode?: number | null;
  /** Show elapsed time */
  durationMs?: number;
  /** Whether output is still streaming */
  streaming?: boolean;
  /** Collapsed by default */
  defaultCollapsed?: boolean;
}

// Basic ANSI color code mapping
const ANSI_COLORS: Record<string, string> = {
  "30": "#555",    "31": "#f87171", "32": "#86efac", "33": "#fcd34d",
  "34": "#93c5fd", "35": "#d8b4fe", "36": "#67e8f9", "37": "#e5e7eb",
  "90": "#6b7280", "91": "#fca5a5", "92": "#bbf7d0", "93": "#fef08a",
  "94": "#bfdbfe", "95": "#e9d5ff", "96": "#a5f3fc", "97": "#f3f4f6",
};

interface StyledSpan {
  text: string;
  color?: string;
  bold?: boolean;
}

function parseAnsi(raw: string): StyledSpan[] {
  const parts: StyledSpan[] = [];
  let currentColor: string | undefined;
  let bold = false;
  let lastIndex = 0;

  // Match ANSI escape sequences: \x1B[...m
  const regex = /\x1B\[([0-9;]*)m/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(raw)) !== null) {
    // Push text before this escape
    if (match.index > lastIndex) {
      parts.push({ text: raw.slice(lastIndex, match.index), color: currentColor, bold });
    }
    lastIndex = match.index + match[0].length;

    // Parse codes
    const codes = match[1].split(";").filter(Boolean);
    for (const code of codes) {
      if (code === "0") { currentColor = undefined; bold = false; }
      else if (code === "1") { bold = true; }
      else if (ANSI_COLORS[code]) { currentColor = ANSI_COLORS[code]; }
    }
  }

  // Push remaining text
  if (lastIndex < raw.length) {
    parts.push({ text: raw.slice(lastIndex), color: currentColor, bold });
  }

  return parts;
}

export default function TerminalOutput({
  command,
  output,
  exitCode,
  durationMs,
  streaming = false,
  defaultCollapsed = false,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const scrollRef = useRef<HTMLDivElement>(null);
  const parsed = useMemo(() => parseAnsi(output), [output]);

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (streaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output, streaming]);

  const isError = exitCode !== null && exitCode !== undefined && exitCode !== 0;

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle} onClick={() => setCollapsed(!collapsed)}>
        <span style={{ fontSize: 11, color: "var(--text-dim)", marginRight: 6 }}>
          {collapsed ? "▶" : "▼"}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "#67e8f9", fontFamily: "monospace" }}>
          $
        </span>
        {command && (
          <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text)", marginLeft: 6, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {command}
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {streaming && (
            <span style={{ fontSize: 10, color: "#fcd34d", animation: "dotPulse 1.2s infinite" }}>●</span>
          )}
          {durationMs !== undefined && (
            <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
              {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
          {exitCode !== null && exitCode !== undefined && (
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: isError ? "#fca5a5" : "#86efac",
              padding: "1px 5px",
              borderRadius: 4,
              background: isError ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
            }}>
              {isError ? `exit ${exitCode}` : "✓"}
            </span>
          )}
        </div>
      </div>

      {!collapsed && (
        <div ref={scrollRef} style={outputStyle}>
          {parsed.map((span, i) => (
            <span
              key={i}
              style={{
                color: span.color || "var(--text-dim, #8892b0)",
                fontWeight: span.bold ? 700 : 400,
              }}
            >
              {span.text}
            </span>
          ))}
          {streaming && <span style={{ animation: "dotPulse 1.2s infinite" }}>▋</span>}
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────

const containerStyle: CSSProperties = {
  border: "1px solid var(--border, rgba(255,255,255,0.08))",
  borderRadius: 10,
  overflow: "hidden",
  margin: "6px 0",
  background: "rgba(13, 17, 23, 0.75)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "6px 10px",
  cursor: "pointer",
  background: "rgba(255,255,255,0.02)",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  userSelect: "none",
};

const outputStyle: CSSProperties = {
  padding: "8px 12px",
  maxHeight: 250,
  overflow: "auto",
  fontSize: 12,
  fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace',
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};
