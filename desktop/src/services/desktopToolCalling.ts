/**
 * Desktop Local Tool Calling Service
 *
 * Provides tool definitions and execution for the desktop Tauri client's
 * local llama-server sidecar. Uses the OpenAI-compatible /v1/chat/completions
 * endpoint with `tools` parameter (requires --jinja flag on llama-server).
 *
 * Tool calling flow:
 *   1. Call chatWithTools() — sidecar returns tool_calls or text
 *   2. Execute tool calls locally
 *   3. Feed results back as tool messages → re-call
 *   4. Stream final natural-language response
 */

import type { LocalLLMSidecar, ChatMessage, ToolDef, ToolCallResult } from "./localLLM";

// ── Tool Definitions (OpenAI format) ───────────────────

export const DESKTOP_LOCAL_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description:
        "Get the current date, time, and timezone. Use this when the user asks about the current time or date.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_memory",
      description:
        "Recall relevant memories and knowledge stored by this agent. Use this to look up previously saved information.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The topic or question to search memories for",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "Save important information to agent memory for later recall. Use this to remember facts, preferences, or instructions.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description:
              'A short label/key for this memory (e.g. "user_name", "favorite_color")',
          },
          value: {
            type: "string",
            description: "The information to remember",
          },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_skills",
      description:
        "Search for available skills/plugins on the Agentrix marketplace. Skills add new capabilities to the agent.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              'Search query for skills (e.g. "weather", "translation", "code")',
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_installed_skills",
      description:
        "List all skills currently installed on this agent instance.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ── Tool Execution ─────────────────────────────────────

export interface DesktopToolContext {
  instanceId?: string;
  agentId?: string;
  authToken?: string;
}

