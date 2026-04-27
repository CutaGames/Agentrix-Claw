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
import { compactChatMessagesForContext } from "./contextWindow";
import { API_BASE } from "./store";

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
  {
    type: "function",
    function: {
      name: "search_workspace_files",
      description:
        "Search the selected local workspace for text, symbols, function names, error messages, or code references. Use this before reading many files one by one.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Plain text or symbol to search for",
          },
          path_filter: {
            type: "string",
            description: "Optional path substring such as src/, desktop/src/, .tsx, or commands.rs",
          },
          max_results: {
            type: "number",
            description: "Maximum matches to return, default 20, max 50",
          },
          case_sensitive: {
            type: "boolean",
            description: "Whether matching should be case-sensitive",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "index_workspace_code",
      description:
        "Build or refresh the selected workspace code intelligence index: extracted symbols plus local semantic vectors. Use before symbol or semantic code search when the workspace may have changed.",
      parameters: {
        type: "object",
        properties: {
          max_files: {
            type: "number",
            description: "Maximum source files to index, default 300, max 2000",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_workspace_symbols",
      description:
        "Search indexed workspace symbols such as classes, functions, interfaces, Rust structs, and modules. Use after index_workspace_code for code navigation.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Symbol name or partial name to search for",
          },
          max_results: {
            type: "number",
            description: "Maximum symbols to return, default 30, max 100",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "semantic_search_workspace_code",
      description:
        "Search indexed code chunks by meaning using the local semantic vector index. Use after index_workspace_code for fuzzy code discovery.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language or code concept query",
          },
          max_results: {
            type: "number",
            description: "Maximum code chunks to return, default 10, max 50",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_auto_repair_command",
      description:
        "Run a local build/test command, parse diagnostics, and optionally apply exact workspace text edits before retrying. First call without edits to diagnose; if it returns needs_patch, call again with edits [{file, old_text, new_text}] to apply and rerun.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Build/test/check command to run locally",
          },
          working_directory: {
            type: "string",
            description: "Optional command working directory",
          },
          timeout_ms: {
            type: "number",
            description: "Command timeout in milliseconds, default 60000, max 600000",
          },
          edits: {
            type: "array",
            description: "Optional exact workspace text edits to apply before rerunning the command",
            items: {
              type: "object",
              properties: {
                file: { type: "string", description: "Workspace-relative file path" },
                old_text: { type: "string", description: "Exact text to replace; must appear once" },
                new_text: { type: "string", description: "Replacement text" },
              },
              required: ["file", "old_text", "new_text"],
            },
          },
        },
        required: ["command"],
      },
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

      case "search_workspace_files":
        return await executeSearchWorkspaceFiles(args);

      case "index_workspace_code":
        return await executeIndexWorkspaceCode(args);

      case "search_workspace_symbols":
        return await executeSearchWorkspaceSymbols(args);

      case "semantic_search_workspace_code":
        return await executeSemanticSearchWorkspaceCode(args);

      case "run_auto_repair_command":
        return await executeRunAutoRepairCommand(args);

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Tool ${name} failed: ${message}` });
  }
}

function clampMaxResults(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

async function executeSearchWorkspaceFiles(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query || "").trim();
  if (!query) {
    return JSON.stringify({ error: "query is required" });
  }

  try {
    const { searchWorkspaceFiles } = await import("./workspace");
    const result = await searchWorkspaceFiles({
      query,
      pathFilter: typeof args.path_filter === "string" ? args.path_filter : undefined,
      maxResults: clampMaxResults(args.max_results),
      caseSensitive: args.case_sensitive === true,
    });

    return JSON.stringify({
      query: result.query,
      root: result.root,
      truncated: result.truncated,
      durationMs: result.durationMs,
      matches: result.matches.map((match) => ({
        path: match.path,
        lineNumber: match.lineNumber,
        column: match.column,
        lineText: match.lineText.slice(0, 500),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Workspace search failed: ${message}` });
  }
}

async function executeIndexWorkspaceCode(args: Record<string, unknown>): Promise<string> {
  try {
    const { indexWorkspaceCode } = await import("./codeIntelligence");
    const result = await indexWorkspaceCode({
      maxFiles: clampMaxResultsForCodeIndex(args.max_files),
    });
    return JSON.stringify(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Code index failed: ${message}` });
  }
}

async function executeSearchWorkspaceSymbols(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query || "").trim();
  if (!query) return JSON.stringify({ error: "query is required" });
  try {
    const { searchWorkspaceSymbols, getWorkspaceCodeIndexSummary } = await import("./codeIntelligence");
    const symbols = searchWorkspaceSymbols(query, clampSymbolResults(args.max_results));
    return JSON.stringify({
      index: getWorkspaceCodeIndexSummary(),
      symbols,
      note: symbols.length === 0 ? "No symbols matched. Run index_workspace_code if the index is empty or stale." : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Symbol search failed: ${message}` });
  }
}

