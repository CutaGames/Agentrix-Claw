import {
  buildDeviceCredentialRefreshCommand,
  buildDeviceLifecycleRevokeCommand,
  fenceFromDeviceListItem,
  newDeviceLifecycleRequestId,
} from '../device-lifecycle-client';

describe('device lifecycle client', () => {
  const device = {
    device_id: 'claw-1',
    device_revocation_epoch: '0',
    credential_revocation_epoch: '2',
    optimistic_version: '2',
    credential_version: '3',
  };

  it('builds a registry fence and revoke command', () => {
    const fence = fenceFromDeviceListItem(device, '2026-09-13T00:00:00.000Z');
    expect(fence.target).toEqual({ kind: 'device_registry', deviceId: 'claw-1' });
    const command = buildDeviceLifecycleRevokeCommand({
      deviceId: 'claw-1',
      fence,
      requestId: 'req-1',
    });
    expect(command.reasonCode).toBe('owner_revoke');
    expect(command.expectedFence.credentialVersion).toBe('3');
  });

  it('builds a credential refresh command', () => {
    const fence = fenceFromDeviceListItem(device);
    const command = buildDeviceCredentialRefreshCommand({
      deviceId: 'claw-1',
      fence,
      requestId: 'req-2',
    });
    expect(command.reasonCode).toBe('credential_rotation');
    expect(newDeviceLifecycleRequestId().startsWith('dlc_')).toBe(true);
  });
});
