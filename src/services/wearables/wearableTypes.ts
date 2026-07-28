export type WearableKind = 'ring' | 'band' | 'clip' | 'sensor' | 'glass' | 'watch' | 'unknown';

export type WearableSupportTier = 'ready' | 'known' | 'beta';

export type WearableConnectionStage = 'connecting' | 'discovering' | 'reading' | 'done';

export interface BlePermissionState {
  bluetooth: boolean;
  location: boolean;
  nearbyDevices: boolean;
  granted: boolean;
}

export interface BleScanResult {
  id: string;
  name: string;
  localName: string | null;
  rssi: number | null;
  manufacturerData: string | null;
  serviceUUIDs: string[];
}

export interface WearableCharacteristicSnapshot {
  uuid: string;
  serviceUuid: string;
  isReadable: boolean;
  isWritableWithResponse: boolean;
  isWritableWithoutResponse: boolean;
  isNotifiable: boolean;
  value: string | null;
}

export interface WearableServiceSnapshot {
  uuid: string;
  characteristics: WearableCharacteristicSnapshot[];
}

export interface WearableConnectionSnapshot {
  device: BleScanResult;
  services: WearableServiceSnapshot[];
  readableCharacteristics: WearableCharacteristicSnapshot[];
  notifiableCharacteristics: WearableCharacteristicSnapshot[];
  firstReadCharacteristic: WearableCharacteristicSnapshot | null;
  readError: string | null;
  connectedAt: string;
}

export interface WearableScanCandidate {
  id: string;
  name: string;
  kind: WearableKind;
  supportTier: WearableSupportTier;
  summary: string;
  serviceLabels: string[];
  signalLabel: string;
  raw: BleScanResult;
}

export interface WearableProfile {
  id: string;
  name: string;
  kind: WearableKind;
  supportTier: WearableSupportTier;
  summary: string;
  serviceLabels: string[];
  servicesCount: number;
  readableCount: number;
  notifiableCount: number;
  firstReadCharacteristicUuid: string | null;
  firstReadPayload: string | null;
  readError: string | null;
  connectedAt: string;
}

export interface WearableVendorProfile {
  key: string;
  name: string;
  kind: WearableKind;
  supportTier: WearableSupportTier;
  namePatterns: string[];
  serviceLabels: string[];
  gestureHints: string[];
  summary: string;
}

export interface AgentVerificationEvent {
  type: 'wearable.phase1_verified';
  source: 'wearable';
  deviceId: string;
  deviceName: string;
  services: string[];
  firstReadableCharacteristicUuid: string | null;
  payloadPreview: string | null;
}

export interface AgentCapabilityPreview {
  title: string;
  summary: string;
  triggers: string[];
  evidence: string[];
  verificationEvent: AgentVerificationEvent;
}

export interface PairedWearableRecord {
  id: string;
  name: string;
  kind: WearableKind;
  supportTier: WearableSupportTier;
  serviceLabels: string[];
  pairedAt: string;
  lastSeenAt: string;
  verificationEventType: AgentVerificationEvent['type'];
}

export interface LiveCharacteristicEvent {
  id: string;
  deviceId: string;
  serviceUuid: string;
  characteristicUuid: string;
  value: string | null;
  receivedAt: string;
}

// ── Phase 2: Continuous Data Collection ─────────────────────────────────────

export type TelemetryChannel = 'heart_rate' | 'spo2' | 'temperature' | 'steps' | 'battery' | 'accelerometer' | 'custom';

export interface TelemetrySample {
  id: string;
  deviceId: string;
  channel: TelemetryChannel;
  value: number;
  unit: string;
  rawBase64: string | null;
  characteristicUuid: string;
  serviceUuid: string;
  timestamp: string;
}

export interface TelemetryBuffer {
  deviceId: string;
  samples: TelemetrySample[];
  startedAt: string;
  lastFlushedAt: string | null;
}

export type CollectorStatus = 'idle' | 'connecting' | 'collecting' | 'reconnecting' | 'error' | 'paused';

export interface CollectorState {
  deviceId: string;
  deviceName: string;
  status: CollectorStatus;
  channels: MonitoredChannel[];
  samplesCollected: number;
  samplesUploaded: number;
  lastSampleAt: string | null;
  lastError: string | null;
  connectedSince: string | null;
  reconnectAttempts: number;
}

export interface MonitoredChannel {
  channel: TelemetryChannel;
  serviceUuid: string;
  characteristicUuid: string;
  label: string;
  parser: 'heart_rate_measurement' | 'battery_level' | 'temperature' | 'uint16_le' | 'float32_le' | 'raw';
  intervalMs: number;
  enabled: boolean;
  lastValue: number | null;
  lastUpdatedAt: string | null;
}

export interface CollectorConfig {
  deviceId: string;
  deviceName: string;
  channels: MonitoredChannel[];
  flushIntervalMs: number;
  maxBufferSize: number;
  reconnectMaxAttempts: number;
  reconnectDelayMs: number;
}

export interface TelemetryUploadPayload {
  deviceId: string;
  deviceName: string;
  samples: TelemetrySample[];
  uploadedAt: string;
}

// ── Phase 3: Automation Rules & Agent Triggers ──────────────────────────────

export type TriggerCondition = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between' | 'change' | 'absent';

export type TriggerAction = 'notify_agent' | 'log_event' | 'send_alert' | 'execute_skill' | 'update_context';

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  deviceId: string;
  channel: TelemetryChannel;
  condition: TriggerCondition;
  threshold: number;
  thresholdHigh?: number;
  windowMs: number;
  cooldownMs: number;
  action: TriggerAction;
  actionPayload: Record<string, unknown>;
  lastTriggeredAt: string | null;
  triggerCount: number;
  createdAt: string;
}

export interface TriggerEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  deviceId: string;
  channel: TelemetryChannel;
  value: number;
  condition: TriggerCondition;
  threshold: number;
  action: TriggerAction;
  actionPayload: Record<string, unknown>;
  triggeredAt: string;
  acknowledged: boolean;
}

export interface WearableAgentContext {
  deviceId: string;
  deviceName: string;
  kind: WearableKind;
  latestReadings: Record<TelemetryChannel, { value: number; unit: string; updatedAt: string }>;
  activeTriggers: TriggerEvent[];
  collectorStatus: CollectorStatus;
}