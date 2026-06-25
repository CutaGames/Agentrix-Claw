/**
 * Desktop Local Tool Calling Service
 *
 * Provides tool definitions and execution for the desktop Tauri client's
 * local llama-server sidecar. Uses the OpenAI-compatible /v1/chat/completions
 * endpoint with `tools` parameter (requires --jinja flag on llama-server).
 *
 * Tool calling flow:
 *   1. Call chatWithTools() �?sidecar returns tool_calls or text
 *   2. Execute tool calls locally
 *   3. Feed results back as tool messages �?re-call
 *   4. Stream final natural-language response
 */

import type { LocalLLMSidecar, ChatMessage, ToolDef, ToolCallResult } from "./localLLM";
import { compactChatMessagesForContext } from "./contextWindow";
import { API_BASE } from "./store";
import { AGENT_RUN_TOOL_DEF, executeSpawnTool } from "./spawnTool";

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
        "(?:^|[\\s\"'(`])" + escapeRegExp(prefix) + "(?:[\\\\/]|\\s*(?:目录|文件夹|folder|dir|directory|下|�?\\b)",
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
  // ── Computer Use (Phase B) ────────────────────────────────────────────────
  // Cross-platform mouse/keyboard/screen primitives. Each tool routes through
  // Rust red-lines (terminals/sudo/self) before touching the OS, and through
  // the desktop approval sheet for user-visible consent.
  {
    type: "function",
    function: {
      name: "computer_use_screenshot",
      description:
        "Take a PNG screenshot of a monitor (base64). Use to ground UI actions before clicking. Optional region/max_size to keep payload small.",
      parameters: {
        type: "object",
        properties: {
          monitor_index: { type: "number", description: "0-based monitor index, default 0 (primary)" },
          region: {
            type: "array",
            description: "Optional [x,y,w,h] crop in physical pixels",
            items: { type: "number" },
          },
          max_size: { type: "number", description: "Longest-edge cap for downscale, default 1600" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "computer_use_click",
      description: "Move mouse to (x,y) and click. Requires user approval each call.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          button: { type: "string", enum: ["left", "right", "middle"] },
          double: { type: "boolean", description: "Double-click when true" },
        },
        required: ["x", "y"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "computer_use_move",
      description: "Move the mouse pointer to (x,y) without clicking.",
      parameters: {
        type: "object",
        properties: { x: { type: "number" }, y: { type: "number" } },
        required: ["x", "y"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "computer_use_type",
      description:
        "Type text into the focused control. Refused if it contains sudo/runas/rm-rf etc. Requires user approval.",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "computer_use_key",
      description: "Send a key combo such as 'ctrl+shift+t' or 'cmd+space'.",
      parameters: {
        type: "object",
        properties: { combo: { type: "string", description: "e.g. 'ctrl+c', 'cmd+shift+4'" } },
        required: ["combo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "computer_use_window_tree",
      description: "Enumerate visible top-level windows with title, app name, and bounds.",
      parameters: { type: "object", properties: {} },
    },
  },
  // ── Computer Use: Desktop GUI grounding (需求 4, P1) ───────────────────────
  {
    type: "function",
    function: {
      name: "computer_use_ground_active_window",
      description:
        "Ground the focused native window: returns interactable elements as a set-of-marks (m1, m2, …) with role, name and bounds. Use this BEFORE clicking native UI so you select an element by its mark instead of guessing pixel coordinates. If `mode` is 'degraded' the accessibility tree is unavailable — do NOT guess coordinates; fall back to a screenshot or tell the user.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "computer_use_click_mark",
      description:
        "Click a native UI element by its set-of-marks id (from computer_use_ground_active_window). Coordinates are resolved from the accessibility tree, never guessed. Requires user approval.",
      parameters: {
        type: "object",
        properties: {
          mark: { type: "string", description: "Element mark such as 'm3'" },
          double: { type: "boolean", description: "Double-click when true" },
        },
        required: ["mark"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "computer_use_focus_window_active",
      description:
        "Bring the window whose title contains `title` to the foreground and report whether it actually became active (is_active). Terminal/self windows are refused.",
      parameters: {
        type: "object",
        properties: { title: { type: "string", description: "Substring of the window title" } },
        required: ["title"],
      },
    },
  },
  // ── Computer Use: Browser via system Chrome (Phase B3) ────────────────────
  {
    type: "function",
    function: {
      name: "computer_use_browser_navigate",
      description:
        "Open a URL in an Agentrix-controlled Chrome window (isolated profile, --remote-debugging-port=9222). Use when the user asks the agent to look something up, fill a form, or take action on the web.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full http(s) URL" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "computer_use_browser_list_tabs",
      description:
        "List currently open tabs in the controlled Chrome instance (id, title, url).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "computer_use_browser_eval",
      description:
        "Evaluate a JavaScript expression in the Agentrix-controlled Chrome tab and return the result. Use to extract DOM data, read text, or compute values from the page. The expression is wrapped in try/catch so thrown errors return structured results instead of failing.",
      parameters: {
        type: "object",
        properties: {
          target_id: { type: "string", description: "CDP target id; defaults to the first page" },
          expression: { type: "string", description: "JS expression, e.g. document.title" },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "computer_use_browser_click_selector",
      description:
        "Click a DOM element matched by a CSS selector in the controlled Chrome tab. Returns an error if no element matches.",
      parameters: {
        type: "object",
        properties: {
          target_id: { type: "string", description: "CDP target id; defaults to the first page" },
          selector: { type: "string", description: "CSS selector, e.g. 'button[type=submit]'" },
        },
        required: ["selector"],
      },
    },
  },
];

/**
 * Returns the tool list with Computer Use tools filtered out unless the
 * user has enabled them in Settings (Phase B7 gate). Browser tools are
 * gated independently from screen/keyboard/mouse tools.
 *
 * @param mode "full" (default) returns every tool the desktop supports;
 *             "compact" returns a minimal essentials-only set suitable for
 *             small local models (Gemma Nano 1-2B) that struggle to make
 *             good selections from 20+ candidates and choke on the
 *             prefill cost. Compact mode keeps file IO + run_command +
 *             search + memory + (optionally) screenshot + browser nav.
 */
export function getActiveDesktopTools(
  mode: "full" | "compact" = "full",
  opts: { multiAgentEnabled?: boolean } = {},
): ToolDef[] {
  let cuEnabled = false;
  let browserEnabled = false;
  try {
    cuEnabled = localStorage.getItem("agentrix_computer_use_enabled") === "1";
    browserEnabled = localStorage.getItem("agentrix_computer_use_browser_enabled") === "1";
  } catch {
    /* SSR / non-browser context */
  }
  const baseTools = DESKTOP_LOCAL_TOOLS.filter((tool) => {
    const name = tool.function?.name || "";
    if (name.startsWith("computer_use_browser_")) return browserEnabled;
    if (name.startsWith("computer_use_")) return cuEnabled;
    if (mode === "compact") {
      // Essentials-only set for small local models. Drop git, indexing,
      // semantic search, auto-repair — they help large models a lot but
      // small ones rarely pick them correctly and the schemas burn
      // prefill budget.
      const COMPACT_KEEP = new Set([
        "get_current_time",
        "list_directory",
        "read_file",
        "write_file",
        "run_command",
        "search_workspace_files",
        "recall_memory",
        "save_memory",
      ]);
      if (COMPACT_KEEP.has(name)) return true;
      // Compact mode keeps the screenshot tool only when CU is enabled,
      // because that's the one CU tool small models can actually use
      // correctly without coordinate grounding.
      if (cuEnabled && name === "computer_use_screenshot") return true;
      if (browserEnabled && name === "computer_use_browser_navigate") return true;
      return false;
    }
    return true;
  });
  // Multi-Agent v1 W2.5 — `agent_run` only attached when caller is a
  // leader chat with a primary task id (multiAgentEnabled). Excluded
  // from compact (small local models can't follow the schema reliably).
  if (opts.multiAgentEnabled && mode === "full") {
    baseTools.push(AGENT_RUN_TOOL_DEF);
  }
  return baseTools;
}

// ── Tool Execution ─────────────────────────────────────

export interface DesktopToolContext {
  instanceId?: string;
  agentId?: string;
  authToken?: string;
  sessionId?: string;
  workspacePathHint?: string;
  /** Multi-Agent v1 — leader chat's primary task id; required for agent_run. */
  parentTaskId?: string;
  /** Multi-Agent v1 — tier hint forwarded to spawn dispatcher. */
  tier?: string;
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

      case "computer_use_screenshot":
      case "computer_use_click":
      case "computer_use_move":
      case "computer_use_type":
      case "computer_use_key":
      case "computer_use_window_tree":
      case "computer_use_ground_active_window":
      case "computer_use_click_mark":
      case "computer_use_focus_window_active":
      case "computer_use_browser_navigate":
      case "computer_use_browser_list_tabs":
      case "computer_use_browser_eval":
      case "computer_use_browser_click_selector":
        return await executeComputerUse(name, args, context);

      case "agent_run":
        // Multi-Agent v1 W2.5 — spawn sub-agent via POST /api/agent-tasks/spawn
        if (!context.parentTaskId) {
          return JSON.stringify({
            error: "invalid_input",
            message:
              "agent_run requires a leader chat session (parentTaskId missing in tool context).",
          });
        }
        return await executeSpawnTool(args, {
          parentTaskId: context.parentTaskId,
          tier: context.tier,
        });

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
    const { createWorkspaceFileBackup } = await import("./workspaceBackups");
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
    const backupResult = hintedPath.startsWith(".agentrix/backup/")
      ? null
      : await createWorkspaceFileBackup(hintedPath, content);
    await writeWorkspaceFile(hintedPath, content);
    return JSON.stringify({
      success: true,
      path: hintedPath,
      workspaceRoot: workspaceDir,
      bytesWritten: new TextEncoder().encode(content).length,
      backup: backupResult?.backup,
      diffPreview: backupResult?.diffPreview,
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
  const startedAt = Date.now();
  const editsCount = Array.isArray(args.edits) ? (args.edits as unknown[]).length : 0;
  try {
    const { trackEvent } = await import("./analytics");
    trackEvent("auto_repair_start", {
      commandPrefix: command.split(/\s+/, 1)[0] || "",
      hasEdits: editsCount > 0 ? 1 : 0,
      editsCount,
    });
    const { runDesktopAutoRepairCommand } = await import("./autoRepair");
    const result = await runDesktopAutoRepairCommand({
      command,
      workingDirectory: typeof args.working_directory === "string" ? args.working_directory : undefined,
      timeoutMs: typeof args.timeout_ms === "number" ? args.timeout_ms : undefined,
      edits: Array.isArray(args.edits) ? (args.edits as any) : undefined,
    });
    trackEvent("auto_repair_done", {
      status: result.status,
      durationMs: Date.now() - startedAt,
      diagnostics: result.diagnostics.length,
      patchedFiles: result.appliedEdits?.length || 0,
      exitCode: result.commandResult.exitCode ?? -1,
      timedOut: result.commandResult.timedOut ? 1 : 0,
    });
    return JSON.stringify(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const { trackEvent } = await import("./analytics");
      trackEvent("auto_repair_error", {
        durationMs: Date.now() - startedAt,
        message: message.slice(0, 200),
      });
    } catch {}
    return JSON.stringify({ error: `Auto repair command failed: ${message}` });
  }
}

// ── Computer Use executor (Phase B6) ─────────────────────────────────────────
// Routes the LLM-facing tool name to the corresponding Tauri command. The
// Rust side enforces hardcoded red-lines (terminals, sudo, self) and the
// approval sheet enforces per-action user consent.
async function executeComputerUse(
  name: string,
  args: Record<string, unknown>,
  context: DesktopToolContext,
): Promise<string> {
  try {
    const { invokeDesktopCommand } = await import("./desktop");
    const { requireDesktopActionApproval } = await import("./desktopAgentSync");

    const requireApproval = async (kind: string, title: string, description: string) => {
      await requireDesktopActionApproval({
        token: context.authToken,
        kind: kind as any,
        title,
        description,
        payload: Object.fromEntries(
          Object.entries(args).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
        ) as Record<string, string>,
        sessionId: context.sessionId,
      });
    };

    switch (name) {
      case "computer_use_screenshot": {
        const result = await invokeDesktopCommand<{
          png_base64: string;
          width: number;
          height: number;
          monitor_index: number;
        }>("computer_use_screenshot", {
          monitorIndex: typeof args.monitor_index === "number" ? args.monitor_index : undefined,
          region: Array.isArray(args.region) ? args.region : undefined,
          maxSize: typeof args.max_size === "number" ? args.max_size : undefined,
        });
        // Trim payload �?return dimensions + a base64 prefix; full PNG only when
        // the model explicitly references it (kept as data url).
        return JSON.stringify({
          width: result.width,
          height: result.height,
          monitor_index: result.monitor_index,
          image_data_url: `data:image/png;base64,${result.png_base64}`,
        });
      }
      case "computer_use_click": {
        const x = Number(args.x);
        const y = Number(args.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return JSON.stringify({ error: "x and y are required numbers" });
        }
        await requireApproval(
          "computer-use-click",
          `Computer Use: click at (${x}, ${y})`,
          `Allow Agentrix to click ${args.button || "left"} button at screen coordinates (${x}, ${y})?`,
        );
        await invokeDesktopCommand<void>("computer_use_click", {
          x,
          y,
          button: args.button,
          double: args.double,
        });
        return JSON.stringify({ success: true });
      }
      case "computer_use_move": {
        const x = Number(args.x);
        const y = Number(args.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return JSON.stringify({ error: "x and y are required numbers" });
        }
        await invokeDesktopCommand<void>("computer_use_move", { x, y });
        return JSON.stringify({ success: true });
      }
      case "computer_use_type": {
        const text = String(args.text ?? "");
        if (!text) return JSON.stringify({ error: "text is required" });
        await requireApproval(
          "computer-use-type",
          `Computer Use: type ${text.length} chars`,
          `Allow Agentrix to type the following into the focused window?\n\n${text.slice(0, 200)}${text.length > 200 ? "..." : ""}`,
        );
        await invokeDesktopCommand<void>("computer_use_type", { text });
        return JSON.stringify({ success: true });
      }
      case "computer_use_key": {
        const combo = String(args.combo ?? "").trim();
        if (!combo) return JSON.stringify({ error: "combo is required" });
        await requireApproval(
          "computer-use-key",
          `Computer Use: key combo ${combo}`,
          `Allow Agentrix to send key combo '${combo}'?`,
        );
        await invokeDesktopCommand<void>("computer_use_key", { combo });
        return JSON.stringify({ success: true });
      }
      case "computer_use_window_tree": {
        const result = await invokeDesktopCommand<unknown[]>("computer_use_window_tree");
        return JSON.stringify({ windows: result });
      }
      case "computer_use_ground_active_window": {
        // Read-only grounding (需求 4.1/4.2). Explicit degraded status
        // (Property 8) is surfaced verbatim so the model never guesses pixels.
        const result = await invokeDesktopCommand<{
          windowId: string;
          appName: string;
          mode: string;
          elements: Array<{
            mark: string;
            role: string;
            name: string;
            bounds: [number, number, number, number];
            interactable: boolean;
            confidence: number;
          }>;
          degradedReason?: string | null;
        }>("computer_use_ground_active_window");
        return JSON.stringify(result);
      }
      case "computer_use_click_mark": {
        // 需求 4.2 — click by element mark, coordinates resolved from the
        // accessibility tree (never guessed). 需求 4.4 — routes through the
        // tiered approval before acting.
        const mark = String(args.mark ?? "").trim();
        if (!mark) return JSON.stringify({ error: "mark is required" });
        const grounding = await invokeDesktopCommand<{
          appName: string;
          mode: string;
          elements: Array<{
            mark: string;
            role: string;
            name: string;
            bounds: [number, number, number, number];
            interactable: boolean;
          }>;
          degradedReason?: string | null;
        }>("computer_use_ground_active_window");
        if (grounding.mode === "degraded") {
          // Property 8: refuse to guess coordinates when grounding is down.
          return JSON.stringify({
            error: "grounding_degraded",
            message:
              grounding.degradedReason ||
              "accessibility grounding unavailable; cannot resolve element to coordinates",
          });
        }
        const el = grounding.elements.find((e) => e.mark === mark);
        if (!el || !el.interactable) {
          return JSON.stringify({
            error: "mark_not_found",
            message: `no interactable element with mark '${mark}' in the focused window`,
          });
        }
        const [bx, by, bw, bh] = el.bounds;
        const x = bx + Math.floor(bw / 2);
        const y = by + Math.floor(bh / 2);
        // Tiered-approval gate (needs Rust red-line check + risk tier).
        const tier = await invokeDesktopCommand<string>("computer_use_native_action_risk", {
          actionKind: "click",
          appName: grounding.appName,
          text: null,
        });
        await requireApproval(
          "computer-use-click",
          `Computer Use: click ${el.role} "${el.name || mark}"`,
          `Allow Agentrix to click element ${mark} (${el.role}${el.name ? ` "${el.name}"` : ""}) at (${x}, ${y}) in ${grounding.appName}? [risk: ${tier}]`,
        );
        await invokeDesktopCommand<void>("computer_use_click", {
          x,
          y,
          double: args.double,
        });
        return JSON.stringify({ success: true, mark, role: el.role, name: el.name, x, y, mode: grounding.mode });
      }
      case "computer_use_focus_window_active": {
        // 需求 4.3 — focus + truthful is_active reporting.
        const title = String(args.title ?? "").trim();
        if (!title) return JSON.stringify({ error: "title is required" });
        const result = await invokeDesktopCommand<{
          windowId: string;
          appName: string;
          isActive: boolean;
          mode: string;
        }>("computer_use_focus_window_active", { title });
        return JSON.stringify(result);
      }
      case "computer_use_browser_navigate": {
        const url = String(args.url ?? "").trim();
        if (!/^https?:\/\//i.test(url)) {
          return JSON.stringify({ error: "url must be http(s)" });
        }
        await requireApproval(
          "computer-use-browser-navigate" as any,
          `Open in browser: ${url}`,
          `Allow Agentrix to open this URL in its controlled Chrome window?\n${url}`,
        );
        const tab = await invokeDesktopCommand<{
          id: string;
          title: string;
          url: string;
        }>("computer_use_browser_navigate", { url });
        return JSON.stringify({ success: true, tab });
      }
      case "computer_use_browser_list_tabs": {
        const tabs = await invokeDesktopCommand<unknown[]>("computer_use_browser_list_tabs");
        return JSON.stringify({ tabs });
      }
      case "computer_use_browser_eval": {
        const expression = String(args.expression ?? "").trim();
        if (!expression) return JSON.stringify({ error: "expression is required" });
        const target_id = args.target_id ? String(args.target_id) : undefined;
        await requireApproval(
          "computer-use-browser-eval" as any,
          `Browser eval: ${expression.slice(0, 80)}`,
          `Allow Agentrix to run this JavaScript in the controlled Chrome tab?\n${expression.slice(0, 400)}`,
        );
        const result = await invokeDesktopCommand<{ value: string; type: string; thrown: boolean }>(
          "computer_use_browser_eval",
          { target_id, expression },
        );
        return JSON.stringify(result);
      }
      case "computer_use_browser_click_selector": {
        const selector = String(args.selector ?? "").trim();
        if (!selector) return JSON.stringify({ error: "selector is required" });
        const target_id = args.target_id ? String(args.target_id) : undefined;
        await requireApproval(
          "computer-use-browser-click" as any,
          `Browser click: ${selector}`,
          `Allow Agentrix to click \`${selector}\` in the controlled Chrome tab?`,
        );
        await invokeDesktopCommand<void>("computer_use_browser_click_selector", {
          target_id,
          selector,
        });
        return JSON.stringify({ success: true });
      }
      default:
        return JSON.stringify({ error: `Unknown computer_use tool: ${name}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ error: `${name} failed: ${message}` });
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
    // Desktop doesn't have a dedicated skill search API yet �?use backend
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
    // Desktop doesn't have a dedicated instance skills API yet �?use backend
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
  /** Multi-Agent v1 — leader chat's primary task id; enables agent_run. */
  parentTaskId?: string;
  /** Multi-Agent v1 — tier hint forwarded to spawn dispatcher. */
  tier?: string;
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
    parentTaskId: options.parentTaskId,
    tier: options.tier,
  };

  let workingMessages: ChatMessage[] = compactToolContextMessages([...messages]);
  let usedTools = false;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (options.abortSignal?.aborted) {
      return { text: "", usedTools };
    }

    workingMessages = compactToolContextMessages(workingMessages);
    // Multi-Agent v1 W2.5 — local sidecar runs `compact` mode so agent_run
    // is intentionally not exposed to small local models. Cloud chats
    // request "full" mode separately and pass multiAgentEnabled:true.
    const result = await sidecar.chatWithTools(workingMessages, getActiveDesktopTools("compact"), {
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
      // No tool calls �?final text response
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

  // Max iterations reached �?get final response without tools
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
