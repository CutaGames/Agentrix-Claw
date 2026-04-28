import { listWorkspaceDir, readWorkspaceFile } from "./workspace";

export type WorkspaceSymbolKind = "class" | "function" | "method" | "interface" | "type" | "enum" | "struct" | "trait" | "module" | "constant";

export interface WorkspaceSymbol {
  name: string;
  kind: WorkspaceSymbolKind;
  path: string;
  line: number;
  column: number;
  language: string;
  signature?: string;
}

interface WorkspaceCodeChunk {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  language: string;
  vector: number[];
}

export interface WorkspaceCodeIndexSummary {
  indexedAt: string;
  fileCount: number;
  symbolCount: number;
  chunkCount: number;
  vectorDimensions: number;
  embeddingProvider: string;
  skipped: string[];
}

export interface WorkspaceSemanticResult {
  path: string;
  startLine: number;
  endLine: number;
  language: string;
  score: number;
  preview: string;
}

const VECTOR_DIMENSIONS = 512;
const EMBEDDING_PROVIDER = "local-hashing-512";
const DEFAULT_MAX_FILES = 300;
const DEFAULT_MAX_FILE_BYTES = 240_000;
const SKIP_DIRS = new Set([".git", ".next", ".turbo", ".expo", ".gradle", "build", "coverage", "dist", "node_modules", "target", "test-results"]);
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".rs": "rust",
  ".py": "python",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".go": "go",
};

let symbols: WorkspaceSymbol[] = [];
let chunks: WorkspaceCodeChunk[] = [];
let summary: WorkspaceCodeIndexSummary | null = null;

export async function indexWorkspaceCode(options: { maxFiles?: number; maxFileBytes?: number } = {}): Promise<WorkspaceCodeIndexSummary> {
  const maxFiles = clampNumber(options.maxFiles, 1, 2000, DEFAULT_MAX_FILES);
  const maxFileBytes = clampNumber(options.maxFileBytes, 8_192, 1_000_000, DEFAULT_MAX_FILE_BYTES);
  const files = await collectWorkspaceSourceFiles("", maxFiles);
  const nextSymbols: WorkspaceSymbol[] = [];
  const nextChunks: WorkspaceCodeChunk[] = [];
  const skipped: string[] = [];

  for (const filePath of files) {
    const language = languageForPath(filePath);
    try {
      const content = await readWorkspaceFile(filePath);
      if (content.length > maxFileBytes) {
        skipped.push(`${filePath}: file too large`);
        continue;
      }
      nextSymbols.push(...extractSymbols(filePath, language, content));
      nextChunks.push(...createChunks(filePath, language, content));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skipped.push(`${filePath}: ${message}`);
    }
  }

  symbols = nextSymbols;
  chunks = nextChunks;
  summary = {
    indexedAt: new Date().toISOString(),
    fileCount: files.length,
    symbolCount: symbols.length,
    chunkCount: chunks.length,
    vectorDimensions: VECTOR_DIMENSIONS,
    embeddingProvider: EMBEDDING_PROVIDER,
    skipped,
  };
  return summary;
}

export function getWorkspaceCodeIndexSummary(): WorkspaceCodeIndexSummary | null {
  return summary;
}

export function searchWorkspaceSymbols(query: string, limit = 30): WorkspaceSymbol[] {
  const normalized = query.trim().toLowerCase();
  const maxResults = clampNumber(limit, 1, 100, 30);
  if (!normalized) return symbols.slice(0, maxResults);

  return symbols
    .map((symbol) => ({ symbol, score: scoreSymbol(symbol, normalized) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.symbol.path.localeCompare(b.symbol.path))
    .slice(0, maxResults)
    .map((item) => item.symbol);
}

export function semanticSearchWorkspaceCode(query: string, limit = 10): WorkspaceSemanticResult[] {
  const normalized = query.trim();
  if (!normalized) return [];
  const vector = vectorize(normalized);
  return chunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(vector, chunk.vector) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, clampNumber(limit, 1, 50, 10))
    .map(({ chunk, score }) => ({
      path: chunk.path,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      language: chunk.language,
      score: Number(score.toFixed(4)),
      preview: chunk.text.replace(/\s+/g, " ").trim().slice(0, 360),
    }));
}

async function collectWorkspaceSourceFiles(relativePath: string, maxFiles: number): Promise<string[]> {
  const files: string[] = [];
  const visit = async (currentPath: string) => {
    if (files.length >= maxFiles) return;
    const entries = await listWorkspaceDir(currentPath);
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const childPath = joinRelativePath(currentPath, entry.name);
      if (entry.is_dir) {
        if (SKIP_DIRS.has(entry.name) || [...SKIP_DIRS].some((dir) => childPath === dir || childPath.startsWith(`${dir}/`))) continue;
        await visit(childPath);
      } else if (languageForPath(childPath) && entry.size <= DEFAULT_MAX_FILE_BYTES * 2) {
        files.push(childPath);
      }
    }
  };
  await visit(relativePath);
  return files;
}

