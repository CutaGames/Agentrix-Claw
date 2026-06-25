import { create } from "zustand";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getDesktopContext, getDesktopDeviceId } from "./desktop";
import { AgentrixStreamParser, type StreamEvent } from "../../../shared/stream-parser.ts";
import { recordStreamEvent, startStreamTurn } from "./streamDiagnostics";

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
function requestRequiresNativeFetch(init?: RequestInit): boolean {
  if (!init) return false;

  if (typeof FormData !== "undefined" && init.body instanceof FormData) {
    return true;
  }

  try {
    const headers = new Headers(init.headers || {});
    const accept = headers.get("Accept") || headers.get("accept") || "";
    if (/text\/event-stream/i.test(accept)) {
      return true;
    }
  } catch {
    // Ignore malformed header bags and fall back to the default transport.
  }

  return false;
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  // IMPORTANT: native fetch is required for SSE and multipart/form-data.
  // `@tauri-apps/plugin-http` buffers streaming responses and corrupts
  // FormData serialization, which causes:
  // - chat streams to appear as a 30-40s blank wait before the whole reply lands
  // - attachment / voice uploads to fail with malformed multipart bodies
  if (requestRequiresNativeFetch(init)) {
    try {
      return await fetch(url, init);
    } catch (err: any) {
      // Browser-level CORS / network failures throw TypeError with no Response.
      // Degrade to tauriFetch so the call still succeeds (at the cost of
      // buffering for SSE). Better a working answer than a failed stream.
      console.warn("[apiFetch] native fetch failed, falling back to tauriFetch:", err?.message || err);
      return await tauriFetch(url, init as any);
    }
  }

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
  /**
   * Inline artifacts surfaced from tool results — currently used to render
   * computer_use_screenshot images directly in the bubble so the user can see
   * what the agent actually saw, instead of just a green checkmark in the
   * timeline tree.
   */
  toolArtifacts?: ToolArtifact[];
}

export interface ToolArtifact {
  toolCallId: string;
  toolName: string;
  /** Inline image data URL (e.g. screenshot). */
  imageDataUrl?: string;
  /** Image dimensions if known. */
  width?: number;
  height?: number;
  /** Optional caption rendered above the artifact. */
  caption?: string;
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

  // v0.7.9 — SSE-level idle watchdog. Backend emits `: ping\n\n` every 15s
  // even when LLM is silent (Claude reasoning / large tool result ingestion).
  // Watchdog resets on ANY bytes (pings count too). Fail fast at 45s so the
  // user sees a clear "stream interrupted" + Continue option instead of
  // staring at a frozen panel for 90s.
  //
  // Backend ping interval is 15s; 45s = 3 missed pings = real death.
  const IDLE_TIMEOUT_MS = 45_000;
  let lastByteAt = Date.now();
  let watchdog: ReturnType<typeof setInterval> | null = null;

