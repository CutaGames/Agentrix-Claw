import { invoke } from "@tauri-apps/api/core";

export interface FileEntry {
  name: string;
  is_dir: boolean;
  size: number;
}

export interface WorkspaceSearchMatch {
  path: string;
  lineNumber: number;
  column: number;
  lineText: string;
}

export interface WorkspaceSearchResult {
  query: string;
  root: string;
  matches: WorkspaceSearchMatch[];
  truncated: boolean;
  durationMs: number;
}

export interface WorkspaceSearchParams {
  query: string;
  pathFilter?: string;
  maxResults?: number;
  caseSensitive?: boolean;
}

export async function setWorkspaceDir(path: string): Promise<string> {
  return invoke<string>("desktop_bridge_set_workspace_dir", { path });
}

export async function getWorkspaceDir(): Promise<string | null> {
  return invoke<string | null>("desktop_bridge_get_workspace_dir");
}

export async function listWorkspaceDir(relativePath: string = ""): Promise<FileEntry[]> {
  return invoke<FileEntry[]>("desktop_bridge_list_workspace_dir", { relativePath });
}

export async function readWorkspaceFile(relativePath: string): Promise<string> {
  return invoke<string>("desktop_bridge_read_workspace_file", { relativePath });
}

export async function writeWorkspaceFile(relativePath: string, content: string): Promise<void> {
  return invoke<void>("desktop_bridge_write_workspace_file", { relativePath, content });
}

export async function deleteWorkspaceFile(relativePath: string): Promise<void> {
  return invoke<void>("desktop_bridge_delete_workspace_file", { relativePath });
}

export async function searchWorkspaceFiles(params: WorkspaceSearchParams): Promise<WorkspaceSearchResult> {
  return invoke<WorkspaceSearchResult>("desktop_bridge_search_workspace_files", {
    query: params.query,
    pathFilter: params.pathFilter,
    maxResults: params.maxResults,
    caseSensitive: params.caseSensitive,
  });
}

/**
 * Scan free-form text for plausible workspace-relative file path mentions.
 *
 * Recognized shapes:
 *   - `path/to/file.ext` (in backticks)
 *   - bare `dir/sub/file.ext` (slash-separated, with extension)
 *   - bare top-level `package.json`, `README.md`, `tsconfig.json`, etc.
 *
 * Returns a deduplicated list of candidates (in order of first occurrence).
 */
