/**
 * Multi-Agent Collaboration v1 — `agent_run` LLM tool schema + event types.
 *
 * Spec: `multi-agent-collaboration-2026-06` W2.1
 * Design: §3.2 (Tool schema) + §4.1 (Event payloads)
 *
 * Shared between desktop (LLM tool registration) and backend (validation
 * + dispatch service).
 */

export type SpawnTargetKind =
  | "leader-direct"
  | "local-anonymous"
  | "team-member"
  | "marketplace-hire";

/**
 * Spawn tool schema as exposed to LLMs. Anthropic / Bedrock / OpenAI all
 * accept this JSON-schema-style spec.
 */
export const AGENT_RUN_TOOL_SCHEMA = {
  name: "agent_run",
  description:
    "Delegate a sub-task to a sub-agent. Returns a subTaskId you can " +
    "reference in your reply with [sub-task #N] anchors. Sub-agents run " +
    "in the background — do NOT wait for results before continuing the " +
    "conversation.",
  parameters: {
    type: "object",
    required: ["role", "prompt"],
    properties: {
      role: {
        type: "string",
        description:
          "Agent role tag (e.g. 'researcher', 'coder', 'reviewer', " +
          "'qa_ops'). If a team member's role matches, the member is " +
          "selected automatically.",
      },
      prompt: {
        type: "string",
        description: "Self-contained instructions for the sub-agent.",
        maxLength: 8000,
      },
      scope: {
        type: "object",
        description:
          "Optional tool/path scope. Defaults to leader's scope minus " +
          "destructive tools.",
        properties: {
          tools: {
            type: "array",
            items: { type: "string" },
            description: "Whitelist of tool names this sub-agent may call.",
          },
          workspace_paths: {
            type: "array",
            items: { type: "string" },
            description:
              "Glob patterns scoped to current workspace; supports " +
              "negative globs like '!secrets/**'.",
          },
        },
      },
      budget_usd: {
        type: "number",
        description:
          "Hard cap on USD spend. Default 1.00. Values >10 require " +
          "explicit user approval.",
        minimum: 0.1,
        maximum: 100,
      },
      target: {
        type: "string",
        enum: ["local-anonymous", "team-member"],
        description:
          "Optional. Default 'team-member' if a member matches role, " +
          "else 'local-anonymous'.",
      },
      wait: {
        type: "boolean",
        description:
          "Default true. When true (recommended for most cases) this " +
          "tool blocks until the sub-agent finishes and returns its " +
          "summary so you can use it directly in your reply. Set to " +
          "false ONLY for fire-and-forget background jobs you don't " +
          "need the result of in this turn — and remember to cite " +
          "[sub-task #xxx] in your reply.",
      },
    },
  },
} as const;

/**
 * Tool input type — what the LLM passes when calling `agent_run`.
 *
 * Note: `target = 'marketplace-hire'` is intentionally omitted from the
 * LLM-visible schema enum (see AGENT_RUN_TOOL_SCHEMA above) but kept in
 * `SpawnTargetKind` for backend validation. Backend rejects v1 writes
 * with `not_implemented_in_v1` (R13.1).
 */
export interface SpawnToolInput {
  role: string;
  prompt: string;
  scope?: {
    tools?: string[];
    workspace_paths?: string[];
  };
  budget_usd?: number;
  target?: "local-anonymous" | "team-member" | "marketplace-hire";
}

/** Successful spawn returns a subTaskId + chosen targetKind. */
export interface SpawnToolOutput {
  subTaskId: string;
  targetKind: SpawnTargetKind;
  /** Set when targetKind=team-member; PetTeamMember.id (NOT the AgentAccount.id). */
  petMemberId?: string | null;
  /** "queued" | "running" | etc. — initial status after dispatch. */
  status: "queued";
}

/** Errors the spawn tool may return inline to the LLM. */
export type SpawnToolError =
  | "spawn_rate_limited"      // R1.4: > 4 concurrent
  | "spawn_session_cap"       // R1.6: > 8 cumulative this session
  | "budget_pending_approval" // R1.5: budget > 10 awaiting user approval
  | "budget_exhausted"        // R10.6: 100% daily budget spent
  | "not_implemented_in_v1"   // R13.1: marketplace-hire in v1
  | "invalid_input";          // schema validation failed

// ── Sub-Agent timeline event payloads (R2 / §4.1) ──────────────────────

/** kind = 'agent_spawn' on agent_task_logs.payload */
export interface AgentSpawnEvent {
  taskId: string;
  parentTaskId: string;
  role: string;
  actorAgentId: string | null;
  target_kind: SpawnTargetKind;
  petMemberId?: string;
  promptPreview: string; // ≤ 80 chars
  budgetUsd: number;
  tier?: string;
  spawnedAt: number; // ms epoch
}

/** kind = 'agent_invoke' on agent_task_logs.payload */
export interface AgentInvokeEvent {
  taskId: string;
  toolName: string;
  toolCallId: string;
  argsPreview?: string; // ≤ 200 chars
  invokedAt: number;
}

/** kind = 'agent_result' on agent_task_logs.payload */
export interface AgentResultEvent {
  taskId: string;
  parentTaskId: string;
  status: "succeeded" | "failed" | "canceled";
  durationMs: number;
  totalCostUsd: number;
  resultSummary: string; // ≤ 200 chars
  errorMessage?: string;
  completedAt: number;
}