  const finish = () => {
    if (settled) return;
    settled = true;
    if (watchdog) clearInterval(watchdog);
    callbacks.onDone();
  };

  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    if (watchdog) clearInterval(watchdog);
    callbacks.onError(message);
  };

  watchdog = setInterval(() => {
    if (settled) return;
    const idleMs = Date.now() - lastByteAt;
    if (idleMs > IDLE_TIMEOUT_MS) {
      recordStreamEvent("watchdog_idle", `${Math.round(idleMs / 1000)}s`);
      try {
        // Best-effort cancel; reader.read() rejection will land in catch
        // below if it didn't already settle. Use ts-ignore because cancel()
        // is on the reader but not exposed in some lib targets.
        (reader as any).cancel?.('idle-timeout');
        recordStreamEvent("watchdog_cancel");
      } catch { /* ignore */ }
      fail(`stream idle ${Math.round(idleMs / 1000)}s — likely network drop`);
    }
  }, 5_000);

  const emit = (event: StreamEvent) => {
    callbacks.onEvent?.(event);
  };

  const parser = new AgentrixStreamParser({
    onTextDelta: (event) => {
      emit(event);
      callbacks.onChunk(event.text);
    },
    onThinking: emit,
    onToolStart: (event) => {
      emit(event);
      recordStreamEvent("tool_start", (event as any).toolName, JSON.stringify((event as any).input || {}).slice(0, 400));
    },
    onToolProgress: emit,
    onToolResult: (event) => {
      emit(event);
      recordStreamEvent("tool_result", (event as any).toolName, `success=${(event as any).success} duration=${(event as any).durationMs}ms`);
    },
    onToolError: (event) => {
      emit(event);
      recordStreamEvent("tool_error", (event as any).toolName, (event as any).error || "");
    },
    onApprovalRequired: emit,
    onUsage: emit,
    onTurnInfo: emit,
    onDone: (event) => {
      emit(event);
      recordStreamEvent("done_event", (event as any).reason || "unknown", `output=${(event as any).totalOutputTokens || 0}t cost=$${(event as any).totalCostUsd || 0}`);
      finish();
    },
    onError: (event) => {
      emit(event);
      recordStreamEvent("error_event", "parser-onError", event.error || "");
      fail(event.error || '未知错误');
    },
    onMeta: (meta) => callbacks.onMeta?.(meta as { resolvedModel?: string; resolvedModelLabel?: string }),
  });

  // Phase 0.8: Wrap reader.read() in a guard so a mid-stream network drop is
  // reported as an error instead of surfacing as a silent end-of-turn.
  let firstByteSeen = false;
  // v0.7.12 — record gaps between consecutive bytes-arrived events. Backend
  // sends keepalive every 5s; if the gap > 6s we know either backend stopped
  // writing (keepalive interval got blocked) or nginx/WebView2 is buffering.
  let lastChunkArrivedAt = Date.now();
  let chunkCount = 0;
  let totalBytesIn = 0;
  let lastReportedKeepalive = 0;
  try {
    while (!settled) {
      const { done, value } = await reader.read();
      if (done) {
        recordStreamEvent("reader_done", `bytes_total_seen=${firstByteSeen ? "yes" : "none"}`, `chunks=${chunkCount} bytes=${totalBytesIn} hbRecv=${parser.getKeepaliveCount()}`);
        break;
      }
      const arrivedAt = Date.now();
      const gapMs = arrivedAt - lastChunkArrivedAt;
      if (firstByteSeen && gapMs > 6_000) {
        // Backend should heartbeat every 5s. A > 6s gap means either the
        // keepalive isn't reaching us (nginx buffering / WebView2 buffering)
        // or the backend stopped writing. Either way: surfaceable signal.
        recordStreamEvent("byte_gap", `${Math.round(gapMs / 1000)}s`, `chunk#${chunkCount} bytes=${value?.length || 0}`);
      }
      lastChunkArrivedAt = arrivedAt;
      chunkCount += 1;
      totalBytesIn += value?.length || 0;

      if (!firstByteSeen) {
        firstByteSeen = true;
        recordStreamEvent("first_byte", `${value?.length || 0}b`);
      }
      // Bytes arrived (could be ping comment, data chunk, or partial frame).
      // Reset the idle clock BEFORE feeding so the parser can call onChunk
      // synchronously without racing the watchdog.
      lastByteAt = Date.now();
      parser.feed(decoder.decode(value, { stream: true }));

      // Surface keepalive arrival rate every 6 frames (~30s wall clock) so
      // the trace shows "yes, backend heartbeat is reaching us" without
      // blowing up the 200-event ring buffer with 5s pings.
      const hbNow = parser.getKeepaliveCount();
      if (hbNow - lastReportedKeepalive >= 6) {
        recordStreamEvent("keepalive_recv", `n=${hbNow}`, `chunks=${chunkCount} bytes=${totalBytesIn}`);
        lastReportedKeepalive = hbNow;
      }
    }

    const tail = decoder.decode();
    if (tail) {
      parser.feed(tail);
    }
    parser.end();
    finish();
  } catch (err: any) {
    // v0.7.12 — record the WebView2 fetch error in maximum detail. Up to now
    // we only saw "network error" generically; capture name/cause/code/stack
    // so we can finally distinguish: socket FIN vs RST vs WebView2 internal
    // idle vs CSP/abort/etc.
    const errDetail = JSON.stringify({
      message: err?.message || String(err),
      name: err?.name,
      code: err?.code,
      cause: err?.cause ? String(err.cause) : undefined,
      ctor: err?.constructor?.name,
      stackHead: typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 3).join(' | ') : undefined,
      chunksSeen: chunkCount,
      bytesIn: totalBytesIn,
      hbRecv: parser.getKeepaliveCount(),
      msSinceLastChunk: Date.now() - lastChunkArrivedAt,
    }).slice(0, 750);
    recordStreamEvent("reader_error", "reader-throw", errDetail);
    fail(err?.message || 'Stream read failed');
  } finally {
    if (watchdog) clearInterval(watchdog);
  }
}

