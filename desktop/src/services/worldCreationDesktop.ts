/**
 * worldCreationDesktop — Desktop (Tauri 2.0) service layer for the v6
 * AI World Creation platform, Tier_C desktop creator.
 *
 * Two concerns live here:
 *   A) REST — thin typed wrappers over the `/v1/world-creation/*` endpoints
 *      (generate / continue / revert / history / publish / task status). All
 *      go through the shared `apiFetch` transport with a Bearer token read
 *      from the desktop auth store.
 *   B) Tauri sandbox bridge — invoke wrappers for the L2 WASM `compute.run`
 *      path and the isolated experience window (open / close).
 *
 * The desktop surface is the off-device execution target for Mobile-dispatched
 * Tier_C creation tasks (Mobile may author Tier_A/B locally but routes Tier_C
 * authoring here, R3.7 / R8.7). Every continuum edit issued from here carries
 * `surface: 'desktop'`.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md
 *   — Tier_C desktop creator, R5.6 (sandbox isolation), R6.3 / R6.4
 *     (compute.run capability + deny-by-default), R8 (Creation_Task_Queue).
 */

import { apiFetch, API_BASE, useAuthStore } from "./store";
import type {
  ContinuumEditRequest,
  ContinuumEditResponse,
  EcsWorldHistoryResponse,
  GenerateEcsWorldRequest,
  GenerateEcsWorldResponse,
  GetCreationTaskResponse,
  PublishPlotResponse,
  RevertEcsWorldRequest,
  RevertEcsWorldResponse,
} from "../../../shared/types/world-creation-api.ts";

// ────────────────────────────────────────────────────────────────────────────
// A) REST helpers
// ────────────────────────────────────────────────────────────────────────────

/** Path prefix for the world-creation API. `API_BASE` already includes `/api`. */
const WORLD_CREATION_PREFIX = "/v1/world-creation";

/**
 * Read the current bearer token from the auth store without subscribing as a
 * React hook (these helpers are called from event handlers / async flows).
 */
function getAuthToken(): string | null {
  try {
    return useAuthStore.getState().token;
  } catch {
    return null;
  }
}

/**
 * Unified fetch helper for world-creation REST calls.
 *
 * - Prefixes `path` with `${API_BASE}` (already `/api`-suffixed).
 * - Attaches `Authorization: Bearer <token>` when a token is available.
 * - Sets a JSON content type for requests that carry a body.
 * - Parses the JSON response; throws `Error(message)` on a non-OK status,
 *   preferring a server-provided `message` / `error` / `detail` field.
 */
async function wcFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await apiFetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const body = parsed as
      | { message?: string; error?: string | { detail?: string }; detail?: string }
      | null;
    const errField = body?.error;
    const message =
      body?.message ||
      (typeof errField === "string" ? errField : errField?.detail) ||
      body?.detail ||
      `请求失败 (HTTP ${res.status})`;
    throw new Error(message);
  }

  return parsed as T;
}

