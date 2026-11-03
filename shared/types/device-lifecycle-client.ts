import {
  DEVICE_LIFECYCLE_SCHEMA_VERSION,
  type DeviceCredentialRefreshCommandV1,
  type DeviceEpochFenceV1,
  type DeviceLifecycleRevokeCommandV1,
  type DeviceRevocationReasonV1,
} from './device-lifecycle';

export const DEVICE_REGISTRY_PATHS = {
  ticket: '/v1/devices/pair/ticket',
  pair: '/v1/devices/pair',
  list: '/v1/devices',
  revokeLegacy: (deviceId: string) => `/v1/devices/${encodeURIComponent(deviceId)}`,
  revokeLifecycle: (deviceId: string) =>
    `/v1/devices/${encodeURIComponent(deviceId)}/lifecycle/revoke`,
  refreshCredential: (deviceId: string) =>
    `/v1/devices/${encodeURIComponent(deviceId)}/credentials/refresh`,
} as const;

export interface DeviceRegistryListItemV1 {
  device_id: string;
  device_revocation_epoch: string;
  credential_revocation_epoch: string;
  optimistic_version: string;
  credential_version: string;
  lifecycle_updated_at?: string | Date | null;
}

export function newDeviceLifecycleRequestId(now: Date = new Date()): string {
  const entropy =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `dlc_${entropy}`.slice(0, 128);
}

export function fenceFromDeviceListItem(
  device: DeviceRegistryListItemV1,
  capturedAt: string = new Date().toISOString(),
): DeviceEpochFenceV1 {
  return {
    schemaVersion: DEVICE_LIFECYCLE_SCHEMA_VERSION,
    target: { kind: 'device_registry', deviceId: device.device_id },
    deviceRevocationEpoch: String(device.device_revocation_epoch),
    credentialRevocationEpoch: String(device.credential_revocation_epoch),
    optimisticVersion: String(device.optimistic_version),
    credentialVersion: String(device.credential_version),
    capturedAt,
  };
}

export function buildDeviceLifecycleRevokeCommand(input: {
  deviceId: string;
  fence: DeviceEpochFenceV1;
  reasonCode?: DeviceRevocationReasonV1;
  requestId?: string;
}): DeviceLifecycleRevokeCommandV1 {
  return {
    schemaVersion: DEVICE_LIFECYCLE_SCHEMA_VERSION,
    requestId: input.requestId ?? newDeviceLifecycleRequestId(),
    expectedFence: {
      ...input.fence,
      target: { kind: 'device_registry', deviceId: input.deviceId },
    },
    reasonCode: input.reasonCode ?? 'owner_revoke',
  };
}

export function buildDeviceCredentialRefreshCommand(input: {
  deviceId: string;
  fence: DeviceEpochFenceV1;
  requestId?: string;
}): DeviceCredentialRefreshCommandV1 {
  return {
    schemaVersion: DEVICE_LIFECYCLE_SCHEMA_VERSION,
    requestId: input.requestId ?? newDeviceLifecycleRequestId(),
    expectedFence: {
      ...input.fence,
      target: { kind: 'device_registry', deviceId: input.deviceId },
    },
    reasonCode: 'credential_rotation',
  };
}
