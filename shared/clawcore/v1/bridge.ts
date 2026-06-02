/**
 * ClawCore Bridge SDK — common interface contract (Phase 5 HW-10.4 / 10.5 / 10.6).
 *
 * This file defines the **TypeScript canonical shape** for the Bridge SDK
 * implemented natively on Android (Kotlin .aar), iOS (Swift .xcframework),
 * and Desktop (Rust → Tauri command). All three native SDKs MUST surface
 * methods with these names, parameters, and async semantics so cross-platform
 * QA + integration tests share one mental model.
 *
 * Stub Kotlin and Swift skeletons appear next to this file; both reference
 * this `index.ts` as the source of truth.
 */

import type {
  ApprovalRequestFrame,
  ApprovalResponseFrame,
  PetEventFrame,
  PetStateFrame,
} from './index';

/** Connection lifecycle events fired by the bridge to the host app. */
export type BridgeEvent =
  | { type: 'connected'; deviceId: string }
  | { type: 'disconnected'; deviceId: string; reason?: string }
  | { type: 'pet_state'; frame: PetStateFrame }
  | { type: 'pet_event'; frame: PetEventFrame }
  | { type: 'approval_request'; frame: ApprovalRequestFrame }
  | { type: 'ota_progress'; deviceId: string; index: number; total: number }
  | { type: 'error'; deviceId?: string; code: string; message: string };

export type BridgeListener = (e: BridgeEvent) => void;

/** Pairing payload returned by `pair()`. The host app must persist `dst`
 *  exactly once — typically in OS keychain / Android EncryptedSharedPreferences /
 *  Tauri secure storage. */
export interface PairResult {
  deviceId: string;
  dst: string;
  deviceClass: string;
}

/** Common interface implemented by all 3 native SDKs. */
export interface ClawCoreBridge {
  /** Initialise transport(s). Called once at app start. */
  init(opts: { apiBase: string; mqttHost: string; mqttPort?: number }): Promise<void>;

  /** Discover nearby devices for pairing (BLE adv on phone; Bluetooth Classic on desktop). */
  scan(timeoutMs?: number): Promise<Array<{ deviceId: string; rssi: number; advName?: string }>>;

  /** Pair: present the user's pair ticket to the device, receive deviceId + DST. */
  pair(input: { ticket: string; deviceId: string }): Promise<PairResult>;

  /** Open MQTT session for a paired device. Idempotent. */
  connect(deviceId: string, dst: string): Promise<void>;

  /** Close session (does not unpair). */
  disconnect(deviceId: string): Promise<void>;

  /** Send an approval response to the server (device-attested). */
  sendApprovalResponse(frame: ApprovalResponseFrame): Promise<void>;

  /** Emit an interaction event (e.g. button press) upstream. */
  sendEvent(frame: PetEventFrame): Promise<void>;

  /** Begin OTA: fetch manifest + chunks, write to A/B partition, verify, swap. */
  beginOta(deviceId: string): Promise<{ packageId: string; version: string }>;

  /** Subscribe to bridge events (connected / frames / errors). Returns unsubscribe fn. */
  on(listener: BridgeListener): () => void;
}

/** Error codes emitted by all native SDKs. */
export const BridgeErrorCodes = {
  NOT_INITIALISED: 'BRIDGE_NOT_INITIALISED',
  TRANSPORT_UNAVAILABLE: 'BRIDGE_TRANSPORT_UNAVAILABLE',
  PAIR_TICKET_INVALID: 'BRIDGE_PAIR_TICKET_INVALID',
  AUTH_REJECTED: 'BRIDGE_AUTH_REJECTED',
  REPLAY_DETECTED: 'BRIDGE_REPLAY_DETECTED',
  OTA_INTEGRITY_FAIL: 'BRIDGE_OTA_INTEGRITY_FAIL',
  OTA_RESUMED: 'BRIDGE_OTA_RESUMED',
  TIMEOUT: 'BRIDGE_TIMEOUT',
} as const;

export type BridgeErrorCode = (typeof BridgeErrorCodes)[keyof typeof BridgeErrorCodes];
