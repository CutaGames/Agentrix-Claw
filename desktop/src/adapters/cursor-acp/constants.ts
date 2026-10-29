/**
 * Cursor ACP local development spike constants.
 *
 * DEVELOPMENT_SPIKE_ONLY — local/test, default-off, single owner, fixed
 * workspace. No production route, flag, success, or Receipt claim.
 */

export const DEVELOPMENT_SPIKE_ONLY = "DEVELOPMENT_SPIKE_ONLY" as const;

export const CURSOR_ACP_SPIKE_ENVIRONMENT = "local_test" as const;

export const CURSOR_ACP_SPIKE_DEFAULT_ENABLED = false;

export const CURSOR_ACP_PROTOCOL_NAME = "agent_client_protocol" as const;

export const CURSOR_ACP_PROTOCOL_VERSION = 1;

export const CURSOR_ACP_DRW_PROTOCOL_VERSION = "1" as const;

export const CURSOR_ACP_AUTH_METHOD_ID = "cursor_login" as const;

export const CURSOR_ACP_CLIENT_INFO = {
  name: "agentrix-cursor-acp-development-spike",
  version: "0.0.0-development-spike",
} as const;

export const CURSOR_ACP_CLIENT_CAPABILITIES = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
} as const;

export const CURSOR_ACP_PERMISSION_OPTION_IDS = [
  "allow-always",
  "allow-once",
  "reject-once",
] as const;

export const CURSOR_ACP_STOP_REASONS = [
  "cancelled",
  "end_turn",
  "max_tokens",
  "max_turn_requests",
  "refusal",
] as const;

export const CURSOR_ACP_SESSION_UPDATE_TYPES = [
  "agent_message_chunk",
  "agent_thought_chunk",
  "plan",
  "tool_call",
  "tool_call_update",
] as const;

export const CURSOR_ACP_CLIENT_REQUEST_METHODS = [
  "authenticate",
  "initialize",
  "session/list",
  "session/load",
  "session/new",
  "session/prompt",
] as const;

export const CURSOR_ACP_CLIENT_NOTIFICATION_METHODS = [
  "session/cancel",
] as const;

export const CURSOR_ACP_AGENT_REQUEST_METHODS = [
  "session/request_permission",
] as const;

export const CURSOR_ACP_AGENT_NOTIFICATION_METHODS = [
  "session/update",
] as const;

export const CURSOR_ACP_SPIKE_LIMITATIONS = [
  "default_off",
  "development_spike_only",
  "local_test_only",
  "no_canonical_receipt",
  "no_production_route",
  "single_owner_fixed_workspace",
] as const;

export const CURSOR_ACP_WORKSPACE_STAND_IN = "spike.fixed.workspace" as const;

export const CURSOR_ACP_DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export const LOCAL_RUNTIME_UNCERTIFIED = "LOCAL_RUNTIME_UNCERTIFIED" as const;

export const CURSOR_ACP_LOCAL_ENVIRONMENT = "local_runtime" as const;

export const CURSOR_ACP_LOCAL_DEFAULT_ENABLED = false;

export const CURSOR_ACP_LOCAL_COMMAND_LOCK = {
  program: "agent",
  args: ["acp"],
  protocolVersion: 1,
} as const;

export const CURSOR_ACP_LOCAL_CLIENT_INFO = {
  name: "agentrix-cursor-acp-local-runtime",
  version: "0.0.0-local-runtime",
} as const;

export const CURSOR_ACP_LOCAL_LIMITATIONS = [
  "default_off",
  "local_runtime_uncertified",
  "no_canonical_receipt",
  "no_production_certification",
  "no_production_route",
  "session_resume_unverified",
  "terminal_query_unverified",
] as const;
