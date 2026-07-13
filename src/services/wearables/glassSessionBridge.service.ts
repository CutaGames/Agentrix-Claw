/**
 * GlassSessionBridge — Manage the lifecycle of a glass ↔ cloud voice session.
 *
 * Orchestrates:
 * - BLE connection monitoring + auto-reconnect
 * - Voice Gateway session creation/tear-down
 * - Relay coordination (audio, image, HUD, gesture)
 * - Background keep-alive when app is backgrounded
 * - Clean shutdown on BLE disconnect
 */

import { BleManager, type Subscription } from 'react-native-ble-plx';
import { AppState, type AppStateStatus } from 'react-native';
import type { Socket } from 'socket.io-client';
import { WearableAudioRelay, type AudioRelayOptions } from './wearableAudioRelay.service';
import { WearableImageRelay } from './wearableImageRelay.service';
import { GlassHUDController } from './glassHUDController.service';
import { GlassGestureHandler } from './glassGestureHandler.service';

// ── Types ──────────────────────────────────────────────

export type BridgeState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'active'      // voice session active
  | 'reconnecting'
  | 'error';

export interface GlassSessionConfig {
  /** BLE device ID from pairing */
  deviceId: string;
  /** Vendor key for capability lookup */
  vendorKey: string;
  /** Voice gateway socket (already connected) */
  voiceSocket: Socket;
  /** Session ID on the voice gateway */
  sessionId: string;
  /** Enable auto-reconnect on BLE disconnect */
  autoReconnect?: boolean;
  /** Max reconnect attempts before giving up */
  maxReconnectAttempts?: number;
  /** Reconnect interval ms */
  reconnectIntervalMs?: number;
}

export interface GlassBridgeCallbacks {
  onStateChange?: (state: BridgeState) => void;
  onError?: (error: Error) => void;
  onGlassConnected?: () => void;
  onGlassDisconnected?: () => void;
  onSessionActive?: () => void;
}

// ── Service ────────────────────────────────────────────

export class GlassSessionBridge {
  private bleManager: BleManager;
  private config: GlassSessionConfig;
  private callbacks: GlassBridgeCallbacks;

  private state: BridgeState = 'disconnected';
  private audioRelay: WearableAudioRelay | null = null;
  private imageRelay: WearableImageRelay | null = null;
  private hudController: GlassHUDController | null = null;
  private gestureHandler: GlassGestureHandler | null = null;

