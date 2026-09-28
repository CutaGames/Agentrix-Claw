/**
 * Mobile wake-word service — privacy-bounded stub (PRD mobile-prd-v3 §3.2).
 *
 * Real `@picovoice/porcupine-react-native` is not yet bundled (license + native
 * module footprint). This module exposes the same surface as the desktop
 * `wakeWord.ts` so the rest of the app can opt-in once the native lib lands.
 *
 * Privacy contract:
 *   - Default DISABLED. Caller must explicitly `setEnabled(true)` after user opt-in.
 *   - No audio leaves the device. Buffer is processed in-memory only.
 *   - Quiet hours 23:00–07:00 honoured; mic is released even if enabled.
 *
 * Today this returns a deterministic stub that fires `agentrix:wake-word` once
 * per `triggerForTesting()` call. Production swap-in:
 *   1. `npm i @picovoice/porcupine-react-native @picovoice/react-native-voice-processor`
 *   2. Replace `start/stop` internals to drive the Porcupine engine
 *   3. Forward `onWake(keywordIndex)` → `dispatchWake(keywordIndex)`
 */
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'agentrix_mobile_wakeword_enabled_v1';
let _running = false;
let _enabled = false;

function isQuietHours(): boolean {
  const h = new Date().getHours();
  return h >= 23 || h < 7;
}

export async function isMobileWakewordEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function setMobileWakewordEnabled(enabled: boolean): Promise<void> {
  _enabled = enabled;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {}
  if (enabled) startMobileWakeword();
  else stopMobileWakeword();
}

export function startMobileWakeword(): void {
  if (_running) return;
  if (!_enabled) return;
  if (isQuietHours()) return;
  _running = true;
  // No-op until native engine is bundled. See module-level docs for swap-in.
  DeviceEventEmitter.emit('agentrix:wake-word-status', { running: true });
}

export function stopMobileWakeword(): void {
  if (!_running) return;
  _running = false;
  DeviceEventEmitter.emit('agentrix:wake-word-status', { running: false });
}

/** Dispatched when the wake word fires. Subscribers should start the voice quick form. */
export function dispatchWake(keywordIndex = 0): void {
  DeviceEventEmitter.emit('agentrix:wake-word', { keywordIndex, ts: Date.now() });
}

/** Test harness — fires a synthetic wake event so the rest of the chain can be exercised. */
export function triggerForTesting(): void {
  dispatchWake(0);
}