async function executeToolCall(
  toolCall: ToolCallResult,
  context: DesktopToolContext,
): Promise<string> {
  const name = toolCall.function.name;
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.function.arguments || "{}");
  } catch {
    return JSON.stringify({ error: `Invalid arguments for tool ${name}` });
  }

  try {
    switch (name) {
      case "get_current_time":
        return executeGetCurrentTime();

      case "recall_memory":
        return await executeRecallMemory(String(args.query || ""), context);

      case "save_memory":
        return await executeSaveMemory(
          String(args.key || ""),
          String(args.value || ""),
          context,
        );

      case "search_skills":
        return await executeSearchSkills(
          String(args.query || ""),
          context,
        );

      case "get_installed_skills":
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
  context: DesktopToolContext,
): Promise<string> {
  if (!context.authToken || !context.agentId) {
    return JSON.stringify({
      memories: [],
      note: "No agent context available for memory recall",
    });
  }

  try {
    const { recallMemorySlots } = await import("./extensionApi");
    const memories = await recallMemorySlots(context.authToken, {
      scopes: ["agent", "user"],
      limit: 5,
    });

    if (!memories?.length) {
      return JSON.stringify({
        memories: [],
        note: `No memories found for "${query}"`,
      });
    }

    return JSON.stringify({
      memories: (Array.isArray(memories) ? memories : []).map((m: any) => ({
        key: m.key,
        value:
          typeof m.value === "string"
            ? m.value.slice(0, 500)
            : JSON.stringify(m.value).slice(0, 500),
        scope: m.scope,
      })),
    });
  } catch {
    return JSON.stringify({
      memories: [],
      note: "Memory recall service unavailable",
    });
  }
}

async function executeSaveMemory(
  key: string,
  value: string,
  context: DesktopToolContext,
): Promise<string> {
  if (!context.authToken || !context.agentId) {
    return JSON.stringify({
      saved: false,
      note: "No agent context available for memory storage",
    });
  }

  try {
    const { writeMemorySlot } = await import("./extensionApi");
    await writeMemorySlot(context.authToken, {
      key,
      value,
      scope: "agent",
      type: "knowledge",
    });
    return JSON.stringify({ saved: true, key });
  } catch {
    return JSON.stringify({ saved: false, note: "Memory write failed" });
  }
}

async function executeSearchSkills(
  query: string,
  context: DesktopToolContext,
): Promise<string> {
  if (!context.authToken) {
    return JSON.stringify({
      skills: [],
      note: "Auth required for skill search",
    });
  }

  try {
    // Desktop doesn't have a dedicated skill search API yet — use backend
    const API_BASE = (window as any).__AGENTRIX_API_BASE__ || 'https://api.agentrix.top';
    const res = await fetch(`${API_BASE}/skills/search?q=${encodeURIComponent(query)}&limit=5`, {
      headers: context.authToken ? { Authorization: `Bearer ${context.authToken}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const results = await res.json();

    if (!results?.length) {
      return JSON.stringify({
        skills: [],
        note: `No skills found for "${query}"`,
      });
    }

    return JSON.stringify({
      skills: results.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description?.slice(0, 200),
      })),
    });
  } catch {
    return JSON.stringify({
      skills: [],
      note: "Skill search service unavailable",
    });
  }
}

async function executeGetInstalledSkills(
  context: DesktopToolContext,
): Promise<string> {
  if (!context.authToken || !context.instanceId) {
    return JSON.stringify({ skills: [], note: "No instance context available" });
  }

  try {
    // Desktop doesn't have a dedicated instance skills API yet — use backend
    const API_BASE = (window as any).__AGENTRIX_API_BASE__ || 'https://api.agentrix.top';
    const res = await fetch(`${API_BASE}/openclaw/proxy/${context.instanceId}/skills`, {
      headers: context.authToken ? { Authorization: `Bearer ${context.authToken}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const skills = await res.json();
    const enabled = (skills || []).filter((s: any) => s.enabled);

    return JSON.stringify({
      skills: enabled.map((s: any) => ({
        id: s.id,
        name: s.name,
        version: s.version,
      })),
    });
  } catch {
    return JSON.stringify({
      skills: [],
      note: "Skills service unavailable",
    });
  }
}

// ── Generic Response Parser ────────────────────────────

function parseToolResponseText(text: string): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return trimmed;

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed.response === "string") {
      return parsed.response;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

// ── Tool-Calling Loop ──────────────────────────────────

const MAX_TOOL_ITERATIONS = 5;

export interface DesktopToolCallingOptions {
  instanceId?: string;
  agentId?: string;
  authToken?: string;
  temperature?: number;
  maxTokens?: number;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onToolResult?: (name: string, result: string) => void;
  abortSignal?: AbortSignal;
}

/**
 * Run a tool-calling agentic loop with the desktop local llama-server sidecar.
 *
 * Flow:
 * 1. Call chatWithTools() via OpenAI-compatible API (--jinja enabled)
 * 2. If tool_calls: execute tools, append results, loop (up to MAX_TOOL_ITERATIONS)
 * 3. Final response: return text for streaming by the caller
 *
 * Returns the final assistant text (after tool resolution).
 */
export async function runDesktopToolCallingLoop(
  sidecar: LocalLLMSidecar,
  messages: ChatMessage[],
  options: DesktopToolCallingOptions,
): Promise<{ text: string; usedTools: boolean }> {
  const toolContext: DesktopToolContext = {
    instanceId: options.instanceId,
    agentId: options.agentId,
    authToken: options.authToken,
  };

  const workingMessages: ChatMessage[] = [...messages];
  let usedTools = false;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (options.abortSignal?.aborted) {
      return { text: "", usedTools };
    }

    const result = await sidecar.chatWithTools(workingMessages, DESKTOP_LOCAL_TOOLS, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      tool_choice: "auto",
    });

    const choice = result.choices?.[0];
    if (!choice) {
      return { text: "", usedTools };
    }

    const toolCalls = choice.message?.tool_calls;
    if (!toolCalls?.length) {
      // No tool calls — final text response
      const responseText = parseToolResponseText(choice.message?.content || "");
      return { text: responseText, usedTools };
    }

    // Model called tools
    usedTools = true;

    // Add assistant message with tool calls
    workingMessages.push({
      role: "assistant",
      content: choice.message?.content || "",
      tool_calls: toolCalls,
    });

    // Execute each tool call and add results
    for (const tc of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {}

      options.onToolCall?.(tc.function.name, args);

      const toolResult = await executeToolCall(tc, toolContext);
      options.onToolResult?.(tc.function.name, toolResult);

      workingMessages.push({
        role: "tool",
        content: toolResult,
        tool_call_id: tc.id,
      });
    }
  }

  // Max iterations reached — get final response without tools
  if (options.abortSignal?.aborted) {
    return { text: "", usedTools };
  }

  const finalResult = await sidecar.chat(workingMessages, {
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  });

  const finalText = finalResult.choices?.[0]?.message?.content || "";
  return { text: parseToolResponseText(finalText), usedTools };
}
