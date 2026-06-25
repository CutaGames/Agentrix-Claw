/**
 * Offline Cache Service
 *
 * Provides offline data persistence using Tauri store (primary) with
 * localStorage fallback. Queues outbound messages when offline and
 * flushes them when connectivity is restored.
 */

import { getNetworkStatus, onNetworkStatusChange } from "./network";

// ── Types ────────────────────────────────────────────────

export interface QueuedMessage {
  id: string;
  endpoint: string;
  method: string;
  body: string;
  headers: Record<string, string>;
  queuedAt: number;
  retries: number;
}

export interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  cachedAt: number;
  ttl: number; // ms, 0 = no expiry
}

// ── Constants ────────────────────────────────────────────

const QUEUE_KEY = "agentrix_offline_queue";
const CACHE_PREFIX = "agentrix_cache_";
const MAX_QUEUE_SIZE = 50;
const MAX_RETRIES = 3;
const FLUSH_INTERVAL_MS = 5_000;
export const OFFLINE_QUEUE_FULL_EVENT = "agentrix:offline-queue-full";

// ── Store abstraction (Tauri + localStorage) ─────────────

let _store: any = null;

async function getStore() {
  if (_store) return _store;
  try {
    const { load } = await import("@tauri-apps/plugin-store");
    _store = await load("offline-cache.json", { autoSave: true, defaults: {} });
    return _store;
  } catch {
    return null;
  }
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const store = await getStore();
  if (store) {
    const value = await store.get(key);
    if (value != null) return value as T;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown) {
  const store = await getStore();
  if (store) {
    await store.set(key, value);
  }
  localStorage.setItem(key, JSON.stringify(value));
}

async function deleteJson(key: string) {
  const store = await getStore();
  if (store) {
    await store.delete(key);
  }
  localStorage.removeItem(key);
}

// ── Message Queue (outbound) ─────────────────────────────

let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _flushing = false;

export async function enqueueMessage(
  endpoint: string,
  method: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<void> {
  const queue = await readJson<QueuedMessage[]>(QUEUE_KEY, []);
  if (queue.length >= MAX_QUEUE_SIZE) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_FULL_EVENT, {
        detail: { endpoint, queueLength: queue.length, maxQueueSize: MAX_QUEUE_SIZE },
      }));
    }
    throw new Error(`Offline queue is full (${MAX_QUEUE_SIZE} messages)`);
  }
  queue.push({
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    endpoint,
    method,
    body,
    headers,
    queuedAt: Date.now(),
    retries: 0,
  });
  await writeJson(QUEUE_KEY, queue);
}

export async function getQueueLength(): Promise<number> {
  const queue = await readJson<QueuedMessage[]>(QUEUE_KEY, []);
  return queue.length;
}

export async function flushQueue(): Promise<{ sent: number; failed: number }> {
  if (_flushing) return { sent: 0, failed: 0 };
  _flushing = true;
  let sent = 0;
  let failed = 0;

  try {
    const queue = await readJson<QueuedMessage[]>(QUEUE_KEY, []);
    const remaining: QueuedMessage[] = [];

    for (const msg of queue) {
      try {
        const res = await fetch(msg.endpoint, {
          method: msg.method,
          headers: msg.headers,
          body: msg.body,
        });
        if (res.ok || (res.status >= 200 && res.status < 500)) {
          sent++;
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        msg.retries++;
        if (msg.retries < MAX_RETRIES) {
          remaining.push(msg);
        }
        failed++;
      }
    }

    await writeJson(QUEUE_KEY, remaining);
  } finally {
    _flushing = false;
  }

  return { sent, failed };
}

// ── Response Cache ───────────────────────────────────────

export async function cacheSet<T>(key: string, data: T, ttl = 300_000): Promise<void> {
  const entry: CacheEntry<T> = {
    key,
    data,
    cachedAt: Date.now(),
    ttl,
  };
  await writeJson(`${CACHE_PREFIX}${key}`, entry);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const entry = await readJson<CacheEntry<T> | null>(`${CACHE_PREFIX}${key}`, null);
  if (!entry) return null;
  if (entry.ttl > 0 && Date.now() - entry.cachedAt > entry.ttl) {
    return null; // expired
  }
  return entry.data;
}

export async function cacheDelete(key: string): Promise<void> {
  await deleteJson(`${CACHE_PREFIX}${key}`);
}

// ── Lifecycle ────────────────────────────────────────────

let _unsubNetwork: (() => void) | null = null;

export function startOfflineCache() {
  if (_unsubNetwork || _flushTimer) {
    return;
  }

  // Auto-flush when coming back online
  _unsubNetwork = onNetworkStatusChange(async (status) => {
    if (status === "online") {
      await flushQueue();
    }
  });

  // Periodic flush attempt when online
  _flushTimer = setInterval(async () => {
    if (getNetworkStatus() === "online") {
      await flushQueue();
    }
  }, FLUSH_INTERVAL_MS);
}

export function stopOfflineCache() {
  _unsubNetwork?.();
  _unsubNetwork = null;
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
}