export function extractFilePathMentions(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (candidate: string) => {
    const cleaned = candidate.trim().replace(/^[`"'(\[{]+|[`"')\]}.,;:!?]+$/g, "");
    if (!cleaned) return;
    // Reject absolute paths, URLs, anything with whitespace.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(cleaned)) return;
    if (cleaned.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(cleaned)) return;
    if (/\s/.test(cleaned)) return;
    if (cleaned.includes("..")) return;
    if (cleaned.length > 256) return;
    // Must look like a file path: have an extension or be a known top-level file.
    const hasExt = /\.[A-Za-z0-9]{1,8}$/.test(cleaned);
    const knownTop = new Set(["package.json", "README.md", "readme.md", "tsconfig.json", "Cargo.toml", ".env", "Dockerfile", "Makefile"]);
    if (!hasExt && !knownTop.has(cleaned)) return;
    if (!seen.has(cleaned)) {
      seen.add(cleaned);
      ordered.push(cleaned);
    }
  };

  // 1) Backtick-quoted paths: `foo/bar.ts` or `package.json`
  for (const match of text.matchAll(/`([^`\n\r]{1,256})`/g)) {
    push(match[1]);
  }
  // 2) Bare slash paths with extension: foo/bar.ts, src/components/X.tsx
  for (const match of text.matchAll(/(?<![A-Za-z0-9_/\\-])([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+){1,8}\.[A-Za-z0-9]{1,8})(?![A-Za-z0-9_/\\-])/g)) {
    push(match[1]);
  }
  // 3) Bare top-level filenames (with extension)
  for (const match of text.matchAll(/(?<![A-Za-z0-9_/\\-])([A-Za-z][A-Za-z0-9_.-]*\.[A-Za-z0-9]{1,8})(?![A-Za-z0-9_/\\-])/g)) {
    push(match[1]);
  }
  return ordered;
}

/**
 * Auto-read workspace files mentioned in user text. Returns a markdown block
 * suitable for inlining into the outbound prompt, plus the list of files that
 * were attached (for UI feedback / dedup with the body text).
 *
 * Behavior:
 *   - Reads at most `maxFiles` files (default 5)
 *   - Aborts a single file if its content is > `maxFileBytes` (default 64KB)
 *   - Skips silently on read errors (file might not exist or be binary)
 *   - Total payload capped at `maxTotalBytes` (default 200KB)
 */
export async function autoAttachMentionedFiles(
  text: string,
  options?: { maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number },
): Promise<{ block: string; files: string[] }> {
  const maxFiles = options?.maxFiles ?? 5;
  const maxFileBytes = options?.maxFileBytes ?? 64 * 1024;
  const maxTotalBytes = options?.maxTotalBytes ?? 200 * 1024;

  const candidates = extractFilePathMentions(text).slice(0, maxFiles * 3);
  if (candidates.length === 0) {
    return { block: "", files: [] };
  }

  const sections: string[] = [];
  const attached: string[] = [];
  let totalBytes = 0;

  for (const candidate of candidates) {
    if (attached.length >= maxFiles) break;
    if (totalBytes >= maxTotalBytes) break;
    let content: string;
    try {
      content = await readWorkspaceFile(candidate);
    } catch {
      continue;
    }
    if (content.length > maxFileBytes) {
      content = `${content.slice(0, maxFileBytes)}\n…(truncated, file is ${content.length} bytes total)`;
    }
    if (totalBytes + content.length > maxTotalBytes) {
      const remaining = Math.max(0, maxTotalBytes - totalBytes);
      content = `${content.slice(0, remaining)}\n…(truncated to fit auto-attach budget)`;
    }
    const ext = (candidate.split(".").pop() || "").toLowerCase();
    sections.push(`### ${candidate}\n\`\`\`${ext}\n${content}\n\`\`\``);
    attached.push(candidate);
    totalBytes += content.length;
  }

  if (attached.length === 0) {
    return { block: "", files: [] };
  }

  const block = `\n\n[Auto-attached workspace files]\nThe following files were read from the user's local workspace because they were mentioned in the message above. Use them as the source of truth.\n\n${sections.join("\n\n")}`;
  return { block, files: attached };
}


function normalizeDialogSelection(selected: string | string[] | null): string | null {
  if (!selected) return null;
  if (typeof selected === "string") return selected;
  return selected[0] || null;
}

export async function pickWorkspaceFolder(): Promise<string | null> {
  let dialogError: unknown = null;

  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = normalizeDialogSelection(
      await open({
        directory: true,
        multiple: false,
        title: "Select Workspace Folder",
      }),
    );
    if (!selected) return null;
    return setWorkspaceDir(selected);
  } catch (error: unknown) {
    dialogError = error;
  }

  try {
    return await invoke<string | null>("desktop_bridge_pick_workspace_dir");
  } catch (bridgeError: any) {
    const dialogMessage = typeof (dialogError as any)?.message === "string" && (dialogError as any).message.trim()
      ? (dialogError as any).message.trim()
      : null;
    const bridgeMessage = typeof bridgeError?.message === "string" && bridgeError.message.trim()
      ? bridgeError.message.trim()
      : null;

    const message = dialogMessage && bridgeMessage
      ? `Failed to open the workspace picker. dialog=${dialogMessage}; bridge=${bridgeMessage}`
      : dialogMessage || bridgeMessage || "Failed to open the workspace picker.";

    throw new Error(message);
  }
}


// ──────────────────────────────────────────────────────────────────────────
// Pro Mode `@symbol` mention support (Sprint Pro Mode Coding Views 2026-05).
//
// Frontend-only adapter on top of `searchWorkspaceFiles`. We don't run a real
// LSP — we just regex-grep the workspace for top-level symbol declarations.
// Good enough for `@symbol` mentions; users still get file path + line, which
// the existing `@file` consumer can handle.
// ──────────────────────────────────────────────────────────────────────────

