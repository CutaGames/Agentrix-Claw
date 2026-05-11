/**
 * ClawCore SDK — Sprint 4 Task 4.9 (Placeholder)
 *
 * Defines the ClawCore protocol types and provides stubs for:
 * - Frame encoding/decoding
 * - HMAC verification
 * - Device communication protocol
 *
 * This will be fully implemented when the physical hardware is ready.
 * Protocol reference: shared/clawcore/v1/
 */

// ── Protocol Types ─────────────────────────────────────────────────────────

/** ClawCore frame header — 8 bytes */
export interface ClawCoreFrameHeader {
  /** Magic bytes: 0x43 0x4C (ASCII "CL") */
  magic: [number, number];
  /** Protocol version (currently 1) */
  version: number;
  /** Frame type */
  type: ClawCoreFrameType;
  /** Payload length in bytes (uint16 big-endian) */
  payloadLength: number;
  /** Sequence number (uint16 big-endian, wraps at 65535) */
  sequence: number;
}

export enum ClawCoreFrameType {
  /** Heartbeat / keep-alive */
  PING = 0x01,
  /** Heartbeat response */
  PONG = 0x02,
  /** Command from app to device */
  COMMAND = 0x10,
  /** Response from device to app */
  RESPONSE = 0x11,
  /** Event pushed from device */
  EVENT = 0x20,
  /** OTA data chunk */
  OTA_DATA = 0x30,
  /** Authentication handshake */
  AUTH = 0x40,
}

export interface ClawCoreFrame {
  header: ClawCoreFrameHeader;
  payload: Uint8Array;
  /** HMAC-SHA256 of header + payload (32 bytes) */
  hmac: Uint8Array;
}

/** Command IDs sent from app to device */
export enum ClawCoreCommand {
  /** Set LED color: payload = [r, g, b] */
  SET_LED = 0x01,
  /** Play haptic pattern: payload = [patternId] */
  HAPTIC = 0x02,
  /** Set pet emotion display: payload = [emotionId, intensity] */
  SET_EMOTION = 0x03,
  /** Request device status */
  GET_STATUS = 0x04,
  /** Start OTA update */
  OTA_BEGIN = 0x10,
  /** Finish OTA update */
  OTA_END = 0x11,
}

/** Event IDs pushed from device to app */
export enum ClawCoreEvent {
  /** Button pressed: payload = [buttonId, pressType] */
  BUTTON_PRESS = 0x01,
  /** Motion detected: payload = [accelX, accelY, accelZ] (int16 each) */
  MOTION = 0x02,
  /** Battery level changed: payload = [level%] */
  BATTERY = 0x03,
  /** Touch sensor: payload = [zoneId, pressure] */
  TOUCH = 0x04,
  /** Temperature reading: payload = [tempC * 10 as int16] */
  TEMPERATURE = 0x05,
}

/** Device status response */
export interface ClawCoreDeviceStatus {
  batteryLevel: number;
  firmwareVersion: string;
  isCharging: boolean;
  uptimeSeconds: number;
  currentEmotion: number;
  ledColor: [number, number, number];
}

// ── HMAC Verification (Stub) ───────────────────────────────────────────────

const HMAC_KEY_PLACEHOLDER = new Uint8Array(32); // Will be derived from pairing

/**
 * Compute HMAC-SHA256 for a ClawCore frame.
 * STUB: Returns a zero-filled 32-byte array until hardware integration.
 */
export function computeFrameHmac(
  _header: Uint8Array,
  _payload: Uint8Array,
  _key: Uint8Array = HMAC_KEY_PLACEHOLDER,
): Uint8Array {
  // TODO: Implement with expo-crypto or native HMAC when hardware is ready
  console.warn('[ClawCore SDK] computeFrameHmac is a stub — returning zeros');
  return new Uint8Array(32);
}

/**
 * Verify the HMAC of a received frame.
 * STUB: Always returns true until hardware integration.
 */
export function verifyFrameHmac(
  _frame: ClawCoreFrame,
  _key: Uint8Array = HMAC_KEY_PLACEHOLDER,
): boolean {
  // TODO: Implement real verification
  console.warn('[ClawCore SDK] verifyFrameHmac is a stub — always returns true');
  return true;
}

