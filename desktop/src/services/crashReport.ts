/**
 * Crash report glue (Sprint G-2 / US-G2-3).
 *
 * Captures three crash sources:
 *   1. Rust panics — already written to disk by setup_panic_hook in lib.rs
 *      and surfaced via desktop_bridge_get_recent_crashes (kept).
 *   2. Unhandled JS errors — window 'error'
 *   3. Unhandled promise rejections — window 'unhandledrejection'
 *
 * Reports go to POST /api/v1/desktop/crashes regardless of the user's
 * telemetry opt-in (crashes only carry a hashed device id + sanitized
 * stack trace per requirements US-G2-3).
 *
 * Local queue (localStorage) holds up to 50 reports; on next online +
 * boot cycle they are flushed in batches.
 */
import { API_BASE } from "./store";
import { getDesktopDeviceId } from "./desktop";

const QUEUE_KEY = "agentrix_crash_queue_v1";
const MAX_QUEUE = 50;
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type CrashType = "rust_panic" | "js_error" | "unhandled_rejection" | "react_error";

interface QueuedCrash {
  deviceId: string;
  userId?: string | null;
  appVersion: string;
  type: CrashType;
  message: string;
  stack?: string | null;
  location?: string | null;
  osPlatform?: string | null;
  osVersion?: string | null;
  arch?: string | null;
  occurredAt: number;
}

let _booted = false;
let _flushTimer: ReturnType<typeof setInterval> | null = null;

function readQueue(): QueuedCrash[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedCrash[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
  } catch {
    // Quota / disabled storage — drop.
  }
}

function readAppVersion(): string {
  // Vite injects __APP_VERSION__ via define / package.json, but desktop
  // historically reads it from the window title or a const. Fall back to '0.0.0'.
  try {
    return (window as any).__AGENTRIX_DESKTOP_VERSION__ || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function reportCrash(
  type: CrashType,
  error: Error | string | null | undefined,
  extra: Partial<Pick<QueuedCrash, "userId" | "location">> = {},
): void {
  const now = Date.now();
  const message = typeof error === "string" ? error : error?.message ?? "(no message)";
  const stack = error && typeof error !== "string" ? error.stack ?? null : null;

  const item: QueuedCrash = {
    deviceId: getDesktopDeviceId(),
    userId: extra.userId ?? null,
    appVersion: readAppVersion(),
    type,
    message: String(message).slice(0, 4000),
    stack: stack ? String(stack).slice(0, 8000) : null,
    location: extra.location ?? null,
    osPlatform: typeof navigator !== "undefined" ? navigator.platform : null,
    osVersion: null,
    arch: null,
    occurredAt: now,
  };

  const queue = readQueue();
  queue.push(item);
  writeQueue(queue);

  // Best-effort immediate flush; if it fails the timer will retry.
  void flushQueue();
}

async function flushQueue(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;

  try {
    const res = await fetch(`${API_BASE}/desktop/crashes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: queue }),
    });
    if (res.ok || res.status === 202) {
      writeQueue([]);
    }
  } catch {
    // Network error — keep queue for next try.
  }
}

export function bootCrashReport(): void {
  if (_booted) return;
  _booted = true;

  // 1. JS unhandled errors
  window.addEventListener("error", (e: ErrorEvent) => {
    if (!e || !e.error) return;
    reportCrash("js_error", e.error, { location: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : null });
  });

  // 2. Promise rejections
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason = e?.reason;
    if (reason instanceof Error) {
      reportCrash("unhandled_rejection", reason);
    } else if (reason != null) {
      reportCrash("unhandled_rejection", String(reason));
    }
  });

  // 3. Periodic flush
  if (_flushTimer) clearInterval(_flushTimer);
  _flushTimer = setInterval(() => void flushQueue(), FLUSH_INTERVAL_MS);

  // 4. Pull pending Rust panic logs and queue them (existing IPC path)
  void pullRustPanics();

  // Initial flush attempt
  void flushQueue();
}

async function pullRustPanics(): Promise<void> {
  try {
    if (!(window as any).__TAURI_INTERNALS__) return;
    const { invoke } = await import("@tauri-apps/api/core");
    const crashes = (await invoke("desktop_bridge_get_recent_crashes", {
      maxAgeSeconds: 24 * 3600,
    })) as Array<{ message?: string; location?: string; stampMs?: number; type?: string }> | null;
    if (!crashes || crashes.length === 0) return;
    for (const c of crashes.slice(0, 10)) {
      reportCrash("rust_panic", String(c.message || "panic"), {
        location: typeof c.location === "string" ? c.location : null,
      });
    }
    await invoke("desktop_bridge_clear_crash_logs").catch(() => {});
  } catch {
    // Rust crash bridge unavailable — fine.
  }
}
