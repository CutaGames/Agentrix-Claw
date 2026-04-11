import { create } from "zustand";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getDesktopDeviceId } from "./desktop";
import { AgentrixStreamParser, type StreamEvent } from "../../../shared/stream-parser.ts";

export const DEFAULT_API_BASE = "https://api.agentrix.top/api";
export const API_BASE_STORAGE_KEY = "agentrix_api_base";
const AGENTRIX_HOST_SUFFIX = ".agentrix.top";

function normalizeApiBase(base: string) {
  const trimmed = base.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return DEFAULT_API_BASE;
  }
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
}

function parseApiBase(base: string): URL | null {
  try {
    const parsed = new URL(normalizeApiBase(base));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getTrustedEnvApiBase(base: string): string {
  const normalized = normalizeApiBase(base || DEFAULT_API_BASE);
  return parseApiBase(normalized) ? normalized : DEFAULT_API_BASE;
}

function isAgentrixHostedApiBase(base: string): boolean {
  const parsed = parseApiBase(base);
  if (!parsed) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return hostname === "agentrix.top" || hostname.endsWith(AGENTRIX_HOST_SUFFIX);
}

export function sanitizePersistedApiBase(base: string, trustedBase: string = DEFAULT_API_BASE): string | null {
  const trimmed = base.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = parseApiBase(trimmed);
  if (!candidate) {
    return null;
  }

  const trusted = parseApiBase(trustedBase);
  if (trusted && candidate.origin.toLowerCase() === trusted.origin.toLowerCase()) {
    return normalizeApiBase(trimmed);
  }

  if (isAgentrixHostedApiBase(trimmed)) {
    return normalizeApiBase(trimmed);
  }

  return null;
}

function resolveApiBase() {
  const envBase = typeof import.meta !== "undefined" ? String(import.meta.env.VITE_API_BASE || "").trim() : "";
  const trustedEnvBase = getTrustedEnvApiBase(envBase);
  let localOverride = "";
  try {
    localOverride = String(localStorage.getItem(API_BASE_STORAGE_KEY) || "").trim();
  } catch {
    localOverride = "";
  }

  const safeOverride = sanitizePersistedApiBase(localOverride, trustedEnvBase);
  if (!safeOverride && localOverride) {
    try {
      localStorage.removeItem(API_BASE_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  return safeOverride || trustedEnvBase;
}

export const API_BASE = resolveApiBase();

// ─── Secure Token Storage ──────────────────────────────
// Use Tauri Store plugin (encrypted on-disk) when available, else localStorage fallback
const TOKEN_STORAGE_KEY = "agentrix_token";

let _tauriStore: any = null;
async function getTauriStore() {
  if (_tauriStore) return _tauriStore;
  try {
    const { load } = await import("@tauri-apps/plugin-store");
    _tauriStore = await load("credentials.json", { autoSave: true, defaults: {} });
    return _tauriStore;
  } catch {
    return null;
  }
}

function readLocalToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocalToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore local persistence failures.
  }
}

function clearLocalToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore local persistence failures.
  }
}

async function secureGetToken(): Promise<string | null> {
  const localToken = readLocalToken();
  const store = await getTauriStore();
  let storeToken: string | null = null;
  if (store) {
    const val = await store.get("agentrix_token");
    if (val) {
      storeToken = String(val);
    }
  }

  // Prefer the immediately-updated local token so QR/OAuth login can survive reloads
  // even if the async Tauri store write hasn't completed yet.
  if (localToken) {
    if (store && localToken !== storeToken) {
      void store.set(TOKEN_STORAGE_KEY, localToken).catch(() => {
        // Best-effort sync only.
      });
    }
    return localToken;
  }

  if (storeToken) {
    writeLocalToken(storeToken);
    return storeToken;
  }

  return null;
}

async function secureSetToken(token: string): Promise<void> {
  writeLocalToken(token);
  const store = await getTauriStore();
  if (store) {
    await store.set(TOKEN_STORAGE_KEY, token);
  }
}

async function secureClearToken(): Promise<void> {
  clearLocalToken();
  const store = await getTauriStore();
  if (store) {
    await store.delete(TOKEN_STORAGE_KEY);
  }
}

// Use Tauri HTTP plugin (bypasses CORS) when available, else standard fetch
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await tauriFetch(url, init as any);
  } catch {
    return await fetch(url, init);
  }
}

