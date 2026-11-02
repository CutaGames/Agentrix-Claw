/**
 * Per-Agent chat history, v1 (L7.4).
 *
 * One owner's Agents without an instance of their own all chat through the owner's default instance. The server
 * therefore stamps the Agent a turn was bound to into the stored message's metadata (`metadata.agentAccountId`,
 * only when the request is bound to an Agent the owner owns). Behind the server switch
 * `CHAT_HISTORY_PER_AGENT_V1_ENABLED` (exactly `1`) the read-back `GET /openclaw/proxy/:instanceId/history` and the
 * model context then keep Agents apart.
 *
 * Read-back, additive and optional:
 * - Request: `?agentAccountId=<uuid>`. A request is bound to the Agent it names (one the owner owns, else refused with
 *   a reason code) or, when it names none, to the Agent the instance itself belongs to. Bound to an Agent, the
 *   answer holds only that Agent's turns (plus the old unattributed ones where they can only be its own). Bound to
 *   none (mobile, desktop on the owner's shared default instance), nothing is filtered: exactly what they got before.
 * - Response: a bare array of messages, as always. Only when the switch is on, the request carries an Agent the
 *   owner owns, and the instance is platform hosted, the answer is `{ scope: 'agent', messages }` instead. A client
 *   that does not understand `scope` never sends the parameter, so it never sees the object.
 */
export const CHAT_HISTORY_AGENT_QUERY_PARAM_V1 = 'agentAccountId' as const;
/** Key in a stored message's metadata that names the Agent the turn was bound to. Absent = not attributed. */
export const CHAT_HISTORY_AGENT_METADATA_KEY_V1 = 'agentAccountId' as const;
export const CHAT_HISTORY_SCOPE_AGENT_V1 = 'agent' as const;
export type ChatHistoryScopeV1 = typeof CHAT_HISTORY_SCOPE_AGENT_V1;

/** Reason codes of a refused per-Agent read-back (`reason` in the error body). */
export const CHAT_HISTORY_AGENT_NOT_OWNED_V1 = 'agent_not_owned' as const;
export const CHAT_HISTORY_AGENT_INVALID_V1 = 'invalid_agent_account_id' as const;

export interface ChatHistoryMessageV1 {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** ISO timestamp on the wire. */
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface ChatHistoryScopedResponseV1 {
  scope: ChatHistoryScopeV1;
  messages: ChatHistoryMessageV1[];
}

/** Either answer the read-back can give. The bare array is the only one clients that send no Agent id see. */
export type ChatHistoryResponseV1 = ChatHistoryMessageV1[] | ChatHistoryScopedResponseV1;

/** Never throws: anything that is not one of the two answers is an unscoped, empty history. */
export function readChatHistoryResponseV1(payload: unknown): { scope: ChatHistoryScopeV1 | null; messages: unknown[] } {
  if (Array.isArray(payload)) return { scope: null, messages: payload };
  if (payload && typeof payload === 'object') {
    const { scope, messages } = payload as { scope?: unknown; messages?: unknown };
    if (scope === CHAT_HISTORY_SCOPE_AGENT_V1 && Array.isArray(messages)) {
      return { scope: CHAT_HISTORY_SCOPE_AGENT_V1, messages };
    }
  }
  return { scope: null, messages: [] };
}
