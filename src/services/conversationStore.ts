/**
 * conversationStore — P-9 Sprint Q2 (T5.2 / T5.4).
 *
 * A lightweight, render-tree-independent mirror of the active conversation
 * so the ConversationBubble (65% sheet) and AgentChatScreen (full-screen
 * Summon) can show the SAME live messages without the bubble re-mounting
 * the ~2000-line AgentChatScreen.
 *
 * Design rationale (why a store and not a full lift):
 *   - The full R2 "two surfaces share one useVoiceSession" lift is a
 *     ~1500-line refactor of AgentChatScreen with real regression risk to
 *     voice / streaming. Instead, AgentChatScreen stays the single owner of
 *     the send/stream pipeline and PUBLISHES a read-only snapshot here on
 *     every message change. The bubble SUBSCRIBES and renders that snapshot
 *     live, and hands a draft back via `setPendingPrefill` when the user
 *     wants the full screen. This gives R2's "data synced across both
 *     layers" without forking the chat engine.
 *
 * It deliberately avoids zustand/MMKV: it's ephemeral session mirror state,
 * one global conversation at a time, and must be readable from non-React
 * callers (the bubble's imperative present()).
 *
 * Spec: requirements.md R2.5 / R2.6 / R2.2 (routing badge).
 */

export type ConversationRole = 'user' | 'assistant' | 'system';

/** Minimal mirror of AgentChatScreen's Message — only what the bubble renders. */
export interface ConversationMessageSnapshot {
  id: string;
  role: ConversationRole;
  content: string;
  streaming?: boolean;
  error?: boolean;
  createdAt: number;
  /** Number of attachments (the bubble shows a 📎 count, not the files). */
  attachmentCount?: number;
}

/** Which inference path the current turn is using (drives the 🌐/📱 badge). */
export type ConversationRouting = 'cloud' | 'local';

export interface ConversationSnapshot {
  /** Conversation/session id the snapshot belongs to. */
  sessionId: string | null;
  /** Active pet/instance name for the bubble header. */
  agentName: string | null;
  messages: ConversationMessageSnapshot[];
  routing: ConversationRouting;
  /** True while a turn is streaming/sending (bubble shows a spinner). */
  busy: boolean;
  /** Monotonic version so subscribers can cheaply detect change. */
  version: number;
}

/**
 * A draft the bubble captured but wants the full Summon screen to pick up
 * (text + attachment uris + whether voice was active). AgentChatScreen
 * consumes this once on focus, then clears it.
 */
export interface PendingPrefill {
  text?: string;
  attachments?: Array<{ uri: string; kind: 'image' | 'audio' }>;
  autoVoice?: boolean;
}

type Listener = (snap: ConversationSnapshot) => void;

const EMPTY: ConversationSnapshot = {
  sessionId: null,
  agentName: null,
  messages: [],
  routing: 'cloud',
  busy: false,
  version: 0,
};

let _snapshot: ConversationSnapshot = EMPTY;
let _pendingPrefill: PendingPrefill | null = null;
const _listeners = new Set<Listener>();

function notify(): void {
  for (const l of _listeners) {
    try {
      l(_snapshot);
    } catch {
      /* a broken subscriber must not break publishing */
    }
  }
}

/** Read the current snapshot (non-React callers). */
export function getConversationSnapshot(): ConversationSnapshot {
  return _snapshot;
}

/**
 * Publish the latest conversation state. Called by AgentChatScreen whenever
 * its messages / routing / busy state change. Bumps `version` so cheap
 * equality checks work. Trims to the most recent `maxMessages` to keep the
 * bubble light (it only shows a preview).
 */
export function publishConversation(
  next: Omit<ConversationSnapshot, 'version'>,
  maxMessages = 40,
): void {
  const messages =
    next.messages.length > maxMessages
      ? next.messages.slice(next.messages.length - maxMessages)
      : next.messages;
  _snapshot = { ...next, messages, version: _snapshot.version + 1 };
  notify();
}

/** Reset to empty (e.g. on logout / active-pet switch). */
export function clearConversation(): void {
  _snapshot = { ...EMPTY };
  notify();
}

/**
 * Append messages to the live snapshot (dedup by id) and notify. Used by the
 * ConversationBubble's in-bubble realtime VOICE so those turns land in the
 * shared conversation — the bubble shows them, and AgentChatScreen merges any
 * it doesn't already have on focus (so Summon sees pet-ball voice chats too).
 * No-op for ids already present.
 */
export function appendConversationMessages(
  msgs: ConversationMessageSnapshot[],
  agentName?: string | null,
): void {
  if (!msgs?.length) return;
  const have = new Set(_snapshot.messages.map((m) => m.id));
  const additions = msgs.filter((m) => m.id && !have.has(m.id));
  if (additions.length === 0) {
    if (agentName && agentName !== _snapshot.agentName) {
      _snapshot = { ..._snapshot, agentName, version: _snapshot.version + 1 };
      notify();
    }
    return;
  }
  _snapshot = {
    ..._snapshot,
    agentName: agentName ?? _snapshot.agentName,
    messages: [..._snapshot.messages, ...additions],
    version: _snapshot.version + 1,
  };
  notify();
}

/** Subscribe to snapshot changes. Returns an unsubscribe fn. */
export function subscribeConversation(listener: Listener): () => void {
  _listeners.add(listener);
  // Push current state immediately so late subscribers are in sync.
  try {
    listener(_snapshot);
  } catch {
    /* ignore */
  }
  return () => {
    _listeners.delete(listener);
  };
}

/** Bubble → full-screen handoff. */
export function setPendingPrefill(prefill: PendingPrefill | null): void {
  _pendingPrefill = prefill;
}

/** AgentChatScreen consumes the pending prefill once, then it is cleared. */
export function consumePendingPrefill(): PendingPrefill | null {
  const p = _pendingPrefill;
  _pendingPrefill = null;
  return p;
}

/** Test/reset hook. */
export function _resetConversationStoreForTests(): void {
  _snapshot = { ...EMPTY };
  _pendingPrefill = null;
  _listeners.clear();
}
