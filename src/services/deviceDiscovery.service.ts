/**
 * deviceDiscovery.service.ts
 *
 * Detects online desktop Agentrix instances for the current user.
 * Uses the backend unified device registry so presence from both
 * desktop-sync and agent-presence are visible to mobile.
 */

import * as Crypto from 'expo-crypto';
import { apiFetch } from './api';
import { mmkv } from '../stores/mmkvStorage';

export interface DiscoveredDevice {
  id: string;
  deviceId: string;
  deviceType: string;
  deviceName?: string;
  platform: string;
  appVersion?: string;
  lastSeenAt: string;
  isOnline: boolean;
  source?: 'agent-presence' | 'desktop-sync';
}

const MOBILE_DEVICE_ID_KEY = 'agentrix_mobile_device_id';

export function getMobileDeviceId(): string {
  const cached = mmkv.getString(MOBILE_DEVICE_ID_KEY);
  if (cached) return cached;
  const next = `mobile-${Crypto.randomUUID()}`;
  mmkv.set(MOBILE_DEVICE_ID_KEY, next);
  return next;
}

let _pollTimer: ReturnType<typeof setInterval> | null = null;
let _listeners: Array<(devices: DiscoveredDevice[]) => void> = [];
let _lastDevices: DiscoveredDevice[] = [];

async function fetchOnlineDevices(): Promise<DiscoveredDevice[]> {
  try {
    const devices = await apiFetch<DiscoveredDevice[]>('/agent-presence/devices/unified/online');
    return Array.isArray(devices)
      ? devices.filter((device) => device.deviceType === 'desktop' || device.source === 'desktop-sync')
      : [];
  } catch {
    return [];
  }
}

function notify(devices: DiscoveredDevice[]) {
  _lastDevices = devices;
  for (const fn of _listeners) fn(devices);
}

export function startDeviceDiscovery(intervalMs = 30_000) {
  if (_pollTimer) return;
  const poll = async () => {
    const devices = await fetchOnlineDevices();
    notify(devices);
  };
  poll();
  _pollTimer = setInterval(poll, intervalMs);
}

export function stopDeviceDiscovery() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
  }
}

export function onDevicesChanged(fn: (devices: DiscoveredDevice[]) => void) {
  _listeners.push(fn);
  // Immediately call with last known state
  if (_lastDevices.length > 0) fn(_lastDevices);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}

export function getLastDiscoveredDevices(): DiscoveredDevice[] {
  return _lastDevices;
}