function extractSymbols(filePath: string, language: string, text: string): WorkspaceSymbol[] {
  if (language.startsWith("typescript") || language.startsWith("javascript")) {
    return extractRegexSymbols(filePath, language, text, [
      { kind: "class", regex: /\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g },
      { kind: "interface", regex: /\b(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g },
      { kind: "type", regex: /\b(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/g },
      { kind: "enum", regex: /\b(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/g },
      { kind: "function", regex: /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g },
      { kind: "constant", regex: /\b(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/g },
      { kind: "method", regex: /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:{]/gm },
    ]);
  }
  if (language === "rust") {
    return extractRegexSymbols(filePath, language, text, [
      { kind: "function", regex: /\b(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)/g },
      { kind: "struct", regex: /\b(?:pub\s+)?struct\s+([A-Za-z_][\w]*)/g },
      { kind: "enum", regex: /\b(?:pub\s+)?enum\s+([A-Za-z_][\w]*)/g },
      { kind: "trait", regex: /\b(?:pub\s+)?trait\s+([A-Za-z_][\w]*)/g },
      { kind: "module", regex: /\b(?:pub\s+)?mod\s+([A-Za-z_][\w]*)/g },
    ]);
  }
  if (language === "python") {
    return extractRegexSymbols(filePath, language, text, [
      { kind: "class", regex: /^\s*class\s+([A-Za-z_][\w]*)/gm },
      { kind: "function", regex: /^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)/gm },
    ]);
  }
  return extractRegexSymbols(filePath, language, text, [
    { kind: "class", regex: /\bclass\s+([A-Za-z_][\w]*)/g },
    { kind: "interface", regex: /\binterface\s+([A-Za-z_][\w]*)/g },
    { kind: "function", regex: /\b(?:fun|func|function)\s+([A-Za-z_][\w]*)/g },
    { kind: "enum", regex: /\benum\s+([A-Za-z_][\w]*)/g },
  ]);
}

function extractRegexSymbols(filePath: string, language: string, text: string, patterns: Array<{ kind: WorkspaceSymbolKind; regex: RegExp }>): WorkspaceSymbol[] {
  const lineStarts = getLineStarts(text);
  const allSymbols: WorkspaceSymbol[] = [];
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text))) {
      const name = match[1];
      if (!name || ["if", "for", "while", "switch", "catch"].includes(name)) continue;
      const position = offsetToLineColumn(match.index, lineStarts);
      const signature = text.split(/\r?\n/)[position.line - 1]?.trim().slice(0, 240);
      allSymbols.push({ name, kind: pattern.kind, path: filePath, line: position.line, column: position.column, language, signature });
    }
  }
  const seen = new Set<string>();
  return allSymbols.filter((symbol) => {
    const key = `${symbol.path}:${symbol.line}:${symbol.kind}:${symbol.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createChunks(filePath: string, language: string, text: string): WorkspaceCodeChunk[] {
  const lines = text.split(/\r?\n/);
  const result: WorkspaceCodeChunk[] = [];
  const chunkSize = 80;
  const overlap = 12;
  for (let start = 0; start < lines.length; start += chunkSize - overlap) {
    const end = Math.min(lines.length, start + chunkSize);
    const chunkText = lines.slice(start, end).join("\n").trim();
    if (chunkText.length > 12) {
      result.push({ id: `${filePath}:${start + 1}-${end}`, path: filePath, startLine: start + 1, endLine: end, text: chunkText, language, vector: vectorize(chunkText) });
    }
    if (end >= lines.length) break;
  }
  return result;
}

function scoreSymbol(symbol: WorkspaceSymbol, query: string): number {
  const name = symbol.name.toLowerCase();
  const pathScore = symbol.path.toLowerCase().includes(query) ? 1 : 0;
  if (name === query) return 10 + pathScore;
  if (name.startsWith(query)) return 7 + pathScore;
  if (name.includes(query)) return 5 + pathScore;
  if ((symbol.signature || "").toLowerCase().includes(query)) return 2 + pathScore;
  return pathScore;
}

function vectorize(text: string): number[] {
  const vector = new Array(VECTOR_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9_.$/-]+|[\u4e00-\u9fa5]+/g) || [];
  for (const token of tokens) {
    vector[hashToken(token) % VECTOR_DIMENSIONS] += 1 / Math.sqrt(Math.max(1, token.length));
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return magnitude > 0 ? vector.map((value) => value / magnitude) : vector;
}

function cosineSimilarity(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * (right[index] || 0), 0);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index++) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function offsetToLineColumn(offset: number, lineStarts: number[]): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) low = mid + 1;
    else high = mid - 1;
  }
  const lineIndex = Math.max(0, high);
  return { line: lineIndex + 1, column: offset - lineStarts[lineIndex] + 1 };
}

function languageForPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  const extension = Object.keys(LANGUAGE_BY_EXTENSION).find((ext) => lower.endsWith(ext));
  return extension ? LANGUAGE_BY_EXTENSION[extension] : "";
}

function joinRelativePath(parent: string, child: string): string {
  return parent ? `${parent.replace(/\/$/, "")}/${child}` : child;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}