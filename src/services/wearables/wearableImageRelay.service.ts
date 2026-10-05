/**
 * WearableImageRelay — BLE camera characteristic → voice:image:frame bridge.
 *
 * AI glasses with cameras (e.g. Meta Ray-Ban, XREAL) send JPEG fragments
 * via BLE Notify. This relay reassembles fragments into complete JPEG frames
 * and emits them as `voice:image:frame` events to the Voice Gateway v2.
 *
 * Fragment protocol:
 *   Byte 0:    flags (0x01 = first fragment, 0x02 = last fragment)
 *   Byte 1-2:  frame sequence number (uint16 LE)
 *   Byte 3-4:  fragment index (uint16 LE)
 *   Byte 5...: JPEG data
 */

import { BleManager, type Subscription } from 'react-native-ble-plx';
import type { Socket } from 'socket.io-client';
import { Buffer } from 'buffer';

// ── GATT UUIDs ─────────────────────────────────────────

/** Agentrix Glass Service UUID (custom) */
const GLASS_SERVICE_UUID = '0000AGX0-0000-1000-8000-00805F9B34FB';
/** Camera image stream characteristic (Notify — glass → phone) */
const CAMERA_CHAR_UUID = '0000AGX3-0000-1000-8000-00805F9B34FB';

// ── Fragment reassembly ────────────────────────────────

const FLAG_FIRST = 0x01;
const FLAG_LAST = 0x02;

interface FrameBuffer {
  sequenceNumber: number;
  fragments: Map<number, Buffer>;
  expectedLast: number;
  startedAt: number;
}

// ── Types ──────────────────────────────────────────────

export interface ImageRelayCallbacks {
  onFrameEmitted?: (frameSeq: number, sizeBytes: number) => void;
  onError?: (error: Error) => void;
}

export interface ImageRelayOptions {
  /** BLE device ID (from scan/pair) */
  deviceId: string;
  /** Voice Gateway session ID */
  sessionId: string;
  /** Max time (ms) to wait for a complete frame before discarding */
  frameTimeoutMs?: number;
  /** Custom service UUID override */
  serviceUuid?: string;
  /** Custom camera characteristic UUID override */
  cameraCharUuid?: string;
}

// ── Service ────────────────────────────────────────────

export class WearableImageRelay {
  private bleManager: BleManager;
  private cameraSubscription: Subscription | null = null;
  private active = false;
  private options: ImageRelayOptions;
  private callbacks: ImageRelayCallbacks;
  private frameTimeoutMs: number;

  /** In-flight frame buffers keyed by sequence number */
  private frameBuffers = new Map<number, FrameBuffer>();

  private serviceUuid: string;
  private cameraCharUuid: string;

  constructor(
    bleManager: BleManager,
    options: ImageRelayOptions,
    callbacks: ImageRelayCallbacks = {},
  ) {
    this.bleManager = bleManager;
    this.options = options;
    this.callbacks = callbacks;
    this.frameTimeoutMs = options.frameTimeoutMs ?? 3000;
    this.serviceUuid = options.serviceUuid || GLASS_SERVICE_UUID;
    this.cameraCharUuid = options.cameraCharUuid || CAMERA_CHAR_UUID;
  }

  // ── Start monitoring camera characteristic ──────────

  async start(voiceSocket: Socket): Promise<void> {
    if (this.active) return;
    this.active = true;

    try {
      const device = await this.bleManager.connectToDevice(this.options.deviceId);
      await device.discoverAllServicesAndCharacteristics();

      this.cameraSubscription = device.monitorCharacteristicForService(
        this.serviceUuid,
        this.cameraCharUuid,
        (error, characteristic) => {
          if (error) {
            this.callbacks.onError?.(
              error instanceof Error ? error : new Error(String(error)),
            );
            return;
          }

          if (!characteristic?.value || !this.active) return;

          this.handleFragment(characteristic.value, voiceSocket);
        },
      );
    } catch (error: any) {
      this.active = false;
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error(error?.message || 'BLE camera start failed'),
      );
      throw error;
    }
  }

  // ── Stop ────────────────────────────────────────────

  async stop(): Promise<void> {
    this.active = false;

    if (this.cameraSubscription) {
      this.cameraSubscription.remove();
      this.cameraSubscription = null;
    }

    this.frameBuffers.clear();
  }

  get isActive(): boolean {
    return this.active;
  }

  // ── Fragment handling ───────────────────────────────

  private handleFragment(base64Value: string, voiceSocket: Socket): void {
    const data = Buffer.from(base64Value, 'base64');

    if (data.length < 5) return; // Too short — ignore

    const flags = data[0];
    const sequenceNumber = data.readUInt16LE(1);
    const fragmentIndex = data.readUInt16LE(3);
    const jpegPayload = data.subarray(5);

    // Get or create frame buffer
    let frame = this.frameBuffers.get(sequenceNumber);

    if (flags & FLAG_FIRST) {
      // Start a new frame (discard any existing stale buffer)
      frame = {
        sequenceNumber,
        fragments: new Map(),
        expectedLast: -1,
        startedAt: Date.now(),
      };
      this.frameBuffers.set(sequenceNumber, frame);
    }

    if (!frame) return; // Fragment for unknown frame — discard

    frame.fragments.set(fragmentIndex, jpegPayload);

    if (flags & FLAG_LAST) {
      frame.expectedLast = fragmentIndex;
    }

    // Check if frame is complete
    if (frame.expectedLast >= 0 && frame.fragments.size === frame.expectedLast + 1) {
      this.emitFrame(frame, voiceSocket);
      this.frameBuffers.delete(sequenceNumber);
    }

    // Purge stale frames
    this.purgeStaleFrames();
  }

  private emitFrame(frame: FrameBuffer, voiceSocket: Socket): void {
    // Reassemble JPEG from ordered fragments
    const sortedKeys = [...frame.fragments.keys()].sort((a, b) => a - b);
    const chunks = sortedKeys.map((k) => frame.fragments.get(k)!);
    const jpegBuffer = Buffer.concat(chunks);

    const jpegBase64 = jpegBuffer.toString('base64');

    // Emit as voice:image:frame — same event the Voice Gateway v2 expects
    voiceSocket.emit('voice:image:frame', {
      sessionId: this.options.sessionId,
      frame: jpegBase64,
      mimeType: 'image/jpeg',
    });

    this.callbacks.onFrameEmitted?.(frame.sequenceNumber, jpegBuffer.length);
  }

  private purgeStaleFrames(): void {
    const now = Date.now();
    for (const [seq, frame] of this.frameBuffers) {
      if (now - frame.startedAt > this.frameTimeoutMs) {
        this.frameBuffers.delete(seq);
      }
    }
  }
}
