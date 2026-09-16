/**
 * GlassGestureHandler — Map AI glass touch/IMU events to Agent commands.
 *
 * Handles:
 * - Touch bar gestures (tap, double-tap, swipe, long-press)
 * - IMU head gestures (nod, shake — optional per device)
 * - Maps gestures → Agent actions (interrupt, confirm, dismiss, scroll)
 *
 * BLE Notify flow:  Glass → GATT event characteristic (0xAGX5) → Phone → Action
 */

import { BleManager, type Subscription } from 'react-native-ble-plx';
import type { Socket } from 'socket.io-client';
import { Buffer } from 'buffer';

// ── GATT UUIDs ─────────────────────────────────────────

const GLASS_SERVICE_UUID = '0000AGX0-0000-1000-8000-00805F9B34FB';
/** Touch/IMU event characteristic (Notify — glass → phone) */
const GESTURE_EVENT_CHAR_UUID = '0000AGX5-0000-1000-8000-00805F9B34FB';

// ── Types ──────────────────────────────────────────────

export type GestureType =
  | 'tap'
  | 'double_tap'
  | 'long_press'
  | 'swipe_forward'
  | 'swipe_backward'
  | 'nod'
  | 'shake';

export type GestureAction =
  | 'voice_interrupt'   // barge-in — stop Agent speaking
  | 'voice_activate'    // start listening
  | 'confirm'           // approve (payment, action)
  | 'dismiss'           // dismiss notification / cancel
  | 'scroll_next'       // next HUD page
  | 'scroll_prev'       // previous HUD page
  | 'capture_image'     // trigger camera capture
  | 'noop';             // no action

export interface GestureEvent {
  type: GestureType;
  /** Timestamp from the device (ms since boot or epoch) */
  deviceTimestamp: number;
  /** Optional raw IMU data { ax, ay, az, gx, gy, gz } */
  imu?: {
    ax: number; ay: number; az: number;
    gx: number; gy: number; gz: number;
  };
}

export interface GestureMapping {
  gesture: GestureType;
  action: GestureAction;
}

export interface GestureHandlerCallbacks {
  onGesture?: (event: GestureEvent, action: GestureAction) => void;
  onError?: (error: Error) => void;
}

// ── Default gesture-to-action mapping ──────────────────

const DEFAULT_GESTURE_MAP: GestureMapping[] = [
  { gesture: 'tap',             action: 'voice_activate' },
  { gesture: 'double_tap',      action: 'voice_interrupt' },
  { gesture: 'long_press',      action: 'capture_image' },
  { gesture: 'swipe_forward',   action: 'scroll_next' },
  { gesture: 'swipe_backward',  action: 'scroll_prev' },
  { gesture: 'nod',             action: 'confirm' },
  { gesture: 'shake',           action: 'dismiss' },
];

// ── Service ────────────────────────────────────────────

export class GlassGestureHandler {
  private bleManager: BleManager;
  private deviceId: string;
  private serviceUuid: string;
  private gestureCharUuid: string;
  private callbacks: GestureHandlerCallbacks;
  private gestureMap: Map<GestureType, GestureAction>;
  private bleSubscription: Subscription | null = null;
  private voiceSocket: Socket | null = null;
  private active = false;

  /** Debounce: ignore duplicate gestures within this window */
  private lastGestureTime = 0;
  private lastGestureType: GestureType | null = null;
  private debounceMs = 300;

  constructor(
    bleManager: BleManager,
    deviceId: string,
    options?: {
      serviceUuid?: string;
      gestureCharUuid?: string;
      customMapping?: GestureMapping[];
      debounceMs?: number;
      callbacks?: GestureHandlerCallbacks;
    },
  ) {
    this.bleManager = bleManager;
    this.deviceId = deviceId;
    this.serviceUuid = options?.serviceUuid ?? GLASS_SERVICE_UUID;
    this.gestureCharUuid = options?.gestureCharUuid ?? GESTURE_EVENT_CHAR_UUID;
    this.callbacks = options?.callbacks ?? {};
    this.debounceMs = options?.debounceMs ?? 300;

    // Build gesture map from custom or default
    const mappings = options?.customMapping ?? DEFAULT_GESTURE_MAP;
    this.gestureMap = new Map(mappings.map((m) => [m.gesture, m.action]));
  }

  /**
   * Start listening for gesture events from the glass.
   * @param voiceSocket Optional voice gateway socket for sending commands
   */
  async start(voiceSocket?: Socket): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.voiceSocket = voiceSocket ?? null;

