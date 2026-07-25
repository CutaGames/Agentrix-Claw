/**
 * Glass Vendor SDK Adapters — platform-specific integrations for AI glasses.
 *
 * Abstracting vendor differences behind a common GlassVendorAdapter interface
 * so glassSessionBridge, glassGestureHandler, and glassHUDController can work
 * across different hardware without vendor-specific branching.
 *
 * Supported vendors:
 *   - XREAL Air 2 Ultra — Full AR, dual cameras, 6DoF IMU, open nebula SDK
 *   - Meta Ray-Ban — Camera, speakers, limited BLE API
 *   - Even Realities G1 — Monochrome HUD, temple touch bar, mic/speaker
 *   - Generic BLE Glass — Fallback for unknown BLE glasses
 */

import type { BleManager, Device, Characteristic } from 'react-native-ble-plx';

// ── Common Interface ───────────────────────────────────

export interface GlassCapabilities {
  hasCamera: boolean;
  hasMic: boolean;
  hasSpeaker: boolean;
  hasHUD: boolean;
  hasIMU: boolean;
  hasTouchBar: boolean;
  cameraResolution: string;
  hudType: 'none' | 'monochrome' | 'color' | 'ar-overlay';
  hudMaxCharsPerLine: number;
  hudMaxLines: number;
  imuDof: number; // 3 or 6
  batteryServiceUuid: string;
}

export interface GlassVendorAdapter {
  readonly vendorKey: string;
  readonly displayName: string;
  readonly capabilities: GlassCapabilities;

  /** BLE service UUIDs to scan for during pairing */
  readonly scanServiceUuids: string[];

  /** Check if a scanned BLE device matches this vendor */
  matchesDevice(deviceName: string, serviceUuids: string[]): boolean;

  /** Get the characteristic UUID for a given function */
  getCharacteristicUuid(fn: 'mic' | 'speaker' | 'camera' | 'hud' | 'gesture' | 'battery'): string | null;

  /** Format text for the HUD display (vendor-specific encoding) */
  formatHudPayload(text: string, priority?: number): Buffer;

  /** Parse gesture event from BLE notification data */
  parseGestureEvent(data: Buffer): GlassGestureEvent | null;

  /** Parse camera frame from BLE notification data */
  parseCameraFrame?(data: Buffer): { frame: Buffer; mimeType: string; width: number; height: number } | null;
}

export interface GlassGestureEvent {
  type: 'tap' | 'double_tap' | 'long_press' | 'swipe_forward' | 'swipe_backward' | 'nod' | 'shake';
  confidence: number;
  rawImu?: { ax: number; ay: number; az: number; gx: number; gy: number; gz: number };
}

// ── XREAL Air 2 Ultra ──────────────────────────────────

const XREAL_SERVICE_UUID = '0000fe00-0000-1000-8000-00805f9b34fb';
const XREAL_CAMERA_CHAR = '0000fe01-0000-1000-8000-00805f9b34fb';
const XREAL_IMU_CHAR = '0000fe02-0000-1000-8000-00805f9b34fb';
const XREAL_AUDIO_CHAR = '0000fe03-0000-1000-8000-00805f9b34fb';
const XREAL_DISPLAY_CHAR = '0000fe04-0000-1000-8000-00805f9b34fb';

export class XrealAir2Adapter implements GlassVendorAdapter {
  readonly vendorKey = 'xreal-air';
  readonly displayName = 'XREAL Air 2 Ultra';
  readonly scanServiceUuids = [XREAL_SERVICE_UUID];

  readonly capabilities: GlassCapabilities = {
    hasCamera: true,
    hasMic: true,
    hasSpeaker: true,
    hasHUD: true,
    hasIMU: true,
    hasTouchBar: false,
    cameraResolution: '1280x720',
    hudType: 'ar-overlay',
    hudMaxCharsPerLine: 60,
    hudMaxLines: 5,
    imuDof: 6,
    batteryServiceUuid: '180f',
  };

  matchesDevice(deviceName: string, serviceUuids: string[]): boolean {
    const name = deviceName.toLowerCase();
    return name.includes('xreal') || name.includes('nreal') ||
           serviceUuids.some((u) => u.toLowerCase().includes('fe00'));
  }

  getCharacteristicUuid(fn: string): string | null {
    switch (fn) {
      case 'camera': return XREAL_CAMERA_CHAR;
      case 'gesture': return XREAL_IMU_CHAR;
      case 'mic':
      case 'speaker': return XREAL_AUDIO_CHAR;
      case 'hud': return XREAL_DISPLAY_CHAR;
      case 'battery': return '00002a19-0000-1000-8000-00805f9b34fb'; // Standard battery level
      default: return null;
    }
  }

  formatHudPayload(text: string, priority = 1): Buffer {
    // XREAL Nebula SDK uses JSON-based display commands
    const payload = JSON.stringify({
      cmd: 'display_text',
      text: text.substring(0, 60 * 5), // max 300 chars
      priority,
      position: 'center',
      duration: priority > 2 ? 10000 : 5000,
    });
    return Buffer.from(payload, 'utf-8');
  }

