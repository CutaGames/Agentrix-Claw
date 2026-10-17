import {
  validateDeveloperAdapterCapabilityV1,
  type DeveloperAdapterCapabilityV1,
  type DeveloperMachineProjectionV1,
  type DeveloperSessionSummaryV1,
} from "../../shared/types/developer-remote-workspace";

export type DeveloperMutationCtaKind = "send" | "approve";

export type DeveloperMutationCtaDecision = {
  visible: boolean;
  enabled: boolean;
  reason: string;
};

export type DeveloperMutationCtaInput = {
  kind: DeveloperMutationCtaKind;
  capability: unknown;
  mutationCapabilityPublished: boolean;
  machineConnection?:
    | DeveloperMachineProjectionV1["connection"]["status"]
    | "unknown";
  sessionState?: DeveloperSessionSummaryV1["state"] | "unknown";
  online?: boolean;
};

function capabilityFromUnknown(
  input: unknown,
): DeveloperAdapterCapabilityV1 | null {
  const result = validateDeveloperAdapterCapabilityV1(input);
  return result.valid ? (input as DeveloperAdapterCapabilityV1) : null;
}

export function evaluateDeveloperMutationCta(
  input: DeveloperMutationCtaInput,
): DeveloperMutationCtaDecision {
  const capability = capabilityFromUnknown(input.capability);
  if (!capability) {
    return { visible: false, enabled: false, reason: "capability_invalid" };
  }
  if (capability.certification.status !== "supported") {
    return { visible: false, enabled: false, reason: "capability_unpublished" };
  }
  if (input.kind === "send" && capability.sessionCapabilities.prompt !== true) {
    return {
      visible: false,
      enabled: false,
      reason: "send_capability_unpublished",
    };
  }
  if (
    input.kind === "approve" &&
    (capability.approvalCapabilities.permissionRequests !== true ||
      capability.approvalCapabilities.exactDigestDecision !== true ||
      capability.approvalCapabilities.canonicalAuthorityBridge !== true)
  ) {
    return {
      visible: false,
      enabled: false,
      reason: "approve_capability_unpublished",
    };
  }
  if (input.mutationCapabilityPublished !== true) {
    return {
      visible: false,
      enabled: false,
      reason: "api_capability_truth_unpublished",
    };
  }
  if (input.online === false || input.machineConnection === "offline") {
    return { visible: true, enabled: false, reason: "offline_mutation_denied" };
  }
  if (input.machineConnection === "stale" || input.sessionState === "stale") {
    return { visible: true, enabled: false, reason: "stale_mutation_denied" };
  }
  if (
    input.sessionState &&
    !["ready", "available", "busy"].includes(input.sessionState)
  ) {
    return { visible: true, enabled: false, reason: "session_not_executable" };
  }
  return { visible: true, enabled: true, reason: "api_capability_truth" };
}

export function mutationCtaFailClosed(
  decision: DeveloperMutationCtaDecision,
): boolean {
  return decision.enabled !== true;
}
