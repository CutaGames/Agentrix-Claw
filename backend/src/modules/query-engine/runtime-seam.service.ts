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

  runtimeContext?: Record<string, any>;
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
      modelLabel, needsTools, permissionProfile, planModeAddition, runtimeContext,
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

    let systemPrompt = builtContext.systemPrompt;
    let systemBlocks = this.agentContextService.buildCacheableSystemBlocks(builtContext);

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

    // 3. Merge tools: base + MCP + plugin-provided + multi-agent
    const effectiveTools = needsTools !== false ? [...baseTools] : [];
    let mcpToolCount = 0;
    let pluginToolCount = 0;
    let multiAgentToolCount = 0;

    if (needsTools !== false) {
      // 3-zero. Multi-agent — inject `agent_run` so the LLM can spawn
      // parallel sub-agents for complex / decomposable tasks. Schema lives
      // in shared/types/agent-tools.ts but was historically not registered
      // on the LLM tool list (audit 2026-05-28). Anthropic / Bedrock require
      // `input_schema` field; OpenAI / others use `parameters` — we emit
      // input_schema and downstream toOpenAITools() converts as needed.
      try {
        const { AGENT_RUN_TOOL_SCHEMA } = await import('../../../../shared/types/agent-tools');
        effectiveTools.push({
          name: AGENT_RUN_TOOL_SCHEMA.name,
          description: AGENT_RUN_TOOL_SCHEMA.description,
          input_schema: AGENT_RUN_TOOL_SCHEMA.parameters,
        });
        multiAgentToolCount = 1;
      } catch (err: any) {
        this.logger.warn(`agent_run tool injection failed: ${err.message}`);
      }

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

    const toolNames = effectiveTools
      .map((tool) => tool?.name || tool?.function?.name)
      .filter((name): name is string => typeof name === 'string' && name.length > 0);
    const runtimeHints: string[] = [];
    const workspaceHint = typeof runtimeContext?.workspaceHint === 'string' ? runtimeContext.workspaceHint.trim() : '';
    const fileHint = typeof runtimeContext?.fileHint === 'string' ? runtimeContext.fileHint.trim() : '';
    const activeWindowTitle = typeof runtimeContext?.activeWindowTitle === 'string' ? runtimeContext.activeWindowTitle.trim() : '';
    const processName = typeof runtimeContext?.processName === 'string' ? runtimeContext.processName.trim() : '';
    if (toolNames.some((name) => name.startsWith('desktop_'))) {
      runtimeHints.push('- Desktop tools are available in this chat: use desktop_read_file / desktop_list_directory for inspection, and desktop_write_file / desktop_run_command when needed (approval may be required).');
      runtimeHints.push('- For desktop_* tools, treat the selected desktop workspace root as authoritative. Do not invent or rewrite paths into WSL, UNC, Linux, or shell-specific variants unless the user explicitly asks for that transformation. Prefer `.` or workspace-relative subpaths from the selected workspace root.');
      if (workspaceHint) {
        runtimeHints.push(`- Selected desktop workspace root: ${workspaceHint}`);
      }
      if (fileHint) {
        runtimeHints.push(`- Current desktop file hint: ${fileHint}`);
      }
      if (activeWindowTitle) {
        runtimeHints.push(`- Active desktop window: ${activeWindowTitle}`);
      }
      if (processName) {
        runtimeHints.push(`- Active desktop process: ${processName}`);
      }
    }
    if (toolNames.includes('web_search') || toolNames.includes('search_web') || toolNames.includes('web_fetch') || toolNames.includes('open_url')) {
      runtimeHints.push('- Web access tools are available in this chat for weather, current events, docs, and URL fetch/open tasks.');
    }
    if (toolNames.includes('agent_run')) {
      runtimeHints.push('- For COMPLEX or LONG-RUNNING work (auditing a codebase, reviewing many files, multi-step research), call `agent_run` to delegate to a sub-agent. By default `agent_run` BLOCKS this turn until the sub-agent finishes (max 90s) and returns `{summary, status, costUsd}`. Use that summary directly in your reply — do not re-read source files the sub-agent already analyzed. For trivially parallelizable batches you may emit MULTIPLE `agent_run` calls in the same assistant turn (each blocks independently, but Claude can run them in parallel). Only set `wait: false` if you intentionally want fire-and-forget — in that case you MUST cite [sub-task #xxx] in your reply so the user knows results will arrive in the timeline later.');
    }
    if (toolNames.some((name) => name.startsWith('desktop_'))) {
      runtimeHints.push('- For multiple INDEPENDENT desktop reads (e.g. inspecting several files or directories), emit ALL the desktop_read_file / desktop_list_directory tool calls in the SAME assistant turn so they execute in parallel. Do not wait for one tool to return before deciding on the next when the next call does not depend on the previous result.');
    }
    if (toolNames.some((name) => name.startsWith('mcp_'))) {
      runtimeHints.push('- MCP tools are available in this chat; use them instead of claiming MCP/server access is unavailable.');
    }
    if (toolNames.some((name) => name.startsWith('installed_'))) {
      runtimeHints.push('- Installed skills are available in this chat via installed_* tools.');
    }
    if (runtimeHints.length > 0) {
      // Post-tool-use completion discipline: many Claude models (esp. Opus via
      // Bedrock) will stop with `end_turn` right after executing a batch of
      // tools, producing only the short "let me analyze..." preamble without
      // any actual analysis. Force the model to always deliver a substantive
      // answer after reading/inspecting resources.
      const completionDiscipline = `- After any tool use (reading files, listing directories, searching the web, executing commands, etc.), you MUST produce a substantive answer that directly addresses the user's request. Never stop immediately after tool results with only a transitional sentence like "let me analyze" / "让我深入分析". If you promised analysis or a plan, deliver it in the same turn. Only stop when the user's question has been answered or an explicit hand-off point (e.g. awaiting user confirmation) has been reached.`;
      runtimeHints.push(completionDiscipline);
      const runtimeToolBlock = `\n## Runtime Tool Availability\n${runtimeHints.join('\n')}\nOnly claim lack of access if the relevant tool is absent from the callable tool list.\n`;
      systemPrompt += runtimeToolBlock;
      systemBlocks = [...systemBlocks, { type: 'text', text: runtimeToolBlock }];
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
          // Plugin tool execution (#2 ①:真执行,替换原 stub)
          if (name.startsWith('plugin_')) {
            try {
              const pluginResult = await this.pluginService.executePluginTool(userId, name, args);
              if (pluginResult !== undefined) return pluginResult;
              return { error: `Plugin tool "${name}" not found among active plugins` };
            } catch (err: any) {
              return { error: `Plugin tool execution failed: ${err.message}` };
            }
          }
          return undefined;
        }
      : onToolCall;

    return {
      systemPrompt,
      systemBlocks,
      effectiveTools,
      effectiveOnToolCall,
      hookBlocked,
      hookBlockMessage,
      contextSummary: {
        systemPromptChars: systemPrompt.length,
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
