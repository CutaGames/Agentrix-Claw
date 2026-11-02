/**
 * Cursor ACP local development spike types.
 * DEVELOPMENT_SPIKE_ONLY. Control-plane values are refs/digests only.
 */

import type {
  DeveloperAdapterCapabilityV1,
  DeveloperApprovalDecisionV1,
  DeveloperApprovalRequestV1,
  DeveloperInstructionV1,
  DeveloperMachineProjectionV1,
  DeveloperSessionEventV1,
  DeveloperSessionSummaryV1,
  DeveloperTerminalResultV1,
  DeveloperWorkspaceRefV1,
} from "../../../../shared/types/developer-remote-workspace.ts";
import type {
  ShellCommandEnvelopeV1,
  ShellSessionBindingV1,
} from "../../../../shared/types/shell-session-binding.ts";
import type {
  CURSOR_ACP_LOCAL_ENVIRONMENT,
  CURSOR_ACP_SPIKE_ENVIRONMENT,
  DEVELOPMENT_SPIKE_ONLY,
  LOCAL_RUNTIME_UNCERTIFIED,
} from "./constants";

export type CursorAcpSpikeEnvironment = typeof CURSOR_ACP_SPIKE_ENVIRONMENT;

export type CursorAcpJsonRpcId = string | number;

export interface CursorAcpJsonRpcRequest {
  jsonrpc: "2.0";
  id: CursorAcpJsonRpcId;
  method: string;
  params?: unknown;
}

export interface CursorAcpJsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface CursorAcpJsonRpcSuccess {
  jsonrpc: "2.0";
  id: CursorAcpJsonRpcId;
  result: unknown;
}

