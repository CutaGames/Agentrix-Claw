/**
 * Runtime Seam Service — P0 Unified Runtime Contract
 *
 * Provides a single entry point that both chat paths delegate to,
 * ensuring consistent behavior for:
 * - Session lifecycle
 * - Hook execution (pre/post message, pre/post tool)
 * - MCP tool injection
 * - Memory load/save
 * - Stream event emission
 * - Plugin-provided tool injection
 *
 * The canonical runtime now lives under `/openclaw/proxy`.
 * `/claude/chat` remains only as a compatibility shim and should delegate
 * into the same OpenClaw runtime instead of maintaining a second execution path.
 */
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { HookService } from '../hooks/hook.service';
import { HookEventType } from '../../entities/hook-config.entity';
import { McpServerRegistryService } from '../mcp-registry/mcp-server-registry.service';
import { AgentContextService, ContextBuildOptions } from '../agent-context/agent-context.service';
import { PluginService } from '../plugin/plugin.service';
import { MemorySlotService } from '../agent-context/memory-slot.service';
import { StreamEvent } from './interfaces/stream-event.interface';

// ============================================================
// Runtime Seam Input / Output Types
// ============================================================

export interface RuntimeSeamInput {
  userId: string;
  sessionId: string;
  agentId?: string;
  instanceId?: string;
  instanceName?: string;

  /** The user's message (text or multimodal blocks) */
  message: string | any[];

  /** Conversation history (already formatted as role/content objects) */
  history?: Array<{ role: string; content: string | any[] }>;

  /** Base tools provided by the caller (e.g. skill tools, desktop tools) */
  baseTools?: any[];

  /** Tool call handler from caller */
  onToolCall?: (name: string, args: any) => Promise<any>;

  /** Whether tools should be used for this message */
  needsTools?: boolean;

  /** Model / provider preferences */
  model?: string;
  modelLabel?: string;
  provider?: string;
  userCredentials?: {
    apiKey: string; secretKey?: string; region?: string;
    baseUrl?: string; providerId: string; model?: string;
  };

  /** Permission profile for agent account */
  permissionProfile?: {
    agentAccountId?: string;
    agentAccountName?: string;
    agentAccountStatus?: string;
    deniedToolNames: string[];
  };

  /** Plan mode system prompt addition */
  planModeAddition?: string;

  /** Mode: ask skips tools, agent/plan uses them */
  mode?: 'ask' | 'agent' | 'plan';

  /** Platform: desktop, mobile, web */
  platform?: string;
}

export interface RuntimeSeamResult {
  /** The assistant reply text */
  text: string;

  /** Any tool calls that were executed */
  toolCalls: any[] | null;

  /** The model that was actually used */
  resolvedModel: string;

  /** Stop reason */
  stopReason: string;

  /** Built context metadata */
  contextSummary: {
    systemPromptChars: number;
    memoryTokenEstimate: number;
    hookCount: number;
    mcpToolCount: number;
    pluginToolCount: number;
    totalToolCount: number;
  };
}

@Injectable()
export class RuntimeSeamService {
  private readonly logger = new Logger(RuntimeSeamService.name);

  constructor(
    @Inject(forwardRef(() => HookService))
    private readonly hookService: HookService,
    @Inject(forwardRef(() => McpServerRegistryService))
    private readonly mcpRegistryService: McpServerRegistryService,
    private readonly agentContextService: AgentContextService,
    @Inject(forwardRef(() => PluginService))
    private readonly pluginService: PluginService,
    @Inject(forwardRef(() => MemorySlotService))
    private readonly memorySlotService: MemorySlotService,
  ) {}

