import { type AgentCapabilityPreview, type WearableProfile } from './wearableTypes';
import { WearableVendorRegistryService } from './wearableVendorRegistry.service';

export class WearableAgentCapabilityService {
  static buildCapabilityPreview(profile: WearableProfile): AgentCapabilityPreview {
    const triggers: string[] = [...WearableVendorRegistryService.getGestureHints(profile.name)];

    if (profile.kind === 'ring') {
      triggers.push('Route vendor tap or squeeze events into agent wake intents after characteristic mapping.');
    }
    if (profile.kind === 'band') {
      triggers.push('Use band presence and wrist gestures as lightweight wake or confirm signals.');
    }
    if (profile.serviceLabels.includes('Heart Rate')) {
      triggers.push('Treat heart-rate telemetry as silent context that enriches agent decisions without forcing UI.');
    }
    if (profile.serviceLabels.includes('Battery')) {
      triggers.push('Expose battery state to throttle continuous sensing or background sync policies.');
    }
    if (triggers.length === 0) {
      triggers.push('Map the first stable readable characteristic into a vendor-specific event contract for OpenClaw compatibility.');
    }

    const payloadPreview = profile.firstReadPayload
      ? `${profile.firstReadPayload.slice(0, 24)}${profile.firstReadPayload.length > 24 ? '...' : ''}`
      : null;

    const evidence = [
      `${profile.servicesCount} GATT services discovered during the connection stage.`,
      `${profile.readableCount} readable characteristics are available for phase-1 verification.`,
      `${profile.notifiableCount} notifiable characteristics are available for phase-2 live monitoring.`,
      profile.firstReadCharacteristicUuid
        ? `Initial characteristic read captured ${profile.firstReadCharacteristicUuid}.`
        : 'No readable characteristic was exposed by this device during discovery.',
    ];

    if (profile.readError) {
      evidence.push(`Read attempt returned an error: ${profile.readError}`);
    }

    return {
      title: 'Minimal validation chain completed',
      summary: 'This device has completed the phase-1 BLE path: discovered, connected, inspected through GATT, and mapped into an agent-facing verification event.',
      triggers,
      evidence,
      verificationEvent: {
        type: 'wearable.phase1_verified',
        source: 'wearable',
        deviceId: profile.id,
        deviceName: profile.name,
        services: profile.serviceLabels,
        firstReadableCharacteristicUuid: profile.firstReadCharacteristicUuid,
        payloadPreview,
      },
    };
  }
}