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

function isAbsolutePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("~");
}

function normalizeWorkspaceRelativePath(value: unknown, allowEmpty = false): string {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw || raw === ".") {
    if (allowEmpty) return "";
    throw new Error("path is required");
  }
  if (isAbsolutePath(raw)) {
    throw new Error("Use a workspace-relative path, not an absolute path.");
  }
  const segments = raw.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    throw new Error("Path must stay inside the selected workspace.");
  }
  return segments.join("/");
}

function joinWorkspacePath(workspaceDir: string, relativePath: string): string {
  const safeRelativePath = normalizeWorkspaceRelativePath(relativePath, true);
  if (!safeRelativePath) {
    return workspaceDir;
  }
  const separator = workspaceDir.includes("\\") ? "\\" : "/";
  return `${workspaceDir.replace(/[\\/]+$/g, "")}${separator}${safeRelativePath.replace(/\//g, separator)}`;
}

const KNOWN_WORKSPACE_HINT_PREFIXES = [
  "desktop",
  "backend",
  "frontend",
  "docs",
  "src",
  "tests",
  "android",
  "ios",
  "contract",
  "shared",
  "scripts",
  "sdk-js",
  "local-agent",
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractWorkspacePathHint(messages: ChatMessage[]): string | undefined {
  const recentUserTexts = [...messages]
    .reverse()
    .filter((message) => message.role === "user" && typeof message.content === "string" && message.content.trim())
    .slice(0, 6)
    .map((message) => message.content);

  for (const text of recentUserTexts) {
    if (/(根目录|仓库根目录|workspace root|repo root|project root)/i.test(text)) {
      return undefined;
    }

    const explicitPathMatches = text.match(/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+/g) || [];
    for (const rawMatch of explicitPathMatches) {
      const normalizedMatch = rawMatch.replace(/^[.\/]+/, "").replace(/[),.;:!?]+$/g, "");
      if (!normalizedMatch || isAbsolutePath(normalizedMatch)) {
        continue;
      }

      const segments = normalizedMatch.split("/").filter(Boolean);
      if (segments.some((segment) => segment === "..")) {
        continue;
      }

      const lastSegment = segments[segments.length - 1] || "";
      const directorySegments = /\.[a-z0-9]+$/i.test(lastSegment) ? segments.slice(0, -1) : segments;
      if (directorySegments.length > 0) {
        return directorySegments.join("/");
      }
    }

    for (const prefix of KNOWN_WORKSPACE_HINT_PREFIXES) {
      const pattern = new RegExp(
        "(?:^|[\\s\"'(`])" + escapeRegExp(prefix) + "(?:[\\\\/]|\\s*(?:目录|文件夹|folder|dir|directory|下|中)\\b)",
        "i",
      );
      if (pattern.test(text)) {
        return prefix;
      }
    }
  }

  return undefined;
}

function applyWorkspacePathHint(relativePath: string, context: DesktopToolContext) {
  const normalizedPath = normalizeWorkspaceRelativePath(relativePath, true);
  if (!normalizedPath || !context.workspacePathHint || normalizedPath.includes("/")) {
    return normalizedPath;
  }
  return normalizeWorkspaceRelativePath(`${context.workspacePathHint}/${normalizedPath}`);
}

function parseLineNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(1, Math.floor(parsed));
}

function clampCommandTimeout(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 60_000;
  }
  return Math.max(1_000, Math.min(10 * 60_000, Math.floor(parsed)));
}

