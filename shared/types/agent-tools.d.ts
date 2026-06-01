export type SpawnTargetKind = "leader-direct" | "local-anonymous" | "team-member" | "marketplace-hire";
export declare const AGENT_RUN_TOOL_SCHEMA: {
    readonly name: "agent_run";
    readonly description: string;
    readonly parameters: {
        readonly type: "object";
        readonly required: readonly ["role", "prompt"];
        readonly properties: {
            readonly role: {
                readonly type: "string";
                readonly description: string;
            };
            readonly prompt: {
                readonly type: "string";
                readonly description: "Self-contained instructions for the sub-agent.";
                readonly maxLength: 8000;
            };
            readonly scope: {
                readonly type: "object";
                readonly description: string;
                readonly properties: {
                    readonly tools: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                        readonly description: "Whitelist of tool names this sub-agent may call.";
                    };
                    readonly workspace_paths: {
                        readonly type: "array";
                        readonly items: {
                            readonly type: "string";
                        };
                        readonly description: string;
                    };
                };
            };
            readonly budget_usd: {
                readonly type: "number";
                readonly description: string;
                readonly minimum: 0.1;
                readonly maximum: 100;
            };
            readonly target: {
                readonly type: "string";
                readonly enum: readonly ["local-anonymous", "team-member"];
                readonly description: string;
            };
            readonly wait: {
                readonly type: "boolean";
                readonly description: string;
            };
        };
    };
};
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
export interface SpawnToolOutput {
    subTaskId: string;
    targetKind: SpawnTargetKind;
    petMemberId?: string | null;
    status: "queued";
}
export type SpawnToolError = "spawn_rate_limited" | "spawn_session_cap" | "budget_pending_approval" | "budget_exhausted" | "not_implemented_in_v1" | "invalid_input";
export interface AgentSpawnEvent {
    taskId: string;
    parentTaskId: string;
    role: string;
    actorAgentId: string | null;
    target_kind: SpawnTargetKind;
    petMemberId?: string;
    promptPreview: string;
    budgetUsd: number;
    tier?: string;
    spawnedAt: number;
}
export interface AgentInvokeEvent {
    taskId: string;
    toolName: string;
    toolCallId: string;
    argsPreview?: string;
    invokedAt: number;
}
export interface AgentResultEvent {
    taskId: string;
    parentTaskId: string;
    status: "succeeded" | "failed" | "canceled";
    durationMs: number;
    totalCostUsd: number;
    resultSummary: string;
    errorMessage?: string;
    completedAt: number;
}