async function executeSemanticSearchWorkspaceCode(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query || "").trim();
  if (!query) return JSON.stringify({ error: "query is required" });
  try {
    const { semanticSearchWorkspaceCode, getWorkspaceCodeIndexSummary } = await import("./codeIntelligence");
    const results = semanticSearchWorkspaceCode(query, clampSemanticResults(args.max_results));
    return JSON.stringify({
      index: getWorkspaceCodeIndexSummary(),
      results,
      note: results.length === 0 ? "No code chunks matched. Run index_workspace_code if the index is empty or stale." : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Semantic code search failed: ${message}` });
  }
}

async function executeRunAutoRepairCommand(args: Record<string, unknown>): Promise<string> {
  const command = String(args.command || "").trim();
  if (!command) return JSON.stringify({ error: "command is required" });
  try {
    const { runDesktopAutoRepairCommand } = await import("./autoRepair");
    const result = await runDesktopAutoRepairCommand({
      command,
      workingDirectory: typeof args.working_directory === "string" ? args.working_directory : undefined,
      timeoutMs: typeof args.timeout_ms === "number" ? args.timeout_ms : undefined,
      edits: Array.isArray(args.edits) ? args.edits as any : undefined,
    });
    return JSON.stringify(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Auto repair command failed: ${message}` });
  }
}

function clampMaxResultsForCodeIndex(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 300;
  return Math.max(1, Math.min(2000, Math.floor(parsed)));
}

function clampSymbolResults(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function clampSemanticResults(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
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
const MAX_PARALLEL_TOOL_CALLS = 8;
const TOOL_CONTEXT_TOKEN_BUDGET = 12000;

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

async function executeToolCallWithCallbacks(
  toolCall: ToolCallResult,
  toolContext: DesktopToolContext,
  options: DesktopToolCallingOptions,
): Promise<ChatMessage> {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.function.arguments || "{}");
  } catch {}

  options.onToolCall?.(toolCall.function.name, args);
  const toolResult = await executeToolCall(toolCall, toolContext);
  options.onToolResult?.(toolCall.function.name, toolResult);

  return {
    role: "tool",
    content: toolResult,
    tool_call_id: toolCall.id,
  };
}

async function executeToolCallsInParallel(
  toolCalls: ToolCallResult[],
  toolContext: DesktopToolContext,
  options: DesktopToolCallingOptions,
): Promise<ChatMessage[]> {
  const results: ChatMessage[] = [];
  for (let index = 0; index < toolCalls.length; index += MAX_PARALLEL_TOOL_CALLS) {
    if (options.abortSignal?.aborted) break;
    const batch = toolCalls.slice(index, index + MAX_PARALLEL_TOOL_CALLS);
    const batchResults = await Promise.all(
      batch.map((toolCall) => executeToolCallWithCallbacks(toolCall, toolContext, options)),
    );
    results.push(...batchResults);
  }
  return results;
}

function compactToolContextMessages(messages: ChatMessage[]): ChatMessage[] {
  return compactChatMessagesForContext(messages, {
    maxTokens: TOOL_CONTEXT_TOKEN_BUDGET,
    minRecentMessages: 14,
    maxSummaryChars: 2200,
  }).messages;
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

  let workingMessages: ChatMessage[] = compactToolContextMessages([...messages]);
  let usedTools = false;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (options.abortSignal?.aborted) {
      return { text: "", usedTools };
    }

    workingMessages = compactToolContextMessages(workingMessages);
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

    const toolResultMessages = await executeToolCallsInParallel(toolCalls, toolContext, options);
    workingMessages.push(...toolResultMessages);
  }

  // Max iterations reached — get final response without tools
  if (options.abortSignal?.aborted) {
    return { text: "", usedTools };
  }

  workingMessages = compactToolContextMessages(workingMessages);
  const finalResult = await sidecar.chat(workingMessages, {
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  });

  const finalText = finalResult.choices?.[0]?.message?.content || "";
  return { text: parseToolResponseText(finalText), usedTools };
}