/**
 * Phase 0.8: fetch() wrapper with exponential-backoff retries for transient
 * failures (network drop, DNS blip, 502/503/504). Only retries BEFORE the
 * response body has been consumed — never duplicates a chat turn.
 */
async function fetchWithBackoff(
  doFetch: () => Promise<Response>,
  opts: { retries?: number; signal?: AbortSignal } = {},
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const delays = [1000, 2000, 4000, 8000]; // ms, capped by retries
  let lastErr: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      const res = await doFetch();
      // Retry on 502/503/504 (upstream/gateway issues) — fine to retry since
      // we haven't started streaming yet.
      if (attempt < retries && (res.status === 502 || res.status === 503 || res.status === 504)) {
        await new Promise((r) => setTimeout(r, delays[Math.min(attempt, delays.length - 1)]));
        continue;
      }
      return res;
    } catch (err: any) {
      lastErr = err;
      if (err?.name === 'AbortError') throw err;
      if (attempt >= retries) break;
      await new Promise((r) => setTimeout(r, delays[Math.min(attempt, delays.length - 1)]));
    }
  }
  throw lastErr || new Error('fetch failed after retries');
}

type StreamTransport = "native" | "tauri";

// v0.7.13 — DEFINITIVE root cause discovery: nginx access logs prove SSE
// requests via WebView2 native fetch (`Edg/134.0.0.0` user-agent) reliably
// fail at +25-30s with `TypeError: network error`, while SSE requests via
// tauri-plugin-http (`tauri-plugin-http/2.5.7` user-agent) successfully
// completed multi-thousand-byte streams (08:44 turn = 2993 bytes, 08:48
// turn = 5886 bytes, both 201). Same backend, same nginx, same heartbeat
// — the only difference is the transport.
//
// All other API calls (auth/me, desktop-sync/state, agent-presence/agents,
// /health) already go through tauri-plugin-http and have zero issues.
// Streaming was the only path stuck on WebView2 native fetch, and that path
// has an undocumented disconnect at ~25-30s — likely a Chromium connection
// pool eviction or Win11 WebView2 H2 idle reaper. Either way: provably bad.
//
// Earlier v0.7.7 attempted this default flip and got reverted in v0.7.9
// after user reported "SSE completely broken in prod". On re-audit: that
// claim conflicts with the nginx evidence above where tauri-plugin SSE
// actually worked. The v0.7.9 revert was made on insufficient evidence.
//
// This time we have:
//   1. nginx access log proof tauri-plugin-http SSE streams complete
//   2. trace data (chunksSeen=8 hbRecv=4 msSinceLastChunk=2.8s) showing
//      WebView2 abort is mid-stream, NOT idle, NOT keepalive-related.
//   3. consumeAgentrixSse() properly handles the ReadableStream from the
//      Tauri plugin (verified by reading plugin source: pull-mode reader
//      that round-trips chunks through invoke('plugin:http|fetch_read_body')
//      preserving SSE framing).
//
// If THIS regresses, it'll be visible in stream-trace as transport_failure.
let preferredStreamTransport: StreamTransport = "tauri";

