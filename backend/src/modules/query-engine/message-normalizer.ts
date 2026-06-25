/**
 * Message Normalizer — Context Budget & Message Formatting
 *
 * Reference: Claude Code's MessageNormalizer.
 * - Truncates oversized tool results
 * - Filters UI-only messages
 * - Enforces context window budget
 * - Normalizes messages for different LLM providers
 */
import { Logger } from '@nestjs/common';
import { ChatMessage, MessageRole } from './interfaces';

const logger = new Logger('MessageNormalizer');

// ============================================================
// Configuration
// ============================================================

export interface NormalizerConfig {
  /** Max tokens for context window (default 128000 for Claude) */
  maxContextTokens?: number;
  /** Max chars per tool result before truncation (default 8000) */
  maxToolResultChars?: number;
  /** Reserve tokens for system prompt (default 2000) */
  systemPromptReserve?: number;
  /** Reserve tokens for LLM response (default 4096) */
  responseReserve?: number;
  /** Approximate chars per token for estimation (default 4) */
  charsPerToken?: number;
}

const DEFAULT_CONFIG: Required<NormalizerConfig> = {
  maxContextTokens: 128_000,
  maxToolResultChars: 8000,
  systemPromptReserve: 2000,
  responseReserve: 4096,
  charsPerToken: 4,
};

// ============================================================
// Message Normalizer
// ============================================================

export class MessageNormalizer {
  private readonly config: Required<NormalizerConfig>;

  constructor(config?: NormalizerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Normalize and trim messages to fit within the context budget.
   *
   * Strategy:
   * 1. Truncate individual tool results that exceed maxToolResultChars
   * 2. Filter UI-only/transient messages
   * 3. If total still exceeds budget, drop oldest messages (keeping system + last N)
   */
  normalize(messages: ChatMessage[], systemPrompt?: string): ChatMessage[] {
    let result = messages.map((m) => ({ ...m }));

    // Step 1: Truncate oversized tool results
    result = this.truncateToolResults(result);

    // Step 2: Filter UI-only messages
    result = this.filterTransientMessages(result);

    // Step 3: Budget enforcement
    result = this.enforceContextBudget(result, systemPrompt);

    return result;
  }

  /**
   * Estimate token count for a set of messages.
   */
  estimateTokens(messages: ChatMessage[], systemPrompt?: string): number {
    let totalChars = systemPrompt?.length ?? 0;
    for (const msg of messages) {
      totalChars += msg.content?.length ?? 0;
      // Tool calls in assistant messages
      if (msg.toolCalls) {
        totalChars += JSON.stringify(msg.toolCalls).length;
      }
    }
    return Math.ceil(totalChars / this.config.charsPerToken);
  }

  /**
   * Check if messages are approaching the context limit.
   * Returns a ratio (0-1+) where 1.0 = at limit.
   */
  contextUsageRatio(messages: ChatMessage[], systemPrompt?: string): number {
    const tokens = this.estimateTokens(messages, systemPrompt);
    const budget = this.config.maxContextTokens - this.config.responseReserve;
    return tokens / budget;
  }

  /**
   * Check if compaction should be triggered.
   * Returns true if context usage > 80% of budget.
   */
  shouldCompact(messages: ChatMessage[], systemPrompt?: string): boolean {
    return this.contextUsageRatio(messages, systemPrompt) > 0.8;
  }

  // ==========================================================
  // Internal: Truncate Tool Results
  // ==========================================================

  private truncateToolResults(messages: ChatMessage[]): ChatMessage[] {
    return messages.map((msg) => {
      if (msg.role !== 'tool') return msg;
      if (!msg.content || msg.content.length <= this.config.maxToolResultChars) return msg;

      const truncated = msg.content.slice(0, this.config.maxToolResultChars);
      return {
        ...msg,
        content: truncated + `\n...[truncated from ${msg.content.length} chars]`,
      };
    });
  }

  // ==========================================================
  // Internal: Filter Transient Messages
  // ==========================================================

  private filterTransientMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.filter((msg) => {
      // Keep all non-system messages
      if (msg.role !== 'system') return true;
      // Keep system messages that aren't UI-only markers
      const content = msg.content?.toLowerCase() ?? '';
      if (content.includes('[ui-only]') || content.includes('[transient]')) {
        return false;
      }
      return true;
    });
  }

  // ==========================================================
  // Internal: Context Budget Enforcement
  // ==========================================================

  private enforceContextBudget(messages: ChatMessage[], systemPrompt?: string): ChatMessage[] {
    const budget =
      this.config.maxContextTokens -
      this.config.systemPromptReserve -
      this.config.responseReserve;

    let tokens = this.estimateTokens(messages, systemPrompt);

    if (tokens <= budget) return messages;

    // Strategy: keep the last message (must be user), and progressively
    // remove the oldest non-system messages from the middle
    const result = [...messages];
    let removedCount = 0;

    // Remove from index 0 (oldest) towards the end, but keep last 4 messages
    while (tokens > budget && result.length > 4) {
      const removed = result.shift()!;
      const removedTokens = Math.ceil(
        (removed.content?.length ?? 0) / this.config.charsPerToken,
      );
      tokens -= removedTokens;
      removedCount++;
    }

    if (removedCount > 0) {
      logger.warn(`Budget enforcement: removed ${removedCount} oldest messages`);
      // Insert a marker so the LLM knows context was trimmed
      result.unshift({
        role: 'system' as MessageRole,
        content: `[Context trimmed: ${removedCount} earlier messages removed to fit context window]`,
      });
    }

    return result;
  }
}

// ============================================================
// Provider-specific Message Formatting
// ============================================================

export interface ProviderMessageFormat {
  role: string;
  content: any;
  [key: string]: any;
}

/**
 * Convert ChatMessages to Claude API format.
 */
export function toClaudeMessages(messages: ChatMessage[]): ProviderMessageFormat[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((msg) => {
      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        return {
          role: 'assistant',
          content: [
            ...(msg.content ? [{ type: 'text', text: msg.content }] : []),
            ...msg.toolCalls.map((tc) => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.input,
            })),
          ],
        };
      }
      if (msg.role === 'tool') {
        return {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId,
              content: msg.content,
            },
          ],
        };
      }
      return { role: msg.role, content: msg.content };
    });
}

/**
 * Convert ChatMessages to OpenAI API format.
 */
export function toOpenAIMessages(messages: ChatMessage[]): ProviderMessageFormat[] {
  return messages.map((msg) => {
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        })),
      };
    }
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: msg.content,
      };
    }
    return { role: msg.role, content: msg.content };
  });
}
