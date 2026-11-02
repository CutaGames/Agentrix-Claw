/**
 * Planned DRW capability manifest plus local spike sheet.
 * DEVELOPMENT_SPIKE_ONLY. Planned adapters cannot claim session/approval bits.
 */

import {
  DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  type DeveloperAdapterCapabilityV1,
} from "../../../../shared/types/developer-remote-workspace.ts";
import {
  CURSOR_ACP_DRW_PROTOCOL_VERSION,
  CURSOR_ACP_PROTOCOL_NAME,
  CURSOR_ACP_SPIKE_LIMITATIONS,
  DEVELOPMENT_SPIKE_ONLY,
} from "./constants";
import type { CursorAcpSpikeCapabilitySheet } from "./types";

export const CURSOR_ACP_SPIKE_MANIFEST: DeveloperAdapterCapabilityV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_adapter_capability",
  manifestRef: "cursor-acp-spike-manifest-1",
  manifestVersion: 1,
  adapterRef: "cursor-acp-development-spike",
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
    reasonCode: "development_spike_only",
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
    observedAt: "2026-08-22T12:01:00.000Z",
    validUntil: "2026-08-22T12:09:00.000Z",
    sequence: 1,
  },
  limitations: [...CURSOR_ACP_SPIKE_LIMITATIONS],
};

export const CURSOR_ACP_SPIKE_CAPABILITY_SHEET: CursorAcpSpikeCapabilitySheet =
  {
    recordKind: "cursor_acp_development_spike_sheet",
    resultClass: DEVELOPMENT_SPIKE_ONLY,
    environment: "local_test",
    defaultOff: true,
    enabledByDefault: false,
    singleOwner: true,
    fixedWorkspace: true,
    productionRoute: false,
    productionFlag: false,
    receiptClaim: false,
    canonicalSuccessClaim: false,
    vendorProcessSpawn: false,
    officialDrwCertification: "planned",
    verifiableSubset: [
      "authenticate",
      "cancel",
      "initialize",
      "permission_decision",
      "permission_request",
      "query",
      "session/list",
      "session/load",
      "session/new",
      "session/prompt",
      "session/update",
    ],
  };