    try {
      const device = await this.bleManager.connectToDevice(this.deviceId);
      await device.discoverAllServicesAndCharacteristics();

      this.bleSubscription = device.monitorCharacteristicForService(
        this.serviceUuid,
        this.gestureCharUuid,
        (error, characteristic) => {
          if (error) {
            this.callbacks.onError?.(
              error instanceof Error ? error : new Error(String(error)),
            );
            return;
          }

          if (characteristic?.value) {
            const parsed = this.parseGestureEvent(characteristic.value);
            if (parsed) {
              this.handleGestureEvent(parsed);
            }
          }
        },
      );
    } catch (error) {
      this.active = false;
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /** Stop listening for gesture events. */
  stop(): void {
    this.active = false;
    if (this.bleSubscription) {
      this.bleSubscription.remove();
      this.bleSubscription = null;
    }
    this.voiceSocket = null;
  }

  /** Update the voice socket (e.g. when session reconnects). */
  setVoiceSocket(socket: Socket | null): void {
    this.voiceSocket = socket;
  }

  /** Update gesture mapping at runtime. */
  setMapping(gesture: GestureType, action: GestureAction): void {
    this.gestureMap.set(gesture, action);
  }

  /** Get the current gesture-to-action mapping. */
  getMapping(): GestureMapping[] {
    return Array.from(this.gestureMap.entries()).map(([gesture, action]) => ({ gesture, action }));
  }

  // ── Internal ──────────────────────────────────────────

  /**
   * Parse a BLE characteristic value into a GestureEvent.
   * Expected format: JSON { "type": "tap", "ts": 12345, "imu": {...} }
   */
  private parseGestureEvent(base64Value: string): GestureEvent | null {
    try {
      const raw = Buffer.from(base64Value, 'base64').toString('utf-8');
      const data = JSON.parse(raw) as Record<string, unknown>;

      const type = data.type as string | undefined;
      if (!type || !this.isValidGestureType(type)) {
        return null;
      }

      return {
        type: type as GestureType,
        deviceTimestamp: typeof data.ts === 'number' ? data.ts : Date.now(),
        imu: typeof data.imu === 'object' && data.imu !== null
          ? data.imu as GestureEvent['imu']
          : undefined,
      };
    } catch {
      return null;
    }
  }

  private isValidGestureType(type: string): type is GestureType {
    return ['tap', 'double_tap', 'long_press', 'swipe_forward', 'swipe_backward', 'nod', 'shake'].includes(type);
  }

  /**
   * Handle a parsed gesture event: debounce → map to action → execute.
   */
  private handleGestureEvent(event: GestureEvent): void {
    // Debounce: skip if same gesture arrived within debounce window
    const now = Date.now();
    if (
      event.type === this.lastGestureType &&
      now - this.lastGestureTime < this.debounceMs
    ) {
      return;
    }
    this.lastGestureTime = now;
    this.lastGestureType = event.type;

    const action = this.gestureMap.get(event.type) ?? 'noop';
    this.callbacks.onGesture?.(event, action);

    if (action === 'noop') return;

    this.executeAction(action, event);
  }

  /**
   * Execute the mapped action — sends commands to the voice socket
   * or emits events for local handling.
   */
  private executeAction(action: GestureAction, event: GestureEvent): void {
    switch (action) {
      case 'voice_interrupt':
        // Send barge-in signal to cloud
        this.voiceSocket?.emit('voice:interrupt', {
          source: 'glass_gesture',
          gesture: event.type,
        });
        break;

      case 'voice_activate':
        // Trigger wake / start listening
        this.voiceSocket?.emit('voice:start', {
          source: 'glass_gesture',
          deviceType: 'glass',
        });
        break;

      case 'confirm':
        // Send confirmation (e.g. payment approval)
        this.voiceSocket?.emit('voice:glass:confirm', {
          source: 'glass_gesture',
          gesture: event.type,
          timestamp: event.deviceTimestamp,
        });
        break;

      case 'dismiss':
        // Dismiss current notification / cancel operation
        this.voiceSocket?.emit('voice:glass:dismiss', {
          source: 'glass_gesture',
          gesture: event.type,
        });
        break;

      case 'scroll_next':
      case 'scroll_prev':
        // HUD pagination — handled locally, no cloud signal needed
        // The HUD controller listens for these
        break;

      case 'capture_image':
        // Trigger camera frame capture
        this.voiceSocket?.emit('voice:glass:capture', {
          source: 'glass_gesture',
          gesture: event.type,
        });
        break;
    }
  }
}
