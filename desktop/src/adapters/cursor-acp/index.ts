/**
 * Cursor ACP local development spike public surface.
 * DEVELOPMENT_SPIKE_ONLY. No production route, flag, or Receipt export.
 */

export { CursorAcpLocalDevelopmentSpike } from "./adapter";
export {
  CURSOR_ACP_AUTH_METHOD_ID,
  CURSOR_ACP_LOCAL_COMMAND_LOCK,
  CURSOR_ACP_LOCAL_DEFAULT_ENABLED,
  CURSOR_ACP_LOCAL_ENVIRONMENT,
  CURSOR_ACP_SPIKE_DEFAULT_ENABLED,
  CURSOR_ACP_SPIKE_ENVIRONMENT,
  CURSOR_ACP_SPIKE_LIMITATIONS,
  DEVELOPMENT_SPIKE_ONLY,
  LOCAL_RUNTIME_UNCERTIFIED,
} from "./constants";
export { digestRefOf, spikeEnvelope } from "./control-plane";
export {
  attachScriptedCursorAcpAgent,
  createEncryptedDataRef,
  createSpikeApprovalDecision,
  createSpikeBindingFixtures,
  SPIKE_ADAPTER_SESSION_REF,
  SPIKE_INSTRUCTION_REF,
  SPIKE_OWNER_PRINCIPAL_REF,
  SPIKE_WORKSPACE_REF,
} from "./fixtures";
export {
  CURSOR_ACP_SPIKE_CAPABILITY_SHEET,
  CURSOR_ACP_SPIKE_MANIFEST,
} from "./manifest";
export { CURSOR_ACP_OFFICIAL_CAPABILITY_RECORD } from "./official-capability";
export {
  CURSOR_ACP_LOCAL_CAPABILITY_SHEET,
  CURSOR_ACP_LOCAL_MANIFEST,
} from "./real-manifest";
export { CursorAcpLocalRuntime } from "./real-adapter";
export { CursorAcpProcessHostClient, lockedCommand } from "./process-host";
export { createInMemoryAcpStdioPair } from "./transport";
export type {
  AcpStdioJsonRpcTransport,
  AcpStdioJsonRpcTransportOptions,
  CursorAcpLocalCapabilitySheet,
  CursorAcpLocalEnvelope,
  CursorAcpOfficialCapabilityRecord,
  CursorAcpSpikeCapabilitySheet,
  CursorAcpSpikeConfig,
  CursorAcpSpikeEnvelope,
  CursorAcpSpikeEventPayload,
  CursorAcpVendorProbe,
  DeveloperRuntimeInvoke,
} from "./types";