async function requireSelectedWorkspace(): Promise<string> {
  const { getWorkspaceDir } = await import("./workspace");
  const workspaceDir = await getWorkspaceDir();
  if (!workspaceDir) {
    throw new Error("No workspace selected. Choose a workspace folder in Settings before using workspace tools.");
  }
  return workspaceDir;
}

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
      name: "list_directory",
      description:
        "List files and directories inside the selected workspace. Paths are resolved from the workspace root, not the current chat topic. Include explicit prefixes like desktop/, backend/, docs/, or src/ when targeting subdirectories. Use an empty path to inspect the workspace root.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Workspace-relative directory path. Leave empty to list the workspace root.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a file from the selected workspace. Paths are workspace-root relative, so include explicit prefixes like desktop/src/... or backend/src/... instead of bare filenames when the target is inside a subdirectory. Provide start_line and end_line for large files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Workspace-relative file path to read",
          },
          start_line: {
            type: "number",
            description: "1-based start line for a partial read (optional)",
          },
          end_line: {
            type: "number",
            description: "1-based inclusive end line for a partial read (optional)",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write content to a file inside the selected workspace. Paths are workspace-root relative, so include explicit prefixes like desktop/, backend/, docs/, or src/ when writing into a subdirectory. Creates parent directories if needed. Requires user approval.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Workspace-relative file path to write",
          },
          content: {
            type: "string",
            description: "New file content",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a shell command with the selected workspace as the default working directory. When the command should run inside a subdirectory, set working_directory explicitly with a workspace-root-relative path like desktop or backend. Use this for tasks like build, test, mkdir, move, or delete after approval.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "Shell command to execute",
          },
          working_directory: {
            type: "string",
            description: "Optional workspace-relative working directory",
          },
          timeout_ms: {
            type: "number",
            description: "Maximum runtime in milliseconds, default 60000, max 600000",
          },
        },
        required: ["command"],
      },
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
      name: "git_push",
      description:
        "Push the current branch to a remote. Use only when the user explicitly asks to push code or trigger remote CI.",
      parameters: {
        type: "object",
        properties: {
          remote: { type: "string", description: "Remote name, defaults to origin" },
          branch: { type: "string", description: "Branch name, defaults to current branch" },
          set_upstream: { type: "boolean", description: "Whether to pass --set-upstream" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_pull",
      description:
        "Pull the current branch from a remote. Use before integrating remote changes; defaults to --autostash.",
      parameters: {
        type: "object",
        properties: {
          remote: { type: "string", description: "Remote name, defaults to origin" },
          branch: { type: "string", description: "Branch name, defaults to current branch" },
          rebase: { type: "boolean", description: "Whether to pull with --rebase" },
          autostash: { type: "boolean", description: "Whether to pull with --autostash, default true" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_checkout",
      description:
        "Switch to an existing branch or create a new branch. Do not use for destructive resets.",
      parameters: {
        type: "object",
        properties: {
          branch: { type: "string", description: "Branch name to check out" },
          create: { type: "boolean", description: "Create the branch with -b" },
        },
        required: ["branch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git_stash",
      description:
        "Run git stash push/list/pop. Prefer push before risky branch switches when there are local changes.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["push", "list", "pop"], description: "Stash action, defaults to push" },
          message: { type: "string", description: "Optional stash message for push" },
          include_untracked: { type: "boolean", description: "Include untracked files when pushing" },
        },
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
  sessionId?: string;
  workspacePathHint?: string;
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

      case "list_directory":
        return await executeListDirectory(args, context);

      case "read_file":
        return await executeReadFile(args, context);

      case "write_file":
        return await executeWriteFile(args, context);

      case "run_command":
        return await executeRunCommand(args, context);

      case "index_workspace_code":
        return await executeIndexWorkspaceCode(args);

      case "search_workspace_symbols":
        return await executeSearchWorkspaceSymbols(args);

      case "semantic_search_workspace_code":
        return await executeSemanticSearchWorkspaceCode(args);

      case "git_push":
        return await executeGitPush(args);

      case "git_pull":
        return await executeGitPull(args);

      case "git_checkout":
        return await executeGitCheckout(args);

      case "git_stash":
        return await executeGitStash(args);

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

async function executeListDirectory(args: Record<string, unknown>, context: DesktopToolContext): Promise<string> {
  const relativePath = normalizeWorkspaceRelativePath(args.path, true);
  try {
    const workspaceDir = await requireSelectedWorkspace();
    const { listWorkspaceDir } = await import("./workspace");
    const hintedPath = applyWorkspacePathHint(relativePath, context);
    const entries = await listWorkspaceDir(hintedPath);
    return JSON.stringify({
      workspaceRoot: workspaceDir,
      path: hintedPath,
      entries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `List directory failed: ${message}` });
  }
}

async function executeReadFile(args: Record<string, unknown>, context: DesktopToolContext): Promise<string> {
  let relativePath = "";
  try {
    relativePath = normalizeWorkspaceRelativePath(args.path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Read file failed: ${message}` });
  }

  try {
    const workspaceDir = await requireSelectedWorkspace();
    const { readDesktopFile } = await import("./desktop");
    const hintedPath = applyWorkspacePathHint(relativePath, context);
    const result = await readDesktopFile(
      joinWorkspacePath(workspaceDir, hintedPath),
      parseLineNumber(args.start_line),
      parseLineNumber(args.end_line),
    );
    return JSON.stringify({
      path: hintedPath,
      workspaceRoot: workspaceDir,
      content: result.content,
      size: result.size,
      totalLines: result.totalLines,
      startLine: result.startLine,
      endLine: result.endLine,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Read file failed: ${message}` });
  }
}

async function executeWriteFile(args: Record<string, unknown>, context: DesktopToolContext): Promise<string> {
  const content = typeof args.content === "string" ? args.content : String(args.content || "");
  let relativePath = "";
  try {
    relativePath = normalizeWorkspaceRelativePath(args.path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Write file failed: ${message}` });
  }

  try {
    const { writeWorkspaceFile } = await import("./workspace");
    const { requireDesktopActionApproval } = await import("./desktopAgentSync");
    const workspaceDir = await requireSelectedWorkspace();
    const hintedPath = applyWorkspacePathHint(relativePath, context);
    await requireDesktopActionApproval({
      token: context.authToken,
      kind: "write-file",
      title: `Write file: ${hintedPath}`,
      description: `Allow Agentrix to write to this workspace file?\n${hintedPath}`,
      payload: { path: hintedPath },
      sessionId: context.sessionId,
    });
    await writeWorkspaceFile(hintedPath, content);
    return JSON.stringify({
      success: true,
      path: hintedPath,
      workspaceRoot: workspaceDir,
      bytesWritten: new TextEncoder().encode(content).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Write file failed: ${message}` });
  }
}

async function executeRunCommand(args: Record<string, unknown>, context: DesktopToolContext): Promise<string> {
  const command = String(args.command || "").trim();
  if (!command) {
    return JSON.stringify({ error: "command is required" });
  }

  try {
    const { runDesktopCommand } = await import("./desktop");
    const { requireDesktopActionApproval } = await import("./desktopAgentSync");
    const workspaceDir = await requireSelectedWorkspace();
    const workingDirectory = typeof args.working_directory === "string" && args.working_directory.trim()
      ? joinWorkspacePath(workspaceDir, normalizeWorkspaceRelativePath(args.working_directory, true))
      : workspaceDir;
    await requireDesktopActionApproval({
      token: context.authToken,
      kind: "run-command",
      title: `Run command: ${command.slice(0, 80)}`,
      description: `Allow Agentrix to run this workspace command?\n${command}${workingDirectory ? `\nWorking directory: ${workingDirectory}` : ""}`,
      payload: { command, workingDirectory },
      sessionId: context.sessionId,
    });
    const result = await runDesktopCommand(command, workingDirectory, clampCommandTimeout(args.timeout_ms));
    return JSON.stringify(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Run command failed: ${message}` });
  }
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

async function executeGitPush(args: Record<string, unknown>): Promise<string> {
  try {
    const { gitPush } = await import("./git");
    const result = await gitPush(
      typeof args.remote === "string" ? args.remote : undefined,
      typeof args.branch === "string" ? args.branch : undefined,
      args.set_upstream === true,
    );
    return JSON.stringify(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Git push failed: ${message}` });
  }
}

async function executeGitPull(args: Record<string, unknown>): Promise<string> {
  try {
    const { gitPull } = await import("./git");
    const result = await gitPull(
      typeof args.remote === "string" ? args.remote : undefined,
      typeof args.branch === "string" ? args.branch : undefined,
      args.rebase === true,
      args.autostash !== false,
    );
    return JSON.stringify(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Git pull failed: ${message}` });
  }
}

async function executeGitCheckout(args: Record<string, unknown>): Promise<string> {
  const branch = String(args.branch || "").trim();
  if (!branch) return JSON.stringify({ error: "branch is required" });
  try {
    const { gitCheckout } = await import("./git");
    const result = await gitCheckout(branch, args.create === true);
    return JSON.stringify(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Git checkout failed: ${message}` });
  }
}

async function executeGitStash(args: Record<string, unknown>): Promise<string> {
  const actionValue = String(args.action || "push");
  const action = actionValue === "list" || actionValue === "pop" ? actionValue : "push";
  try {
    const { gitStash } = await import("./git");
    const result = await gitStash(
      action,
      typeof args.message === "string" ? args.message : undefined,
      args.include_untracked === true,
    );
    return JSON.stringify(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `Git stash failed: ${message}` });
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
  sessionId?: string;
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
    sessionId: options.sessionId,
    workspacePathHint: extractWorkspacePathHint(messages),
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
