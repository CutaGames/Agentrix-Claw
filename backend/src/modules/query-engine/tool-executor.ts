/**
 * Tool Executor — Concurrent Tool Execution Engine
 *
 * Reference: Claude Code's StreamingToolExecutor pattern.
 * - Read-only + concurrency-safe tools: parallel execution (up to N)
 * - Write / non-safe tools: serial execution
 * - Ordered result emission regardless of completion order
 * - Per-tool timeout and abort support
 */
import { Logger } from '@nestjs/common';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';
import { ToolContext, ToolResult } from '../tool-registry/interfaces';
import { ToolCallRequest } from './interfaces';
import {
  StreamEvent,
  ApprovalRequiredEvent,
  ToolStartEvent,
  ToolResultEvent,
  ToolErrorEvent,
  ToolProgressEvent,
} from './interfaces/stream-event.interface';

const logger = new Logger('ToolExecutor');

// ============================================================
// Permission Check Callback
// ============================================================

export interface ToolPermissionCheckResult {
  behavior: 'allow' | 'deny' | 'ask';
  reason?: string;
  riskLevel?: 0 | 1 | 2 | 3;
}

export type ToolPermissionCheckFn = (
  toolName: string,
  input: Record<string, any>,
  ctx: ToolContext,
) => Promise<ToolPermissionCheckResult>;

// ============================================================
// Configuration
// ============================================================

export interface ToolExecutorConfig {
  /** Max concurrent read-only tool executions (default 5) */
  maxConcurrency?: number;
  /** Default per-tool timeout in ms (default 30000) */
  defaultTimeoutMs?: number;
  /** Abort signal for the entire batch */
  abortSignal?: AbortSignal;
  /** Optional permission check before execution. If 'deny', tool is not executed.
   *  If 'ask', an approval_required event is emitted and execution is skipped. */
  permissionCheck?: ToolPermissionCheckFn;
}

const DEFAULT_CONFIG: Required<Omit<ToolExecutorConfig, 'abortSignal' | 'permissionCheck'>> = {
  maxConcurrency: 5,
  defaultTimeoutMs: 30_000,
};

// ============================================================
// Execution Result
// ============================================================

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  result: ToolResult;
  events: StreamEvent[];
}

// ============================================================
// Tool Executor
// ============================================================

export class ToolExecutor {
  private readonly config: Required<Omit<ToolExecutorConfig, 'abortSignal' | 'permissionCheck'>>;
  private readonly abortSignal?: AbortSignal;
  private readonly permissionCheck?: ToolPermissionCheckFn;

  constructor(
    private readonly toolRegistry: ToolRegistryService,
    config?: ToolExecutorConfig,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.abortSignal = config?.abortSignal;
    this.permissionCheck = config?.permissionCheck;
  }

  /**
   * Execute a batch of tool calls with optimal concurrency.
   * Read-only concurrent-safe tools run in parallel; others run serially.
   * Results are emitted in original request order.
   *
   * @param toolCalls - The batch of tool calls from the LLM
   * @param ctx - Tool execution context
   * @param onEvent - Callback for streaming events to SSE
   */
  async executeBatch(
    toolCalls: ToolCallRequest[],
    ctx: ToolContext,
    onEvent?: (event: StreamEvent) => void,
  ): Promise<ToolExecutionResult[]> {
    if (toolCalls.length === 0) return [];

    // Classify tools
    const { concurrent, serial } = this.classifyToolCalls(toolCalls);

    // Results map for ordered emission
    const resultsMap = new Map<string, ToolExecutionResult>();

    // Execute concurrent tools in parallel with concurrency limit
    if (concurrent.length > 0) {
      const concurrentResults = await this.executeWithConcurrencyLimit(
        concurrent,
        ctx,
        onEvent,
      );
      for (const r of concurrentResults) {
        resultsMap.set(r.toolCallId, r);
      }
    }

    // Execute serial tools one by one
    for (const call of serial) {
      if (this.abortSignal?.aborted) break;
      const result = await this.executeSingle(call, ctx, onEvent);
      resultsMap.set(result.toolCallId, result);
    }

    // Return in original order
    return toolCalls.map((tc) => resultsMap.get(tc.id)!).filter(Boolean);
  }

  /**
   * Classify tool calls into concurrent vs serial buckets.
   */
  private classifyToolCalls(
    toolCalls: ToolCallRequest[],
  ): { concurrent: ToolCallRequest[]; serial: ToolCallRequest[] } {
    const concurrent: ToolCallRequest[] = [];
    const serial: ToolCallRequest[] = [];

    for (const call of toolCalls) {
      const tool = this.toolRegistry.get(call.name);
      if (tool && tool.isReadOnly && tool.isConcurrencySafe) {
        concurrent.push(call);
      } else {
        serial.push(call);
      }
    }

    return { concurrent, serial };
  }

