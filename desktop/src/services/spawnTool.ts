/**
 * Multi-Agent Collaboration v1 — `agent_run` tool registration + executor.
 *
 * Spec: multi-agent-collaboration-2026-06 W2.5
 * Design: §3.2, §3.3, §3.5 (rate limits)
 *
 * Client-side guardrails (defence-in-depth alongside server enforcement):
 *   - 4 concurrent in-flight sub-tasks per leader chat (R1.4)
 *   - 8 cumulative this session (R1.6)
 *   - budget_usd > 10 ⇒ pending approval (R1.5)
 *
 * NOTE: Server (`POST /api/agent-tasks/spawn`) re-checks all of these, so
 * a malicious LLM cannot bypass them. Client-side checks just save a
 * round-trip and surface error messages faster.
 */

import {
  AGENT_RUN_TOOL_SCHEMA,
  type SpawnToolInput,
  type SpawnToolOutput,
} from "../../../shared/types/agent-tools";
import type { ToolDef } from "./localLLM";
import { API_BASE, useAuthStore } from "./store";

export const SPAWN_TOOL_NAME = "agent_run";

export const FANOUT_CAP = 4;
export const SESSION_CAP = 8;
export const HIGH_BUDGET_THRESHOLD_USD = 10;

/**
 * `agent_run` ToolDef in OpenAI/Anthropic format. Use this in
 * `DESKTOP_LOCAL_TOOLS` and any chat-side tool list.
 */
export const AGENT_RUN_TOOL_DEF: ToolDef = {
  type: "function",
  function: {
    name: AGENT_RUN_TOOL_SCHEMA.name,
    description: AGENT_RUN_TOOL_SCHEMA.description,
    parameters: AGENT_RUN_TOOL_SCHEMA.parameters,
  },
};

// ── Client-side counters (per session) ─────────────────────────────────

interface SpawnSessionState {
  /** Track in-flight (queued/running) sub-tasks per parentTaskId. */
  inFlightByParent: Map<string, Set<string>>;
  /** Cumulative spawn count this session, regardless of parent. */
  cumulativeCount: number;
  /** SubTaskIds awaiting user approval for high-budget spawns. */
  pendingApprovals: Map<string, { input: SpawnToolInput; parentTaskId: string }>;
}

const _state: SpawnSessionState = {
  inFlightByParent: new Map(),
  cumulativeCount: 0,
  pendingApprovals: new Map(),
};

/** Reset session counters (call on chat-session-changed event). */
export function resetSpawnSession(): void {
  _state.inFlightByParent.clear();
  _state.cumulativeCount = 0;
  _state.pendingApprovals.clear();
}

/** Increment in-flight count for a parent. */
function trackSpawn(parentTaskId: string, subTaskId: string) {
  let set = _state.inFlightByParent.get(parentTaskId);
  if (!set) {
    set = new Set();
    _state.inFlightByParent.set(parentTaskId, set);
  }
  set.add(subTaskId);
  _state.cumulativeCount += 1;
}

/** Decrement in-flight count when a sub-task settles. */
export function releaseSpawn(parentTaskId: string, subTaskId: string): void {
  const set = _state.inFlightByParent.get(parentTaskId);
  if (set) {
    set.delete(subTaskId);
    if (set.size === 0) _state.inFlightByParent.delete(parentTaskId);
  }
}

export function getInFlightCount(parentTaskId: string): number {
  return _state.inFlightByParent.get(parentTaskId)?.size ?? 0;
}

export function getCumulativeCount(): number {
  return _state.cumulativeCount;
}

// ── Tool executor ──────────────────────────────────────────────────────

export interface SpawnToolExecutorContext {
  /** Required — the leader chat's primary task id, treated as parent. */
  parentTaskId: string;
  /** Optional — tier hint for the LLM router. */
  tier?: string;
  /** Optional — pre-approved budget bypass token (W2.8). */
  approvalToken?: string;
}

/**
 * Execute an `agent_run` tool call. Returns a JSON-encoded string the LLM
 * can read directly back as the tool result.
 */