  parseGestureEvent(data: Buffer): GlassGestureEvent | null {
    if (data.length < 12) return null;
    try {
      // XREAL IMU data: 6-axis float32 LE (ax, ay, az, gx, gy, gz)
      const ax = data.readFloatLE(0);
      const ay = data.readFloatLE(4);
      const az = data.readFloatLE(8);
      const gx = data.length >= 24 ? data.readFloatLE(12) : 0;
      const gy = data.length >= 24 ? data.readFloatLE(16) : 0;
      const gz = data.length >= 24 ? data.readFloatLE(20) : 0;

      // Gesture classification from IMU
      const accelMag = Math.sqrt(ax * ax + ay * ay + az * az);
      const gyroMag = Math.sqrt(gx * gx + gy * gy + gz * gz);

      if (gyroMag > 3.0 && Math.abs(gx) > 2.0) return { type: 'nod', confidence: 0.7, rawImu: { ax, ay, az, gx, gy, gz } };
      if (gyroMag > 4.0 && Math.abs(gy) > 3.0) return { type: 'shake', confidence: 0.7, rawImu: { ax, ay, az, gx, gy, gz } };
      if (accelMag > 15) return { type: 'tap', confidence: 0.6, rawImu: { ax, ay, az, gx, gy, gz } };

      return null;
    } catch {
      return null;
    }
  }

  parseCameraFrame(data: Buffer): { frame: Buffer; mimeType: string; width: number; height: number } | null {
    if (data.length < 100) return null;
    // XREAL sends JPEG frames through camera characteristic
    // First 4 bytes: big-endian frame length
    const frameLen = data.readUInt32BE(0);
    if (data.length < frameLen + 4) return null;
    return {
      frame: data.subarray(4, 4 + frameLen),
      mimeType: 'image/jpeg',
      width: 1280,
      height: 720,
    };
  }
}

// ── Meta Ray-Ban ───────────────────────────────────────

const META_SERVICE_UUID = '0000fd00-0000-1000-8000-00805f9b34fb';
const META_AUDIO_CHAR = '0000fd01-0000-1000-8000-00805f9b34fb';
const META_CONTROL_CHAR = '0000fd02-0000-1000-8000-00805f9b34fb';

export class MetaRayBanAdapter implements GlassVendorAdapter {
  readonly vendorKey = 'meta-rayban';
  readonly displayName = 'Meta Ray-Ban Stories';
  readonly scanServiceUuids = [META_SERVICE_UUID];

  readonly capabilities: GlassCapabilities = {
    hasCamera: true,
    hasMic: true,
    hasSpeaker: true,
    hasHUD: false,
    hasIMU: false,
    hasTouchBar: true,
    cameraResolution: '1280x1280',
    hudType: 'none',
    hudMaxCharsPerLine: 0,
    hudMaxLines: 0,
    imuDof: 0,
    batteryServiceUuid: '180f',
  };

  matchesDevice(deviceName: string, serviceUuids: string[]): boolean {
    const name = deviceName.toLowerCase();
    return name.includes('ray-ban') || name.includes('ray ban') || name.includes('meta glass') ||
           serviceUuids.some((u) => u.toLowerCase().includes('fd00'));
  }

  getCharacteristicUuid(fn: string): string | null {
    switch (fn) {
      case 'mic':
      case 'speaker': return META_AUDIO_CHAR;
      case 'gesture': return META_CONTROL_CHAR;
      case 'battery': return '00002a19-0000-1000-8000-00805f9b34fb';
      default: return null; // No HUD or camera BLE access
    }
  }

  formatHudPayload(_text: string): Buffer {
    // Meta Ray-Ban has no HUD — return empty
    return Buffer.alloc(0);
  }

  parseGestureEvent(data: Buffer): GlassGestureEvent | null {
    if (data.length < 2) return null;
    try {
      // Meta touch frame: byte[0] = event type, byte[1] = duration (10ms units)
      const eventType = data[0];
      const duration = (data[1] || 0) * 10;

      switch (eventType) {
        case 0x01: return { type: 'tap', confidence: 0.9 };
        case 0x02: return { type: 'double_tap', confidence: 0.9 };
        case 0x03: return { type: duration > 500 ? 'long_press' : 'tap', confidence: 0.8 };
        case 0x10: return { type: 'swipe_forward', confidence: 0.8 };
        case 0x11: return { type: 'swipe_backward', confidence: 0.8 };
        default: return null;
      }
    } catch {
      return null;
    }
  }
}

// ── Even Realities G1 ──────────────────────────────────

const EVEN_SERVICE_UUID = '0000ee00-0000-1000-8000-00805f9b34fb';
const EVEN_AUDIO_CHAR = '0000ee01-0000-1000-8000-00805f9b34fb';
const EVEN_HUD_CHAR = '0000ee02-0000-1000-8000-00805f9b34fb';
const EVEN_TOUCH_CHAR = '0000ee03-0000-1000-8000-00805f9b34fb';

export class EvenG1Adapter implements GlassVendorAdapter {
  readonly vendorKey = 'even-g1';
  readonly displayName = 'Even Realities G1';
  readonly scanServiceUuids = [EVEN_SERVICE_UUID];

