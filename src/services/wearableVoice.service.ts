/**
 * Wearable Voice Service — Bridge for WearOS / watchOS companion apps.
 *
 * Enables voice input from smartwatches:
 * - WearOS: Via Wear Data Layer API (companion app sends audio/transcript)
 * - watchOS: Via WatchConnectivity framework
 *
 * Architecture:
 *   Watch mic → On-watch STT (or raw audio) → Phone app via bridge → Backend
 *
 * This service handles the phone-side reception of wearable voice events.
 * The actual watch app is a separate native project.
 *
 * Communication protocol:
 *   Watch → Phone:
 *     { type: 'voice:transcript', text: string, lang: string }
 *     { type: 'voice:audio', audio: base64, format: string }
 *     { type: 'voice:activate', source: 'watch' }
 *   Phone → Watch:
 *     { type: 'voice:response', text: string }
 *     { type: 'voice:state', state: 'listening' | 'thinking' | 'speaking' | 'idle' }
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

export interface WearableVoiceCallbacks {
  onTranscript?: (text: string, lang: string) => void;
  onAudioReceived?: (audioBase64: string, format: string) => void;
  onActivate?: () => void;
}

export class WearableVoiceService {
  private emitter: NativeEventEmitter | null = null;
  private subscription: any = null;
  private callbacks: WearableVoiceCallbacks = {};

  /**
   * Check if wearable bridge is available.
   */
  static isAvailable(): boolean {
    if (Platform.OS === 'android') {
      return Boolean(NativeModules.WearDataLayerModule);
    }
    if (Platform.OS === 'ios') {
      return Boolean(NativeModules.WatchConnectivityModule);
    }
    return false;
  }

  /**
   * Initialize the wearable voice bridge.
   */
  init(callbacks: WearableVoiceCallbacks): void {
    this.callbacks = callbacks;

    const nativeModule = Platform.OS === 'android'
      ? NativeModules.WearDataLayerModule
      : NativeModules.WatchConnectivityModule;

    if (!nativeModule) {
      console.log('[Wearable] Native module not available');
      return;
    }

    this.emitter = new NativeEventEmitter(nativeModule);

    this.subscription = this.emitter.addListener('wearableMessage', (event: any) => {
      this.handleWearableMessage(event);
    });

    console.log('[Wearable] Voice bridge initialized');
  }

  /**
   * Send voice state update to the watch.
   */
  sendState(state: 'listening' | 'thinking' | 'speaking' | 'idle'): void {
    this.sendToWatch({ type: 'voice:state', state });
  }

  /**
   * Send text response to the watch (for display).
   */
  sendResponse(text: string): void {
    this.sendToWatch({ type: 'voice:response', text: text.slice(0, 200) }); // Watch display is small
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
    this.emitter = null;
    this.callbacks = {};
  }

  // ── Private ──

  private handleWearableMessage(event: any): void {
    if (!event?.type) return;

    switch (event.type) {
      case 'voice:transcript':
        if (event.text) {
          this.callbacks.onTranscript?.(event.text, event.lang || 'en');
        }
        break;

      case 'voice:audio':
        if (event.audio) {
          this.callbacks.onAudioReceived?.(event.audio, event.format || 'pcm');
        }
        break;

      case 'voice:activate':
        this.callbacks.onActivate?.();
        break;

      default:
        console.log('[Wearable] Unknown message type:', event.type);
    }
  }

  private sendToWatch(message: Record<string, any>): void {
    try {
      const nativeModule = Platform.OS === 'android'
        ? NativeModules.WearDataLayerModule
        : NativeModules.WatchConnectivityModule;

      if (nativeModule?.sendMessage) {
        nativeModule.sendMessage(JSON.stringify(message));
      }
    } catch (err) {
      console.warn('[Wearable] Failed to send to watch:', err);
    }
  }
}