// ── Frame Encoding (Stub) ──────────────────────────────────────────────────

const MAGIC: [number, number] = [0x43, 0x4c]; // "CL"
const PROTOCOL_VERSION = 1;

let sequenceCounter = 0;

/**
 * Encode a ClawCore frame for transmission.
 * STUB: Builds the frame structure but HMAC is zeroed.
 */
export function encodeFrame(
  type: ClawCoreFrameType,
  payload: Uint8Array,
): Uint8Array {
  const seq = sequenceCounter++ & 0xffff;
  const payloadLen = payload.length;

  // Header: magic(2) + version(1) + type(1) + payloadLen(2) + seq(2) = 8 bytes
  const header = new Uint8Array(8);
  header[0] = MAGIC[0];
  header[1] = MAGIC[1];
  header[2] = PROTOCOL_VERSION;
  header[3] = type;
  header[4] = (payloadLen >> 8) & 0xff;
  header[5] = payloadLen & 0xff;
  header[6] = (seq >> 8) & 0xff;
  header[7] = seq & 0xff;

  // HMAC placeholder (32 bytes of zeros)
  const hmac = computeFrameHmac(header, payload);

  // Full frame: header(8) + payload(N) + hmac(32)
  const frame = new Uint8Array(8 + payloadLen + 32);
  frame.set(header, 0);
  frame.set(payload, 8);
  frame.set(hmac, 8 + payloadLen);

  return frame;
}

/**
 * Decode a received ClawCore frame from raw bytes.
 * STUB: Parses structure but skips HMAC verification.
 */
export function decodeFrame(data: Uint8Array): ClawCoreFrame | null {
  if (data.length < 8 + 32) {
    console.warn('[ClawCore SDK] Frame too short');
    return null;
  }

  // Validate magic
  if (data[0] !== MAGIC[0] || data[1] !== MAGIC[1]) {
    console.warn('[ClawCore SDK] Invalid magic bytes');
    return null;
  }

  const version = data[2];
  if (version !== PROTOCOL_VERSION) {
    console.warn(`[ClawCore SDK] Unsupported protocol version: ${version}`);
    return null;
  }

  const type = data[3] as ClawCoreFrameType;
  const payloadLength = (data[4] << 8) | data[5];
  const sequence = (data[6] << 8) | data[7];

  if (data.length < 8 + payloadLength + 32) {
    console.warn('[ClawCore SDK] Frame truncated');
    return null;
  }

  const payload = data.slice(8, 8 + payloadLength);
  const hmac = data.slice(8 + payloadLength, 8 + payloadLength + 32);

  const frame: ClawCoreFrame = {
    header: {
      magic: MAGIC,
      version,
      type,
      payloadLength,
      sequence,
    },
    payload,
    hmac,
  };

  // Verify HMAC (stub — always passes)
  if (!verifyFrameHmac(frame)) {
    console.warn('[ClawCore SDK] HMAC verification failed');
    return null;
  }

  return frame;
}

// ── Convenience Builders ───────────────────────────────────────────────────

/**
 * Build a command frame.
 */
export function buildCommandFrame(command: ClawCoreCommand, args: number[] = []): Uint8Array {
  const payload = new Uint8Array([command, ...args]);
  return encodeFrame(ClawCoreFrameType.COMMAND, payload);
}

/**
 * Build a ping frame.
 */
export function buildPingFrame(): Uint8Array {
  return encodeFrame(ClawCoreFrameType.PING, new Uint8Array(0));
}

/**
 * Parse a device status response payload.
 */
export function parseDeviceStatus(payload: Uint8Array): ClawCoreDeviceStatus | null {
  // Expected payload: battery(1) + fwMajor(1) + fwMinor(1) + fwPatch(1) +
  //                   charging(1) + uptime(4) + emotion(1) + led(3) = 13 bytes
  if (payload.length < 13) return null;

  return {
    batteryLevel: payload[0],
    firmwareVersion: `${payload[1]}.${payload[2]}.${payload[3]}`,
    isCharging: payload[4] === 1,
    uptimeSeconds: (payload[5] << 24) | (payload[6] << 16) | (payload[7] << 8) | payload[8],
    currentEmotion: payload[9],
    ledColor: [payload[10], payload[11], payload[12]],
  };
}
