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
export type StreamEvent = TextDeltaEvent | ThinkingEvent | ToolStartEvent | ToolProgressEvent | ToolResultEvent | ToolErrorEvent | ApprovalRequiredEvent | UsageEvent | TurnInfoEvent | DoneEvent | ErrorStreamEvent;
export interface LegacyChunkData {
    chunk?: string;
    meta?: Record<string, any>;
    error?: string;
}
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
    onLegacyChunk?: (data: LegacyChunkData) => void;
    onMeta?: (meta: Record<string, any>) => void;
}
export declare class AgentrixStreamParser {
    private readonly callbacks;
    private buffer;
    private isDone;
    constructor(callbacks: StreamParserCallbacks);
    feed(rawChunk: string): void;
    end(): void;
    reset(): void;
    private processRawEvent;
    private dispatchStructuredEvent;
}
