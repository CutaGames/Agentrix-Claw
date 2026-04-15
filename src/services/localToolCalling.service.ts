/**
 * Local Tool Calling Service
 *
 * Provides tool definitions and execution for local on-device LLM inference.
 * When the local model (Gemma 3n E2B/E4B) supports tool calling via llama.rn,
 * this service manages:
 *   1. Tool schema definitions (OpenAI-compatible format)
 *   2. Tool execution (dispatching calls to existing services)
 *   3. Agentic tool-calling loop (completion → tool calls → execute → re-complete)
 */

import type { ToolDefinition, ToolCall } from 'llama.rn';
import type { MobileLocalChatMessage } from './mobileLocalInference.service';

// ── Tool Definitions ───────────────────────────────────

export const LOCAL_AGENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current date, time, and timezone. Use this when the user asks about the current time or date.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall_memory',
      description: 'Recall relevant memories and knowledge stored by this agent. Use this to look up previously saved information.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The topic or question to search memories for',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: 'Save important information to agent memory for later recall. Use this to remember facts, preferences, or instructions.',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'A short label/key for this memory (e.g. "user_name", "favorite_color")',
          },
          value: {
            type: 'string',
            description: 'The information to remember',
          },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_skills',
      description: 'Search for available skills/plugins on the Agentrix marketplace. Skills add new capabilities to the agent.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for skills (e.g. "weather", "translation", "code")',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_installed_skills',
      description: 'List all skills currently installed on this agent instance.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

// ── Tool Execution ─────────────────────────────────────

interface ToolExecutionContext {
  instanceId?: string;
  agentId?: string;
}

