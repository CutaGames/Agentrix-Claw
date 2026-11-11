/**
 * Honest local Cursor ACP runtime capability.
 * Planned DRW certification: session/approval bits stay false.
 * Resume and terminal query are unverified and not claimed.
 */

import {
  DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  type DeveloperAdapterCapabilityV1,
} from "../../../../shared/types/developer-remote-workspace.ts";
import {
  CURSOR_ACP_DRW_PROTOCOL_VERSION,
  CURSOR_ACP_LOCAL_LIMITATIONS,
  CURSOR_ACP_PROTOCOL_NAME,
  LOCAL_RUNTIME_UNCERTIFIED,
} from "./constants";
import type { CursorAcpLocalCapabilitySheet } from "./types";

export const CURSOR_ACP_LOCAL_MANIFEST: DeveloperAdapterCapabilityV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_adapter_capability",
  manifestRef: "cursor-acp-local-runtime-manifest-1",
  manifestVersion: 1,
  adapterRef: "cursor-acp-local-runtime",
  providerRef: "cursor",
  providerDisplayName: "Cursor",
  productRef: "cursor-cli-acp",
  productDisplayName: "Cursor CLI ACP",
  protocol: {
    kind: "acp",
    protocolName: CURSOR_ACP_PROTOCOL_NAME,
    protocolVersion: CURSOR_ACP_DRW_PROTOCOL_VERSION,
    transport: "stdio",
  },
  certification: {
    status: "planned",
    reasonCode: "local_runtime_uncertified",
  },
  sessionCapabilities: {
    list: false,
    create: false,
    resume: false,
    prompt: false,
    streamEvents: false,
    cancel: false,
    terminalQuery: false,
  },
  approvalCapabilities: {
    permissionRequests: false,
    exactDigestDecision: false,
    canonicalAuthorityBridge: false,
  },
  workspaceCapabilities: {
    explicitSelection: true,
    trustGate: true,
    redactedMetadataOnly: true,
  },
  platforms: ["linux", "macos", "windows"],
  authPlacement: "vendor_runtime",
  freshness: {
    observedAt: "2026-08-23T00:00:00.000Z",
    validUntil: "2026-08-23T00:08:00.000Z",
    sequence: 1,
  },
  limitations: [...CURSOR_ACP_LOCAL_LIMITATIONS],
};

export const CURSOR_ACP_LOCAL_CAPABILITY_SHEET: CursorAcpLocalCapabilitySheet =
  {
    recordKind: "cursor_acp_local_runtime_sheet",
    resultClass: LOCAL_RUNTIME_UNCERTIFIED,
    environment: "local_runtime",
    defaultOff: true,
    enabledByDefault: false,
    productionRoute: false,
    productionFlag: false,
    productionCertification: false,
    receiptClaim: false,
    canonicalSuccessClaim: false,
    vendorProcessSpawn: true,
    officialDrwCertification: "planned",
    sessionResume: "planned",
    terminalQuery: "unsupported",
    implementedLocalMethods: [
      "authenticate",
      "initialize",
      "session/cancel",
      "session/list",
      "session/new",
      "session/prompt",
      "session/request_permission",
      "session/update",
    ],
    unsupportedOrPlanned: ["session_resume", "terminal_query"],
  };