  readonly capabilities: GlassCapabilities = {
    hasCamera: false,
    hasMic: true,
    hasSpeaker: true,
    hasHUD: true,
    hasIMU: false,
    hasTouchBar: true,
    cameraResolution: 'none',
    hudType: 'monochrome',
    hudMaxCharsPerLine: 30,
    hudMaxLines: 3,
    imuDof: 0,
    batteryServiceUuid: '180f',
  };

  matchesDevice(deviceName: string, serviceUuids: string[]): boolean {
    const name = deviceName.toLowerCase();
    return name.includes('even') || name.includes('g1 glass') ||
           serviceUuids.some((u) => u.toLowerCase().includes('ee00'));
  }

  getCharacteristicUuid(fn: string): string | null {
    switch (fn) {
      case 'mic':
      case 'speaker': return EVEN_AUDIO_CHAR;
      case 'hud': return EVEN_HUD_CHAR;
      case 'gesture': return EVEN_TOUCH_CHAR;
      case 'battery': return '00002a19-0000-1000-8000-00805f9b34fb';
      default: return null;
    }
  }

  formatHudPayload(text: string, priority = 1): Buffer {
    // Even G1: custom binary protocol
    // Byte 0: command (0x01 = text display)
    // Byte 1: priority (0-3)
    // Byte 2-3: text length (uint16 LE)
    // Byte 4+: UTF-8 text
    const truncated = text.substring(0, 30 * 3); // max 90 chars for 3 lines
    const textBytes = Buffer.from(truncated, 'utf-8');
    const header = Buffer.alloc(4);
    header[0] = 0x01;
    header[1] = Math.min(priority, 3);
    header.writeUInt16LE(textBytes.length, 2);
    return Buffer.concat([header, textBytes]);
  }

  parseGestureEvent(data: Buffer): GlassGestureEvent | null {
    if (data.length < 1) return null;
    try {
      // Even G1 touch bar: single byte event codes
      const eventCode = data[0];
      switch (eventCode) {
        case 0x01: return { type: 'tap', confidence: 0.95 };
        case 0x02: return { type: 'double_tap', confidence: 0.95 };
        case 0x03: return { type: 'long_press', confidence: 0.9 };
        case 0x04: return { type: 'swipe_forward', confidence: 0.9 };
        case 0x05: return { type: 'swipe_backward', confidence: 0.9 };
        default: return null;
      }
    } catch {
      return null;
    }
  }
}

// ── Generic BLE Glass (fallback) ───────────────────────

export class GenericBleGlassAdapter implements GlassVendorAdapter {
  readonly vendorKey = 'generic-ble-glass';
  readonly displayName = 'BLE Audio Glasses';
  readonly scanServiceUuids: string[] = [];

  readonly capabilities: GlassCapabilities = {
    hasCamera: false,
    hasMic: true,
    hasSpeaker: true,
    hasHUD: false,
    hasIMU: false,
    hasTouchBar: false,
    cameraResolution: 'none',
    hudType: 'none',
    hudMaxCharsPerLine: 0,
    hudMaxLines: 0,
    imuDof: 0,
    batteryServiceUuid: '180f',
  };

  matchesDevice(_deviceName: string, serviceUuids: string[]): boolean {
    // Match any device with audio service but no recognized vendor
    return serviceUuids.some((u) => {
      const short = u.replace(/-/g, '').toLowerCase();
      return short.includes('1108') || short.includes('110b') || short.includes('110e');
    });
  }

  getCharacteristicUuid(fn: string): string | null {
    if (fn === 'battery') return '00002a19-0000-1000-8000-00805f9b34fb';
    return null; // Generic — use standard audio profile
  }

  formatHudPayload(): Buffer {
    return Buffer.alloc(0); // No HUD
  }

  parseGestureEvent(): GlassGestureEvent | null {
    return null; // No gesture support
  }
}

// ── Adapter Registry ───────────────────────────────────

const ALL_ADAPTERS: GlassVendorAdapter[] = [
  new XrealAir2Adapter(),
  new MetaRayBanAdapter(),
  new EvenG1Adapter(),
  new GenericBleGlassAdapter(),
];

/**
 * Find the best matching adapter for a scanned BLE device.
 */
export function resolveGlassAdapter(
  deviceName: string,
  serviceUuids: string[],
): GlassVendorAdapter {
  for (const adapter of ALL_ADAPTERS) {
    if (adapter.matchesDevice(deviceName, serviceUuids)) {
      return adapter;
    }
  }
  return ALL_ADAPTERS[ALL_ADAPTERS.length - 1]; // fallback to generic
}

/**
 * Get a specific adapter by vendor key.
 */
export function getAdapterByKey(vendorKey: string): GlassVendorAdapter | null {
  return ALL_ADAPTERS.find((a) => a.vendorKey === vendorKey) || null;
}

/**
 * Get all registered adapters.
 */
export function getAllAdapters(): GlassVendorAdapter[] {
  return [...ALL_ADAPTERS];
}
