export interface CompactableChatMessage {
  role: string;
  content: string;
}

export interface ContextCompactionOptions {
  maxTokens: number;
  minRecentMessages?: number;
  maxSummaryChars?: number;
}

export interface ContextCompactionResult<T extends CompactableChatMessage> {
  messages: T[];
  originalEstimatedTokens: number;
  estimatedTokens: number;
  omittedMessages: number;
  summaryInserted: boolean;
}

const APPROX_CHARS_PER_TOKEN = 4;
const MESSAGE_OVERHEAD_TOKENS = 6;
const DEFAULT_MIN_RECENT_MESSAGES = 12;
const DEFAULT_MAX_SUMMARY_CHARS = 2400;

export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / APPROX_CHARS_PER_TOKEN));
}

export function estimateChatMessagesTokens(messages: CompactableChatMessage[]): number {
  return messages.reduce(
    (total, message) => total + MESSAGE_OVERHEAD_TOKENS + estimateTextTokens(message.content),
    0,
  );
}

function normalizeExcerpt(content: string, maxChars: number): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}...`;
}

function buildCompactionSummary<T extends CompactableChatMessage>(
  omitted: T[],
  maxSummaryChars: number,
): string {
  const counts = omitted.reduce<Record<string, number>>((acc, message) => {
    acc[message.role] = (acc[message.role] || 0) + 1;
    return acc;
  }, {});

  const countText = Object.entries(counts)
    .map(([role, count]) => `${role}: ${count}`)
    .join(", ");
  const excerpts = omitted
    .slice(-8)
    .map((message) => `- ${message.role}: ${normalizeExcerpt(message.content, 220)}`)
    .filter((line) => line.trim().length > 3);

  const summary = [
    "Earlier conversation compacted to fit the active context window.",
    `Omitted ${omitted.length} older messages${countText ? ` (${countText})` : ""}.`,
    excerpts.length ? "Recent omitted excerpts:" : "",
    ...excerpts,
    "Use this summary only as background; prioritize the latest user request and recent tool results.",
  ]
    .filter(Boolean)
    .join("\n");

  return summary.length <= maxSummaryChars
    ? summary
    : `${summary.slice(0, Math.max(0, maxSummaryChars - 1))}...`;
}

export function compactChatMessagesForContext<T extends CompactableChatMessage>(
  messages: T[],
  options: ContextCompactionOptions,
): ContextCompactionResult<T> {
  const maxTokens = Math.max(1, options.maxTokens);
  const originalEstimatedTokens = estimateChatMessagesTokens(messages);
  if (originalEstimatedTokens <= maxTokens) {
    return {
      messages,
      originalEstimatedTokens,
      estimatedTokens: originalEstimatedTokens,
      omittedMessages: 0,
      summaryInserted: false,
    };
  }

  const minRecentMessages = Math.max(1, options.minRecentMessages ?? DEFAULT_MIN_RECENT_MESSAGES);
  const maxSummaryChars = Math.max(400, options.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS);
  const systemMessages = messages.filter((message) => message.role === "system");
  const conversationMessages = messages.filter((message) => message.role !== "system");
  const summaryReserveTokens = estimateTextTokens("Earlier conversation compacted.") + Math.ceil(maxSummaryChars / APPROX_CHARS_PER_TOKEN);

  const recent: T[] = [];
  let usedTokens = estimateChatMessagesTokens(systemMessages) + summaryReserveTokens;

  for (let index = conversationMessages.length - 1; index >= 0; index -= 1) {
    const message = conversationMessages[index];
    const nextTokens = MESSAGE_OVERHEAD_TOKENS + estimateTextTokens(message.content);
    const mustKeep = recent.length < minRecentMessages;
    if (!mustKeep && usedTokens + nextTokens > maxTokens) break;
    recent.unshift(message);
    usedTokens += nextTokens;
  }

  const omitted = conversationMessages.slice(0, Math.max(0, conversationMessages.length - recent.length));
  if (!omitted.length) {
    return {
      messages: [...systemMessages, ...recent],
      originalEstimatedTokens,
      estimatedTokens: estimateChatMessagesTokens([...systemMessages, ...recent]),
      omittedMessages: 0,
      summaryInserted: false,
    };
  }

  const summaryMessage = {
    role: "system",
    content: buildCompactionSummary(omitted, maxSummaryChars),
  } as T;
  const compacted = [...systemMessages, summaryMessage, ...recent];

  return {
    messages: compacted,
    originalEstimatedTokens,
    estimatedTokens: estimateChatMessagesTokens(compacted),
    omittedMessages: omitted.length,
    summaryInserted: true,
  };
}