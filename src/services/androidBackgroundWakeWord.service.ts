import { NativeModules, Platform } from 'react-native';
import type { LocalWakeWordModel } from './localWakeWord.service';

type AndroidBackgroundWakeWordNativeModule = {
  isOverlayPermissionGranted(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  syncConfig(configJson: string): Promise<boolean>;
  startService(): Promise<boolean>;
  stopService(): Promise<boolean>;
  isServiceRunning(): Promise<boolean>;
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

export async function isAndroidBackgroundWakeWordRunning(): Promise<boolean> {
  if (!isAndroidBackgroundWakeWordAvailable()) {
    return false;
  }
  return nativeModule!.isServiceRunning();
}