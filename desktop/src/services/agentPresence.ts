/**
 * Desktop Agent Presence Service
 *
 * Connects to the backend /presence WebSocket namespace for real-time
 * cross-device presence, handoff events, and timeline updates.
 * Also provides REST API wrappers for agent presence endpoints.
 */

import { io, type Socket } from "socket.io-client";
import { API_BASE, apiFetch } from "./store";
import { getDesktopDeviceId } from "./desktop";

// ── Constants ────────────────────────────────────────────────────────────────

const WS_ORIGIN = API_BASE.replace(/\/api\/?$/, "");

// ── Types ────────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  status: "active" | "suspended" | "archived";
  personality?: string;
  defaultModel?: string;
  delegationLevel?: string;
  channelBindings?: { platform: string; enabled: boolean }[];
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  agentId: string;
  channel: string;
  direction: "inbound" | "outbound";
  role: "user" | "agent" | "system";
  content: string;
  status?: string;
  createdAt: string;
}

export interface DeviceInfo {
  id: string;
  deviceId: string;
  platform: string;
  isOnline: boolean;
  lastSeenAt: string;
  capabilities?: string[];
}

export interface HandoffEvent {
  handoffId: string;
  fromDeviceId: string;
  toDeviceId?: string;
  agentId?: string;
  contextSnapshot?: Record<string, unknown>;
}

export interface DashboardOverview {
  totalAgents: number;
  activeAgents: number;
  totalEvents: number;
  pendingApprovals: number;
  onlineDevices: number;
}

// ── Presence WebSocket ───────────────────────────────────────────────────────

let _presenceSocket: Socket | null = null;
let _presenceHeartbeat: ReturnType<typeof setInterval> | null = null;
let _presenceConnected = false;

export type PresenceEventName =
  | "presence:device_online"
  | "presence:device_offline"
  | "handoff:request"
  | "handoff:initiated"
  | "handoff:accepted"
  | "handoff:accept_ok"
  | "handoff:accept_error"
  | "handoff:rejected"
  | "timeline:new_event"
  | "approval:new";

