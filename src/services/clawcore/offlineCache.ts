/**
 * offlineCache.ts — Sprint WC #8
 *
 * Per toy-prd-v4 §5.5: 离线缓存策略
 *
 * L2 devices must implement:
 *   - Last 8 `pet.state.sync` payloads cached (cycle when offline)
 *   - Default LED mode: 3s breathing blue
 *   - Wi-Fi reconnect forces `hello` re-send
 *
 * This module manages the mobile-side cache that mirrors what the device
 * should have. When connection is restored, we push the latest state
 * immediately so the device doesn't show stale data.
 *
 * Also provides the "last known state" for UI display when device is offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PetStatePayload, ClawCoreDevice } from './types';

// ── Constants ────────────────────────────────────────────────

const CACHE_KEY_PREFIX = 'clawcore_offline_cache_';
const MAX_CACHED_STATES = 8;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Types ────────────────────────────────────────────────────

interface CachedState {
  payload: PetStatePayload;
  timestamp: number;
}

interface DeviceOfflineCache {
  device_id: string;
  states: CachedState[];
  last_online_at: number;
  reconnect_pending: boolean;
}

// ── Cache management ─────────────────────────────────────────

/**
 * Store a pet state payload in the offline cache for a device.
 * Keeps the last 8 states (FIFO).
 */
export async function cachePetState(deviceId: string, state: PetStatePayload): Promise<void> {
  try {
    const cache = await loadCache(deviceId);
    cache.states.push({ payload: state, timestamp: Date.now() });

    // Keep only last MAX_CACHED_STATES
    if (cache.states.length > MAX_CACHED_STATES) {
      cache.states = cache.states.slice(-MAX_CACHED_STATES);
    }

    await saveCache(deviceId, cache);
  } catch {
    // Best effort — offline cache is non-critical
  }
}

/**
 * Get the last known pet state for a device (for UI display when offline).
 */
export async function getLastKnownState(deviceId: string): Promise<PetStatePayload | null> {
  try {
    const cache = await loadCache(deviceId);
    if (cache.states.length === 0) return null;
    return cache.states[cache.states.length - 1].payload;
  } catch {
    return null;
  }
}

/**
 * Get all cached states for a device (for cycling display on reconnect).
 */
export async function getCachedStates(deviceId: string): Promise<PetStatePayload[]> {
  try {
    const cache = await loadCache(deviceId);
    return cache.states.map((s) => s.payload);
  } catch {
    return [];
  }
}

/**
 * Mark a device as going offline. Sets reconnect_pending flag.
 */
export async function markDeviceOffline(deviceId: string): Promise<void> {
  try {
    const cache = await loadCache(deviceId);
    cache.reconnect_pending = true;
    await saveCache(deviceId, cache);
  } catch {
    // Best effort
  }
}

/**
 * Mark a device as back online. Clears reconnect_pending flag.
 * Returns true if a reconnect was pending (caller should push latest state).
 */
export async function markDeviceOnline(deviceId: string): Promise<boolean> {
  try {
    const cache = await loadCache(deviceId);
    const wasPending = cache.reconnect_pending;
    cache.reconnect_pending = false;
    cache.last_online_at = Date.now();
    await saveCache(deviceId, cache);
    return wasPending;
  } catch {
    return false;
  }
}

/**
 * Check if a device has a pending reconnect (needs state push).
 */
export async function isReconnectPending(deviceId: string): Promise<boolean> {
  try {
    const cache = await loadCache(deviceId);
    return cache.reconnect_pending;
  } catch {
    return false;
  }
}

/**
 * Clear the offline cache for a device (e.g. on unpair).
 */
export async function clearDeviceCache(deviceId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY_PREFIX + deviceId);
  } catch {
    // Best effort
  }
}

/**
 * Get cache stats for all devices (for debugging/UI).
 */
export async function getCacheStats(): Promise<Array<{
  device_id: string;
  cached_states: number;
  last_online_at: number;
  reconnect_pending: boolean;
}>> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith(CACHE_KEY_PREFIX));
    const stats = [];

    for (const key of cacheKeys) {
      const deviceId = key.slice(CACHE_KEY_PREFIX.length);
      const cache = await loadCache(deviceId);
      stats.push({
        device_id: deviceId,
        cached_states: cache.states.length,
        last_online_at: cache.last_online_at,
        reconnect_pending: cache.reconnect_pending,
      });
    }

    return stats;
  } catch {
    return [];
  }
}

// ── Internal ─────────────────────────────────────────────────

async function loadCache(deviceId: string): Promise<DeviceOfflineCache> {
  const raw = await AsyncStorage.getItem(CACHE_KEY_PREFIX + deviceId);
  if (!raw) {
    return { device_id: deviceId, states: [], last_online_at: 0, reconnect_pending: false };
  }
  try {
    const parsed = JSON.parse(raw) as DeviceOfflineCache;
    // Evict stale entries
    const cutoff = Date.now() - CACHE_TTL_MS;
    parsed.states = parsed.states.filter((s) => s.timestamp > cutoff);
    return parsed;
  } catch {
    return { device_id: deviceId, states: [], last_online_at: 0, reconnect_pending: false };
  }
}

async function saveCache(deviceId: string, cache: DeviceOfflineCache): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY_PREFIX + deviceId, JSON.stringify(cache));
}
