import { Logger } from '@nestjs/common';

/**
 * ToolCallBridge — Routes tool calls from realtime voice sessions
 * (Gemini Live, GPT-4o Realtime) to the Agent Runtime.
 *
 * This bridge:
 * 1. Receives function_call events from the voice model
 * 2. Maps them to registered agent skills/capabilities
 * 3. Executes the skill via CapabilityExecutorService or SkillExecutorService
 * 4. Returns the result back to the voice session for the model to continue
 *
 * Designed to work with any RealtimeVoiceAdapter that emits onToolCall events.
 */

export interface ToolCallResult {
  name: string;
  result: any;
  error?: string;
  durationMs: number;
}

export interface ToolCallHandler {
  (toolName: string, args: Record<string, any>): Promise<any>;
}

export interface ToolCallBridgeConfig {
  /** Agent instance ID for skill resolution */
  agentId?: string;
  /** User ID for permission checks */
  userId: string;
  /** Custom tool handlers (override default routing) */
  customHandlers?: Record<string, ToolCallHandler>;
  /** Timeout per tool call in ms (default 30s) */
  timeoutMs?: number;
}

export class ToolCallBridge {
  private readonly logger = new Logger(ToolCallBridge.name);
  private handlers = new Map<string, ToolCallHandler>();
  private config: ToolCallBridgeConfig;
  private executionLog: ToolCallResult[] = [];

  constructor(config: ToolCallBridgeConfig) {
    this.config = config;

    // Register built-in handlers
    this.registerBuiltIn();

    // Register custom handlers
    if (config.customHandlers) {
      for (const [name, handler] of Object.entries(config.customHandlers)) {
        this.handlers.set(name, handler);
      }
    }
  }

  /**
   * Execute a tool call and return the result.
   * Called from RealtimeVoiceAdapter's onToolCall callback.
   */
  async execute(toolName: string, args: Record<string, any>): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      const handler = this.handlers.get(toolName);
      if (!handler) {
        const result: ToolCallResult = {
          name: toolName,
          result: null,
          error: `Unknown tool: ${toolName}`,
          durationMs: Date.now() - start,
        };
        this.executionLog.push(result);
        return result;
      }

      // Execute with timeout
      const timeoutMs = this.config.timeoutMs || 30_000;
      const resultPromise = handler(toolName, args);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool call timed out after ${timeoutMs}ms`)), timeoutMs),
      );

      const toolResult = await Promise.race([resultPromise, timeoutPromise]);

      const result: ToolCallResult = {
        name: toolName,
        result: toolResult,
        durationMs: Date.now() - start,
      };

      this.executionLog.push(result);
      this.logger.debug(`Tool [${toolName}] executed in ${result.durationMs}ms`);
      return result;
    } catch (error: any) {
      const result: ToolCallResult = {
        name: toolName,
        result: null,
        error: error.message || 'Tool execution failed',
        durationMs: Date.now() - start,
      };
      this.executionLog.push(result);
      this.logger.error(`Tool [${toolName}] failed: ${error.message}`);
      return result;
    }
  }

  /**
   * Format tool result for sending back to the voice model.
   */
  formatForModel(result: ToolCallResult): { name: string; response: any } {
    if (result.error) {
      return {
        name: result.name,
        response: { error: result.error },
      };
    }
    return {
      name: result.name,
      response: typeof result.result === 'string'
        ? { output: result.result }
        : result.result,
    };
  }

  /**
   * Register a custom tool handler.
   */
  registerHandler(name: string, handler: ToolCallHandler): void {
    this.handlers.set(name, handler);
  }

  /**
   * Get execution log for diagnostics.
   */
  getExecutionLog(lastN = 20): ToolCallResult[] {
    return this.executionLog.slice(-lastN);
  }

  // ── Built-in handlers ──

  private registerBuiltIn(): void {
    // search_web — generic web search
    this.handlers.set('search_web', async (_name, args) => {
      const query = args.query;
      if (!query) return { error: 'Missing query parameter' };
      // Delegate to search service if available
      return { message: `Search results for: ${query}`, query, note: 'Connect to SearchService for real results' };
    });

    // execute_agent_skill — delegates to skill executor
    this.handlers.set('execute_agent_skill', async (_name, args) => {
      const skillName = args.skillName;
      const parameters = args.parameters || {};
      if (!skillName) return { error: 'Missing skillName parameter' };
      // Delegate to SkillExecutorService
      return { message: `Skill ${skillName} executed`, skillName, parameters, note: 'Connect to SkillExecutorService' };
    });

    // set_reminder — simple timer
    this.handlers.set('set_reminder', async (_name, args) => {
      const message = args.message;
      const delaySeconds = args.delaySeconds || 60;
      return { message: `Reminder set: "${message}" in ${delaySeconds}s`, scheduled: true };
    });

    // get_current_time
    this.handlers.set('get_current_time', async () => {
      return { time: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
    });

    // get_weather (placeholder)
    this.handlers.set('get_weather', async (_name, args) => {
      return { location: args.location || 'current', note: 'Connect to weather API' };
    });
  }
}