  private bleDisconnectSub: Subscription | null = null;
  private appStateSub: ReturnType<typeof AppState.addEventListener> | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    config: GlassSessionConfig,
    callbacks: GlassBridgeCallbacks = {},
  ) {
    this.bleManager = new BleManager();
    this.config = {
      autoReconnect: true,
      maxReconnectAttempts: 5,
      reconnectIntervalMs: 3000,
      ...config,
    };
    this.callbacks = callbacks;
  }

  // ── Lifecycle ─────────────────────────────────────────

  /**
   * Initialize and start the full glass session:
   * BLE connect → start all relays → activate voice session
   */
  async start(): Promise<void> {
    if (this.destroyed) return;
    this.setState('connecting');

    try {
      // 1. Ensure BLE connection
      const device = await this.bleManager.connectToDevice(this.config.deviceId, {
        timeout: 10000,
      });
      await device.discoverAllServicesAndCharacteristics();

      this.callbacks.onGlassConnected?.();
      this.setState('connected');

      // 2. Monitor for disconnect
      this.bleDisconnectSub = this.bleManager.onDeviceDisconnected(
        this.config.deviceId,
        (_error, _device) => {
          this.handleBleDisconnect();
        },
      );

      // 3. Monitor app state for background/foreground
      this.appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
        this.handleAppStateChange(nextState);
      });

      // 4. Start all relay subsystems
      await this.startRelays();

      this.setState('active');
      this.callbacks.onSessionActive?.();
      this.reconnectAttempts = 0; // reset on success

    } catch (error) {
      this.setState('error');
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error)),
      );

      // Try auto-reconnect
      if (this.config.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Stop the session and clean up all resources.
   */
  async stop(): Promise<void> {
    this.destroyed = true;
    this.cancelReconnect();

    // Stop all relays
    await this.stopRelays();

    // Unsubscribe from BLE disconnect
    if (this.bleDisconnectSub) {
      this.bleDisconnectSub.remove();
      this.bleDisconnectSub = null;
    }

    // Unsubscribe from app state
    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = null;
    }

    // Disconnect BLE
    try {
      await this.bleManager.cancelDeviceConnection(this.config.deviceId);
    } catch { /* ignore */ }

    this.setState('disconnected');
    this.callbacks.onGlassDisconnected?.();
  }

  /** Get current bridge state. */
  getState(): BridgeState {
    return this.state;
  }

  /** Get the HUD controller for direct display control. */
  getHUDController(): GlassHUDController | null {
    return this.hudController;
  }

  /** Get the gesture handler for mapping customization. */
  getGestureHandler(): GlassGestureHandler | null {
    return this.gestureHandler;
  }

  // ── Relay management ──────────────────────────────────

  private async startRelays(): Promise<void> {
    const { deviceId, vendorKey, voiceSocket, sessionId } = this.config;

    // Audio relay (mic + speaker)
    const audioOpts: AudioRelayOptions = {
      deviceId,
      sessionId,
    };
    this.audioRelay = new WearableAudioRelay(this.bleManager, audioOpts, {
      onError: (err, dir) => {
        this.callbacks.onError?.(new Error(`Audio relay ${dir}: ${err.message}`));
      },
    });
    await this.audioRelay.startUpstream(voiceSocket);
    this.audioRelay.startDownstream(voiceSocket);

    // Image relay (camera frames)
    this.imageRelay = new WearableImageRelay(
      this.bleManager,
      { deviceId, sessionId },
      {
        onError: (err) => {
          this.callbacks.onError?.(new Error(`Image relay: ${err.message}`));
        },
      },
    );
    await this.imageRelay.start(voiceSocket);

    // HUD controller
    this.hudController = new GlassHUDController(this.bleManager, deviceId, {
      vendorKey,
      callbacks: {
        onError: (err) => {
          this.callbacks.onError?.(new Error(`HUD: ${err.message}`));
        },
      },
    });
    this.hudController.start();

    // Register voice socket listeners for HUD updates
    voiceSocket.on('voice:agent:text', (data: { text: string; isFinal: boolean }) => {
      if (data.isFinal) {
        void this.hudController?.showAgentResponse(data.text);
      }
    });

    voiceSocket.on('voice:deepthink:start', () => {
      void this.hudController?.showNotification('Deep analysis in progress...', '🧠');
    });

    voiceSocket.on('voice:deepthink:done', (data: { summary?: string }) => {
      if (data.summary) {
        void this.hudController?.showAgentResponse(data.summary);
      }
    });

    // Gesture handler
    this.gestureHandler = new GlassGestureHandler(this.bleManager, deviceId, {
      callbacks: {
        onError: (err) => {
          this.callbacks.onError?.(new Error(`Gesture: ${err.message}`));
        },
      },
    });
    await this.gestureHandler.start(voiceSocket);
  }

  private async stopRelays(): Promise<void> {
    if (this.audioRelay) {
      this.audioRelay.stop();
      this.audioRelay = null;
    }

    if (this.imageRelay) {
      this.imageRelay.stop();
      this.imageRelay = null;
    }

    if (this.hudController) {
      await this.hudController.stop();
      this.hudController = null;
    }

    if (this.gestureHandler) {
      this.gestureHandler.stop();
      this.gestureHandler = null;
    }
  }

  // ── Reconnection ──────────────────────────────────────

  private handleBleDisconnect(): void {
    if (this.destroyed) return;

    this.setState('disconnected');
    this.callbacks.onGlassDisconnected?.();

    // Stop relays (they depend on BLE)
    void this.stopRelays();

    if (this.config.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts ?? 5)) {
      this.setState('error');
      this.callbacks.onError?.(new Error('Max reconnect attempts reached'));
      return;
    }

    this.setState('reconnecting');
    this.reconnectAttempts++;

    const delay = this.config.reconnectIntervalMs ?? 3000;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start();
    }, delay * this.reconnectAttempts); // exponential backoff
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ── App state handling ────────────────────────────────

  private handleAppStateChange(nextState: AppStateStatus): void {
    if (this.destroyed) return;

    if (nextState === 'background') {
      // Keep BLE alive but reduce relay activity
      // Audio relay continues (voice is primary use case)
      // Image relay pauses (save battery)
      this.imageRelay?.stop();
    } else if (nextState === 'active') {
      // Resume full relay activity
      if (this.state === 'active' && this.imageRelay && this.config.voiceSocket) {
        void this.imageRelay.start(this.config.voiceSocket);
      }
    }
  }

  // ── State management ──────────────────────────────────

  private setState(newState: BridgeState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.callbacks.onStateChange?.(newState);
  }
}
