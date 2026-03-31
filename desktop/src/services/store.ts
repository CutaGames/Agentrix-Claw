import { create } from "zustand";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export const API_BASE = "https://api.agentrix.top/api";

// ─── Secure Token Storage ──────────────────────────────
// Use Tauri Store plugin (encrypted on-disk) when available, else localStorage fallback
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

async function secureGetToken(): Promise<string | null> {
  const store = await getTauriStore();
  if (store) {
    const val = await store.get("agentrix_token");
    if (val) return val as string;
  }
  // Fallback: localStorage (for dev / browser)
  return localStorage.getItem("agentrix_token");
}

async function secureSetToken(token: string): Promise<void> {
  const store = await getTauriStore();
  if (store) {
    await store.set("agentrix_token", token);
  }
  localStorage.setItem("agentrix_token", token);
}

async function secureClearToken(): Promise<void> {
  const store = await getTauriStore();
  if (store) {
    await store.delete("agentrix_token");
  }
  localStorage.removeItem("agentrix_token");
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
  kind: 'image' | 'file';
  isImage: boolean;
}

export async function uploadChatAttachment(file: File, token: string): Promise<ChatAttachment> {
  // Derive mime type from extension if the File object doesn't provide one
  const mimeFromExt: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
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
    await secureSetToken(token);
    set({ token });
    // Fetch full user + agents
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

/** SSE streaming chat via OpenClaw proxy */
export function streamChat(opts: {
  instanceId: string;
  message: string;
  sessionId: string;
  token: string;
  model?: string;
  mode?: 'ask' | 'agent' | 'plan';
  onChunk: (chunk: string) => void;
  onMeta?: (meta: { resolvedModel?: string; resolvedModelLabel?: string }) => void;
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
      mode: opts.mode,
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
        opts.onError(`HTTP ${res.status}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              opts.onDone();
              return;
            }
            // Parse JSON SSE chunks: {"chunk":"text"} or {"error":"msg"}
            try {
              const parsed = JSON.parse(data);
              if (parsed && typeof parsed === "object") {
                if (parsed.error) {
                  opts.onError(parsed.error);
                  return;
                }
                // Handle meta events (model info)
                if (parsed.meta && opts.onMeta) {
                  opts.onMeta(parsed.meta);
                  continue;
                }
                // Extract text from known fields
                const text = parsed.chunk ?? parsed.text ?? parsed.content;
                if (text !== undefined) {
                  opts.onChunk(String(text));
                  continue;
                }
              }
            } catch {
              // Not JSON — pass through as-is
            }
            opts.onChunk(data);
          }
        }
      }
      opts.onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        opts.onError(err.message);
      }
    });

  return ac;
}

/** Direct Claude/Bedrock fallback */
export function streamDirectChat(opts: {
  messages: Array<{ role: string; content: string }>;
  sessionId: string;
  agentId?: string | null;
  token: string;
  onChunk: (chunk: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
}): AbortController {
  const ac = new AbortController();

  const fetchInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify({
      messages: opts.messages,
      sessionId: opts.sessionId,
      ...(opts.agentId ? { agentId: opts.agentId } : {}),
    }),
    signal: ac.signal,
  };

  // Use tauriFetch (bypasses CORS) with fallback to window.fetch
  const doFetch = async () => {
    try {
      return await tauriFetch(`${API_BASE}/claude/chat`, fetchInit as any);
    } catch {
      return await fetch(`${API_BASE}/claude/chat`, fetchInit);
    }
  };

  doFetch()
    .then(async (res) => {
      if (!res.ok) {
        opts.onError(`HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      if (data.error) {
        opts.onError(data.error);
        return;
      }
      const reply = data.reply || data.content || data.message || "";
      // Simulate streaming for consistency
      const words = reply.split(" ");
      for (let i = 0; i < words.length; i++) {
        opts.onChunk(words[i] + (i < words.length - 1 ? " " : ""));
        await new Promise((r) => setTimeout(r, 30));
      }
      opts.onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") opts.onError(err.message);
    });

  return ac;
}

/** Fetch available AI models */
export async function fetchModels(token: string) {
  const res = await apiFetch(`${API_BASE}/openclaw/models`, {
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
