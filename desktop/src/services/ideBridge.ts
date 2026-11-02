import { invoke } from "@tauri-apps/api/core";
import type {
  IdeBridgeReverseCommand,
  IdeBridgeReverseRequest,
  IdeBridgeReverseResponse,
  IdeBridgeTarget,
} from "../../../shared/types/ide-bridge";

export type SupportedIdeTarget = IdeBridgeTarget;

// ─── Phase-1: one-shot reverse RPC (existing `openInIde` retained) ─────

export interface OpenInIdeOptions {
  path: string;
  line?: number;
  column?: number;
  editor?: SupportedIdeTarget;
}

export async function openInIde({
  path,
  line,
  column,
  editor,
}: OpenInIdeOptions): Promise<string> {
  return invoke<string>("desktop_bridge_open_in_ide", {
    path,
    line,
    column,
    editor,
  });
}

// ─── Phase-1.5: shared envelope dispatcher ─────────────────────────────
//
// Sprint Post-launch P-3 (2026-05-24) — IdeBridge protocol unification.
// All reverse-direction commands now flow through this function. Each
// command kind maps to a Tauri command (existing or future stub). This
// gives us a single chokepoint for the protocol while individual Tauri
// commands can be implemented incrementally.

export async function sendIdeBridgeCommand(
  request: IdeBridgeReverseRequest,
): Promise<IdeBridgeReverseResponse> {
  try {
    switch (request.command.kind) {
      case "open-file": {
        const launched = await openInIde({
          editor: request.target,
          path: request.command.path,
          line: request.command.line,
          column: request.command.column,
        });
        return { ok: true, launched };
      }
      case "show-diff": {
        // Phase-2: Tauri command not yet implemented. Falls back to
        // open-file on the right-hand side so the user at least lands
        // on the changed file.
        try {
          await openInIde({
            editor: request.target,
            path: request.command.right,
          });
          return { ok: true, launched: `${request.target} (file fallback)` };
        } catch (err: any) {
          return {
            ok: false,
            error: err?.message || "show-diff fallback failed",
          };
        }
      }
      case "run-task":
      case "run-command":
      case "reveal-symbol": {
        // Phase-2 stubs. We acknowledge the request without invoking
        // anything so the caller can treat unsupported commands as a
        // soft-no-op rather than a hard failure.
        return {
          ok: false,
          error: `command "${request.command.kind}" is not yet implemented (P3 phase-2)`,
        };
      }
      default: {
        const exhaustive: never = request.command;
        return { ok: false, error: `unknown command: ${JSON.stringify(exhaustive)}` };
      }
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// Convenience wrappers for each supported reverse command. Each delegates
// through `sendIdeBridgeCommand` so all logging / error wrapping stays
// centralized. Callers that need richer responses should use
// `sendIdeBridgeCommand` directly.

export async function openFileInIde(
  target: SupportedIdeTarget,
  path: string,
  line?: number,
  column?: number,
): Promise<IdeBridgeReverseResponse> {
  return sendIdeBridgeCommand({
    protocolVersion: 1,
    target,
    command: { kind: "open-file", path, line, column },
  });
}

export async function showDiffInIde(
  target: SupportedIdeTarget,
  left: string,
  right: string,
  title?: string,
): Promise<IdeBridgeReverseResponse> {
  return sendIdeBridgeCommand({
    protocolVersion: 1,
    target,
    command: { kind: "show-diff", left, right, title },
  });
}

export async function runIdeTask(
  target: SupportedIdeTarget,
  taskName: string,
  args?: string[],
): Promise<IdeBridgeReverseResponse> {
  return sendIdeBridgeCommand({
    protocolVersion: 1,
    target,
    command: { kind: "run-task", taskName, args },
  });
}

export async function runIdeCommand(
  target: SupportedIdeTarget,
  commandId: string,
  args?: unknown[],
): Promise<IdeBridgeReverseResponse> {
  return sendIdeBridgeCommand({
    protocolVersion: 1,
    target,
    command: { kind: "run-command", commandId, args },
  });
}

export async function revealSymbolInIde(
  target: SupportedIdeTarget,
  query: string,
): Promise<IdeBridgeReverseResponse> {
  return sendIdeBridgeCommand({
    protocolVersion: 1,
    target,
    command: { kind: "reveal-symbol", query },
  });
}

// Re-export shared types for caller convenience.
export type {
  IdeBridgeReverseCommand,
  IdeBridgeReverseRequest,
  IdeBridgeReverseResponse,
};