export async function executeSpawnTool(
  rawArgs: Record<string, unknown>,
  ctx: SpawnToolExecutorContext,
): Promise<string> {
  // 1. Validate schema (best-effort; server re-validates)
  const role = String(rawArgs.role || "").trim();
  const prompt = String(rawArgs.prompt || "").trim();
  const target =
    rawArgs.target === "local-anonymous" ||
    rawArgs.target === "team-member" ||
    rawArgs.target === "marketplace-hire"
      ? rawArgs.target
      : undefined;
  const budgetUsd =
    typeof rawArgs.budget_usd === "number" && Number.isFinite(rawArgs.budget_usd)
      ? rawArgs.budget_usd
      : 1.0;
  const scope = (rawArgs.scope ?? undefined) as SpawnToolInput["scope"];

  if (!role || role.length > 30) {
    return JSON.stringify({ error: "invalid_input", message: "role: 1-30 chars required" });
  }
  if (!prompt || prompt.length > 8000) {
    return JSON.stringify({ error: "invalid_input", message: "prompt: 1-8000 chars required" });
  }
  if (budgetUsd < 0.1 || budgetUsd > 100) {
    return JSON.stringify({ error: "invalid_input", message: "budget_usd: 0.10-100" });
  }

  // 2. Client-side rate-limit checks (R1.4 / R1.6)
  if (!ctx.parentTaskId) {
    return JSON.stringify({
      error: "invalid_input",
      message: "agent_run can only be called from a leader chat with a parent task id",
    });
  }
  if (getInFlightCount(ctx.parentTaskId) >= FANOUT_CAP) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("agentrix:spawn-rate-limited", {
          detail: {
            kind: "fanout_cap",
            cap: FANOUT_CAP,
            inFlight: getInFlightCount(ctx.parentTaskId),
            parentTaskId: ctx.parentTaskId,
          },
        }),
      );
    }
    return JSON.stringify({
      error: "spawn_rate_limited",
      message: `${FANOUT_CAP} sub-tasks already running; wait for one to complete before spawning more`,
      retryAfterMs: 5000,
    });
  }
  if (_state.cumulativeCount >= SESSION_CAP) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("agentrix:spawn-rate-limited", {
          detail: {
            kind: "session_cap",
            cap: SESSION_CAP,
            cumulative: _state.cumulativeCount,
            parentTaskId: ctx.parentTaskId,
          },
        }),
      );
    }
    return JSON.stringify({
      error: "spawn_session_cap",
      message: `Session cap of ${SESSION_CAP} sub-tasks reached. Rest a moment, then continue if needed.`,
    });
  }

  // 3. High-budget approval gate (R1.5)
  if (budgetUsd > HIGH_BUDGET_THRESHOLD_USD && !ctx.approvalToken) {
    const pendingId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    _state.pendingApprovals.set(pendingId, {
      input: { role, prompt, target, budget_usd: budgetUsd, scope },
      parentTaskId: ctx.parentTaskId,
    });
    // Emit a UI event so the chat surface can show the approval modal.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("agentrix:spawn-approval-needed", {
          detail: {
            pendingId,
            role,
            promptPreview: prompt.slice(0, 200),
            budgetUsd,
            target,
          },
        }),
      );
    }
    return JSON.stringify({
      error: "budget_pending_approval",
      message: `Budget $${budgetUsd.toFixed(2)} exceeds $${HIGH_BUDGET_THRESHOLD_USD} threshold. Approval pending — user will be prompted in the chat surface.`,
      pendingId,
    });
  }

  // 4. POST /api/agent-tasks/spawn
  const token = useAuthStore.getState().token;
  if (!token) {
    return JSON.stringify({ error: "unauthenticated", message: "no auth token" });
  }

  // Build the request body. Spread approval_token into scope when present;
  // server reads `scope.approval_token` as the W2.8 backstop bypass.
  const finalScope = ctx.approvalToken
    ? { ...(scope ?? {}), approval_token: ctx.approvalToken }
    : scope;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/agent-tasks/spawn`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        parentTaskId: ctx.parentTaskId,
        role,
        prompt,
        // R1.5 — when caller has user approval, scope.approval_token
        // is set so the server-side backstop accepts the high-budget spawn.
        scope: finalScope,
        budget_usd: budgetUsd,
        target,
        tier: ctx.tier,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ error: "network_error", message: msg });
  }

  if (!res.ok) {
    let errBody: { error?: string; message?: string } = {};
    try {
      errBody = await res.json();
    } catch {
      errBody = { message: await res.text().catch(() => res.statusText) };
    }
    return JSON.stringify({
      error: errBody.error || `http_${res.status}`,
      message: errBody.message || res.statusText,
    });
  }

  const json = (await res.json()) as SpawnToolOutput;
  trackSpawn(ctx.parentTaskId, json.subTaskId);

  // v2.1 W7.2 — Leader hire CTA. When the user originally requested a
  // `team-member` but the server fell back to `local-anonymous` (no
  // matching role), emit an event so ChatPanel can render a "雇佣
  // marketplace pet?" inline CTA. The Leader LLM also gets a hint string
  // in the tool result so it can verbalize the same suggestion.
  let hireCtaEmitted = false;
  if (
    typeof window !== "undefined" &&
    target === "team-member" &&
    json.targetKind === "local-anonymous"
  ) {
    window.dispatchEvent(
      new CustomEvent("agentrix:marketplace-hire-suggestion", {
        detail: {
          parentTaskId: ctx.parentTaskId,
          role,
          prompt,
          budgetUsd,
          fallbackSubTaskId: json.subTaskId,
        },
      }),
    );
    hireCtaEmitted = true;
  }

  return JSON.stringify({
    subTaskId: json.subTaskId,
    targetKind: json.targetKind,
    petMemberId: json.petMemberId,
    status: json.status,
    hint: hireCtaEmitted
      ? `Sub-task spawned as anonymous because no team-member matched role "${role}". Marketplace hire CTA was surfaced in the chat. Use [sub-task #${json.subTaskId.slice(0, 8)}] to anchor it in your reply.`
      : `Sub-task spawned. Use [sub-task #${json.subTaskId.slice(0, 8)}] to anchor it in your reply.`,
  });
}