async function fetchStreamingResponse(url: string, init: RequestInit): Promise<Response> {
  // v0.7.12 — manual override so user (or me) can flip transport without
  // shipping a new build. Set in DevTools console:
  //   localStorage.setItem("agentrix_force_tauri_transport", "1")
  // Then re-send the message. This isolates the question "is WebView2
  // native fetch the bug" from "is the backend sending wrong bytes".
  let forceTransport: StreamTransport | null = null;
  try {
    const force = localStorage.getItem("agentrix_force_tauri_transport");
    if (force === "1") forceTransport = "tauri";
    else if (force === "0") forceTransport = "native";
  } catch { /* ignore */ }
  const effectiveTransport = forceTransport ?? preferredStreamTransport;

  if (effectiveTransport === "tauri") {
    recordStreamEvent("transport_attempt", "tauri-plugin-http", url);
    try {
      const r = await tauriFetch(url, init as any);
      recordStreamEvent("transport_success", "tauri", `status=${r.status}`);
      return r;
    } catch (err) {
      recordStreamEvent("transport_failure", "tauri", (err as any)?.message || String(err));
      console.warn("[stream] tauriFetch failed, falling back to native fetch:", (err as any)?.message || err);
      preferredStreamTransport = "native";
    }
  }

  recordStreamEvent("transport_attempt", "webview2-native", url);
  try {
    const r = await fetch(url, init);
    recordStreamEvent("transport_success", "native", `status=${r.status}`);
    return r;
  } catch (err) {
    recordStreamEvent("transport_failure", "native", (err as any)?.message || String(err));
    console.warn("[stream] native fetch failed, retrying via tauriFetch:", (err as any)?.message || err);
    try {
      recordStreamEvent("transport_attempt", "tauri-fallback", url);
      const response = await tauriFetch(url, init as any);
      recordStreamEvent("transport_success", "tauri-fallback", `status=${response.status}`);
      console.warn("[stream] tauriFetch succeeded after native failure; transport sticky-flipped to tauri.");
      preferredStreamTransport = "tauri";
      return response;
    } catch (fallbackErr) {
      recordStreamEvent("transport_failure", "tauri-fallback", (fallbackErr as any)?.message || String(fallbackErr));
      throw fallbackErr;
    }
  }
}

async function buildDesktopRequestContext(baseContext: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Surface the user's Settings → Computer Use toggles so the backend tool
  // bridge knows whether to expose computer_use_* tools to the cloud model.
  // Both default to false; toggles live in localStorage and are written by
  // the SettingsPanel.
  let enableComputerUse = false;
  let enableBrowserAutomation = false;
  try {
    enableComputerUse = localStorage.getItem("agentrix_computer_use_enabled") === "1";
    enableBrowserAutomation = localStorage.getItem("agentrix_computer_use_browser_enabled") === "1";
  } catch {
    /* SSR / non-browser context */
  }

  try {
    const desktopContext = await getDesktopContext();
    return {
      ...baseContext,
      workspaceHint: desktopContext.workspaceHint || undefined,
      fileHint: desktopContext.fileHint || undefined,
      activeWindowTitle: desktopContext.activeWindow?.title || undefined,
      processName: desktopContext.activeWindow?.processName || undefined,
      clipboardTextPreview: desktopContext.clipboardTextPreview || undefined,
      enableComputerUse,
      enableBrowserAutomation,
    };
  } catch {
    return { ...baseContext, enableComputerUse, enableBrowserAutomation };
  }
}