type PresenceHandlers = {
  onDeviceOnline?: (device: DeviceInfo) => void;
  onDeviceOffline?: (deviceId: string) => void;
  onHandoffInitiated?: (event: HandoffEvent) => void;
  onHandoffAccepted?: (event: HandoffEvent) => void;
  onTimelineEvent?: (event: TimelineEvent) => void;
  onApprovalNew?: (event: TimelineEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
};

let _presenceHandlers: PresenceHandlers = {};

export function isPresenceConnected(): boolean {
  return _presenceConnected;
}

export function initPresenceSocket(token: string, handlers: PresenceHandlers) {
  _presenceHandlers = handlers;
  connectPresence(token);
}

export function destroyPresenceSocket() {
  if (_presenceHeartbeat) {
    clearInterval(_presenceHeartbeat);
    _presenceHeartbeat = null;
  }
  if (_presenceSocket) {
    _presenceSocket.disconnect();
    _presenceSocket = null;
  }
  _presenceConnected = false;
}

function connectPresence(token: string) {
  if (_presenceSocket?.connected) return;

  const deviceId = getDesktopDeviceId();

  _presenceSocket = io(`${WS_ORIGIN}/presence`, {
    auth: {
      token,
      deviceId,
      deviceType: "desktop",
      platform: navigator.platform || "unknown",
      deviceName: "Agentrix Desktop",
      appVersion: "0.1.1",
      capabilities: ["chat", "notification", "screenshot", "run-command", "file-access"],
    },
    transports: ["websocket"],
    reconnection: true,
    reconnectionDelay: 3000,
    reconnectionDelayMax: 30000,
  });

  _presenceSocket.on("connect", () => {
    _presenceConnected = true;
    _presenceHandlers.onConnectionChange?.(true);
    // Periodic heartbeat every 30s
    if (_presenceHeartbeat) clearInterval(_presenceHeartbeat);
    _presenceHeartbeat = setInterval(() => {
      _presenceSocket?.emit("heartbeat", {
        platform: navigator.platform,
        deviceType: "desktop",
        capabilities: ["chat", "notification", "screenshot", "run-command", "file-access"],
      });
    }, 30_000);
  });

  _presenceSocket.on("disconnect", () => {
    _presenceConnected = false;
    _presenceHandlers.onConnectionChange?.(false);
    if (_presenceHeartbeat) {
      clearInterval(_presenceHeartbeat);
      _presenceHeartbeat = null;
    }
  });

  _presenceSocket.on("connect_error", () => {
    _presenceConnected = false;
    _presenceHandlers.onConnectionChange?.(false);
  });

  // Event routing
  _presenceSocket.on("presence:device_online", (data) => _presenceHandlers.onDeviceOnline?.(data));
  _presenceSocket.on("presence:device_offline", (data) => _presenceHandlers.onDeviceOffline?.(data?.deviceId));
  _presenceSocket.on("handoff:request", (data) => _presenceHandlers.onHandoffInitiated?.(data));
  _presenceSocket.on("handoff:initiated", (data) => _presenceHandlers.onHandoffInitiated?.(data));
  _presenceSocket.on("handoff:accepted", (data) => _presenceHandlers.onHandoffAccepted?.(data));
  _presenceSocket.on("handoff:accept_ok", (data) => _presenceHandlers.onHandoffAccepted?.(data));
  _presenceSocket.on("timeline:new_event", (data) => _presenceHandlers.onTimelineEvent?.(data));
  _presenceSocket.on("approval:new", (data) => _presenceHandlers.onApprovalNew?.(data));

  // Forward all events to window for other components
  _presenceSocket.onAny((event, data) => {
    window.dispatchEvent(new CustomEvent("agentrix:presence-event", { detail: { event, data } }));
  });
}

/** Initiate a handoff to another device via WebSocket */
export function initiateHandoffWs(payload: {
  targetDeviceId?: string;
  agentId?: string;
  sessionId?: string;
  contextSnapshot?: Record<string, unknown>;
}) {
  _presenceSocket?.emit("handoff:initiate", {
    ...payload,
    sourceDeviceType: "desktop",
  });
}

/** Accept a handoff via WebSocket */
export function acceptHandoffWs(handoffId: string) {
  _presenceSocket?.emit("handoff:accept", { handoffId });
}

/** Reject a handoff via WebSocket */
export function rejectHandoffWs(handoffId: string) {
  _presenceSocket?.emit("handoff:reject", { handoffId });
}

// ── REST API Wrappers ────────────────────────────────────────────────────────

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function fetchAgents(token: string): Promise<Agent[]> {
  const res = await apiFetch(`${API_BASE}/agent-presence/agents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<Agent[]>(res);
}

export async function fetchTimeline(
  token: string,
  agentId: string,
  params?: { channel?: string; limit?: number },
): Promise<TimelineEvent[]> {
  const qs = new URLSearchParams();
  if (params?.channel) qs.set("channel", params.channel);
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await apiFetch(`${API_BASE}/agent-presence/agents/${agentId}/timeline${suffix}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<TimelineEvent[]>(res);
}

export async function fetchDevices(token: string): Promise<DeviceInfo[]> {
  const res = await apiFetch(`${API_BASE}/agent-presence/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<DeviceInfo[]>(res);
}

export async function fetchOnlineDevices(token: string): Promise<DeviceInfo[]> {
  const res = await apiFetch(`${API_BASE}/agent-presence/devices/online`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<DeviceInfo[]>(res);
}

export async function fetchDashboard(token: string): Promise<DashboardOverview> {
  const res = await apiFetch(`${API_BASE}/agent-presence/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson<DashboardOverview>(res);
}

export async function approveReply(
  token: string,
  eventId: string,
  text?: string,
): Promise<{ success: boolean }> {
  const res = await apiFetch(`${API_BASE}/agent-presence/approvals/${eventId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  });
  return readJson(res);
}

export async function rejectReply(
  token: string,
  eventId: string,
): Promise<{ success: boolean }> {
  const res = await apiFetch(`${API_BASE}/agent-presence/approvals/${eventId}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson(res);
}

export async function fetchChannelHealth(token: string): Promise<Record<string, { healthy: boolean }>> {
  const res = await apiFetch(`${API_BASE}/agent-presence/channels/health`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return readJson(res);
}