export interface ChatAttachment {
  url: string;
  publicUrl: string;
  fileName: string;
  originalName: string;
  mimetype: string;
  size: number;
  kind: 'image' | 'audio' | 'video' | 'file';
  isImage: boolean;
  isAudio: boolean;
  isVideo: boolean;
}

export async function uploadChatAttachment(file: File, token: string): Promise<ChatAttachment> {
  // Derive mime type from extension if the File object doesn't provide one
  const mimeFromExt: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg', aac: 'audio/aac',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v',
    pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown',
    csv: 'text/csv', json: 'application/json',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const type = file.type || mimeFromExt[ext] || 'application/octet-stream';

  // Read File into ArrayBuffer for reliable Tauri IPC serialization
  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type });

  const formData = new FormData();
  formData.append('file', blob, file.name);

  const response = await apiFetch(`${API_BASE}/upload/chat-attachment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData as any,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Upload failed: ${response.status}`);
  }

  const uploaded = await response.json();
  const publicBase = API_BASE.replace(/\/api\/?$/, '');
  return {
    ...uploaded,
    publicUrl: uploaded.url.startsWith('http') ? uploaded.url : `${publicBase}${uploaded.url}`,
  };
}

export interface DesktopAgent {
  id: string;
  userId: string;
  name: string;
  description?: string;
  status: "draft" | "active" | "paused" | "archived";
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface OpenClawInstance {
  id: string;
  name: string;
  instanceUrl: string;
  status: string;
  instanceType: string;
  isPrimary: boolean;
  relayToken?: string;
  relayConnected: boolean;
  capabilities?: Record<string, any>;
  resolvedModel?: string;
  resolvedModelLabel?: string;
  resolvedProvider?: string;
  hasCustomProvider?: boolean;
  updatedAt: string;
}

async function fetchDesktopAgents(token: string): Promise<DesktopAgent[]> {
  const response = await apiFetch(`${API_BASE}/agent-presence/agents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return [];
  const text = await response.text();
  if (!text) return [];
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

// ─── Auth Store ────────────────────────────────────────
interface AuthState {
  token: string | null;
  user: any | null;
  isGuest: boolean;
  agents: DesktopAgent[];
  activeAgentId: string | null;
  instances: OpenClawInstance[];
  activeInstanceId: string | null;
  acceptToken: (token: string) => Promise<void>;
  loadToken: () => Promise<void>;
  login: (email: string, code: string) => Promise<boolean>;
  sendCode: (email: string) => Promise<boolean>;
  enterGuest: () => void;
  logout: () => Promise<void>;
  setActiveAgent: (id: string) => void;
  setActiveInstance: (id: string) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isGuest: false,
  agents: [],
  activeAgentId: null,
  instances: [],
  activeInstanceId: null,

  acceptToken: async (token: string) => {
    set({ token, isGuest: false });
    void secureSetToken(token).catch((error) => {
      console.warn("[acceptToken] failed to persist token:", error);
    });
  },

  loadToken: async () => {
    try {
      const stored = await secureGetToken();
      if (!stored) return;
      set({ token: stored });
      // Fetch user info (use text+JSON.parse for tauriFetch compat)
      const res = await apiFetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${stored}` },
      });
      const status = res.status;
      if (status === 401 || status === 403) {
        // Only clear if the token hasn't been replaced while we were fetching
        const current = get().token;
        if (current === stored) {
          console.warn("[loadToken] /auth/me returned", status, "— clearing token");
          await secureClearToken();
          set({ token: null });
        } else {
          console.warn("[loadToken] /auth/me returned", status, "— token already replaced, keeping new token");
        }
        return;
      }
      if (status < 200 || status >= 300) {
        // Server error — keep token, just skip loading user info
        console.warn("[loadToken] /auth/me returned", status, "— keeping token");
        return;
      }
      const text = await res.text();
      if (!text) return;
      const data = JSON.parse(text);
      const agents = await fetchDesktopAgents(stored).catch(() => []);
      const currentActiveAgentId = get().activeAgentId;
      const nextActiveAgentId =
        (currentActiveAgentId && agents.some((agent) => agent.id === currentActiveAgentId)
          ? currentActiveAgentId
          : null) || agents[0]?.id || null;

      // Extract OpenClaw instances from /auth/me response
      const userData = data.user || data;
      const instances: OpenClawInstance[] = Array.isArray(userData.openClawInstances)
        ? userData.openClawInstances
        : [];
      const currentInstanceId = get().activeInstanceId;
      const primaryInstance = instances.find((i) => i.isPrimary);
      const nextInstanceId =
        (currentInstanceId && instances.some((i) => i.id === currentInstanceId)
          ? currentInstanceId
          : null) || primaryInstance?.id || instances[0]?.id || null;

      set({
        user: userData,
        agents,
        activeAgentId: nextActiveAgentId,
        instances,
        activeInstanceId: nextInstanceId,
      });
    } catch (e) {
      // Offline / parse error — keep token, don't clear
      console.warn("[loadToken] error (keeping token):", e);
    }
  },

  sendCode: async (email: string) => {
    const res = await apiFetch(`${API_BASE}/auth/email/send-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return res.ok;
  },

  login: async (email: string, code: string) => {
    const res = await apiFetch(`${API_BASE}/auth/email/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    if (res.status < 200 || res.status >= 300) return false;
    const text = await res.text();
    if (!text) return false;
    const data = JSON.parse(text);
    const token = data.token || data.access_token;
    if (!token) return false;
    await get().acceptToken(token);
    await get().loadToken();
    return true;
  },

  logout: async () => {
    await secureClearToken();
    set({ token: null, user: null, isGuest: false, agents: [], activeAgentId: null, instances: [], activeInstanceId: null });
  },

  enterGuest: () => set({ isGuest: true }),

  setActiveAgent: (id: string) => set({ activeAgentId: id }),
  setActiveInstance: (id: string) => set({ activeInstanceId: id }),
}));