  /**
   * Execute tools with a concurrency limit using a semaphore pattern.
   */
  private async executeWithConcurrencyLimit(
    toolCalls: ToolCallRequest[],
    ctx: ToolContext,
    onEvent?: (event: StreamEvent) => void,
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    const executing: Set<Promise<void>> = new Set();

    for (const call of toolCalls) {
      if (this.abortSignal?.aborted) break;

      const p = this.executeSingle(call, ctx, onEvent).then((result) => {
        results.push(result);
        executing.delete(p);
      });
      executing.add(p);

      if (executing.size >= this.config.maxConcurrency) {
        await Promise.race(executing);
      }
    }

    // Wait for remaining
    await Promise.all(executing);
    return results;
  }

  /**
   * Execute a single tool call with timeout, progress streaming, and error handling.
   */
  private async executeSingle(
    call: ToolCallRequest,
    ctx: ToolContext,
    onEvent?: (event: StreamEvent) => void,
  ): Promise<ToolExecutionResult> {
    const events: StreamEvent[] = [];
    const emit = (event: StreamEvent) => {
      events.push(event);
      onEvent?.(event);
    };

    // Emit tool_start
    const startEvent: ToolStartEvent = {
      type: 'tool_start',
      toolCallId: call.id,
      toolName: call.name,
      input: call.input,
    };
    emit(startEvent);

    const startMs = Date.now();

    // Permission check before execution
    if (this.permissionCheck) {
      try {
        const permResult = await this.permissionCheck(call.name, call.input, ctx);

        if (permResult.behavior === 'deny') {
          const reason = permResult.reason || 'Permission denied';
          const errorEvent: ToolErrorEvent = {
            type: 'tool_error',
            toolCallId: call.id,
            toolName: call.name,
            error: `Permission denied: ${reason}`,
            retriable: false,
          };
          emit(errorEvent);
          return {
            toolCallId: call.id,
            toolName: call.name,
            result: { success: false, error: `Permission denied: ${reason}`, durationMs: Date.now() - startMs },
            events,
          };
        }

        if (permResult.behavior === 'ask') {
          const approvalEvent: ApprovalRequiredEvent = {
            type: 'approval_required',
            toolCallId: call.id,
            toolName: call.name,
            input: call.input,
            riskLevel: permResult.riskLevel ?? 1,
            reason: permResult.reason || 'User approval required',
          };
          emit(approvalEvent);
          return {
            toolCallId: call.id,
            toolName: call.name,
            result: { success: false, error: `Approval required: ${permResult.reason || 'waiting for user approval'}`, durationMs: Date.now() - startMs },
            events,
          };
        }
      } catch (err: any) {
        logger.warn(`Permission check failed for ${call.name}: ${err.message}`);
        // Continue with execution on permission check failure
      }
    }

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(call, ctx, (progress) => {
        const progressEvent: ToolProgressEvent = {
          type: 'tool_progress',
          toolCallId: call.id,
          status: progress.type,
          partialResult: progress.data,
        };
        emit(progressEvent);
      });

      const durationMs = Date.now() - startMs;

      // Emit tool_result
      const resultEvent: ToolResultEvent = {
        type: 'tool_result',
        toolCallId: call.id,
        toolName: call.name,
        success: result.success,
        result: result.data ?? result.error,
        durationMs,
        error: result.error,
      };
      emit(resultEvent);

      return { toolCallId: call.id, toolName: call.name, result, events };
    } catch (error: any) {
      const durationMs = Date.now() - startMs;

      // Emit tool_error
      const errorEvent: ToolErrorEvent = {
        type: 'tool_error',
        toolCallId: call.id,
        toolName: call.name,
        error: error.message || 'Unknown error',
        retriable: false,
      };
      emit(errorEvent);

      const failResult: ToolResult = {
        success: false,
        error: error.message || 'Tool execution failed',
        durationMs,
      };

      return { toolCallId: call.id, toolName: call.name, result: failResult, events };
    }
  }

  /**
   * Execute a tool call via the registry with timeout.
   */
  private async executeWithTimeout(
    call: ToolCallRequest,
    ctx: ToolContext,
    onProgress?: (progress: any) => void,
  ): Promise<ToolResult> {
    const timeoutMs = this.config.defaultTimeoutMs;

    return new Promise<ToolResult>(async (resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Tool "${call.name}" timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      try {
        const result = await this.toolRegistry.execute(call.name, call.input, ctx, onProgress);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    });
  }
}
