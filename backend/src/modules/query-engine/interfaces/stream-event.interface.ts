/**
 * Unified SSE Stream Event Protocol
 *
 * All chat streaming paths (claude/chat, openclaw/proxy/:id/stream, desktop/sync)
 * emit these typed events via SSE. Frontend parsers switch on `event.type`.
 *
 * Reference: Claude Code's StreamEvent union type.
 */

// ============================================================
// Individual Event Types
// ============================================================

export interface TextDeltaEvent {
  type: 'text_delta';
  text: string;
}

export interface ThinkingEvent {
  type: 'thinking';
  text: string;
}

export interface ToolStartEvent {
  type: 'tool_start';
  toolCallId: string;
  toolName: string;
  input: Record<string, any>;
}

export interface ToolProgressEvent {
  type: 'tool_progress';
  toolCallId: string;
  status: string;
  partialResult?: string;
}

export interface ToolResultEvent {
  type: 'tool_result';
  toolCallId: string;
  toolName: string;
  success: boolean;
  result: any;
  durationMs: number;
  error?: string;
}

export interface ToolErrorEvent {
  type: 'tool_error';
  toolCallId: string;
  toolName: string;
  error: string;
  retriable: boolean;
}

export interface ApprovalRequiredEvent {
  type: 'approval_required';
  toolCallId: string;
  toolName: string;
  input: Record<string, any>;
  riskLevel: 0 | 1 | 2 | 3;
  reason: string;
}

export interface UsageEvent {
  type: 'usage';
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalCostUsd?: number;
  model?: string;
}

export interface TurnInfoEvent {
  type: 'turn_info';
  turnIndex: number;
  messageCount: number;
  contextTokens: number;
  budgetRemaining?: number;
  isCompacted?: boolean;
}

export interface DoneEvent {
  type: 'done';
  reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'abort' | 'error' | 'tool_use';
  totalDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd?: number;
}

export interface ErrorStreamEvent {
  type: 'error';
  error: string;
  code?: string;
  retriable: boolean;
}

// ============================================================
// Union Type
// ============================================================

export type StreamEvent =
  | TextDeltaEvent
  | ThinkingEvent
  | ToolStartEvent
  | ToolProgressEvent
  | ToolResultEvent
  | ToolErrorEvent
  | ApprovalRequiredEvent
  | UsageEvent
  | TurnInfoEvent
  | DoneEvent
  | ErrorStreamEvent;

// ============================================================
// SSE Helpers
// ============================================================

/**
 * Format a StreamEvent as an SSE data line.
 * Compatible with EventSource and fetch-based SSE parsers.
 */
export function formatSSE(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Format the final SSE terminator.
 */
export function formatSSEDone(): string {
  return `data: [DONE]\n\n`;
}

/**
 * Parse an SSE data line back to a StreamEvent.
 * Returns null for [DONE] or unparseable lines.
 */
export function parseSSE(line: string): StreamEvent | null {
  const data = line.startsWith('data: ') ? line.slice(6).trim() : line.trim();
  if (!data || data === '[DONE]') return null;
  try {
    return JSON.parse(data) as StreamEvent;
  } catch {
    return null;
  }
}
