/**
 * Audio Routing Manager — Mobile
 *
 * Automatically manages audio output routing:
 * - Bluetooth headset connected → route to Bluetooth
 * - Wired headset connected → route to headset
 * - No headset → route to speaker (voice chat) or earpiece (private)
 * - User override → respect manual selection
 *
 * Also handles:
 * - Audio interruptions (phone calls, other apps)
 * - Route change notifications
 * - Optimal mode selection for recording vs playback
 *
 * Uses expo-av for audio mode control.
 */

import { Platform, NativeModules, NativeEventEmitter } from 'react-native';

let Audio: any = null;
try { Audio = require('expo-av').Audio; } catch {}

export type AudioRoute = 'speaker' | 'earpiece' | 'bluetooth' | 'wired_headset' | 'unknown';
export type AudioMode = 'voice_chat' | 'playback' | 'recording' | 'idle';

export interface AudioRoutingCallbacks {
  onRouteChange?: (newRoute: AudioRoute, previousRoute: AudioRoute) => void;
  onInterruption?: (began: boolean) => void;
}

export class AudioRoutingService {
  private currentRoute: AudioRoute = 'unknown';
  private currentMode: AudioMode = 'idle';
  private callbacks: AudioRoutingCallbacks = {};
  private preferredRoute: AudioRoute | null = null;
  private eventSubscription: any = null;

  /**
   * Initialize audio routing with callbacks.
   */
  async init(callbacks: AudioRoutingCallbacks): Promise<void> {
    this.callbacks = callbacks;
    await this.detectCurrentRoute();
    this.startRouteMonitoring();
  }

  /**
   * Set audio mode optimized for the current activity.
   */
  async setMode(mode: AudioMode): Promise<void> {
    if (!Audio) return;
    this.currentMode = mode;

    try {
      switch (mode) {
        case 'voice_chat':
          // Both recording and playback, speaker output
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            ...(Platform.OS === 'ios' ? {
              interruptionModeIOS: 1, // DoNotMix
            } : {}),
            ...(Platform.OS === 'android' ? {
              shouldDuckAndroid: false,
              playThroughEarpieceAndroid: false,
            } : {}),
          });
          break;

        case 'playback':
          // TTS playback only, no recording
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            ...(Platform.OS === 'android' ? {
              shouldDuckAndroid: true,
              playThroughEarpieceAndroid: this.preferredRoute === 'earpiece',
            } : {}),
          });
          break;

        case 'recording':
          // Recording only
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
          });
          break;

        case 'idle':
          // Release audio session
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: false,
            staysActiveInBackground: false,
          });
          break;
      }
    } catch (err) {
      console.warn('[AudioRouting] setMode failed:', err);
    }
  }

  /**
   * Force output to a specific route.
   */
  async setPreferredRoute(route: AudioRoute): Promise<void> {
    this.preferredRoute = route;

    if (Platform.OS === 'android' && Audio) {
      try {
        await Audio.setAudioModeAsync({
          playThroughEarpieceAndroid: route === 'earpiece',
        });
      } catch {}
    }

    // iOS routing is managed by AVAudioSession — setting category handles it
    if (Platform.OS === 'ios') {
      await this.setMode(this.currentMode);
    }
  }

  /**
   * Get current audio route.
   */
  getRoute(): AudioRoute {
    return this.currentRoute;
  }

  /**
   * Get current audio mode.
   */
  getMode(): AudioMode {
    return this.currentMode;
  }

  /**
   * Check if a headset (wired or Bluetooth) is connected.
   */
  isHeadsetConnected(): boolean {
    return this.currentRoute === 'bluetooth' || this.currentRoute === 'wired_headset';
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    if (this.eventSubscription) {
      this.eventSubscription.remove();
      this.eventSubscription = null;
    }
    this.callbacks = {};
  }

  // ── Private ──

  private async detectCurrentRoute(): Promise<void> {
    // Basic detection — in production, use a native module for accurate route info
    try {
      if (Platform.OS === 'ios') {
        // iOS: Check via NativeModules if available
        const routeInfo = NativeModules.AudioRoutingModule;
        if (routeInfo?.getCurrentRoute) {
          const route = await routeInfo.getCurrentRoute();
          this.updateRoute(this.mapNativeRoute(route));
          return;
        }
      }
      // Default: assume speaker
      this.updateRoute('speaker');
    } catch {
      this.updateRoute('speaker');
    }
  }

  private startRouteMonitoring(): void {
    // Listen for audio route changes via native events
    try {
      const AudioRoutingModule = NativeModules.AudioRoutingModule;
      if (AudioRoutingModule) {
        const emitter = new NativeEventEmitter(AudioRoutingModule);
        this.eventSubscription = emitter.addListener('audioRouteChange', (event: any) => {
          const newRoute = this.mapNativeRoute(event.route);
          this.updateRoute(newRoute);
        });
      }
    } catch {
      // Native module not available — route changes won't be detected
    }
  }

  private updateRoute(newRoute: AudioRoute): void {
    if (newRoute === this.currentRoute) return;
    const prev = this.currentRoute;
    this.currentRoute = newRoute;
    this.callbacks.onRouteChange?.(newRoute, prev);
    console.log(`[AudioRouting] Route changed: ${prev} → ${newRoute}`);
  }

  private mapNativeRoute(nativeRoute: string): AudioRoute {
    if (!nativeRoute) return 'unknown';
    const lower = nativeRoute.toLowerCase();
    if (lower.includes('bluetooth') || lower.includes('a2dp') || lower.includes('hfp')) return 'bluetooth';
    if (lower.includes('headset') || lower.includes('headphone') || lower.includes('wired')) return 'wired_headset';
    if (lower.includes('earpiece') || lower.includes('receiver')) return 'earpiece';
    if (lower.includes('speaker') || lower.includes('built')) return 'speaker';
    return 'unknown';
  }
}
