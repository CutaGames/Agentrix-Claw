import {
  type WearableProfile,
  type WearableScanCandidate,
  type WearableVendorProfile,
} from './wearableTypes';

const KNOWN_VENDOR_PROFILES: WearableVendorProfile[] = [
  // ── AI Glasses ─────────────────────────────────────
  {
    key: 'even-g1',
    name: 'Even Realities G1',
    kind: 'glass',
    supportTier: 'ready',
    namePatterns: ['even g1', 'even realities', 'g1 glass'],
    serviceLabels: ['Agentrix Glass Audio', 'HUD Display', 'Touch Input', 'Battery', 'Device Information'],
    gestureHints: ['Tap temple to toggle voice. Long press to interrupt. Swipe forward/back for undo/redo.'],
    summary: 'AI glasses with monochrome HUD, mic, speaker, and touch bar. Primary glass target.',
  },
  {
    key: 'xreal-air',
    name: 'XREAL Air 2 Ultra',
    kind: 'glass',
    supportTier: 'beta',
    namePatterns: ['xreal', 'nreal'],
    serviceLabels: ['Camera', 'Audio', 'IMU', 'Battery', 'Device Information'],
    gestureHints: ['Full AR overlay. Camera supports continuous frame capture. 6DoF head tracking.'],
    summary: 'Full-color AR glasses with dual cameras, 6DoF IMU, mic, and speakers.',
  },
  {
    key: 'meta-rayban',
    name: 'Meta Ray-Ban Stories',
    kind: 'glass',
    supportTier: 'known',
    namePatterns: ['ray-ban', 'meta glass', 'ray ban'],
    serviceLabels: ['Camera', 'Audio', 'Battery'],
    gestureHints: ['Tap frame to capture photo. Voice commands via Meta AI (limited BLE access).'],
    summary: 'Smart glasses with camera and speakers. Limited BLE API openness.',
  },
  {
    key: 'ble-audio-glass',
    name: 'BLE Audio Glasses',
    kind: 'glass',
    supportTier: 'beta',
    namePatterns: ['audio glass', 'smart glass', 'bone conduction'],
    serviceLabels: ['Audio', 'Battery'],
    gestureHints: ['Audio-only glasses. Mic and speakers via BLE Audio or classic A2DP.'],
    summary: 'Generic audio-only smart glasses with mic and speaker over BLE.',
  },
  // ── Rings ──────────────────────────────────────────
  {
    key: 'oura-ring',
    name: 'Oura Ring',
    kind: 'ring',
    supportTier: 'ready',
    namePatterns: ['oura'],
    serviceLabels: ['Battery', 'Device Information'],
    gestureHints: ['Use tap and presence changes as ring-level agent wake candidates after vendor mapping.'],
    summary: 'Known ring profile with stable battery and device information services.',
  },
  {
    key: 'mi-band',
    name: 'Mi Band',
    kind: 'band',
    supportTier: 'ready',
    namePatterns: ['mi band', 'xiaomi band'],
    serviceLabels: ['Heart Rate', 'Battery'],
    gestureHints: ['Use band gestures and presence as low-friction agent wake or confirm signals.'],
    summary: 'Known band profile with common heart-rate and battery telemetry.',
  },
  {
    key: 'fitbit',
    name: 'Fitbit',
    kind: 'band',
    supportTier: 'known',
    namePatterns: ['fitbit'],
    serviceLabels: ['Heart Rate', 'Device Information'],
    gestureHints: ['Use fitness telemetry as context enrichment before gesture decoding is fully mapped.'],
    summary: 'Known Fitbit-style profile with telemetry-first compatibility.',
  },
  {
    key: 'core-sensor',
    name: 'Core Sensor',
    kind: 'sensor',
    supportTier: 'known',
    namePatterns: ['sensor', 'thermo', 'heart'],
    serviceLabels: ['Health Thermometer', 'Heart Rate', 'Environmental Sensing'],
    gestureHints: ['Treat sensor updates as silent context sources for downstream OpenClaw routing.'],
    summary: 'Known sensor profile oriented around passive telemetry rather than gestures.',
  },
];

export class WearableVendorRegistryService {
  static enrichScanCandidate(candidate: WearableScanCandidate): WearableScanCandidate {
    const match = this.matchByName(candidate.name);
    if (!match) {
      return candidate;
    }

    return {
      ...candidate,
      kind: match.kind,
      supportTier: this.promoteSupportTier(candidate.supportTier, match.supportTier),
      serviceLabels: this.mergeLabels(candidate.serviceLabels, match.serviceLabels),
      summary: `${candidate.summary} ${match.summary}`,
    };
  }

  static enrichProfile(profile: WearableProfile): WearableProfile {
    const match = this.matchByName(profile.name);
    if (!match) {
      return profile;
    }

    return {
      ...profile,
      kind: match.kind,
      supportTier: this.promoteSupportTier(profile.supportTier, match.supportTier),
      serviceLabels: this.mergeLabels(profile.serviceLabels, match.serviceLabels),
      summary: `${profile.summary} ${match.summary}`,
    };
  }

  static getGestureHints(deviceName: string): string[] {
    return this.matchByName(deviceName)?.gestureHints ?? [];
  }

  private static matchByName(deviceName: string): WearableVendorProfile | null {
    const normalizedName = deviceName.toLowerCase();
    return KNOWN_VENDOR_PROFILES.find((profile) => profile.namePatterns.some((pattern) => normalizedName.includes(pattern))) ?? null;
  }

  private static mergeLabels(current: string[], next: string[]): string[] {
    return Array.from(new Set([...current, ...next]));
  }

  private static promoteSupportTier(current: WearableScanCandidate['supportTier'], next: WearableScanCandidate['supportTier']) {
    const order = ['beta', 'known', 'ready'];
    return order.indexOf(next) > order.indexOf(current) ? next : current;
  }
}