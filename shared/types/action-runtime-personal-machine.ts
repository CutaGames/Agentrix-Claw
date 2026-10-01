/**
 * Action Runtime owner — additive same-owner Personal Machine Mesh profile.
 *
 * Not a chat.tool_execution.v1 tool and not developer.remote_execute.
 * Generic create/execute must keep rejecting these constants.
 * Do not re-export from the shared barrel.
 */

export const ACTION_TYPE_PERSONAL_MACHINE_LLM_GENERATE_V1 =
  "personal_machine.llm_generate.v1" as const;
export const ACTION_TOOL_PERSONAL_MACHINE_LLM_GENERATE_V1 =
  "personal_machine.llm_generate" as const;
export const ACTION_PROFILE_PERSONAL_MACHINE_V1 =
  "action-runtime-personal-machine-v1" as const;

export const PMM_ACTION_JOB_TYPE_V1 = "llm.generate.v1" as const;

export interface PersonalMachineActionAdmissionRefV1 {
  disposition: "accepted" | "unavailable";
  admissionDecisionRef: string;
  jobRequestDigest: string;
  clientRequestId: string;
}

export interface PersonalMachineActionCreateInputV1 {
  ownerUserId: string;
  ownerPrincipalRef: string;
  agentId: string;
  accountableAgentId: string;
  tenantRef: string | null;
  jobType: typeof PMM_ACTION_JOB_TYPE_V1;
  jobRequestDigest: string;
  clientRequestId: string;
  selectedDeviceRef: string;
  selectedRuntimeId: string;
  selectedExecutorShellBindingRef: string;
  admission: PersonalMachineActionAdmissionRefV1;
}

export interface PersonalMachineActionRecordV1 {
  schemaVersion: "1";
  profile: typeof ACTION_PROFILE_PERSONAL_MACHINE_V1;
  actionType: typeof ACTION_TYPE_PERSONAL_MACHINE_LLM_GENERATE_V1;
  toolName: typeof ACTION_TOOL_PERSONAL_MACHINE_LLM_GENERATE_V1;
  actionId: string;
  ownerPrincipalRef: string;
  agentId: string;
  jobRequestDigest: string;
  clientRequestId: string;
  createdAt: string;
  terminalSourceResultRef?: string;
}

export interface PersonalMachineExternalTerminalInputV1 {
  actionId: string;
  ownerPrincipalRef: string;
  agentId: string;
  jobRequestDigest: string;
  terminalSourceResultRef: string;
  terminalSourceDigest: string;
}
