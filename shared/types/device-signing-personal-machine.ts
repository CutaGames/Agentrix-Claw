/**
 * Device Signing owner — additive Personal Machine Mesh wrapper/verifier.
 *
 * Purpose is exact. `device-auth` and `session-auth` cannot sign or verify
 * PMM artifacts. Unknown purposes fail closed. Do not re-export from the
 * shared barrel.
 */

import {
  DEVICE_SIGNING_PERSONAL_MACHINE_PURPOSES_V1,
  DEVICE_SIGNING_PURPOSES_V1,
  isDeviceSigningPersonalMachinePurposeV1,
  type DeviceSigningCredentialV1,
  type DeviceSigningPersonalMachinePurposeV1,
} from "./device-signing-credential";

export type DeviceSigningPersonalMachineCredentialV1 = Omit<
  DeviceSigningCredentialV1,
  "purpose"
> & {
  purpose: DeviceSigningPersonalMachinePurposeV1;
};
import type {
  DesktopTerminalSourceResultV1,
  MachineExecutionCapabilityV1,
  PersonalMachineArtifactPurposeV1,
  PersonalMachineArtifactTypeV1,
  SignedPersonalMachineArtifactV1,
} from "./personal-machine-mesh";
import {
  PERSONAL_MACHINE_ARTIFACT_PURPOSES_V1,
  validateDesktopTerminalSourceResultV1,
  validateMachineExecutionCapabilityV1,
  validateSignedPersonalMachineArtifactV1,
} from "./personal-machine-mesh";

export const DEVICE_SIGNING_PERSONAL_MACHINE_WRAPPER_VERSION = "1" as const;

export const DEVICE_SIGNING_PERSONAL_MACHINE_PURPOSE_BY_TYPE_V1 = {
  "machine-execution-capability": "personal-machine-capability",
  "desktop-terminal-source-result": "personal-machine-terminal-result",
} as const satisfies Record<
  PersonalMachineArtifactTypeV1,
  DeviceSigningPersonalMachinePurposeV1
>;

export interface DeviceSigningPersonalMachineExpectedContextV1 {
  purpose: DeviceSigningPersonalMachinePurposeV1;
  ownerPrincipalRef: string;
  tenantRef: string | null;
  agentId: string;
  deviceId: string;
  runtimeId: string;
  bindingRef: string;
  credentialRef: string;
  credentialRevocationEpoch: string;
  antiReplayRef: string;
  now: string;
}

export interface DeviceSigningPersonalMachineEnvelopeV1<T> {
  schemaVersion: typeof DEVICE_SIGNING_PERSONAL_MACHINE_WRAPPER_VERSION;
  purpose: DeviceSigningPersonalMachinePurposeV1;
  agentId: string;
  tenantRef: string | null;
  signed: SignedPersonalMachineArtifactV1<T>;
}

export interface DeviceSigningPersonalMachineVerifyResultV1 {
  valid: boolean;
  errors: string[];
}

const PURPOSE_TO_TYPE: Record<
  DeviceSigningPersonalMachinePurposeV1,
  PersonalMachineArtifactTypeV1
