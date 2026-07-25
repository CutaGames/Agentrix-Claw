/**
 * ClawCore types — Wire Protocol v0 type definitions.
 * Per toy-prd-v4 §5.2-5.3.
 */

export type ClawCoreFrameType =
  | 'hello'
  | 'auth'
  | 'pet.state.sync'
  | 'pet.interaction'
  | 'pet.approval.notify'
  | 'ota.check'
  | 'ota.chunk'
  | 'vitals.report'
  | 'tts.play'
  | 'error';

export type ClawCoreDeviceState =
  | 'discovered'
  | 'connecting'
  | 'pairing'
  | 'bound'
  | 'active'
  | 'disconnected'
  | 'error';

export type ToyCapabilityFlag =
  | 'screen_eink'
  | 'screen_oled'
  | 'led_rgb'
  | 'haptic'
  | 'tts'
  | 'mic'
  | 'touch_sensor'
  | 'pressure_sensor'
  | 'gyro'
  | 'nfc_writer';

export interface ClawCoreDevice {
  id: string;
  name: string;
  bleId: string;
  firmwareVersion: string;
  hardwareTier: 'L2' | 'L3';
  vendor: string;
  capabilityFlags: ToyCapabilityFlag[];
  pairingMethod: 'nfc' | 'ble' | 'wifi' | 'sdk' | 'app';
  state: ClawCoreDeviceState;
  batteryLevel: number | null;
  lastActive: number | null;
  deviceJwt: string | null;
}

// ── Frame payloads ───────────────────────────────────────────

export interface HelloPayload {
  device_id: string;
  fw_version: string;
  capability_flags: ToyCapabilityFlag[];
}

export interface AuthPayload {
  device_jwt: string;
  server_pub: string;
}

export interface PetStatePayload {
  emotion: string;
  intimacy: number;
  skin_thumbnail_url?: string;
  soul_template_id?: string;
  level?: number;
}

export interface PetInteractionPayload {
  kind: 'hug' | 'nfc_touch' | 'wrist_tap' | 'touch' | 'shake' | 'proximity_in' | 'proximity_out';
  amount?: number;
  token?: string;
}

export interface ApprovalNotifyPayload {
  request_id: string;
  risk_level: 'L0' | 'L1' | 'L2' | 'L3';
  ttl_s: number;
}

export interface OtaCheckPayload {
  current_fw: string;
}

export interface OtaChunkPayload {
  index: number;
  total: number;
  data_b64: string;
}

export interface VitalsReportPayload {
  kind: string;
  value: number;
  unit: string;
  confidence: number;
}

export interface TtsPlayPayload {
  audio_url?: string;
  text?: string;
  voice_id?: string;
}

export interface ErrorPayload {
  code: string;
  msg: string;
}