export async function executeToolCall(
  toolCall: ToolCall,
  context: ToolExecutionContext,
): Promise<string> {
  const name = toolCall.function.name;
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    return JSON.stringify({ error: `Invalid arguments for tool ${name}` });
  }

  try {
    switch (name) {
      case 'get_current_time':
        return executeGetCurrentTime();

      case 'recall_memory':
        return await executeRecallMemory(String(args.query || ''), context);

      case 'save_memory':
        return await executeSaveMemory(
          String(args.key || ''),
          String(args.value || ''),
          context,
        );

      case 'search_skills':
        return await executeSearchSkills(String(args.query || ''));

      case 'get_installed_skills':
        return await executeGetInstalledSkills(context);

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Tool ${name} failed: ${message}` });
  }
}

function executeGetCurrentTime(): string {
  const now = new Date();
  return JSON.stringify({
    iso: now.toISOString(),
    local: now.toLocaleString(),
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: now.getTime(),
  });
}

async function executeRecallMemory(
  query: string,
  context: ToolExecutionContext,
): Promise<string> {
  if (!context.agentId) {
    return JSON.stringify({ memories: [], note: 'No agent context available for memory recall' });
  }

  const { recallMemories } = await import('./memorySlot.api');
  const memories = await recallMemories({
    agentId: context.agentId,
    query,
    limit: 5,
    scopes: ['agent', 'user'],
  });

  if (!memories?.length) {
    return JSON.stringify({ memories: [], note: `No memories found for "${query}"` });
  }

  return JSON.stringify({
    memories: memories.map((m) => ({
      key: m.key,
      value: typeof m.value === 'string' ? m.value.slice(0, 500) : JSON.stringify(m.value).slice(0, 500),
      scope: m.scope,
    })),
  });
}

async function executeSaveMemory(
  key: string,
  value: string,
  context: ToolExecutionContext,
): Promise<string> {
  if (!context.agentId) {
    return JSON.stringify({ saved: false, note: 'No agent context available for memory storage' });
  }

  const { writeMemorySlot } = await import('./memorySlot.api');
  await writeMemorySlot({
    key,
    value,
    scope: 'agent',
    type: 'knowledge',
    agentId: context.agentId,
  });

  return JSON.stringify({ saved: true, key });
}

async function executeSearchSkills(query: string): Promise<string> {
  const { agentSkillSearch } = await import('./openclaw.service');
  const results = await agentSkillSearch(query, { limit: 5 });

  if (!results?.length) {
    return JSON.stringify({ skills: [], note: `No skills found for "${query}"` });
  }

  return JSON.stringify({
    skills: results.map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description?.slice(0, 200),
    })),
  });
}

async function executeGetInstalledSkills(
  context: ToolExecutionContext,
): Promise<string> {
  if (!context.instanceId) {
    return JSON.stringify({ skills: [], note: 'No instance context available' });
  }

  const { getInstanceSkills } = await import('./openclaw.service');
  const skills = await getInstanceSkills(context.instanceId);
  const enabled = (skills || []).filter((s) => s.enabled);

  return JSON.stringify({
    skills: enabled.map((s) => ({
      id: s.id,
      name: s.name,
      version: s.version,
    })),
  });
}

// ── Generic Response Parser ────────────────────────────
// llama.cpp Generic format wraps text responses in {"response": "..."} JSON
// when tools are provided but the model decides not to call any tool.

export function parseToolResponseText(text: string): string {
  if (!text) return '';

  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return trimmed;

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed.response === 'string') {
      return parsed.response;
    }
    // Not a generic response wrapper — return original text
    return trimmed;
  } catch {
    // Not valid JSON — return as-is
    return trimmed;
  }
}

// ── Tool-Calling Loop ──────────────────────────────────

const MAX_TOOL_ITERATIONS = 5;

export interface ToolCallingOptions {
  model?: string;
  instanceId?: string;
  agentId?: string;
  temperature?: number;
  maxTokens?: number;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
  onStreamToken?: (chunk: string) => void;
  abortSignal?: AbortSignal;
}

/**
 * Run a tool-calling agentic loop with the local model.
 *
 * Flow:
 * 1. Call completion WITH tools (no streaming — output is JSON in Generic format)
 * 2. If tool_calls: execute tools, append results, loop (up to MAX_TOOL_ITERATIONS)
 * 3. Final response: call completion WITHOUT tools, WITH streaming for natural output
 *
 * Returns the final assistant text.
 */
export async function runLocalToolCallingLoop(
  messages: MobileLocalChatMessage[],
  options: ToolCallingOptions,
): Promise<{ text: string; usedTools: boolean }> {
  const bridge = (globalThis as { __AGENTRIX_LOCAL_LLM__?: any }).__AGENTRIX_LOCAL_LLM__;
  if (!bridge?.generateWithTools) {
    throw new Error('Local LLM bridge does not support tool calling');
  }

  const toolContext: ToolExecutionContext = {
    instanceId: options.instanceId,
    agentId: options.agentId,
  };

  // Working message list (mutable copy)
  const workingMessages: any[] = [...messages];
  let usedTools = false;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (options.abortSignal?.aborted) {
      return { text: '', usedTools };
    }

    // Completion with tools (no streaming — Generic format outputs JSON)
    const result = await bridge.generateWithTools({
      model: options.model,
      messages: workingMessages,
      tools: LOCAL_AGENT_TOOLS,
      tool_choice: 'auto',
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });

    const toolCalls: ToolCall[] = result.tool_calls || [];

    if (!toolCalls.length) {
      // No tool calls — model wants to respond directly
      const responseText = parseToolResponseText(result.text);
      return { text: responseText, usedTools };
    }

    // Model called tools — execute them
    usedTools = true;

    // Add assistant message with tool calls
    workingMessages.push({
      role: 'assistant' as const,
      content: result.text || '',
      tool_calls: toolCalls.map((tc, i) => ({
        id: tc.id || `call_${iteration}_${i}`,
        type: 'function' as const,
        function: tc.function,
      })),
    });

    // Execute each tool call and add results
    for (const tc of toolCalls) {
      const callId = tc.id || `call_${iteration}`;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {}

      options.onToolCall?.(tc.function.name, args);

      const toolResult = await executeToolCall(tc, toolContext);
      options.onToolResult?.(tc.function.name, toolResult);

      workingMessages.push({
        role: 'tool' as const,
        content: toolResult,
        tool_call_id: callId,
      });
    }
  }

  // Max iterations reached — do final completion without tools to get natural text
  if (options.abortSignal?.aborted) {
    return { text: '', usedTools };
  }

  // Final streaming response (without tools)
  if (typeof bridge.generateStreamWithTools === 'function' && options.onStreamToken) {
    const chunks = await bridge.generateStreamWithTools({
      model: options.model,
      messages: workingMessages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      onToken: options.onStreamToken,
    });
    return { text: chunks.join(''), usedTools };
  }

  // Fallback: non-streaming final response
  const finalResult = await bridge.generateWithTools({
    model: options.model,
    messages: workingMessages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  });

  return { text: parseToolResponseText(finalResult.text), usedTools };
}
