/**
 * Query Engine Interfaces
 *
 * Types for the stateful conversation engine: messages, turns, options.
 */

import { ToolContext } from '../../tool-registry/interfaces';
import { StreamEvent } from './stream-event.interface';

// ============================================================
// Messages
// ============================================================

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
  role: MessageRole;
  content: string;
  /** For assistant messages that include tool use */
  toolCalls?: ToolCallRequest[];
  /** For tool result messages */
  toolCallId?: string;
  toolName?: string;
  /** Metadata */
  timestamp?: number;
  tokenCount?: number;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  input: Record<string, any>;
}

// ============================================================
// Conversation State
// ============================================================

export interface ConversationState {
  messages: ChatMessage[];
  turnIndex: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  isCompacted: boolean;
  compactionCount: number;
  systemPrompt: string;
  createdAt: number;
  lastActivityAt: number;
}

// ============================================================
// Query Options
// ============================================================

export interface QueryOptions {
  /** System prompt override */
  systemPrompt?: string;
  /** Max tokens for LLM response */
  maxTokens?: number;
  /** Temperature */
  temperature?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** Model override (e.g. 'claude-sonnet-4-20250514') */
  model?: string;
  /** LLM provider override */
  provider?: 'claude' | 'openai' | 'gemini' | 'bedrock';
  /** Tool categories to enable for this query */
  enabledToolCategories?: string[];
  /** Specific tool names to disable */
  disabledTools?: string[];
  /** Budget cap for this query (tokens) */
  maxBudgetTokens?: number;
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Whether to allow auto-compaction when context is large */
  autoCompact?: boolean;
  /** Max consecutive agentic turns before stopping */
  maxTurns?: number;
}

// ============================================================
// LLM Response (normalized from any provider)
// ============================================================

export interface NormalizedLLMResponse {
  content: string;
  toolCalls: ToolCallRequest[];
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  model: string;
  thinking?: string;
}

export { StreamEvent };
export * from './stream-event.interface';
