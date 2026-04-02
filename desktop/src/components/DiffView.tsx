/**
 * DiffView — Renders unified diff output with syntax coloring.
 * Parses standard unified diff format and displays additions/deletions.
 */
import { type CSSProperties, useState, useMemo } from "react";

interface Props {
  diff: string;
  fileName?: string;
  /** Collapsed by default */
  defaultCollapsed?: boolean;
}

interface DiffLine {
  type: "add" | "remove" | "context" | "header";
  content: string;
  lineNo?: number;
}

function parseDiff(raw: string): DiffLine[] {
  const lines = raw.split("\n");
  const result: DiffLine[] = [];
  let lineNo = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      result.push({ type: "header", content: line });
      // Extract starting line number
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) lineNo = parseInt(match[1], 10) - 1;
    } else if (line.startsWith("+")) {
      lineNo++;
      result.push({ type: "add", content: line.slice(1), lineNo });
    } else if (line.startsWith("-")) {
      result.push({ type: "remove", content: line.slice(1) });
    } else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
      result.push({ type: "header", content: line });
    } else {
      lineNo++;
      result.push({ type: "context", content: line.startsWith(" ") ? line.slice(1) : line, lineNo });
    }
  }

  return result;
}

const lineColors: Record<DiffLine["type"], { bg: string; color: string }> = {
  add:     { bg: "rgba(34, 197, 94, 0.1)",  color: "#86efac" },
  remove:  { bg: "rgba(239, 68, 68, 0.1)",  color: "#fca5a5" },
  context: { bg: "transparent",              color: "var(--text-dim, #8892b0)" },
  header:  { bg: "rgba(108, 92, 231, 0.08)", color: "var(--accent-light, #A29BFE)" },
};

export default function DiffView({ diff, fileName, defaultCollapsed = true }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const parsed = useMemo(() => parseDiff(diff), [diff]);

  const addCount = parsed.filter(l => l.type === "add").length;
  const removeCount = parsed.filter(l => l.type === "remove").length;

  return (
    <div style={containerStyle}>
      <div
        style={headerStyle}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {collapsed ? "▶" : "▼"} {fileName || "Diff"}
        </span>
        <span style={statStyle}>
          {addCount > 0 && <span style={{ color: "#86efac" }}>+{addCount}</span>}
          {removeCount > 0 && <span style={{ color: "#fca5a5", marginLeft: 6 }}>-{removeCount}</span>}
        </span>
      </div>

      {!collapsed && (
        <div style={codeContainerStyle}>
          {parsed.map((line, i) => {
            const colors = lineColors[line.type];
            return (
              <div key={i} style={{ ...lineStyle, background: colors.bg }}>
                {line.type !== "header" && (
                  <span style={lineNoStyle}>
                    {line.lineNo ?? ""}
                  </span>
                )}
                <span style={prefixStyle}>
                  {line.type === "add" ? "+" : line.type === "remove" ? "-" : line.type === "header" ? "" : " "}
                </span>
                <span style={{ color: colors.color, flex: 1 }}>
                  {line.content}
                </span>
              </div>
            );
          })}
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
  background: "rgba(13, 17, 23, 0.6)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "8px 12px",
  cursor: "pointer",
  background: "rgba(255,255,255,0.03)",
  borderBottom: "1px solid var(--border, rgba(255,255,255,0.06))",
  gap: 8,
  userSelect: "none",
};

const statStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  fontFamily: "monospace",
  display: "flex",
  gap: 2,
};

const codeContainerStyle: CSSProperties = {
  maxHeight: 300,
  overflow: "auto",
  fontSize: 12,
  fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace',
  lineHeight: 1.6,
};

const lineStyle: CSSProperties = {
  display: "flex",
  paddingLeft: 4,
  paddingRight: 8,
  minHeight: 20,
};

const lineNoStyle: CSSProperties = {
  width: 36,
  textAlign: "right",
  paddingRight: 8,
  color: "rgba(255,255,255,0.2)",
  fontSize: 11,
  userSelect: "none",
  flexShrink: 0,
};

const prefixStyle: CSSProperties = {
  width: 14,
  textAlign: "center",
  fontWeight: 700,
  flexShrink: 0,
  userSelect: "none",
};