/** POST `/v1/world-creation/plots/:plotId/generate` — generate an ECS_World draft (R3.1). */
export async function generateEcsWorld(
  plotId: string,
  body: GenerateEcsWorldRequest,
): Promise<GenerateEcsWorldResponse> {
  return wcFetch<GenerateEcsWorldResponse>(
    `${WORLD_CREATION_PREFIX}/plots/${encodeURIComponent(plotId)}/generate`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

/**
 * POST `/v1/world-creation/plots/:plotId/continue` — unified continuum edit
 * (prompt-drive / co-edit / hand-build, R3.4). Forces `surface: 'desktop'` so
 * Tier_C edits are honored locally on this surface rather than re-dispatched.
 */
export async function continueEditing(
  plotId: string,
  body: ContinuumEditRequest,
): Promise<ContinuumEditResponse> {
  const payload: ContinuumEditRequest = { ...body, surface: "desktop" };
  return wcFetch<ContinuumEditResponse>(
    `${WORLD_CREATION_PREFIX}/plots/${encodeURIComponent(plotId)}/continue`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/** POST `/v1/world-creation/plots/:plotId/revert` — restore a prior version (R3.5). */
export async function revertEcsWorld(
  plotId: string,
  body: RevertEcsWorldRequest,
): Promise<RevertEcsWorldResponse> {
  return wcFetch<RevertEcsWorldResponse>(
    `${WORLD_CREATION_PREFIX}/plots/${encodeURIComponent(plotId)}/revert`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

/** GET `/v1/world-creation/plots/:plotId/history` — diff chain (oldest → newest). */
export async function getEcsHistory(plotId: string): Promise<EcsWorldHistoryResponse> {
  return wcFetch<EcsWorldHistoryResponse>(
    `${WORLD_CREATION_PREFIX}/plots/${encodeURIComponent(plotId)}/history`,
    { method: "GET" },
  );
}

/** POST `/v1/world-creation/plots/:plotId/publish` — publish & get a share code (R10.1 / R11.1). */
export async function publishPlot(plotId: string): Promise<PublishPlotResponse> {
  return wcFetch<PublishPlotResponse>(
    `${WORLD_CREATION_PREFIX}/plots/${encodeURIComponent(plotId)}/publish`,
    { method: "POST" },
  );
}

/** GET `/v1/world-creation/tasks/:taskId` — Creation_Task status (R8). */
export async function getCreationTask(taskId: string): Promise<GetCreationTaskResponse> {
  return wcFetch<GetCreationTaskResponse>(
    `${WORLD_CREATION_PREFIX}/tasks/${encodeURIComponent(taskId)}`,
    { method: "GET" },
  );
}

// ────────────────────────────────────────────────────────────────────────────
// B) Tauri sandbox bridge (L2 WASM compute.run + isolated experience window)
// ────────────────────────────────────────────────────────────────────────────

/** Lazily import the Tauri core `invoke` (keeps web/dev bundling happy). */
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/**
 * Normalize a Tauri invoke rejection (the Rust side rejects with a string,
 * typically formatted as `CODE: detail`) into an `Error` carrying that message.
 */
function toSandboxError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "string") return new Error(err);
  try {
    return new Error(JSON.stringify(err));
  } catch {
    return new Error(String(err));
  }
}

/** Request shape for a Tier_C L2 WASM `compute.run` tick (R6.3 / R6.4). */
export interface ComputeRunRequest {
  moduleId: string;
  entry: string;
  capabilities: string[];
  /** Reviewed WASM bytecode as a byte array (empty in UI-demo mode). */
  wasmBytes: number[];
  input: unknown;
  /** Optional fuel budget bounding execution (deterministic gas). */
  fuel?: number;
}

/** Result of a `compute.run` tick. */
export interface ComputeRunResult {
  moduleId: string;
  output: unknown;
}

/**
 * Run one Tier_C computation inside the L2 WASM sandbox via
 * `world_sandbox_compute_run`.
 *
 * IMPORTANT: the Rust `ComputeRunRequest` struct has no `rename_all`, so every
 * nested field MUST be sent as snake_case (`module_id`, `wasm_bytes`, ...).
 * The camelCase TS API is mapped to snake_case here on the way in, and the
 * snake_case Rust response (`module_id`) is mapped back out.
 */
export async function computeRun(req: ComputeRunRequest): Promise<ComputeRunResult> {
  try {
    const res = await tauriInvoke<{ module_id: string; output: unknown }>(
      "world_sandbox_compute_run",
      {
        request: {
          module_id: req.moduleId,
          entry: req.entry,
          capabilities: req.capabilities,
          wasm_bytes: req.wasmBytes,
          input: req.input,
          fuel: req.fuel,
        },
      },
    );
    return { moduleId: res.module_id, output: res.output };
  } catch (err) {
    throw toSandboxError(err);
  }
}

/**
 * Open the isolated experience window for a Plot (R5.6 sandbox isolation) via
 * `world_sandbox_open_isolated_window`. Resolves to the created window label.
 */
export async function openIsolatedExperience(plotId: string): Promise<string> {
  try {
    return await tauriInvoke<string>("world_sandbox_open_isolated_window", { plotId });
  } catch (err) {
    throw toSandboxError(err);
  }
}

/** Close the isolated experience window for a Plot via `world_sandbox_close_isolated_window`. */
export async function closeIsolatedExperience(plotId: string): Promise<void> {
  try {
    await tauriInvoke<void>("world_sandbox_close_isolated_window", { plotId });
  } catch (err) {
    throw toSandboxError(err);
  }
}