/** SSE streaming chat via OpenClaw proxy */
export function streamAgentChat(opts: {
  token: string;
  instanceId: string;
  sessionId: string;
  message: string;
  history: Array<{ role: string; content: string }>;
  model?: string;
  maxTokens?: number;
  mode?: "ask" | "agent" | "plan";
  /**
   * Codex-borrow P1 — explicit user tier preference. Mapped from desktop's
   * ExecutionMode (`local-only|auto|cloud-only`) by the caller.
   */
  tier?: "local" | "smart" | "cloud";
  onChunk: (chunk: string) => void;
  onMeta?: (meta: any) => void;
  onDone: () => void;
  onError: (err: string) => void;
  onEvent?: (event: StreamEvent) => void;
}): AbortController {
  const ac = new AbortController();
  const url = `${API_BASE}/openclaw/proxy/${opts.instanceId}/stream`;
  startStreamTurn(`${opts.mode || "agent"} ${opts.model || "auto"} sess=${opts.sessionId.slice(0, 12)}`);

  void buildDesktopRequestContext({
    sessionId: opts.sessionId,
    maxOutputTokens: opts.maxTokens ?? 12288,
    enableParallelLanes: true,
  })
    .then((context) => {
      const fetchInit: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.token}`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          message: opts.message,
          history: opts.history,
          sessionId: opts.sessionId,
          context,
          model: opts.model,
          tier: opts.tier,
          options: {
            maxTokens: opts.maxTokens ?? 12288,
            enableParallelLanes: true,
          },
          mode: opts.mode || "agent",
          platform: "desktop",
          deviceId: getDesktopDeviceId(),
        }),
        signal: ac.signal,
      };

      return fetchWithBackoff(() => fetchStreamingResponse(url, fetchInit), { signal: ac.signal, retries: 0 });
    })
    .then(async (res) => {
      if (!res || !res.ok || !res.body) {
        let detail = res ? `HTTP ${res.status}` : "Request failed";
        try {
          const text = res ? await res.text() : "";
          if (text) {
            const json = JSON.parse(text);
            detail = json.message || json.error || detail;
          }
        } catch {}
        recordStreamEvent("error_event", "non-2xx-response", detail);
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
      if (err?.name !== "AbortError") {
        opts.onError(err?.message || String(err));
      }
    });

  return ac;
}

export function streamChat(opts: {
  token: string;
  instanceId: string;
  sessionId: string;
  message: string;
  history?: Array<{ role: string; content: string }>;
  model?: string;
  maxTokens?: number;
  mode?: "ask" | "agent" | "plan";
  /** Codex-borrow P1 — explicit user tier preference. */
  tier?: "local" | "smart" | "cloud";
  onChunk: (chunk: string) => void;
  onMeta?: (meta: any) => void;
  onDone: () => void;
  onError: (err: string) => void;
  onEvent?: (event: StreamEvent) => void;
}): AbortController {
  return streamAgentChat({
    ...opts,
    history: opts.history || [],
  });
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

  void buildDesktopRequestContext({
    sessionId: opts.sessionId,
  })
    .then((context) => {
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
          context,
          mode: opts.mode || "agent",
          platform: "desktop",
          deviceId: getDesktopDeviceId(),
          options: { model: opts.model, maxTokens: 12288, enableParallelLanes: true },
          ...(opts.agentId ? { agentId: opts.agentId } : {}),
        }),
        signal: ac.signal,
      };

      return fetchWithBackoff(
        () => fetchStreamingResponse(`${API_BASE}/openclaw/proxy/stream`, fetchInit),
        { signal: ac.signal, retries: 0 },
      );
    })
    .then(async (res) => {
      if (!res || !res.ok || !res.body) {
        let detail = res ? `HTTP ${res.status}` : "Request failed";
        try {
          const text = res ? await res.text() : "";
          if (text) {
            const json = JSON.parse(text);
            detail = json.message || json.error || detail;
          }
        } catch {}
        recordStreamEvent("error_event", "non-2xx-response-default", detail);
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
      if (err?.name !== "AbortError") opts.onError(err?.message || String(err));
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
