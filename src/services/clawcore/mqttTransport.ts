/**
 * mqttTransport.ts — Sprint WB #4
 *
 * Wi-Fi/MQTT transport for ClawCore Toy devices.
 * Per toy-prd-v4 §3.4: "Wi-Fi 直连 + MQTT（L2 高带宽）"
 *
 * Used for:
 *   - Smart speakers (long TTS streams)
 *   - Desk companions (always-on)
 *   - Car infotainment
 *   - Learning machines
 *
 * Architecture:
 *   Mobile → Backend MQTT broker (EMQX) → Device
 *   Device → Backend MQTT broker → Mobile (via socket.io relay)
 *
 * The mobile app doesn't connect directly to MQTT; instead it uses
 * the backend as a relay via the existing socket.io presence connection.
 * This avoids requiring MQTT client libraries on mobile.
 */
import { apiFetch } from '../api';
import { decodeFrame, verifyFrame, type ClawCoreFrame } from './protocol';
import type { ClawCoreDevice, PetStatePayload, PetInteractionPayload } from './types';

// ── Types ────────────────────────────────────────────────────

export interface MqttDeviceInfo {
  device_id: string;
  online: boolean;
  last_seen_at: string | null;
  transport: 'mqtt';
  firmware_version: string | null;
  ip_address: string | null;
}

export interface MqttSendResult {
  delivered: boolean;
  device_id: string;
}

// ── API (relay through backend) ──────────────────────────────

/**
 * List devices connected via MQTT (Wi-Fi devices).
 */
export async function listMqttDevices(): Promise<MqttDeviceInfo[]> {
  return apiFetch<MqttDeviceInfo[]>('/v1/clawcore/devices?transport=mqtt');
}

/**
 * Send a frame to a device via MQTT relay.
 * The backend publishes to `agentrix/devices/{deviceId}/down`.
 */
export async function sendFrameViaMqtt(
  deviceId: string,
  frameType: string,
  payload: unknown,
): Promise<MqttSendResult> {
  return apiFetch<MqttSendResult>('/v1/clawcore/mqtt/send', {
    method: 'POST',
    body: JSON.stringify({
      device_id: deviceId,
      frame_type: frameType,
      payload,
    }),
  });
}

/**
 * Push pet state to a Wi-Fi/MQTT device.
 */
export async function pushPetStateViaMqtt(
  deviceId: string,
  state: PetStatePayload,
): Promise<MqttSendResult> {
  return sendFrameViaMqtt(deviceId, 'pet.state.sync', state);
}

/**
 * Send TTS play command to a Wi-Fi device (speakers/desk companions).
 * Per toy-prd-v4 §5.3: `tts.play` frame type.
 */
export async function sendTtsViaMqtt(
  deviceId: string,
  payload: { audio_url?: string; text?: string; voice_id?: string },
): Promise<MqttSendResult> {
  return sendFrameViaMqtt(deviceId, 'tts.play', payload);
}

/**
 * Send approval notification to a Wi-Fi device.
 */
export async function sendApprovalNotifyViaMqtt(
  deviceId: string,
  payload: { request_id: string; risk_level: string; ttl_s: number },
): Promise<MqttSendResult> {
  return sendFrameViaMqtt(deviceId, 'pet.approval.notify', payload);
}

/**
 * Trigger OTA check for a Wi-Fi device.
 */
export async function triggerOtaCheckViaMqtt(deviceId: string): Promise<MqttSendResult> {
  return sendFrameViaMqtt(deviceId, 'ota.check', { current_fw: 'request' });
}

// ── Socket.io listener for MQTT uplink events ────────────────

type MqttUplinkHandler = (deviceId: string, frame: ClawCoreFrame) => void;

let _uplinkHandler: MqttUplinkHandler | null = null;

/**
 * Register a handler for MQTT uplink frames (device → backend → mobile).
 * These arrive via the existing socket.io presence connection as
 * `agentrix:toy-mqtt-uplink` events.
 */
export function onMqttUplink(handler: MqttUplinkHandler): () => void {
  _uplinkHandler = handler;

  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail?.device_id || !detail?.raw_frame) return;

    const frame = decodeFrame(detail.raw_frame);
    if (frame) {
      _uplinkHandler?.(detail.device_id, frame);
    }
  };

  window.addEventListener('agentrix:toy-mqtt-uplink', listener);

  return () => {
    window.removeEventListener('agentrix:toy-mqtt-uplink', listener);
    _uplinkHandler = null;
  };
}

/**
 * Check if a device supports MQTT transport.
 */
export function isMqttDevice(device: ClawCoreDevice): boolean {
  return device.pairingMethod === 'wifi' || device.pairingMethod === 'sdk';
}
