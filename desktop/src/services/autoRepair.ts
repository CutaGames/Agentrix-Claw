import { runDesktopCommand, type DesktopCommandResult } from "./desktop";
import { readWorkspaceFile, writeWorkspaceFile } from "./workspace";

export type RepairDiagnosticSource = "typescript" | "rust" | "eslint" | "jest" | "generic";

export interface RepairDiagnostic {
  source: RepairDiagnosticSource;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  severity: "error" | "warning";
  raw: string;
}

export interface WorkspaceTextEdit {
  file: string;
  old_text: string;
  new_text: string;
}

export interface DesktopAutoRepairOptions {
  command: string;
  workingDirectory?: string;
  timeoutMs?: number;
  edits?: WorkspaceTextEdit[];
}

export interface DesktopAutoRepairResult {
  status: "passed" | "needs_patch" | "patched" | "failed";
  commandResult: DesktopCommandResult;
  diagnostics: RepairDiagnostic[];
  appliedEdits?: Array<{ file: string; replaced: boolean }>;
  repairPrompt?: string;
}

const MAX_REPAIR_OUTPUT_CHARS = 12_000;

export async function runDesktopAutoRepairCommand(options: DesktopAutoRepairOptions): Promise<DesktopAutoRepairResult> {
  const command = options.command.trim();
  if (!command) {
    throw new Error("command is required");
  }

  let appliedEdits: Array<{ file: string; replaced: boolean }> | undefined;
  if (options.edits?.length) {
    appliedEdits = await applyWorkspaceTextEdits(options.edits);
  }

  const commandResult = await runDesktopCommand(
    command,
    options.workingDirectory,
    clampTimeout(options.timeoutMs),
  );
  const diagnostics = parseRepairDiagnostics(commandResult);

  if (!commandResult.timedOut && (commandResult.exitCode ?? 0) === 0 && diagnostics.length === 0) {
    return { status: appliedEdits?.length ? "patched" : "passed", commandResult: trimCommandResult(commandResult), diagnostics, appliedEdits };
  }

  return {
    status: appliedEdits?.length ? "failed" : "needs_patch",
    commandResult: trimCommandResult(commandResult),
    diagnostics,
    appliedEdits,
    repairPrompt: buildRepairPrompt(command, diagnostics),
  };
}

export function parseRepairDiagnostics(result: DesktopCommandResult): RepairDiagnostic[] {
  const output = [result.stdout || "", result.stderr || ""].filter(Boolean).join("\n");
  const diagnostics = [
    ...parseTypeScriptDiagnostics(output),
    ...parseRustDiagnostics(output),
    ...parseEslintDiagnostics(output),
    ...parseJestDiagnostics(output),
  ];

  if (diagnostics.length > 0) {
    return dedupeDiagnostics(diagnostics).slice(0, 80);
  }

  if ((result.exitCode ?? 0) !== 0 || result.timedOut) {
    return [{
      source: "generic",
      severity: "error",
      message: result.timedOut ? "Command timed out" : "Command failed without parseable diagnostics",
      raw: output.slice(0, 2_000),
    }];
  }

  return [];
}

