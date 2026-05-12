/**
 * ClawCore Mobile SDK — Sprint I #24
 *
 * Client-side bridge for ClawCore Wire Protocol v0.
 * Per toy-prd-v4 §5 and cross-platform PRD §10:
 *
 * Responsibilities:
 *   - BLE GATT connection (Nordic UART Service)
 *   - Wi-Fi/MQTT fallback for high-bandwidth devices
 *   - Frame encode/decode (JSON-line + HMAC verification)
 *   - Device state management (hello → auth → bound → active)
 *   - pet.state.sync push to connected toys
 *   - pet.interaction receive from toys
 *   - OTA chunk delivery
 *
 * This module wraps react-native-ble-plx for BLE and socket.io for MQTT relay.
 */
export { ClawCoreManager } from './ClawCoreManager';
export { ClawCoreFrame, encodeFrame, decodeFrame, verifyFrame } from './protocol';
export type {
  ClawCoreDevice,
  ClawCoreDeviceState,
  ClawCoreFrameType,
  PetStatePayload,
  PetInteractionPayload,
  OtaChunkPayload,
  HelloPayload,
  AuthPayload,
} from './types';
