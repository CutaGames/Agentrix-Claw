/**
 * ClawCore Protocol v1 — TypeScript type definitions (Phase 5 HW-10.1).
 *
 * These mirror the JSON Schemas in this directory and the wire format
 * documented in docs/RFC_CLAWCORE_PROTOCOL.zh-CN.md.
 *
 * Single source of truth used by:
 *   - backend (NestJS device-registry, MQTT bridge)
 *   - desktop (Tauri Bridge SDK)
 *   - mobile (RN Bridge SDK, Agentrix-Claw repo)
 *   - firmware (esp32-rs, nRF52 Zephyr — generated via JSON Schema)
 */

export const CLAWCORE_PROTO_VERSION = 'v1' as const;

export type ClawCoreFrameType =
  | 'pet_state'
  | 'pet_event'
  | 'approval_request'
  | 'approval_response';

export interface PetStateFrame {
  type: 'pet_state';
  seq: number;
  pet_skin_id: string;
  energy: number;
  paused: boolean;
  paused_reason: string | null;
  daily_spend_cents: number;
  ts: number;
}

export type PetEventKind =
  | 'task_completed'
  | 'task_failed'
  | 'reward_earned'
  | 'risk_paused'
  | 'energy_restored'
  | 'interaction';

export interface PetEventFrame {
  type: 'pet_event';
  seq: number;
  pet_skin_id: string;
  kind: PetEventKind;
  amount_cents?: number;
  message?: string;
  ts: number;
}

export type RiskLevel = 'L1' | 'L2' | 'L3';

export interface ApprovalRequestFrame {
  type: 'approval_request';
  seq: number;
  request_id: string;
  risk_level: RiskLevel;
  summary: string;
  amount_cents?: number;
  deadline_ts: number;
}

export interface ApprovalResponseFrame {
  type: 'approval_response';
  request_id: string;
  decision: 'approve' | 'deny';
  cosign_token?: string;
  device_attestation: string;
  nonce: number;
}

export type ClawCoreFrame =
  | PetStateFrame
  | PetEventFrame
  | ApprovalRequestFrame
  | ApprovalResponseFrame;

/** MQTT topic templates per docs/RFC §5. Phase 5 BE-10.1. */
export const ClawCoreTopics = {
  /** Server → device. */
  downlink: (deviceId: string) => `agentrix/devices/${deviceId}/down`,
  /** Device → server. */
  uplink: (deviceId: string) => `agentrix/devices/${deviceId}/up`,
  /** OTA chunk request reply. */
  ota: (deviceId: string) => `agentrix/devices/${deviceId}/ota`,
  /** Broadcast lifecycle (online/offline). */
  presence: (deviceId: string) => `agentrix/devices/${deviceId}/presence`,
} as const;