export function buildRepairPrompt(command: string, diagnostics: RepairDiagnostic[]): string {
  const lines = diagnostics.slice(0, 20).map((diagnostic, index) => {
    const location = diagnostic.file
      ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ""}${diagnostic.column ? `:${diagnostic.column}` : ""}`
      : "unknown location";
    const code = diagnostic.code ? ` ${diagnostic.code}` : "";
    return `${index + 1}. [${diagnostic.source}${code}] ${location} - ${diagnostic.message}`;
  });

  return [
    "Automatic repair loop is ready for the next tool call.",
    `Command: ${command}`,
    "Diagnostics:",
    ...lines,
    "Generate the smallest safe workspace text edits, then call run_auto_repair_command again with edits: [{ file, old_text, new_text }] to apply and retry.",
    "Use workspace-relative file paths only. Each old_text must be exact and unique in its file.",
  ].join("\n");
}

async function applyWorkspaceTextEdits(edits: WorkspaceTextEdit[]): Promise<Array<{ file: string; replaced: boolean }>> {
  const applied: Array<{ file: string; replaced: boolean }> = [];
  for (const edit of edits.slice(0, 12)) {
    const file = String(edit.file || "").trim().replace(/\\/g, "/");
    const oldText = String(edit.old_text || "");
    const newText = String(edit.new_text || "");

    if (!isSafeWorkspaceRelativePath(file)) {
      throw new Error(`Unsafe edit path: ${file}`);
    }
    if (!oldText) {
      throw new Error(`old_text is required for ${file}`);
    }

    const current = await readWorkspaceFile(file);
    const matches = countOccurrences(current, oldText);
    if (matches !== 1) {
      throw new Error(`Expected exactly one old_text match in ${file}, found ${matches}`);
    }

    await writeWorkspaceFile(file, current.replace(oldText, newText));
    applied.push({ file, replaced: true });
  }
  return applied;
}

function parseTypeScriptDiagnostics(output: string): RepairDiagnostic[] {
  const diagnostics: RepairDiagnostic[] = [];
  const pattern = /^(.+?\.(?:ts|tsx|js|jsx))\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(output))) {
    diagnostics.push({
      source: "typescript",
      file: normalizePath(match[1]),
      line: Number(match[2]),
      column: Number(match[3]),
      code: match[4],
      message: match[5].trim(),
      severity: "error",
      raw: match[0],
    });
  }
  return diagnostics;
}

function parseRustDiagnostics(output: string): RepairDiagnostic[] {
  const diagnostics: RepairDiagnostic[] = [];
  const pattern = /error(?:\[(E\d+)\])?:\s+([^\n]+)\n\s+-->\s+([^:\n]+):(\d+):(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(output))) {
    diagnostics.push({
      source: "rust",
      file: normalizePath(match[3]),
      line: Number(match[4]),
      column: Number(match[5]),
      code: match[1],
      message: match[2].trim(),
      severity: "error",
      raw: match[0],
    });
  }
  return diagnostics;
}

function parseEslintDiagnostics(output: string): RepairDiagnostic[] {
  const diagnostics: RepairDiagnostic[] = [];
  const lines = output.split(/\r?\n/);
  let currentFile = "";

  for (const line of lines) {
    if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(line.trim())) {
      currentFile = normalizePath(line.trim());
      continue;
    }

    const match = line.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+([@\w/-]+)$/);
    if (!match || !currentFile) continue;
    diagnostics.push({
      source: "eslint",
      file: currentFile,
      line: Number(match[1]),
      column: Number(match[2]),
      code: match[5],
      message: match[4].trim(),
      severity: match[3] as "error" | "warning",
      raw: line,
    });
  }

  return diagnostics;
}

function parseJestDiagnostics(output: string): RepairDiagnostic[] {
  const diagnostics: RepairDiagnostic[] = [];
  const pattern = /^FAIL\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(output))) {
    diagnostics.push({
      source: "jest",
      file: normalizePath(match[1].trim()),
      message: "Jest test suite failed",
      severity: "error",
      raw: match[0],
    });
  }
  return diagnostics;
}

function dedupeDiagnostics(diagnostics: RepairDiagnostic[]): RepairDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = [diagnostic.source, diagnostic.file, diagnostic.line, diagnostic.column, diagnostic.code, diagnostic.message].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function trimCommandResult(result: DesktopCommandResult): DesktopCommandResult {
  return {
    ...result,
    stdout: (result.stdout || "").slice(-MAX_REPAIR_OUTPUT_CHARS),
    stderr: (result.stderr || "").slice(-MAX_REPAIR_OUTPUT_CHARS),
  };
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

function isSafeWorkspaceRelativePath(filePath: string): boolean {
  if (!filePath || filePath.startsWith("/") || filePath.startsWith("\\")) return false;
  if (/^[a-zA-Z]:/.test(filePath)) return false;
  return !filePath.split("/").some((part) => part === ".." || part === "");
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function clampTimeout(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 60_000;
  return Math.max(1_000, Math.min(10 * 60_000, Math.floor(parsed)));
}