  /**
   * Build the unified runtime context for a chat message.
   * Both chat paths call this BEFORE making the LLM call.
   *
   * Returns:
   * - systemPrompt (layered)
   * - effectiveTools (base + MCP + plugin)
   * - effectiveOnToolCall (merged handler)
   * - hookBlocked (if pre-message hook blocks)
   */
  async buildRuntimeContext(input: RuntimeSeamInput): Promise<{
    systemPrompt: string;
    systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
    effectiveTools: any[];
    effectiveOnToolCall: ((name: string, args: any) => Promise<any>) | undefined;
    hookBlocked: boolean;
    hookBlockMessage?: string;
    contextSummary: RuntimeSeamResult['contextSummary'];
  }> {
    const {
      userId, sessionId, agentId, instanceName,
      modelLabel, needsTools, permissionProfile, planModeAddition,
      baseTools = [], onToolCall,
    } = input;

    // 1. Build layered context (system prompt + memory)
    const builtContext = await this.agentContextService.buildContext({
      userId,
      agentId,
      sessionId,
      instanceName: instanceName || 'Agent',
      modelLabel: modelLabel || 'AI',
      needsTools: needsTools !== false,
      permissionProfile: permissionProfile || undefined,
      planModeAddition: planModeAddition || undefined,
    });

    const systemBlocks = this.agentContextService.buildCacheableSystemBlocks(builtContext);

    // 2. Pre-message hooks
    let hookBlocked = false;
    let hookBlockMessage: string | undefined;
    const messageText = typeof input.message === 'string'
      ? input.message
      : (input.message || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');

    try {
      const preHookResults = await this.hookService.executeHooks({
        userId,
        sessionId,
        eventType: HookEventType.MESSAGE_PRE,
        message: messageText,
        model: input.model || '',
      });
      if (this.hookService.hasBlockingResult(preHookResults)) {
        hookBlocked = true;
        hookBlockMessage = 'Message blocked by pre-message hook.';
      }
    } catch (err: any) {
      this.logger.warn(`Pre-message hook error: ${err.message}`);
    }

    // 3. Merge tools: base + MCP + plugin-provided
    const effectiveTools = needsTools !== false ? [...baseTools] : [];
    let mcpToolCount = 0;
    let pluginToolCount = 0;

    if (needsTools !== false) {
      // 3a. MCP server tools
      try {
        const mcpTools = await this.mcpRegistryService.getUserMcpTools(userId);
        for (const mcpTool of mcpTools) {
          effectiveTools.push({
            name: mcpTool.name,
            description: mcpTool.description,
            input_schema: mcpTool.input_schema,
          });
        }
        mcpToolCount = mcpTools.length;
        if (mcpToolCount > 0) this.logger.log(`Injected ${mcpToolCount} MCP tools`);
      } catch (err: any) {
        this.logger.warn(`MCP tools injection failed: ${err.message}`);
      }

      // 3b. Plugin-provided tools
      try {
        const pluginTools = await this.pluginService.getPluginProvidedTools(userId);
        for (const pt of pluginTools) {
          effectiveTools.push({
            name: pt.name,
            description: pt.description,
            input_schema: pt.input_schema,
          });
        }
        pluginToolCount = pluginTools.length;
        if (pluginToolCount > 0) this.logger.log(`Injected ${pluginToolCount} plugin tools`);
      } catch (err: any) {
        this.logger.warn(`Plugin tools injection failed: ${err.message}`);
      }
    }

    // 4. Merge tool call handlers: caller's handler + MCP execution + plugin execution
    const effectiveOnToolCall = needsTools !== false && (onToolCall || mcpToolCount > 0 || pluginToolCount > 0)
      ? async (name: string, args: any) => {
          // Try caller's handler first
          if (onToolCall) {
            const callerResult = await onToolCall(name, args);
            if (callerResult !== undefined) return callerResult;
          }
          // Try MCP tool execution
          if (name.startsWith('mcp_')) {
            try {
              const mcpTools = await this.mcpRegistryService.getUserMcpTools(userId);
              const tool = mcpTools.find(t => t.name === name);
              if (tool) {
                return this.mcpRegistryService.executeToolCall(
                  (tool as any).mcpServerId, name, args,
                );
              }
            } catch (err: any) {
              return { error: `MCP tool execution failed: ${err.message}` };
            }
          }
          // Try plugin tool execution (placeholder — plugins don't have real execution yet)
          if (name.startsWith('plugin_')) {
            return { error: 'Plugin tool execution not yet implemented' };
          }
          return undefined;
        }
      : onToolCall;

    return {
      systemPrompt: builtContext.systemPrompt,
      systemBlocks,
      effectiveTools,
      effectiveOnToolCall,
      hookBlocked,
      hookBlockMessage,
      contextSummary: {
        systemPromptChars: builtContext.systemPrompt.length,
        memoryTokenEstimate: builtContext.memoryTokenEstimate,
        hookCount: 0,
        mcpToolCount,
        pluginToolCount,
        totalToolCount: effectiveTools.length,
      },
    };
  }

  /**
   * Execute post-message hooks and memory save.
   * Both chat paths call this AFTER getting the LLM response.
   */
  async postProcess(input: RuntimeSeamInput, responseText: string, toolCalls?: any[]): Promise<void> {
    const { userId, sessionId, agentId, model } = input;
    const messageText = typeof input.message === 'string'
      ? input.message
      : (input.message || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');

    // 1. Post-message hooks (fire and forget)
    this.hookService.executeHooks({
      userId,
      sessionId,
      eventType: HookEventType.MESSAGE_POST,
      message: responseText,
      model: model || '',
      metadata: { toolCalls },
    }).catch((err: any) => this.logger.warn(`Post-message hook error: ${err.message}`));

    // 2. Memory write-back: flush any pending session memory slots
    try {
      await this.memorySlotService.flushPendingWrites(userId, sessionId, agentId);
    } catch (err: any) {
      this.logger.warn(`Memory flush failed: ${err.message}`);
    }
  }
}