> = {
  "personal-machine-capability": "machine-execution-capability",
  "personal-machine-terminal-result": "desktop-terminal-source-result",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function expectedPersonalMachineSigningPurposeV1(
  artifactType: PersonalMachineArtifactTypeV1,
): DeviceSigningPersonalMachinePurposeV1 {
  return DEVICE_SIGNING_PERSONAL_MACHINE_PURPOSE_BY_TYPE_V1[artifactType];
}

export function verifyDeviceSigningPersonalMachinePurposeExactV1(
  purpose: unknown,
): DeviceSigningPersonalMachineVerifyResultV1 {
  if (isDeviceSigningPersonalMachinePurposeV1(purpose)) {
    return { valid: true, errors: [] };
  }
  if ((DEVICE_SIGNING_PURPOSES_V1 as readonly unknown[]).includes(purpose)) {
    return {
      valid: false,
      errors: [
        "purpose: legacy device-auth/session-auth cannot wrap PMM artifacts",
      ],
    };
  }
  return { valid: false, errors: ["purpose: unknown purpose fail-closed"] };
}

export function verifyDeviceSigningPersonalMachineWrapperV1<T>(input: {
  envelope: DeviceSigningPersonalMachineEnvelopeV1<T>;
  credential:
    | DeviceSigningPersonalMachineCredentialV1
    | DeviceSigningCredentialV1;
  expected: DeviceSigningPersonalMachineExpectedContextV1;
  artifactValidator: (artifact: unknown) => {
    valid: boolean;
    errors: string[];
  };
  consumedAntiReplayRefs?: ReadonlySet<string>;
}): DeviceSigningPersonalMachineVerifyResultV1 {
  const errors: string[] = [];
  const { envelope, credential, expected } = input;
  if (!isRecord(envelope as unknown)) {
    return { valid: false, errors: ["envelope: expected object"] };
  }
  if (
    envelope.schemaVersion !== DEVICE_SIGNING_PERSONAL_MACHINE_WRAPPER_VERSION
  ) {
    errors.push("envelope.schemaVersion: expected 1");
  }
  const purposeCheck = verifyDeviceSigningPersonalMachinePurposeExactV1(
    envelope.purpose,
  );
  errors.push(...purposeCheck.errors);
  if (envelope.purpose !== expected.purpose) {
    errors.push("envelope.purpose: context mismatch");
  }

  const type = PURPOSE_TO_TYPE[expected.purpose];
  const domain =
    expected.purpose === "personal-machine-capability"
      ? "agentrix:personal-machine-capability:v1"
      : "agentrix:personal-machine-terminal-result:v1";
  const signed = validateSignedPersonalMachineArtifactV1(
    envelope.signed,
    input.artifactValidator,
    {
      domain,
      artifactType: type,
      purpose: expected.purpose as PersonalMachineArtifactPurposeV1,
      ownerPrincipalRef: expected.ownerPrincipalRef,
      runtimeId: expected.runtimeId,
    },
  );
  errors.push(...signed.errors);

  const payload = envelope.signed?.signingPayload;
  if (payload) {
    if (payload.credentialPurpose !== envelope.purpose) {
      errors.push(
        "envelope.purpose: must equal signingPayload.credentialPurpose",
      );
    }
    if (payload.ownerPrincipalRef !== expected.ownerPrincipalRef) {
      errors.push("context.ownerPrincipalRef: exact mismatch");
    }
    const payloadTenant =
      payload.tenantRef === undefined ? null : payload.tenantRef;
    if (
      payloadTenant !== expected.tenantRef ||
      envelope.tenantRef !== expected.tenantRef
    ) {
      errors.push("context.tenantRef: exact mismatch");
    }
    if (envelope.agentId !== expected.agentId) {
      errors.push("context.agentId: exact mismatch");
    }
    if (payload.deviceRef?.deviceId !== expected.deviceId) {
      errors.push("context.deviceId: exact mismatch");
    }
    if (payload.runtimeId !== expected.runtimeId) {
      errors.push("context.runtimeId: exact mismatch");
    }
    if ((payload.executorShellBindingRef ?? "") !== expected.bindingRef) {
      errors.push("context.bindingRef: exact mismatch");
    }
    if (payload.credentialRef !== expected.credentialRef) {
      errors.push("context.credentialRef: exact mismatch");
    }
    if (
      payload.credentialRevocationEpoch !== expected.credentialRevocationEpoch
    ) {
      errors.push("context.credentialRevocationEpoch: exact mismatch");
    }
    if (payload.antiReplayRef !== expected.antiReplayRef) {
      errors.push("context.antiReplayRef: exact mismatch");
    }
    if (Date.parse(payload.expiresAt) <= Date.parse(expected.now)) {
      errors.push("context.expiresAt: expired");
    }
  }

  if (!isDeviceSigningPersonalMachinePurposeV1(credential.purpose)) {
    errors.push("credential.purpose: not an approved PMM signing purpose");
  } else if (credential.purpose !== expected.purpose) {
    errors.push("credential.purpose: purpose-exact mismatch");
  }
  if (credential.credentialRef !== expected.credentialRef) {
    errors.push("credential.credentialRef: exact mismatch");
  }
  if (credential.deviceId !== expected.deviceId) {
    errors.push("credential.deviceId: exact mismatch");
  }
  if (
    credential.credentialRevocationEpoch !== expected.credentialRevocationEpoch
  ) {
    errors.push("credential.credentialRevocationEpoch: stale or mismatched");
  }
  if (credential.status !== "active") {
    errors.push(`credential.status: ${credential.status} is not current`);
  }
  if (
    credential.expiresAt &&
    Date.parse(credential.expiresAt) <= Date.parse(expected.now)
  ) {
    errors.push("credential.expiresAt: stale credential");
  }
  if (input.consumedAntiReplayRefs?.has(expected.antiReplayRef)) {
    errors.push("antiReplayRef: replay");
  }
  if (
    !(PERSONAL_MACHINE_ARTIFACT_PURPOSES_V1 as readonly string[]).includes(
      expected.purpose,
    )
  ) {
    errors.push("purpose: unknown purpose fail-closed");
  }

  return { valid: errors.length === 0, errors };
}

export function verifyPersonalMachineCapabilityWrapperV1(input: {
  envelope: DeviceSigningPersonalMachineEnvelopeV1<MachineExecutionCapabilityV1>;
  credential:
    | DeviceSigningPersonalMachineCredentialV1
    | DeviceSigningCredentialV1;
  expected: DeviceSigningPersonalMachineExpectedContextV1;
  consumedAntiReplayRefs?: ReadonlySet<string>;
}): DeviceSigningPersonalMachineVerifyResultV1 {
  if (input.expected.purpose !== "personal-machine-capability") {
    return {
      valid: false,
      errors: ["expected.purpose: capability wrapper required"],
    };
  }
  return verifyDeviceSigningPersonalMachineWrapperV1({
    ...input,
    artifactValidator: validateMachineExecutionCapabilityV1,
  });
}

export function verifyPersonalMachineTerminalResultWrapperV1(input: {
  envelope: DeviceSigningPersonalMachineEnvelopeV1<DesktopTerminalSourceResultV1>;
  credential:
    | DeviceSigningPersonalMachineCredentialV1
    | DeviceSigningCredentialV1;
  expected: DeviceSigningPersonalMachineExpectedContextV1;
  consumedAntiReplayRefs?: ReadonlySet<string>;
}): DeviceSigningPersonalMachineVerifyResultV1 {
  if (input.expected.purpose !== "personal-machine-terminal-result") {
    return {
      valid: false,
      errors: ["expected.purpose: terminal-result wrapper required"],
    };
  }
  return verifyDeviceSigningPersonalMachineWrapperV1({
    ...input,
    artifactValidator: validateDesktopTerminalSourceResultV1,
  });
}

export const DEVICE_SIGNING_PERSONAL_MACHINE_PUBLISHED_PURPOSES_V1 =
  DEVICE_SIGNING_PERSONAL_MACHINE_PURPOSES_V1;
