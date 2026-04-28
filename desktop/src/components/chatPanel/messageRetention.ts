import type { ChatMessage } from "../../services/store";

export const MAX_MESSAGES_PER_SESSION = 160;
export const MAX_CACHED_SESSIONS = 10;

export function trimChatMessagesForDesktopMemory(
  messages: ChatMessage[],
  maxMessages = MAX_MESSAGES_PER_SESSION,
): ChatMessage[] {
  if (messages.length <= maxMessages) {
    return messages;
  }

  const pinned = messages.slice(0, 2);
  const recent = messages.slice(-(maxMessages - pinned.length));
  const recentIds = new Set(recent.map((message) => message.id));
  return [...pinned.filter((message) => !recentIds.has(message.id)), ...recent];
}

export function trimSessionMessageCache(
  cache: Record<string, ChatMessage[]>,
  activeSessionId: string,
): Record<string, ChatMessage[]> {
  const entries = Object.entries(cache).map(([sessionId, messages]) => [
    sessionId,
    trimChatMessagesForDesktopMemory(messages),
  ] as const);
  const activeEntry = entries.find(([sessionId]) => sessionId === activeSessionId);
  const rest = entries.filter(([sessionId]) => sessionId !== activeSessionId).slice(-Math.max(0, MAX_CACHED_SESSIONS - 1));
  return Object.fromEntries(activeEntry ? [...rest, activeEntry] : rest);
}