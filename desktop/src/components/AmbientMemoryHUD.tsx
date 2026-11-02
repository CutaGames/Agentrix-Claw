// Sprint Pre-launch P-3 (2026-05-23) — Ambient Memory HUD.
//
// A compact bottom-left widget that surfaces the agent's long-memory
// system to non-coder users. Today the long-memory + self-evolution
// stack runs invisibly in the backend; users have no signal that the
// agent "remembers them" beyond what's in the current chat session.
//
// What it shows:
//   - The most recently recalled memory snippet with "我记得..." prefix
//   - A tiny pulse animation when a fresh memory is saved (`save_memory`
//     tool call seen in the active turn)
//   - Click to expand into the full memory wiki (Pro mode only) or to
//     a friendly read-only list (Simple/Standard).
//
// Why bottom-left and not header: the header is owned by ChatTitleBar
// which is already crowded. Bottom-left is empty real estate on every
// viewport size and matches the Cursor / Cascade hud convention.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useAuthStore } from "../services/store";
import { recallMemorySlots } from "../services/extensionApi";
import { useUserMode } from "../services/userMode";

interface MemorySnippet {
  key: string;
  value: string;
  importance?: number;
  scope?: string;
}

const REFRESH_MS = 60_000;
const CYCLE_MS = 8_000;

export default function AmbientMemoryHUD() {
  const token = useAuthStore((s) => s.token);
  const userMode = useUserMode();
  const [snippets, setSnippets] = useState<MemorySnippet[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pulse, setPulse] = useState(false);
  const fetchInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!token || fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const res = await recallMemorySlots(token, { scopes: ["agent", "user"], limit: 5 }) as
        | { memories?: Array<{ key: string; value: any; importance?: number; scope?: string }> }
        | Array<{ key: string; value: any; importance?: number; scope?: string }>
        | null;
      const list = Array.isArray(res) ? res : Array.isArray((res as any)?.memories) ? (res as any).memories : [];
      const normalized: MemorySnippet[] = list.map((m: any) => ({
        key: String(m.key || ""),
        value: typeof m.value === "string" ? m.value : JSON.stringify(m.value || "").slice(0, 200),
        importance: typeof m.importance === "number" ? m.importance : undefined,
        scope: m.scope,
      })).filter((m: MemorySnippet) => m.value && m.value.length > 0);
      setSnippets(normalized);
    } catch { /* network / not-ready — silent */ }
    finally { fetchInFlightRef.current = false; }
  }, [token]);

  // Initial fetch + periodic refresh.
  useEffect(() => {
    void refresh();
    const t = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  // Cycle through snippets so a returning user sees variety.
  useEffect(() => {
    if (snippets.length <= 1) return;
    const t = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % snippets.length);
    }, CYCLE_MS);
    return () => window.clearInterval(t);
  }, [snippets.length]);

  // Pulse on save_memory event (we listen to a window event the
  // streaming-turn handler will dispatch when it sees the tool call).
  useEffect(() => {
    const onSaved = () => {
      setPulse(true);
      window.setTimeout(() => setPulse(false), 2400);
      // Refresh shortly after — give backend a moment to commit.
      window.setTimeout(() => { void refresh(); }, 800);
    };
    window.addEventListener("agentrix:memory-saved", onSaved);
    return () => window.removeEventListener("agentrix:memory-saved", onSaved);
  }, [refresh]);

  if (!token) return null;
  if (snippets.length === 0) return null;

  const current = snippets[activeIndex];
  const isPro = userMode === "pro";

  const handleClick = () => {
    // Pro: open memory wiki. Simple/Standard: dispatch a friendly event the
    // chat panel can intercept to open a read-only "我记得..." sheet.
    if (isPro) {
      window.dispatchEvent(new CustomEvent("agentrix:open-memory"));
    } else {
      window.dispatchEvent(new CustomEvent("agentrix:open-memory-readonly"));
    }
  };

  return (
    <div
      style={{ ...wrapperStyle, ...(pulse ? wrapperPulseStyle : {}) }}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
      title={isPro ? "打开记忆 Wiki" : "查看 Agent 记得你的事"}
      data-testid="ambient-memory-hud"
    >
      <span style={leadStyle}>{pulse ? "✨ 我记下了" : "💭 我记得"}</span>
      <span style={textStyle}>{truncate(current.value, 60)}</span>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// ── Styles ─────────────────────────────────────────────────────────────────

const wrapperStyle: CSSProperties = {
  position: "fixed",
  left: 12,
  bottom: 12,
  zIndex: 90,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontSize: 11,
  cursor: "pointer",
  maxWidth: 360,
  boxShadow: "var(--shadow)",
  backdropFilter: "blur(8px)",
  transition: "transform 0.18s, box-shadow 0.18s, border-color 0.18s",
};

const wrapperPulseStyle: CSSProperties = {
  borderColor: "var(--accent)",
  boxShadow: "0 0 0 4px rgba(108, 92, 231, 0.18)",
  transform: "translateY(-2px)",
};

const leadStyle: CSSProperties = {
  flexShrink: 0,
  fontWeight: 700,
  color: "var(--accent-eyebrow)",
  letterSpacing: 0.3,
};

const textStyle: CSSProperties = {
  color: "var(--text)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