// ─── Chat API ──────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: ChatAttachment[];
  streaming?: boolean;
  error?: boolean;
  createdAt: number;
  meta?: { resolvedModel?: string; resolvedModelLabel?: string };
}

async function consumeAgentrixSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: {
    onChunk: (chunk: string) => void;
    onMeta?: (meta: { resolvedModel?: string; resolvedModelLabel?: string }) => void;
    onDone: () => void;
    onError: (err: string) => void;
    onEvent?: (event: StreamEvent) => void;
  },
) {
  const decoder = new TextDecoder();
  let settled = false;

  const finish = () => {
    if (settled) return;
    settled = true;
    callbacks.onDone();
  };

  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    callbacks.onError(message);
  };

  const emit = (event: StreamEvent) => {
    callbacks.onEvent?.(event);
  };

  const parser = new AgentrixStreamParser({
    onTextDelta: (event) => {
      emit(event);
      callbacks.onChunk(event.text);
    },
    onThinking: emit,
    onToolStart: emit,
    onToolProgress: emit,
    onToolResult: emit,
    onToolError: (event) => {
      emit(event);
    },
    onApprovalRequired: emit,
    onUsage: emit,
    onTurnInfo: emit,
    onDone: (event) => {
      emit(event);
      finish();
    },
    onError: (event) => {
      emit(event);
      fail(event.error || '未知错误');
    },
    onMeta: (meta) => callbacks.onMeta?.(meta as { resolvedModel?: string; resolvedModelLabel?: string }),
  });

  while (!settled) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.feed(decoder.decode(value, { stream: true }));
  }

  const tail = decoder.decode();
  if (tail) {
    parser.feed(tail);
  }
  parser.end();
  finish();
}

