/**
 * Shared SSE Stream Parser
 *
 * Cross-platform streaming parser for the unified SSE event protocol.
 * Works in web (browser), React Native (mobile), and Tauri (desktop).
 *
 * Usage:
 *   const parser = new AgentrixStreamParser({
 *     onTextDelta: (text) => appendToChat(text),
 *     onToolStart: (e) => showToolSpinner(e.toolName),
 *     onToolResult: (e) => hideToolSpinner(e.toolCallId),
 *     onApprovalRequired: (e) => showApprovalDialog(e),
 *     onDone: (e) => finishChat(e),
 *     onError: (e) => showError(e.error),
 *   });
 *
 *   // Feed raw SSE data from fetch/EventSource
 *   parser.feed(chunk);
 *
 * Reference: Phase 6 unified SSE protocol (ARCHITECTURE_OPTIMIZATION doc).
 */

// ============================================================
// Stream Event Types (duplicated for portability — no backend imports)
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
  reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'abort' | 'error';
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
// Legacy chunk format (backward compat)
// ============================================================

export interface LegacyChunkData {
  chunk?: string;
  meta?: Record<string, any>;
  error?: string;
}

// ============================================================
// Parser Callbacks
// ============================================================

export interface StreamParserCallbacks {
  onTextDelta?: (event: TextDeltaEvent) => void;
  onThinking?: (event: ThinkingEvent) => void;
  onToolStart?: (event: ToolStartEvent) => void;
  onToolProgress?: (event: ToolProgressEvent) => void;
  onToolResult?: (event: ToolResultEvent) => void;
  onToolError?: (event: ToolErrorEvent) => void;
  onApprovalRequired?: (event: ApprovalRequiredEvent) => void;
  onUsage?: (event: UsageEvent) => void;
  onTurnInfo?: (event: TurnInfoEvent) => void;
  onDone?: (event: DoneEvent) => void;
  onError?: (event: ErrorStreamEvent) => void;
  /** Legacy: called for backward-compat { chunk } events */
  onLegacyChunk?: (data: LegacyChunkData) => void;
  /** Legacy: called for { meta } events */
  onMeta?: (meta: Record<string, any>) => void;
}

// ============================================================
// Stream Parser
// ============================================================

export class AgentrixStreamParser {
  private buffer = '';
  private isDone = false;
  private seenStructuredTextDelta = false;

  constructor(private readonly callbacks: StreamParserCallbacks) {}

  /**
   * Feed a raw chunk of SSE data. Handles partial lines,
   * multiple events per chunk, and both structured + legacy formats.
   */
  feed(rawChunk: string): void {
    if (this.isDone) return;

    this.buffer += rawChunk;

    // Split on double newline (SSE event boundary)
    let boundary = this.buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const rawEvent = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);

      this.processRawEvent(rawEvent);

      if (this.isDone) return;
      boundary = this.buffer.indexOf('\n\n');
    }
  }

  /**
   * Signal that the stream has ended (connection closed).
   * Processes any remaining buffer content.
   */
  end(): void {
    if (this.buffer.trim()) {
      this.processRawEvent(this.buffer);
    }
    this.buffer = '';
    this.isDone = true;
  }

  /**
   * Reset the parser for reuse.
   */
  reset(): void {
    this.buffer = '';
    this.isDone = false;
    this.seenStructuredTextDelta = false;
  }

  /**
   * Process a single raw SSE event block.
   */
  private processRawEvent(raw: string): void {
    const lines = raw.split('\n');
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) return;

    const data = dataLines.join('\n').trim();

    // [DONE] sentinel
    if (data === '[DONE]') {
      this.isDone = true;
      return;
    }

    // Try to parse as JSON
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Not JSON — treat as raw text chunk
      this.callbacks.onLegacyChunk?.({ chunk: data });
      this.callbacks.onTextDelta?.({ type: 'text_delta', text: data });
      return;
    }

    // Structured event (has a .type field)
    if (parsed && typeof parsed.type === 'string') {
      this.dispatchStructuredEvent(parsed as StreamEvent);
      return;
    }

    // Legacy format: { chunk, meta, error }
    if (parsed.chunk !== undefined || parsed.meta || parsed.error) {
      this.callbacks.onLegacyChunk?.(parsed);

      if (parsed.meta) {
        this.callbacks.onMeta?.(parsed.meta);
      }

      if (typeof parsed.chunk === 'string' && parsed.chunk.length > 0 && !this.seenStructuredTextDelta) {
        // Don't double-emit text_delta if backend also sends structured format
        this.callbacks.onTextDelta?.({ type: 'text_delta', text: parsed.chunk });
      }

      if (parsed.error) {
        this.callbacks.onError?.({
          type: 'error',
          error: parsed.error,
          retriable: false,
        });
      }
      return;
    }

    // Unknown format — pass through as legacy
    this.callbacks.onLegacyChunk?.(parsed);
  }

  /**
   * Dispatch a structured StreamEvent to the appropriate callback.
   */
  private dispatchStructuredEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'text_delta':
        this.seenStructuredTextDelta = true;
        this.callbacks.onTextDelta?.(event);
        break;
      case 'thinking':
        this.callbacks.onThinking?.(event);
        break;
      case 'tool_start':
        this.callbacks.onToolStart?.(event);
        break;
      case 'tool_progress':
        this.callbacks.onToolProgress?.(event);
        break;
      case 'tool_result':
        this.callbacks.onToolResult?.(event);
        break;
      case 'tool_error':
        this.callbacks.onToolError?.(event);
        break;
      case 'approval_required':
        this.callbacks.onApprovalRequired?.(event);
        break;
      case 'usage':
        this.callbacks.onUsage?.(event);
        break;
      case 'turn_info':
        this.callbacks.onTurnInfo?.(event);
        break;
      case 'done':
        this.callbacks.onDone?.(event);
        this.isDone = true;
        break;
      case 'error':
        this.callbacks.onError?.(event);
        break;
    }
  }
}
