/**
 * v0.7.10 — Desktop SSE Stream Diagnostics
 *
 * Persists every chat-stream lifecycle event (start, first byte, tool start,
 * tool result, done, error) to localStorage so the user can export a
 * machine-readable trace when "几秒就网络中断" happens. Strict ring buffer
 * (last 200 events, ≤ 100 KB) so the storage cost is bounded.
 *
 * Surface points:
 *   - `recordStreamEvent` — call from store.ts / useStreamingTurn.ts
 *   - `getStreamDiagnostics` — debug panel reads & exports as JSON
 *
 * Why not console.log? WebView2 console history is cleared when the panel is
 * minimized. localStorage survives crashes and panel reloads.
 *
 * The 7 "Session not found" red rows the user reported in v0.7.5+ have ZERO
 * matching backend log entries. This trace lets us see exactly where the
 * onError() call originates: native fetch immediate failure, parser onError,
 * watchdog timeout, retry loop, etc. Each event is timestamped to ms.
 */

const STORAGE_KEY = "agentrix_stream_diag_v1";
const MAX_EVENTS = 200;
const MAX_DETAIL_CHARS = 800;

export type StreamDiagPhase =
  | "request_start"
  | "transport_attempt"
  | "transport_success"
  | "transport_failure"
  | "first_byte"
  | "parser_event"
  | "tool_start"
  | "tool_result"
  | "tool_error"
  | "watchdog_idle"
  | "watchdog_cancel"
  | "reader_done"
  | "reader_error"
  | "done_event"
  | "error_event"
  | "user_retry"
  | "user_continue"
  | "send_blocked"
  | "send_invoked"
  | "byte_gap"
  | "keepalive_recv";

export interface StreamDiagEvent {
  /** ms since epoch */
  ts: number;
  /** ms since the last request_start in the same logical turn */
  relativeMs: number;
  /** Logical turn id — same value across one full chat send → response cycle */
  turnId: string;
  phase: StreamDiagPhase;
  /** Optional short label (`tauri-fetch`, `native-fetch`, tool name, etc.) */
  label?: string;
  /** Truncated detail (≤ 800 chars) */
  detail?: string;
}

let _ringBuffer: StreamDiagEvent[] = [];
let _activeTurnStart: number | null = null;
let _activeTurnId = "";

function loadFromStorage(): StreamDiagEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) : [];
  } catch {
    return [];
  }
}

function saveToStorage(buffer: StreamDiagEvent[]) {
  try {
    // Truncate to MAX_EVENTS + ensure detail is ≤ MAX_DETAIL_CHARS.
    const trimmed = buffer.slice(-MAX_EVENTS).map((e) => ({
      ...e,
      detail: e.detail && e.detail.length > MAX_DETAIL_CHARS
        ? e.detail.slice(0, MAX_DETAIL_CHARS) + "…"
        : e.detail,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota exceeded — drop oldest half and retry once */
    try {
      const half = buffer.slice(-Math.floor(MAX_EVENTS / 2));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(half));
    } catch {
      /* give up; non-essential */
    }
  }
}

if (typeof window !== "undefined") {
  _ringBuffer = loadFromStorage();
}

/**
 * Begin a logical "turn" (one user message → one stream lifecycle).
 * Subsequent events recorded during this turn share the same turnId so
 * the export is filterable.
 */
export function startStreamTurn(label?: string): string {
  _activeTurnStart = Date.now();
  _activeTurnId = `t-${_activeTurnStart}-${Math.random().toString(36).slice(2, 6)}`;
  recordStreamEvent("request_start", label);
  return _activeTurnId;
}

export function recordStreamEvent(
  phase: StreamDiagPhase,
  label?: string,
  detail?: string,
): void {
  if (typeof window === "undefined") return;
  const ts = Date.now();
  const relativeMs = _activeTurnStart ? ts - _activeTurnStart : 0;
  const event: StreamDiagEvent = {
    ts,
    relativeMs,
    turnId: _activeTurnId || "no-turn",
    phase,
    label,
    detail,
  };
  _ringBuffer.push(event);
  if (_ringBuffer.length > MAX_EVENTS) {
    _ringBuffer = _ringBuffer.slice(-MAX_EVENTS);
  }
  saveToStorage(_ringBuffer);
}

export function getStreamDiagnostics(): StreamDiagEvent[] {
  return [..._ringBuffer];
}

export function clearStreamDiagnostics(): void {
  _ringBuffer = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Format diagnostics as human-readable text for clipboard / file export.
 * Last `recentTurns` turns only — older events are ring-buffered out.
 */
export function formatStreamDiagnostics(recentTurns = 5): string {
  const events = getStreamDiagnostics();
  if (events.length === 0) return "(no stream diagnostics recorded)";

  // Group by turnId, pick the last N turns.
  const byTurn = new Map<string, StreamDiagEvent[]>();
  for (const e of events) {
    const arr = byTurn.get(e.turnId) || [];
    arr.push(e);
    byTurn.set(e.turnId, arr);
  }
  const turnIds = Array.from(byTurn.keys()).slice(-recentTurns);

  const lines: string[] = [];
  lines.push(`# Agentrix Desktop Stream Diagnostics`);
  lines.push(`Exported: ${new Date().toISOString()}`);
  lines.push(`Total events: ${events.length}, recent turns: ${turnIds.length}`);
  lines.push("");

  for (const turnId of turnIds) {
    const turnEvents = byTurn.get(turnId) || [];
    if (turnEvents.length === 0) continue;
    const start = new Date(turnEvents[0].ts).toISOString();
    lines.push(`## Turn ${turnId} (started ${start})`);
    for (const e of turnEvents) {
      const rel = `+${(e.relativeMs / 1000).toFixed(2)}s`;
      const label = e.label ? ` [${e.label}]` : "";
      const detail = e.detail ? `\n      ${e.detail}` : "";
      lines.push(`  ${rel.padEnd(8)} ${e.phase}${label}${detail}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