/** SSE streaming chat via OpenClaw proxy */
export function streamChat(opts: {
  instanceId: string;
  message: string;
  sessionId: string;
  token: string;
  model?: string;
  mode?: "ask" | "agent" | "plan";
  onChunk: (chunk: string) => void;
  onMeta?: (meta: { resolvedModel?: string; resolvedModelLabel?: string }) => void;
  onEvent?: (event: StreamEvent) => void;
  onDone: () => void;
  onError: (err: string) => void;
}): AbortController {
  const ac = new AbortController();
  const url = `${API_BASE}/openclaw/proxy/${opts.instanceId}/stream`;

  const fetchInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      message: opts.message,
      sessionId: opts.sessionId,
      model: opts.model,
      mode: opts.mode || "agent",
      platform: "desktop",
      deviceId: getDesktopDeviceId(),
    }),
    signal: ac.signal,
  };

  // Use tauriFetch (bypasses CORS) with fallback to window.fetch
  const doFetch = async () => {
    try {
      return await tauriFetch(url, fetchInit as any);
    } catch {
      return await fetch(url, fetchInit);
    }
  };

  doFetch()
    .then(async (res) => {
      if (!res.ok || !res.body) {
        let detail = `HTTP ${res.status}`;
        try {
          const text = await res.text();
          if (text) {
            const json = JSON.parse(text);
            detail = json.message || json.error || detail;
          }
        } catch { /* ignore */ }
        opts.onError(detail);
        return;
      }
      const reader = res.body.getReader();
      await consumeAgentrixSse(reader, {
        onChunk: opts.onChunk,
        onMeta: opts.onMeta,
        onEvent: opts.onEvent,
        onDone: opts.onDone,
        onError: opts.onError,
      });
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        opts.onError(err?.message || String(err));
      }
    });

  return ac;
}

/** Default OpenClaw proxy chat via the user's primary instance */
export function streamDirectChat(opts: {
  messages: Array<{ role: string; content: string }>;
  sessionId: string;
  agentId?: string | null;
  token: string;
  model?: string;
  mode?: "ask" | "agent" | "plan";
  onChunk: (chunk: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  onEvent?: (event: StreamEvent) => void;
}): AbortController {
  const ac = new AbortController();

  const fetchInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      messages: opts.messages,
      sessionId: opts.sessionId,
      context: {
        sessionId: opts.sessionId,
      },
      mode: opts.mode || "agent",
      platform: "desktop",
      deviceId: getDesktopDeviceId(),
      options: opts.model ? { model: opts.model } : undefined,
      ...(opts.agentId ? { agentId: opts.agentId } : {}),
    }),
    signal: ac.signal,
  };

  // Use tauriFetch (bypasses CORS) with fallback to window.fetch
  const doFetch = async () => {
    try {
      return await tauriFetch(`${API_BASE}/openclaw/proxy/stream`, fetchInit as any);
    } catch {
      return await fetch(`${API_BASE}/openclaw/proxy/stream`, fetchInit);
    }
  };

  doFetch()
    .then(async (res) => {
      if (!res.ok || !res.body) {
        let detail = `HTTP ${res.status}`;
        try {
          const text = await res.text();
          if (text) {
            const json = JSON.parse(text);
            detail = json.message || json.error || detail;
          }
        } catch { /* ignore */ }
        opts.onError(detail);
        return;
      }
      const reader = res.body.getReader();
      await consumeAgentrixSse(reader, {
        onChunk: opts.onChunk,
        onEvent: opts.onEvent,
        onDone: opts.onDone,
        onError: opts.onError,
      });
    })
    .catch((err) => {
      if (err.name !== "AbortError") opts.onError(err?.message || String(err));
    });

  return ac;
}

/** Sync local model conversation to backend for memory persistence */
export async function syncLocalConversation(
  token: string,
  sessionId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  model?: string,
): Promise<void> {
  try {
    await apiFetch(`${API_BASE}/openclaw/proxy/sync-local-messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        sessionId,
        messages,
        model: model || 'gemma-4-e2b',
        platform: 'desktop',
        deviceId: getDesktopDeviceId(),
      }),
    });
  } catch {
    // Non-critical — local chat still works even if sync fails
  }
}

/** Fetch available AI models */
export async function fetchModels(token: string) {
  const res = await apiFetch(`${API_BASE}/ai-providers/available-models`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const text = await res.text();
  if (!text) return [];
  return JSON.parse(text);
}

/** Fetch chat history */
export async function fetchHistory(
  instanceId: string,
  sessionId: string,
  token: string,
) {
  const res = await apiFetch(
    `${API_BASE}/openclaw/proxy/${instanceId}/history?sessionId=${sessionId}&limit=50`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const text = await res.text();
  if (!text) return [];
  return JSON.parse(text);
}