export interface SymbolHit {
  /** Symbol name as captured (e.g. "useUserMode"). */
  name: string;
  /** Symbol kind heuristic, mostly for icon hinting. */
  kind: "function" | "class" | "interface" | "type" | "const" | "def" | "export";
  /** Workspace-relative path. */
  file: string;
  /** 1-indexed line number. */
  line: number;
  /** Original line text for hint display, trimmed. */
  preview: string;
}

const SYMBOL_PATTERNS: Array<{ kind: SymbolHit["kind"]; regex: string }> = [
  // export function foo / export async function foo / function foo
  { kind: "function",  regex: "(?:export\\s+(?:async\\s+)?)?function\\s+\\w+" },
  // class Foo / export class Foo / abstract class Foo
  { kind: "class",     regex: "(?:export\\s+)?(?:abstract\\s+)?class\\s+\\w+" },
  // interface Foo / export interface Foo
  { kind: "interface", regex: "(?:export\\s+)?interface\\s+\\w+" },
  // type Foo = / export type Foo =
  { kind: "type",      regex: "(?:export\\s+)?type\\s+\\w+\\s*=" },
  // export const foo = / export const Foo =
  { kind: "const",     regex: "export\\s+(?:const|let)\\s+\\w+" },
  // Python def foo / async def foo
  { kind: "def",       regex: "(?:async\\s+)?def\\s+\\w+" },
];

function inferSymbolName(lineText: string, kind: SymbolHit["kind"]): string {
  // Cheap extraction: take whatever non-keyword identifier first appears.
  const tokens = lineText
    .replace(/[\(\):,=<>\[\]{}]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  // Skip leading keywords until we find an identifier.
  const skip = new Set([
    "export", "async", "function", "class", "abstract", "interface",
    "type", "const", "let", "var", "def", "public", "private", "protected",
    "static", "default",
  ]);
  for (const tok of tokens) {
    if (skip.has(tok)) continue;
    if (/^[A-Za-z_$][\w$]*$/.test(tok)) return tok;
  }
  return kind;
}

/**
 * Search workspace for top-level symbol declarations whose name matches `query`.
 *
 * MVP: we issue one combined regex search to the existing Tauri bridge,
 * then post-filter results by query and dedupe. Returns up to `limit` hits.
 *
 * Failure modes (Tauri command unavailable, no workspace, etc.) return `[]`
 * silently — caller should fall back to the `@file` provider.
 */
export async function searchSymbols(
  query: string,
  options?: { limit?: number; pathFilter?: string },
): Promise<SymbolHit[]> {
  const limit = options?.limit ?? 30;
  const pathFilter = options?.pathFilter;
  const filter = (query || "").trim().toLowerCase();

  // Combine all kind regexes into one OR alternation.
  const combined = SYMBOL_PATTERNS.map((p) => `(?:${p.regex})`).join("|");

  let result: WorkspaceSearchResult;
  try {
    result = await searchWorkspaceFiles({
      query: combined,
      pathFilter,
      maxResults: Math.max(limit * 4, 100),
      caseSensitive: false,
    });
  } catch {
    return [];
  }

  const hits: SymbolHit[] = [];
  const seen = new Set<string>();
  for (const m of result.matches) {
    // Identify which kind matched by trying each regex.
    let kind: SymbolHit["kind"] = "function";
    for (const pattern of SYMBOL_PATTERNS) {
      if (new RegExp(pattern.regex).test(m.lineText)) {
        kind = pattern.kind;
        break;
      }
    }
    const name = inferSymbolName(m.lineText, kind);
    if (!name || name === kind) continue;
    if (filter && !name.toLowerCase().includes(filter)) continue;
    const dedupKey = `${m.path}:${m.lineNumber}:${name}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    hits.push({
      name,
      kind,
      file: m.path,
      line: m.lineNumber,
      preview: m.lineText.trim().slice(0, 120),
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
