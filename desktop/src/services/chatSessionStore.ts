import type { ChatMessage } from "./store";

export interface SessionEntry {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}

const SESSION_INDEX_KEY = "agentrix_sessions";
const SESSION_PREFIX = "chat_session_";

let _tauriStore: any = null;

async function getSessionStore() {
  if (_tauriStore) return _tauriStore;
  try {
    const { load } = await import("@tauri-apps/plugin-store");
    _tauriStore = await load("chat-sessions.json", { autoSave: true, defaults: {} });
    return _tauriStore;
  } catch {
    return null;
  }
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const store = await getSessionStore();
  if (store) {
    const value = await store.get(key);
    if (value != null) {
      return value as T;
    }
  }

  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown) {
  const store = await getSessionStore();
  if (store) {
    await store.set(key, value);
  }
  localStorage.setItem(key, JSON.stringify(value));
}

async function deleteKey(key: string) {
  const store = await getSessionStore();
  if (store) {
    await store.delete(key);
  }
  localStorage.removeItem(key);
}

export async function listSessionEntries(): Promise<SessionEntry[]> {
  const sessions = await readJson<SessionEntry[]>(SESSION_INDEX_KEY, []);
  return Array.isArray(sessions) ? sessions : [];
}

export async function loadSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const messages = await readJson<ChatMessage[]>(`${SESSION_PREFIX}${sessionId}`, []);
  return Array.isArray(messages) ? messages : [];
}

export async function persistSession(sessionId: string, messages: ChatMessage[]) {
  const trimmedMessages = messages.slice(-80);
  await writeJson(`${SESSION_PREFIX}${sessionId}`, trimmedMessages);

  const firstUserMsg = messages.find((message) => message.role === "user");
  const title = firstUserMsg
    ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? "..." : "")
    : "New Chat";

  const nextEntry: SessionEntry = {
    id: sessionId,
    title,
    updatedAt: Date.now(),
    messageCount: messages.length,
  };

  const index = await listSessionEntries();
  const existingIndex = index.findIndex((entry) => entry.id === sessionId);
  if (existingIndex >= 0) {
    index[existingIndex] = nextEntry;
  } else {
    index.unshift(nextEntry);
  }

  await writeJson(SESSION_INDEX_KEY, index.slice(0, 50));
}

export async function removeSession(sessionId: string) {
  await deleteKey(`${SESSION_PREFIX}${sessionId}`);
  const nextIndex = (await listSessionEntries()).filter((entry) => entry.id !== sessionId);
  await writeJson(SESSION_INDEX_KEY, nextIndex);
}

// ─── Tab Persistence ──────────────────────────────────────
const TABS_KEY = "agentrix_tabs";

export interface PersistedTab {
  id: string;
  sessionId: string;
  title: string;
}

export async function loadTabs(): Promise<PersistedTab[]> {
  return readJson<PersistedTab[]>(TABS_KEY, []);
}

export async function saveTabs(tabs: PersistedTab[]): Promise<void> {
  await writeJson(TABS_KEY, tabs);
}

export async function loadActiveTabId(): Promise<string | null> {
  return readJson<string | null>("agentrix_active_tab", null);
}

export async function saveActiveTabId(tabId: string): Promise<void> {
  await writeJson("agentrix_active_tab", tabId);
}