/**
 * Approve a pending high-budget spawn and re-issue the dispatch.
 * Returns the same shape as executeSpawnTool.
 */
export async function approvePendingSpawn(pendingId: string): Promise<string> {
  const pending = _state.pendingApprovals.get(pendingId);
  if (!pending) {
    return JSON.stringify({ error: "not_found", message: "pending spawn not found" });
  }
  _state.pendingApprovals.delete(pendingId);
  return executeSpawnTool(
    {
      role: pending.input.role,
      prompt: pending.input.prompt,
      target: pending.input.target,
      budget_usd: pending.input.budget_usd,
      scope: pending.input.scope,
    },
    {
      parentTaskId: pending.parentTaskId,
      approvalToken: "user-approved",
    },
  );
}

/** Reject a pending high-budget spawn. */
export function rejectPendingSpawn(pendingId: string): void {
  _state.pendingApprovals.delete(pendingId);
}

/**
 * v2.1 W7.2 — Confirm a marketplace-hire dispatch from the Leader CTA.
 *
 * Called by ChatPanel when the user clicks "雇佣 marketplace pet" in the
 * inline CTA emitted by `agentrix:marketplace-hire-suggestion`. Returns
 * the same JSON-string shape as `executeSpawnTool`.
 *
 * The flag `MULTI_AGENT_MARKETPLACE_HIRE_ENABLED=1` is required server-side;
 * if OFF the server returns `not_implemented_in_v1` and the CTA falls back
 * to a friendly message that tells the user marketplace is "coming soon".
 */
export async function dispatchMarketplaceHire(input: {
  parentTaskId: string;
  role: string;
  prompt: string;
  budgetUsd: number;
  tier?: string;
}): Promise<string> {
  return executeSpawnTool(
    {
      role: input.role,
      prompt: input.prompt,
      budget_usd: input.budgetUsd,
      target: "marketplace-hire",
    },
    {
      parentTaskId: input.parentTaskId,
      tier: input.tier,
    },
  );
}
