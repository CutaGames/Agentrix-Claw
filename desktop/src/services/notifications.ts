export type NotificationType = "info" | "success" | "warning" | "error" | "task" | "sync";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  action?: { label: string; event: string; payload?: unknown };
}

type Listener = (notifications: AppNotification[]) => void;

const MAX_NOTIFICATIONS = 100;
let _notifications: AppNotification[] = [];
const _listeners = new Set<Listener>();

function emit() {
  const snapshot = [..._notifications];
  _listeners.forEach((fn) => fn(snapshot));
}

export function subscribe(fn: Listener): () => void {
  _listeners.add(fn);
  fn([..._notifications]);
  return () => _listeners.delete(fn);
}

export function addNotification(
  type: NotificationType,
  title: string,
  body: string,
  action?: AppNotification["action"],
): AppNotification {
  const n: AppNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    title,
    body,
    timestamp: Date.now(),
    read: false,
    action,
  };
  _notifications = [n, ..._notifications].slice(0, MAX_NOTIFICATIONS);
  emit();

  // Also fire OS notification if available
  fireOsNotification(title, body);
  return n;
}

export function markRead(id: string) {
  _notifications = _notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  emit();
}

export function markAllRead() {
  _notifications = _notifications.map((n) => ({ ...n, read: true }));
  emit();
}

export function removeNotification(id: string) {
  _notifications = _notifications.filter((n) => n.id !== id);
  emit();
}

export function clearAll() {
  _notifications = [];
  emit();
}

export function getUnreadCount(): number {
  return _notifications.filter((n) => !n.read).length;
}

async function fireOsNotification(title: string, body: string) {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch {
    // Not in Tauri or permission denied — use web Notification API fallback
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  }
}

/**
 * Add a task-completion notification that opens Spotlight when clicked.
 * Used by agent background tasks finishing their work.
 */
export function addTaskCompleteNotification(title: string, body: string, resultText?: string) {
  addNotification("task", title, body, {
    label: "View in Spotlight",
    event: "agentrix:open-spotlight-with-text",
    payload: { text: resultText || body },
  });
}

// Wire notification action clicks to open Spotlight
if (typeof window !== "undefined") {
  window.addEventListener("agentrix:notification-action", async (e) => {
    const detail = (e as CustomEvent).detail;
    if (detail?.event === "agentrix:open-spotlight-with-text") {
      try {
        const text = detail?.payload?.text;
        if (typeof text === "string" && text.trim()) {
          localStorage.setItem("agentrix_spotlight_seed_text", text);
        }
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("desktop_bridge_open_spotlight");
      } catch {}
    }
  });
}
