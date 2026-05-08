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

export interface ReasoningEvent {
  type: 'reasoning';
  text?: string;
  details?: any;
  provider?: string;
  model?: string;
}

export interface RuntimeFallbackEvent {
  type: 'runtime_fallback';
  reason: string;
  fromModel?: string;
  toModel?: string;
  retryAttempt?: number;
  delayMs?: number;
}

export interface ContextCompactionEvent {
  type: 'context_compaction';
  compactedMessageCount: number;
  tokensSaved: number;
  targetRatio?: number;
  protectedLastMessages?: number;
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

/**
 * Phase 4.3: emitted BEFORE the cloud LLM call when the client requested a
 * local-only model (mobile/desktop on-device) but the backend sanitized it to
 * a cloud fallback. Clients may choose to cancel the stream and run on-device.
 *
 * Codex-borrow P1: also used to surface the resolved Tier decision so the UI
 * can render a transparent micro-copy (e.g. "Smart picked Claude Haiku").
 */
export interface MetaEvent {
  type: 'meta';
  localOnlyFallback?: boolean;
  requestedModel?: string | null;
  routedModel?: string | null;
  reason?: string;
  /** Codex-borrow P1 — user-facing tier (`local | smart | cloud`). */
  tier?: 'local' | 'smart' | 'cloud';
  /** Codex-borrow P1 — full TierDecision object for UI rendering. */
  tierDecision?: {
    requestedTier: 'local' | 'smart' | 'cloud';
    classifiedTier: 'local' | 'light' | 'medium' | 'heavy' | 'ultra';
    chosenModel: string;
    reason: string;
    estimatedCostUsd?: number;
    estimatedLatencyMs?: number;
    privacyScope: 'device-only' | 'network';
  };
}

// ============================================================
// Union Type
// ============================================================

export type StreamEvent =
  | TextDeltaEvent
  | ThinkingEvent
  | ReasoningEvent
  | RuntimeFallbackEvent
  | ContextCompactionEvent
  | ToolStartEvent
  | ToolProgressEvent
  | ToolResultEvent
  | ToolErrorEvent
  | ApprovalRequiredEvent
  | UsageEvent
  | TurnInfoEvent
  | DoneEvent
  | ErrorStreamEvent
  | MetaEvent;

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
