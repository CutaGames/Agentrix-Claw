/**
 * Query Engine Service — Stateful Conversation Engine
 *
 * Reference: Claude Code's QueryEngine class.
 * - Manages conversation state (messages, turns, budget)
 * - Routes to LLM providers via existing integration services
 * - Orchestrates tool execution via ToolExecutor
 * - Performs auto-compaction when context grows too large
 * - Streams events via SSE using the unified StreamEvent protocol
 * - Tracks costs via CostTracker
 */
import { Injectable, Logger } from '@nestjs/common';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';
import { PermissionEngineService } from '../permissions/permission-engine.service';
import { DenialTrackerService } from '../permissions/denial-tracker.service';
import {
  ChatMessage,
  ConversationState,
  QueryOptions,
  NormalizedLLMResponse,
  StreamEvent,
} from './interfaces';
import { formatSSE, formatSSEDone } from './interfaces/stream-event.interface';
import { ToolExecutor } from './tool-executor';
import { MessageNormalizer } from './message-normalizer';
import { CompactionEngine } from './compaction';
import { withRetry, withModelFallback } from './with-retry';
import { CostTrackerService } from '../cost-tracker/cost-tracker.service';
import { ToolContext } from '../tool-registry/interfaces';

const logger = new Logger('QueryEngine');

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_MAX_TURNS = 25;
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

// ============================================================
// Query Engine Service
// ============================================================

