/**
 * IdeBridge — Agentrix ↔ external IDE two-way protocol.
 *
 * Spec source: `docs/agentrix-positioning-2026-05.zh-CN.md` §7 P3.
 * Goal: let Agentrix coexist with Cursor / VS Code / Windsurf rather
 * than compete at the editor layer (C_Path collaboration).
 *
 * Two directions:
 *   (a) IDE → Agentrix:   IDE chat / agent panel can call into
 *                          Agentrix backend (chat + agent tasks +
 *                          long memory). The VS Code / Cursor
 *                          extension is the primary consumer.
 *   (b) Agentrix → IDE:   Agentrix desktop / floating-ball can ask
 *                          the IDE to open a file, jump to a line,
 *                          run a built-in command, etc. Currently
 *                          implemented as one-shot URL invocations
 *                          (see `services/ideBridge.ts` `openInIde`).
 *                          Phase-2 will use a JSON-RPC channel.
 *
 * Scope of this file:
 *   - Wire-level types only. No transport.
 *   - Used by:
 *     - `extensions/vscode-agentrix/`     (the IDE extension, dir (a))
 *     - `desktop/src/services/ideBridge.ts` (dir (b))
 *     - `backend/src/modules/...`         (auth + token exchange)
 *
 * MVP transport summary:
 *   - Dir (a): HTTPS, OAuth-style PAT or device-code flow into
 *     `https://api.agentrix.top`. Same JWT as desktop client.
 *   - Dir (b): URL invocation now (`vscode://`/`cursor://`); future
 *     local JSON-RPC over a UNIX socket / named pipe at
 *     `~/.agentrix/ide-bridge.sock`.
 *
 * Versioning:
 *   - All envelopes carry `protocolVersion: number`. Bump on breaking
 *     change. Servers must accept up to 1 minor below current.
 */

// ─── Versioning ────────────────────────────────────────────────────────

/** Semantic version of this protocol. Bump on breaking change. */
export const IDE_BRIDGE_PROTOCOL_VERSION = 1 as const;

/** Supported IDE targets for direction (b). */
export type IdeBridgeTarget = "cursor" | "vscode" | "windsurf";

/** Supported IDE chat surfaces in direction (a) — the kind of UI inside
 *  the IDE that hosts the Agentrix agent. */
export type IdeBridgeSurface =
  | "vscode-chat"   // VS Code 1.92+ Chat API
  | "cursor-chat"   // Cursor's Chat panel
  | "sidebar-view"  // generic webview sidebar (covers older VS Code)
  | "command-palette"; // one-shot via command

// ─── Direction (a) — IDE → Agentrix ────────────────────────────────────

/**
 * Initial handshake the IDE extension sends after the user signs in.
 * Backend responds with `{ ok: true, user: {...}, capabilities: [...] }`
 * or `401`/`403` on auth failure.
 */
export interface IdeBridgeHandshakeRequest {
  protocolVersion: number;
  /** Free-form extension version string (e.g. "0.1.0"). */
  extensionVersion: string;
  /** Which IDE the extension is running in. */
  ideTarget: IdeBridgeTarget;
  /** Which surface inside the IDE will host the agent UI. */
  surface: IdeBridgeSurface;
  /** Locale for human-readable strings. */
  locale?: string;
  /** Whether the user has Pro Mode unlocked client-side. Backend may
   *  override based on subscription. */
  preferredMode?: "simple" | "standard" | "pro";
}

export interface IdeBridgeHandshakeResponse {
  ok: boolean;
  protocolVersion: number;
  user: { id: string; displayName?: string };
  /** Names of optional features the backend exposes, e.g. ["chat",
   *  "agent-task", "memory-recall", "ide-bridge-reverse"]. */
  capabilities: string[];
  /** Human-readable error if `ok=false`. */
  error?: string;
}

/**
 * Chat turn forwarded from the IDE chat into Agentrix.
 *
 * The IDE extension is responsible for keeping the user's local
 * editor state (`open files`, `selection`, `diagnostics`) up-to-date
 * via this envelope so Agentrix has parity with what Cursor sees.
 */
export interface IdeBridgeChatRequest {
  protocolVersion: number;
  sessionId: string;
  /** Free-form user message. */
  message: string;
  /** Editor state captured at send time. */
  context?: {
    activeFile?: string;
    selection?: { startLine: number; endLine: number; text: string };
    openFiles?: string[];
    workspaceRoot?: string;
    /** Last 10 diagnostics from the IDE's language server. */
    recentDiagnostics?: Array<{
      file: string;
      line: number;
      severity: "error" | "warning" | "info";
      message: string;
    }>;
  };
  /** If true, run as a long-running agent task instead of a streamed
   *  chat reply (delegates to /api/agent-tasks). */
  asAgentTask?: boolean;
}

/**
 * Streamed event the backend pushes back to the IDE extension over SSE
 * or websocket. Mirrors the envelopes used by `/openclaw/proxy/:id/stream`
 * and `/claude/chat` so the extension can reuse Agentrix's existing
 * chat plumbing.
 */
export type IdeBridgeChatEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; ok: boolean; preview?: string }
  | { type: "approval_required"; level: "safe" | "confirm" | "danger"; summary: string }
  | { type: "agent_task_created"; taskId: string }
  | { type: "done"; usage?: { inputTokens: number; outputTokens: number } }
  | { type: "error"; message: string };

// ─── Direction (b) — Agentrix → IDE ────────────────────────────────────

/**
 * One-shot reverse RPC envelope. Phase-1 implementation maps each of
 * these to a `vscode://` or `cursor://` URL invocation; phase-2 will
 * route through a local JSON-RPC channel for richer round-trips.
 */
export type IdeBridgeReverseCommand =
  | { kind: "open-file"; path: string; line?: number; column?: number }
  | { kind: "show-diff"; left: string; right: string; title?: string }
  | { kind: "run-task"; taskName: string; args?: string[] }
  | { kind: "run-command"; commandId: string; args?: unknown[] }
  | { kind: "reveal-symbol"; query: string };

export interface IdeBridgeReverseRequest {
  protocolVersion: number;
  /** Which IDE we want to talk to. */
  target: IdeBridgeTarget;
  /** The actual command. */
  command: IdeBridgeReverseCommand;
}

export interface IdeBridgeReverseResponse {
  ok: boolean;
  /** Best-effort echo of what was launched. */
  launched?: string;
  /** Human-readable error if `ok=false` (e.g. "Cursor not installed"). */
  error?: string;
}

// ─── Backend endpoint catalog (informational) ──────────────────────────

/**
 * Stable backend paths the extension talks to. Kept as constants so we
 * can detect drift from a single place.
 */
export const IDE_BRIDGE_BACKEND_PATHS = {
  /** POST — initial extension handshake, returns capabilities. */
  handshake: "/api/ide-bridge/handshake",
  /** POST (SSE) — streamed chat, mirrors `/api/claude/chat` envelopes. */
  chat: "/api/ide-bridge/chat",
  /** POST — create a long-running agent task. */
  agentTaskCreate: "/api/agent-tasks",
  /** GET — list agent tasks for the user. */
  agentTaskList: "/api/agent-tasks",
  /** GET — recall memory slots (cross-tool memory). */
  memoryRecall: "/api/memory-slots/recall",
  /** Mirrors the existing /claude/chat — second chat path that must
   *  stay in sync per AGENTS.md hard rule #2. */
  claudeChatMirror: "/api/claude/chat",
} as const;

export type IdeBridgeBackendPath =
  typeof IDE_BRIDGE_BACKEND_PATHS[keyof typeof IDE_BRIDGE_BACKEND_PATHS];
