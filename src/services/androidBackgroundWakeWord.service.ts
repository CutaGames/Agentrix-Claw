import { NativeModules, Platform } from 'react-native';
import type { LocalWakeWordModel } from './localWakeWord.service';
import { planBackgroundWakeWord, runBackgroundWakeWordPlan } from './backgroundWakeWordPlan';

type AndroidBackgroundWakeWordNativeModule = {
  isOverlayPermissionGranted(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  syncConfig(configJson: string): Promise<boolean>;
  startService(): Promise<boolean>;
  stopService(): Promise<boolean>;
  isServiceRunning(): Promise<boolean>;
  /** Not on binaries before the Claw build 536 follow-up; see backgroundWakeWordPlan.ts. */
  setAppForeground?: (foreground: boolean) => Promise<boolean>;
};

interface BackgroundWakeWordSyncPayload {
  enabled: boolean;
  displayName: string;
  threshold: number;
  activeInstanceId?: string | null;
  activeInstanceName?: string | null;
  model: LocalWakeWordModel | null;
}

const nativeModule = (Platform.OS === 'android'
  ? NativeModules.AndroidBackgroundWakeWord
  : null) as AndroidBackgroundWakeWordNativeModule | null;

export function isAndroidBackgroundWakeWordAvailable(): boolean {
  return Platform.OS === 'android' && nativeModule != null;
}

export async function getAndroidOverlayPermissionStatus(): Promise<boolean> {
  if (!isAndroidBackgroundWakeWordAvailable()) {
    return false;
  }
  return nativeModule!.isOverlayPermissionGranted();
}

export async function requestAndroidOverlayPermission(): Promise<void> {
  if (!isAndroidBackgroundWakeWordAvailable()) {
    return;
  }
  await nativeModule!.requestOverlayPermission();
}

export async function syncAndroidBackgroundWakeWordConfig(payload: BackgroundWakeWordSyncPayload): Promise<void> {
  if (!isAndroidBackgroundWakeWordAvailable()) {
    return;
  }
  await nativeModule!.syncConfig(JSON.stringify(payload));
}

export async function startAndroidBackgroundWakeWordService(): Promise<void> {
  if (!isAndroidBackgroundWakeWordAvailable()) {
    return;
  }
  await nativeModule!.startService();
}

export async function stopAndroidBackgroundWakeWordService(): Promise<void> {
  if (!isAndroidBackgroundWakeWordAvailable()) {
    return;
  }
  await nativeModule!.stopService();
}

let applyChain: Promise<void> = Promise.resolve();

/**
 * Brings the service in line with the setting and the app state (backgroundWakeWordPlan.ts). Calls run one
 * after another, in the order they were made.
 */
export function applyAndroidBackgroundWakeWord(payload: BackgroundWakeWordSyncPayload, appActive: boolean): Promise<void> {
  if (!isAndroidBackgroundWakeWordAvailable()) {
    return Promise.resolve();
  }
  const native = nativeModule!;
  const steps = planBackgroundWakeWord({
    enabled: payload.enabled,
    appActive,
    foregroundSignal: typeof native.setAppForeground === 'function',
  });
  const run = applyChain.then(() => runBackgroundWakeWordPlan(steps, native, JSON.stringify(payload)));
  applyChain = run.catch(() => undefined);
  return run;
}

export async function isAndroidBackgroundWakeWordRunning(): Promise<boolean> {
  if (!isAndroidBackgroundWakeWordAvailable()) {
    return false;
  }
  return nativeModule!.isServiceRunning();
}