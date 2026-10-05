/**
 * Dated Cursor ACP official capability snapshot for DRW-S0.1.
 * DEVELOPMENT_SPIKE_ONLY. Not a production support or Receipt claim.
 *
 * Sources captured 2026-08-22:
 * - https://cursor.com/docs/cli/acp
 * - https://agentclientprotocol.com/protocol/v1/overview
 * - https://agentclientprotocol.com/protocol/v1/schema
 */

import { DEVELOPMENT_SPIKE_ONLY } from "./constants";
import type { CursorAcpOfficialCapabilityRecord } from "./types";

export const CURSOR_ACP_OFFICIAL_CAPABILITY_RECORD: CursorAcpOfficialCapabilityRecord =
  {
    recordKind: "cursor_acp_official_capability_snapshot",
    resultClass: DEVELOPMENT_SPIKE_ONLY,
    environment: "local_test",
    productionClaim: false,
    reviewedForProduction: false,
    receiptClaim: false,
    capturedAt: "2026-08-22T00:00:00.000Z",
    vendor: "Cursor",
    product: "Cursor CLI",
    launchCommand: "agent acp",
    documentationUrl: "https://cursor.com/docs/cli/acp",
    protocolDocumentationUrl:
      "https://agentclientprotocol.com/protocol/v1/overview",
    transport: {
      kind: "stdio",
      envelope: "json-rpc-2.0",
      framing: "newline_delimited_json",
    },
    authentication: {
      advertisedMethodId: "cursor_login",
      placement: "vendor_runtime",
    },
    documentedMethods: [
      {
        method: "initialize",
        direction: "client_to_agent",
        shape: "request",
        documentedBy: "both",
      },
      {
        method: "authenticate",
        direction: "client_to_agent",
        shape: "request",
        documentedBy: "both",
      },
      {
        method: "session/list",
        direction: "client_to_agent",
        shape: "request",
        documentedBy: "agent_client_protocol",
      },
      {
        method: "session/new",
        direction: "client_to_agent",
        shape: "request",
        documentedBy: "both",
      },
      {
        method: "session/load",
        direction: "client_to_agent",
        shape: "request",
        documentedBy: "both",
      },
      {
        method: "session/prompt",
        direction: "client_to_agent",
        shape: "request",
        documentedBy: "both",
      },
      {
        method: "session/update",
        direction: "agent_to_client",
        shape: "notification",
        documentedBy: "both",
      },
      {
        method: "session/request_permission",
        direction: "agent_to_client",
        shape: "request",
        documentedBy: "both",
      },
      {
        method: "session/cancel",
        direction: "client_to_agent",
        shape: "notification",
        documentedBy: "both",
      },
    ],
    permissionOptionIds: ["allow-once", "allow-always", "reject-once"],
    modes: ["agent", "ask", "plan"],
    outOfScope: [
      "ansi_screen_parsing",
      "canonical_receipt",
      "computer_use",
      "credential_storage",
      "cursor_extension_methods",
      "production_flag",
      "production_route",
      "vendor_process_spawn",
    ],
  };