export interface CursorAcpJsonRpcFailure {
  jsonrpc: "2.0";
  id: CursorAcpJsonRpcId | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type CursorAcpJsonRpcMessage =
  | CursorAcpJsonRpcRequest
  | CursorAcpJsonRpcNotification
  | CursorAcpJsonRpcSuccess
  | CursorAcpJsonRpcFailure;

export interface AcpStdioJsonRpcTransportOptions {
  requestTimeoutMs?: number;
  now?: () => number;
  scheduleTimeout?: (callback: () => void, delayMs: number) => () => void;
}

export interface AcpStdioJsonRpcTransport {
  readonly kind: "injectable_stdio_jsonrpc";
  readonly framing: "newline_delimited_json";
  readonly requestTimeoutMs: number;
  request(method: string, params?: unknown): Promise<unknown>;
  notify(method: string, params?: unknown): Promise<void>;
  setIncomingRequestHandler(
    handler: (method: string, params: unknown) => Promise<unknown>,
  ): void;
  setIncomingNotificationHandler(
    handler: (method: string, params: unknown) => void,
  ): void;
  close(): Promise<void>;
}

export interface CursorAcpOfficialMethodRecord {
  method: string;
  direction: "client_to_agent" | "agent_to_client";
  shape: "request" | "notification";
  documentedBy: "cursor_cli_acp" | "agent_client_protocol" | "both";
}

export interface CursorAcpOfficialCapabilityRecord {
  recordKind: "cursor_acp_official_capability_snapshot";
  resultClass: typeof DEVELOPMENT_SPIKE_ONLY;
  environment: CursorAcpSpikeEnvironment;
  productionClaim: false;
  reviewedForProduction: false;
  receiptClaim: false;
  capturedAt: string;
  vendor: "Cursor";
  product: "Cursor CLI";
  launchCommand: "agent acp";
  documentationUrl: "https://cursor.com/docs/cli/acp";
  protocolDocumentationUrl: "https://agentclientprotocol.com/protocol/v1/overview";
  transport: {
    kind: "stdio";
    envelope: "json-rpc-2.0";
    framing: "newline_delimited_json";
  };
  authentication: {
    advertisedMethodId: "cursor_login";
    placement: "vendor_runtime";
  };
  documentedMethods: CursorAcpOfficialMethodRecord[];
  permissionOptionIds: readonly ["allow-once", "allow-always", "reject-once"];
  modes: readonly ["agent", "ask", "plan"];
  outOfScope: readonly string[];
}

export interface CursorAcpSpikeCapabilitySheet {
  recordKind: "cursor_acp_development_spike_sheet";
  resultClass: typeof DEVELOPMENT_SPIKE_ONLY;
  environment: CursorAcpSpikeEnvironment;
  defaultOff: true;
  enabledByDefault: false;
  singleOwner: true;
  fixedWorkspace: true;
  productionRoute: false;
  productionFlag: false;
  receiptClaim: false;
  canonicalSuccessClaim: false;
  vendorProcessSpawn: false;
  officialDrwCertification: "planned";
  verifiableSubset: readonly string[];
}

export interface CursorAcpSpikeBindingFixtures {
  ownerPrincipalRef: string;
  agentId: string;
  deviceRef: string;
  machine: DeveloperMachineProjectionV1;
  workspace: DeveloperWorkspaceRefV1;
  session: DeveloperSessionSummaryV1;
  instruction: DeveloperInstructionV1;
  shellBinding: ShellSessionBindingV1;
  shellCommand: ShellCommandEnvelopeV1;
}

export interface CursorAcpSpikeConfig {
  environment: CursorAcpSpikeEnvironment;
  enabled?: boolean;
  ownerPrincipalRef: string;
  workspaceRef: string;
  binding: CursorAcpSpikeBindingFixtures;
  transport: AcpStdioJsonRpcTransport;
  now?: () => string;
}

export type CursorAcpSpikeOutcome = "ok" | "fail_closed" | "unavailable";

export interface CursorAcpSpikeEnvelope<T> {
  resultClass: typeof DEVELOPMENT_SPIKE_ONLY;
  environment: CursorAcpSpikeEnvironment;
  enabled: boolean;
  defaultOff: true;
  singleOwner: true;
  fixedWorkspace: true;
  productionRoute: false;
  productionFlag: false;
  receiptClaim: false;
  canonicalSuccessClaim: false;
  replayAllowed: false;
  vendorProcessStarted: false;
  outcome: CursorAcpSpikeOutcome;
  reasonCode?: string;
  payload?: T;
}

export type CursorAcpSpikeEventPayload =
  | {
      kind: "session_event";
      event: DeveloperSessionEventV1;
    }
  | {
      kind: "approval_request";
      event: DeveloperSessionEventV1;
      request: DeveloperApprovalRequestV1;
    }
  | {
      kind: "terminal";
      event: DeveloperSessionEventV1;
      result: DeveloperTerminalResultV1;
    };

export interface CursorAcpInitializeResult {
  protocolVersion: number;
  authMethodId: "cursor_login";
}

export interface CursorAcpAuthenticateResult {
  authMethodId: "cursor_login";
}

export type CursorAcpManifestPayload = DeveloperAdapterCapabilityV1;
export type CursorAcpSessionPayload = DeveloperSessionSummaryV1;
export type CursorAcpQueryPayload = {
  instructionRef: string;
  events: DeveloperSessionEventV1[];
  terminal?: DeveloperTerminalResultV1;
};

export type CursorAcpLocalEnvironment = typeof CURSOR_ACP_LOCAL_ENVIRONMENT;

export interface CursorAcpLocalCapabilitySheet {
  recordKind: "cursor_acp_local_runtime_sheet";
  resultClass: typeof LOCAL_RUNTIME_UNCERTIFIED;
  environment: CursorAcpLocalEnvironment;
  defaultOff: true;
  enabledByDefault: false;
  productionRoute: false;
  productionFlag: false;
  productionCertification: false;
  receiptClaim: false;
  canonicalSuccessClaim: false;
  vendorProcessSpawn: true;
  officialDrwCertification: "planned";
  sessionResume: "planned";
  terminalQuery: "unsupported";
  implementedLocalMethods: readonly string[];
  unsupportedOrPlanned: readonly string[];
}

export type CursorAcpLocalOutcome = "ok" | "fail_closed" | "unavailable";

export interface CursorAcpLocalEnvelope<T> {
  resultClass: typeof LOCAL_RUNTIME_UNCERTIFIED;
  environment: CursorAcpLocalEnvironment;
  enabled: boolean;
  defaultOff: true;
  productionRoute: false;
  productionCertification: false;
  receiptClaim: false;
  canonicalSuccessClaim: false;
  replayAllowed: false;
  vendorProcessStarted: boolean;
  outcome: CursorAcpLocalOutcome;
  reasonCode?: string;
  payload?: T;
}

export interface CursorAcpVendorProbe {
  available: boolean;
  reasonCode: string;
  program: string;
  spawnAttempted: boolean;
  processStarted: boolean;
  productionClaim: false;
}

export interface DeveloperRuntimeInvoke {
  (command: string, args?: Record<string, unknown>): Promise<unknown>;
}
