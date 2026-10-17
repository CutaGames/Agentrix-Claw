/**
 * BLE Phase 2 — persistent pairing + characteristic subscription + gesture map.
 *
 * Phase 1 (`wearableBleGateway.service.ts`) provides raw scan/connect.
 * Phase 2 adds:
 *   - **Persistent pairing**: remembered devices survive app restart, auto
 *     reconnect on app foreground.
 *   - **Notification subscribe**: bind to standard BLE characteristics
 *     (Heart Rate Measurement 0x2A37, Battery 0x2A19, Custom gesture 0xFFE1).
 *   - **Gesture → intent**: configurable map from raw gesture id to
 *     `AgentrixIntentName` (e.g. wrist-flick → `wallet_status`).
 *
 * Persistence layer is AsyncStorage to keep parity with the rest of mobile
 * services. When we add KMS/MMKV crypto storage, swap `STORAGE` adapter only.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import type { AgentrixIntentName } from '../intents/chineseAssistants';

const PAIRED_KEY = 'agentrix_ble_paired_devices_v1';
const GESTURE_MAP_KEY = 'agentrix_ble_gesture_map_v1';

/** Standard BLE characteristic UUIDs we listen on by default. */
export const STANDARD_CHARACTERISTICS = {
  heartRate: '00002A37-0000-1000-8000-00805F9B34FB',
  battery: '00002A19-0000-1000-8000-00805F9B34FB',
  // Vendor-defined namespace for proprietary gesture stream
  gesture: '0000FFE1-0000-1000-8000-00805F9B34FB',
} as const;

export interface PairedDevice {
  id: string;
  name: string;
  vendor?: 'mi-band' | 'huawei-band' | 'apple-watch' | 'garmin' | 'unknown';
  pairedAt: number;
  lastConnectedAt?: number;
  characteristicUuids: string[];
  trusted: boolean;
}

export type GestureId =
  | 'wrist-flick'
  | 'double-tap'
  | 'long-hold'
  | 'rotate-cw'
  | 'rotate-ccw';

export type GestureMap = Partial<Record<GestureId, AgentrixIntentName>>;

const DEFAULT_GESTURE_MAP: GestureMap = {
  'wrist-flick': 'wallet_status',
  'double-tap': 'pet_mood',
  'long-hold': 'approve_request',
  'rotate-cw': 'ask_aira',
  'rotate-ccw': 'draft_message',
};

// ── Pairing persistence ─────────────────────────────────────────────────────

export async function loadPairedDevices(): Promise<PairedDevice[]> {
  try {
    const raw = await AsyncStorage.getItem(PAIRED_KEY);
    return raw ? (JSON.parse(raw) as PairedDevice[]) : [];
  } catch {
    return [];
  }
}

export async function savePairedDevice(device: PairedDevice): Promise<void> {
  const list = await loadPairedDevices();
  const idx = list.findIndex((d) => d.id === device.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...device };
  else list.push(device);
  await AsyncStorage.setItem(PAIRED_KEY, JSON.stringify(list));
  DeviceEventEmitter.emit('agentrix:ble-paired-changed', { devices: list });
}

export async function unpairDevice(deviceId: string): Promise<void> {
  const list = (await loadPairedDevices()).filter((d) => d.id !== deviceId);
  await AsyncStorage.setItem(PAIRED_KEY, JSON.stringify(list));
  DeviceEventEmitter.emit('agentrix:ble-paired-changed', { devices: list });
}

export async function markConnected(deviceId: string): Promise<void> {
  const list = await loadPairedDevices();
  const idx = list.findIndex((d) => d.id === deviceId);
  if (idx < 0) return;
  list[idx].lastConnectedAt = Date.now();
  await AsyncStorage.setItem(PAIRED_KEY, JSON.stringify(list));
}

// ── Gesture map ─────────────────────────────────────────────────────────────

export async function loadGestureMap(): Promise<GestureMap> {
  try {
    const raw = await AsyncStorage.getItem(GESTURE_MAP_KEY);
    return raw ? { ...DEFAULT_GESTURE_MAP, ...JSON.parse(raw) } : { ...DEFAULT_GESTURE_MAP };
  } catch {
    return { ...DEFAULT_GESTURE_MAP };
  }
}

export async function setGestureMapping(gesture: GestureId, intent: AgentrixIntentName | null): Promise<void> {
  const map = await loadGestureMap();
  if (intent === null) delete map[gesture];
  else map[gesture] = intent;
  await AsyncStorage.setItem(GESTURE_MAP_KEY, JSON.stringify(map));
  DeviceEventEmitter.emit('agentrix:ble-gesture-map-changed', { map });
}

/**
 * Dispatch a raw gesture from the BLE characteristic stream. Looks up the
 * configured intent and emits `agentrix:ble-intent` with the deep-link target.
 * Caller (UI) opens the intent via `intentBridge.handleDeepLink`.
 */
export async function dispatchGesture(gesture: GestureId, deviceId: string): Promise<AgentrixIntentName | null> {
  const map = await loadGestureMap();
  const intent = map[gesture] ?? null;
  DeviceEventEmitter.emit('agentrix:ble-gesture', { gesture, deviceId, intent, ts: Date.now() });
  if (intent) {
    DeviceEventEmitter.emit('agentrix:ble-intent', { intent, deviceId, gesture, ts: Date.now() });
  }
  return intent;
}