@Injectable()
export class QueryEngineService {
  private readonly normalizer = new MessageNormalizer();
  private readonly compactionEngine = new CompactionEngine();

  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly costTracker: CostTrackerService,
    private readonly permissionEngine: PermissionEngineService,
    private readonly denialTracker: DenialTrackerService,
  ) {}

  /**
   * Submit a user message and stream responses via callback.
   * This is the main entry point for all chat paths.
   *
   * Implements the agentic loop:
   * 1. Normalize messages → 2. Call LLM → 3. If tool_use, execute tools →
   * 4. Append results → 5. Loop back to 2 → 6. When end_turn, emit done
   *
   * @param state - Mutable conversation state
   * @param userMessage - The new user message
   * @param options - Query configuration
   * @param onEvent - Callback for each StreamEvent
   * @param callLLM - Provider-specific LLM call function (injected by caller)
   */
  async submitMessage(
    state: ConversationState,
    userMessage: string,
    options: QueryOptions,
    onEvent: (event: StreamEvent) => void,
    callLLM: (messages: any[], tools: any[], opts: QueryOptions) => Promise<NormalizedLLMResponse>,
  ): Promise<void> {
    const startMs = Date.now();
    const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
    const abortSignal = options.abortSignal;

    // Add user message
    state.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    });
    state.lastActivityAt = Date.now();

    // Create tool executor for this session
    const toolExecutor = new ToolExecutor(this.toolRegistry, {
      abortSignal,
      permissionCheck: async (toolName, input, toolCtxInner) => {
        const tool = this.toolRegistry.get(toolName);
        const riskLevel = tool?.riskLevel ?? 0;
        const decision = await this.permissionEngine.evaluate(toolName, input, {
          userId: toolCtxInner.userId,
          agentId: toolCtxInner.agentId,
          agentAccountId: toolCtxInner.metadata?.agentAccountId,
          instanceId: toolCtxInner.instanceId,
          sessionId: toolCtxInner.sessionId,
          toolRiskLevel: riskLevel,
          amount: input?.amount ?? input?.price,
        });
        return {
          behavior: decision.behavior,
          reason: decision.reason.detail || decision.reason.type,
          riskLevel,
        };
      },
    });

    // Build tool context
    const toolCtx: ToolContext = {
      userId: '', // Caller should set this via state metadata
      sessionId: String(state.createdAt),
      ...((state as any).toolContext ?? {}),
    };

    // Get tool schemas for the current provider
    const provider = options.provider ?? 'claude';
    const tools = this.toolRegistry.getSchemasForProvider(provider, {
      categories: options.enabledToolCategories as any,
    });

    let turnCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalStopReason: NormalizedLLMResponse['stopReason'] = 'end_turn';

    try {
      // Agentic loop
      while (turnCount < maxTurns) {
        if (abortSignal?.aborted) {
          onEvent({ type: 'error', error: 'Aborted by user', retriable: false });
          break;
        }

        turnCount++;

        // Check for auto-compaction
        if (options.autoCompact !== false) {
          const ratio = this.normalizer.contextUsageRatio(state.messages, state.systemPrompt);
          if (this.compactionEngine.shouldCompact(state.messages, ratio)) {
            const { messages: compacted, result: compRes } =
              this.compactionEngine.applyCompaction(state.messages);
            state.messages = compacted;
            state.isCompacted = true;
            state.compactionCount++;
            logger.log(
              `Auto-compaction: ${compRes.compactedMessageCount} messages → summary, saved ~${compRes.tokensSaved} tokens`,
            );
          }
        }

        // Normalize messages
        const normalizedMessages = this.normalizer.normalize(
          state.messages,
          state.systemPrompt,
        );

        // Emit turn info
        onEvent({
          type: 'turn_info',
          turnIndex: turnCount,
          messageCount: normalizedMessages.length,
          contextTokens: this.normalizer.estimateTokens(normalizedMessages, state.systemPrompt),
          isCompacted: state.isCompacted,
        });

        // Call LLM with retry
        const llmResponse = await withRetry(
          () => callLLM(normalizedMessages, tools, options),
          {
            maxRetries: 2,
            abortSignal,
            onRetry: (attempt, err, delay) => {
              logger.warn(`LLM retry ${attempt}: ${err.message}, waiting ${delay}ms`);
            },
          },
        );
        finalStopReason = llmResponse.stopReason || 'end_turn';

        // Track usage
        totalInputTokens += llmResponse.usage.inputTokens;
        totalOutputTokens += llmResponse.usage.outputTokens;
        state.totalInputTokens += llmResponse.usage.inputTokens;
        state.totalOutputTokens += llmResponse.usage.outputTokens;

        // Emit usage event
        onEvent({
          type: 'usage',
          inputTokens: llmResponse.usage.inputTokens,
          outputTokens: llmResponse.usage.outputTokens,
          cacheReadTokens: llmResponse.usage.cacheReadTokens,
          cacheWriteTokens: llmResponse.usage.cacheWriteTokens,
          model: llmResponse.model,
        });

        // Track cost
        const turnCost = this.costTracker.calculateCost(
          llmResponse.model,
          llmResponse.usage.inputTokens,
          llmResponse.usage.outputTokens,
          llmResponse.usage.cacheReadTokens,
          llmResponse.usage.cacheWriteTokens,
        );
        state.totalCostUsd += turnCost;

        // Emit thinking (if extended thinking is enabled)
        if (llmResponse.thinking) {
          onEvent({ type: 'thinking', text: llmResponse.thinking });
        }

        // Emit text content
        if (llmResponse.content) {
          onEvent({ type: 'text_delta', text: llmResponse.content });
        }

        // Add assistant message to state
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: llmResponse.content,
          toolCalls: llmResponse.toolCalls.length > 0 ? llmResponse.toolCalls : undefined,
          timestamp: Date.now(),
        };
        state.messages.push(assistantMsg);
        state.turnIndex = turnCount;

        // If no tool calls, we're done
        if (llmResponse.stopReason !== 'tool_use' || llmResponse.toolCalls.length === 0) {
          break;
        }

        // Execute tool calls
        const toolResults = await toolExecutor.executeBatch(
          llmResponse.toolCalls,
          toolCtx,
          onEvent,
        );

        // Add tool results to message history + denial tracking
        for (const tr of toolResults) {
          const resultContent =
            typeof tr.result.data === 'string'
              ? tr.result.data
              : JSON.stringify(tr.result.data ?? tr.result.error ?? 'No result');

          // Track denials/successes for fallback prompting
          const agentTrackingId = toolCtx.agentId || toolCtx.userId;
          if (tr.result.success) {
            this.denialTracker.recordSuccess(agentTrackingId);
          } else if (tr.result.error?.startsWith('Permission denied:') || tr.result.error?.startsWith('Approval required:')) {
            this.denialTracker.recordDenial(agentTrackingId, tr.toolName);
          }

          state.messages.push({
            role: 'tool',
            content: resultContent,
            toolCallId: tr.toolCallId,
            toolName: tr.toolName,
            timestamp: Date.now(),
          });
        }

        // If denial threshold reached, inject fallback hint
        const agentTrackingId = toolCtx.agentId || toolCtx.userId;
        const fallbackHint = this.denialTracker.shouldFallbackToPrompting(agentTrackingId);
        if (fallbackHint) {
          state.messages.push({
            role: 'system',
            content: fallbackHint,
            timestamp: Date.now(),
          });
        }
      }

      // Emit done
      const totalDurationMs = Date.now() - startMs;
      const totalCost = this.costTracker.calculateCost(
        options.model ?? DEFAULT_MODEL,
        totalInputTokens,
        totalOutputTokens,
      );

      onEvent({
        type: 'done',
        reason: abortSignal?.aborted
          ? 'abort'
          : finalStopReason === 'max_tokens' || finalStopReason === 'stop_sequence' || finalStopReason === 'tool_use'
            ? finalStopReason
            : 'end_turn',
        totalDurationMs,
        totalInputTokens,
        totalOutputTokens,
        totalCostUsd: totalCost,
      });
    } catch (error: any) {
      logger.error(`QueryEngine error: ${error.message}`, error.stack);
      onEvent({
        type: 'error',
        error: error.message || 'Internal query engine error',
        retriable: false,
      });
      onEvent({
        type: 'done',
        reason: 'error',
        totalDurationMs: Date.now() - startMs,
        totalInputTokens,
        totalOutputTokens,
      });
    }
  }

  /**
   * Create a fresh conversation state.
   */
  createState(systemPrompt: string, toolContext?: Partial<ToolContext>): ConversationState {
    return {
      messages: [],
      turnIndex: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      isCompacted: false,
      compactionCount: 0,
      systemPrompt,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      ...(toolContext ? { toolContext } : {}),
    } as ConversationState;
  }

  /**
   * Get the normalizer for external use (e.g., checking context usage).
   */
  getNormalizer(): MessageNormalizer {
    return this.normalizer;
  }

  /**
   * Get the compaction engine for external use.
   */
  getCompactionEngine(): CompactionEngine {
    return this.compactionEngine;
  }
}
