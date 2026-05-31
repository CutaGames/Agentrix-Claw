"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_RUN_TOOL_SCHEMA = void 0;
exports.AGENT_RUN_TOOL_SCHEMA = {
    name: "agent_run",
    description: "Delegate a sub-task to a sub-agent. Returns a subTaskId you can " +
        "reference in your reply with [sub-task #N] anchors. Sub-agents run " +
        "in the background — do NOT wait for results before continuing the " +
        "conversation.",
    parameters: {
        type: "object",
        required: ["role", "prompt"],
        properties: {
            role: {
                type: "string",
                description: "Agent role tag (e.g. 'researcher', 'coder', 'reviewer', " +
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
                description: "Optional tool/path scope. Defaults to leader's scope minus " +
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
                        description: "Glob patterns scoped to current workspace; supports " +
                            "negative globs like '!secrets/**'.",
                    },
                },
            },
            budget_usd: {
                type: "number",
                description: "Hard cap on USD spend. Default 1.00. Values >10 require " +
                    "explicit user approval.",
                minimum: 0.1,
                maximum: 100,
            },
            target: {
                type: "string",
                enum: ["local-anonymous", "team-member"],
                description: "Optional. Default 'team-member' if a member matches role, " +
                    "else 'local-anonymous'.",
            },
            wait: {
                type: "boolean",
                description: "Default true. When true (recommended for most cases) this " +
                    "tool blocks until the sub-agent finishes and returns its " +
                    "summary so you can use it directly in your reply. Set to " +
                    "false ONLY for fire-and-forget background jobs you don't " +
                    "need the result of in this turn — and remember to cite " +
                    "[sub-task #xxx] in your reply.",
            },
        },
    },
};
//# sourceMappingURL=agent-tools.js.map