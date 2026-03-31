/**
 * Cross-device session synchronization service.
 *
 * Uses the backend Socket.IO namespace (`/ws`) so desktop session sync and
 * desktop automation events share the same authenticated realtime transport.
 */

import { io, type Socket } from "socket.io-client";
import { API_BASE, apiFetch, type ChatMessage } from "./store";
import { getDeviceId } from "./deviceId";

// ─── Types ─────────────────────────────────────────────

export interface SyncSessionMeta {
  sessionId: string;
  title: string;
  messageCount: number;
  updatedAt: number;
  deviceId: string;
  deviceType: "desktop" | "mobile" | "web";
}

export interface SyncSessionSnapshot {
  sessionId: string;
  messages: ChatMessage[];
  meta: SyncSessionMeta;
}

type SyncEventHandler = {
  onSessionUpdated?: (snapshot: SyncSessionSnapshot) => void;
  onSessionListReceived?: (sessions: SyncSessionMeta[]) => void;
  onConnectionChange?: (connected: boolean) => void;
};

// ─── WebSocket Sync Client ─────────────────────────────

const WS_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

let _socket: Socket | null = null;
let _handlers: SyncEventHandler = {};
let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let _token: string | null = null;
let _connected = false;
let _clipboardSyncOutListener: EventListener | null = null;

export function isSessionSyncConnected(): boolean {
  return _connected;
}

export function initSessionSync(token: string, handlers: SyncEventHandler) {
  _token = token;
  _handlers = handlers;
  connect();

  // Forward local clipboard changes to other devices via socket
  if (_clipboardSyncOutListener) {
    window.removeEventListener("agentrix:clipboard-sync-out", _clipboardSyncOutListener);
  }
  _clipboardSyncOutListener = ((e: CustomEvent) => {
    send("clipboard:sync", {
      deviceId: getDeviceId(),
      deviceType: "desktop",
      text: e.detail?.text,
      timestamp: e.detail?.timestamp || Date.now(),
    });
  }) as EventListener;
  window.addEventListener("agentrix:clipboard-sync-out", _clipboardSyncOutListener);
}

export function destroySessionSync() {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  if (_clipboardSyncOutListener) {
    window.removeEventListener("agentrix:clipboard-sync-out", _clipboardSyncOutListener);
    _clipboardSyncOutListener = null;
  }
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
  _connected = false;
}

function connect() {
  if (_socket?.connected) return;
  if (!_token) return;

  _socket = io(`${WS_ORIGIN}/ws`, {
    auth: { token: _token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 3000,
  });

  _socket.on("connect", () => {
    _connected = true;
    _handlers.onConnectionChange?.(true);
    send("device:announce", { deviceId: getDeviceId(), deviceType: "desktop", platform: navigator.platform });
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(() => send("ping", {}), 25000);
  });

  _socket.on("disconnect", () => {
    _connected = false;
    _handlers.onConnectionChange?.(false);
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
  });

  _socket.on("connect_error", () => {
    _connected = false;
    _handlers.onConnectionChange?.(false);
  });

  _socket.on("session:updated", (data) => {
    handleMessage({ event: "session:updated", data });
  });

  _socket.on("session:list:res", (data) => {
    handleMessage({ event: "session:list:res", data });
  });

  // Cross-device clipboard sync: receive clipboard from other devices
  _socket.on("clipboard:synced", (data) => {
    if (data?.deviceId !== getDeviceId() && data?.text) {
      window.dispatchEvent(
        new CustomEvent("agentrix:clipboard-sync-in", {
          detail: { text: data.text, timestamp: data.timestamp || Date.now() },
        }),
      );
    }
  });

  _socket.onAny((event, data) => {
    window.dispatchEvent(new CustomEvent("agentrix:socket-event", { detail: { event, data } }));
  });
}

function send(event: string, payload: any) {
  if (_socket?.connected) {
    _socket.emit(event, payload);
  }
}

function handleMessage(msg: { event?: string; data?: any }) {
  if (!msg.event) return;
  switch (msg.event) {
    case "session:updated": {
      const snapshot = msg.data as SyncSessionSnapshot;
      // Don't echo our own changes back
      if (snapshot?.meta?.deviceId !== getDeviceId()) {
        _handlers.onSessionUpdated?.(snapshot);
      }
      break;
    }
    case "session:list:res": {
      const sessions = msg.data?.sessions as SyncSessionMeta[] | undefined;
      if (sessions) _handlers.onSessionListReceived?.(sessions);
      break;
    }
  }
}

// ─── Public sync operations ────────────────────────────

/** Push a session snapshot to the server for other devices */
export function pushSessionSync(sessionId: string, messages: ChatMessage[], title: string) {
  send("session:sync", {
    sessionId,
    messages: messages.slice(-80), // max 80 msgs
    meta: {
      sessionId,
      title,
      messageCount: messages.length,
      updatedAt: Date.now(),
      deviceId: getDeviceId(),
      deviceType: "desktop",
    },
  } satisfies SyncSessionSnapshot);
}

/** Request the session index from all connected devices */
export function requestSessionList() {
  send("session:list", { deviceId: getDeviceId() });
}

// ─── REST fallback for sync (when WS not available) ────

/** POST session snapshot to backend for storage */
export async function pushSessionViaRest(token: string, sessionId: string, messages: ChatMessage[], title: string) {
  const firstUser = messages.find(m => m.role === "user");
  await apiFetch(`${API_BASE}/desktop-sync/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      deviceId: getDeviceId(),
      sessionId,
      title: title || firstUser?.content?.slice(0, 50) || "Untitled",
      messages: messages.slice(-80),
      updatedAt: Date.now(),
    }),
  }).catch(() => {}); // best-effort
}

/** GET session list from backend (REST fallback) */
export async function fetchSessionsViaRest(token: string): Promise<SyncSessionMeta[]> {
  try {
    const res = await apiFetch(`${API_BASE}/desktop-sync/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.sessions) ? data.sessions : (Array.isArray(data) ? data : []);
  } catch {
    return [];
  }
}

/** GET a specific session's messages from backend */
export async function fetchSessionMessagesViaRest(token: string, sessionId: string): Promise<ChatMessage[]> {
  try {
    const res = await apiFetch(`${API_BASE}/desktop-sync/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.messages) ? data.messages : [];
  } catch {
    return [];
  }
}
