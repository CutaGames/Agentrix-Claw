import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as ts from 'typescript';

export type CodeSymbolKind =
  | 'class'
  | 'function'
  | 'method'
  | 'interface'
  | 'type'
  | 'enum'
  | 'struct'
  | 'trait'
  | 'module'
  | 'constant';

export interface CodeSymbol {
  name: string;
  kind: CodeSymbolKind;
  path: string;
  line: number;
  column: number;
  language: string;
  containerName?: string;
  signature?: string;
}

export interface CodeChunk {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  language: string;
  vector: number[];
}

export interface CodeReference {
  symbolName: string;
  path: string;
  line: number;
  column: number;
  language: string;
  referenceKind: 'definition' | 'read' | 'write' | 'call';
  containerName?: string;
  targetPath?: string;
  preview: string;
}

export interface CodeCallGraphEdge {
  fromSymbol: string;
  toSymbol: string;
  path: string;
  line: number;
  column: number;
  language: string;
  preview: string;
}

export interface IndexedFileSnapshot {
  path: string;
  language: string;
  sizeBytes: number;
  mtimeMs: number;
  hash: string;
}

export interface CodeIndexSnapshot {
  root: string;
  indexedAt: string;
  fileCount: number;
  symbolCount: number;
  chunkCount: number;
  referenceCount: number;
  callEdgeCount: number;
  files: IndexedFileSnapshot[];
  skipped: string[];
}

export interface CodeSearchResult {
  path: string;
  startLine: number;
  endLine: number;
  language: string;
  score: number;
  preview: string;
  matches?: Array<{ kind: 'symbol' | 'semantic' | 'reference' | 'call'; score: number; symbolName?: string }>;
}

export interface CodeIndexOptions {
  rootPath?: string;
  maxFiles?: number;
  maxFileBytes?: number;
}

const DEFAULT_MAX_FILES = 600;
const DEFAULT_MAX_FILE_BYTES = 320_000;
const VECTOR_DIMENSIONS = 128;

const SKIPPED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  '.expo',
  '.gradle',
  '.idea',
  '.vscode',
  'android/build',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'Pods',
  'target',
  'test-results',
]);

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.rs': 'rust',
  '.py': 'python',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.go': 'go',
};

@Injectable()
export class CodeIntelligenceService {
  private readonly logger = new Logger(CodeIntelligenceService.name);
  private symbols: CodeSymbol[] = [];
  private chunks: CodeChunk[] = [];
  private references: CodeReference[] = [];
  private callGraph: CodeCallGraphEdge[] = [];
  private fileSnapshots: IndexedFileSnapshot[] = [];
  private snapshot: CodeIndexSnapshot | null = null;

  async indexWorkspace(options: CodeIndexOptions = {}): Promise<CodeIndexSnapshot> {
    const root = await this.resolveRoot(options.rootPath);
    const maxFiles = Math.max(1, Math.min(options.maxFiles || DEFAULT_MAX_FILES, 5_000));
    const maxFileBytes = Math.max(8_192, Math.min(options.maxFileBytes || DEFAULT_MAX_FILE_BYTES, 2_000_000));
    const files = await this.collectSourceFiles(root, maxFiles);
    const nextSymbols: CodeSymbol[] = [];
    const nextChunks: CodeChunk[] = [];
    const nextReferences: CodeReference[] = [];
    const nextCallGraph: CodeCallGraphEdge[] = [];
    const nextFileSnapshots: IndexedFileSnapshot[] = [];
    const skipped: string[] = [];

    for (const absolutePath of files) {
      const relativePath = this.toPosixPath(path.relative(root, absolutePath));
      const language = this.languageForPath(absolutePath);
      try {
        const stat = await fs.stat(absolutePath);
        if (stat.size > maxFileBytes) {
          skipped.push(`${relativePath}: file too large (${stat.size} bytes)`);
          continue;
        }
        const text = await fs.readFile(absolutePath, 'utf8');
        const analysis = this.analyzeFile(relativePath, language, text);
        nextSymbols.push(...analysis.symbols);
        nextReferences.push(...analysis.references);
        nextCallGraph.push(...analysis.callGraph);
        nextChunks.push(...this.createChunks(relativePath, language, text));
        nextFileSnapshots.push({
          path: relativePath,
          language,
          sizeBytes: stat.size,
          mtimeMs: stat.mtimeMs,
          hash: this.hashText(text),
        });
      } catch (error: any) {
        skipped.push(`${relativePath}: ${error?.message || 'read failed'}`);
      }
    }

    this.symbols = nextSymbols;
    this.chunks = nextChunks;
    this.references = nextReferences;
    this.callGraph = nextCallGraph;
    this.fileSnapshots = nextFileSnapshots;
    this.snapshot = {
      root,
      indexedAt: new Date().toISOString(),
      fileCount: files.length,
      symbolCount: nextSymbols.length,
      chunkCount: nextChunks.length,
      referenceCount: nextReferences.length,
      callEdgeCount: nextCallGraph.length,
      files: nextFileSnapshots,
      skipped,
    };

    this.logger.log(
      `Code index refreshed: files=${files.length}, symbols=${nextSymbols.length}, refs=${nextReferences.length}, chunks=${nextChunks.length}`,
    );
    return this.snapshot;
  }

  getStatus(): CodeIndexSnapshot | null {
    return this.snapshot;
  }

  searchSymbols(query: string, limit = 30): CodeSymbol[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return this.symbols.slice(0, limit);

    return this.symbols
      .map(symbol => ({ symbol, score: this.symbolScore(symbol, normalized) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.symbol.path.localeCompare(b.symbol.path))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map(item => item.symbol);
  }

  semanticSearch(query: string, limit = 10): CodeSearchResult[] {
    const normalized = query.trim();
    if (!normalized) return [];

    const queryVector = this.vectorize(normalized);
    return this.chunks
      .map(chunk => ({ chunk, score: this.cosineSimilarity(queryVector, chunk.vector) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(limit, 50)))
      .map(({ chunk, score }) => ({
        path: chunk.path,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        language: chunk.language,
        score: Number(score.toFixed(4)),
        preview: this.preview(chunk.text),
      }));
  }

  getDocumentSymbols(filePath: string): CodeSymbol[] {
    const normalized = this.toPosixPath(filePath).replace(/^\/+/, '');
    return this.symbols.filter(symbol => symbol.path === normalized);
  }

  findReferences(symbolName: string, limit = 50): CodeReference[] {
    const normalized = symbolName.trim().toLowerCase();
    if (!normalized) return [];
    return this.references
      .filter(reference => reference.symbolName.toLowerCase() === normalized || reference.symbolName.toLowerCase().includes(normalized))
      .sort((a, b) => {
        const left = a.referenceKind === 'definition' ? -1 : 0;
        const right = b.referenceKind === 'definition' ? -1 : 0;
        return left - right || a.path.localeCompare(b.path) || a.line - b.line;
      })
      .slice(0, Math.max(1, Math.min(limit, 200)));
  }

  getCallGraph(symbolName: string, direction: 'callers' | 'callees' | 'both' = 'both', limit = 50): CodeCallGraphEdge[] {
    const normalized = symbolName.trim().toLowerCase();
    if (!normalized) return [];
    return this.callGraph
      .filter(edge => {
        const from = edge.fromSymbol.toLowerCase();
        const to = edge.toSymbol.toLowerCase();
        if (direction === 'callers') return to === normalized || to.includes(normalized);
        if (direction === 'callees') return from === normalized || from.includes(normalized);
        return from === normalized || to === normalized || from.includes(normalized) || to.includes(normalized);
      })
      .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
      .slice(0, Math.max(1, Math.min(limit, 200)));
  }

  hybridSearch(query: string, limit = 10): CodeSearchResult[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    const byLocation = new Map<string, CodeSearchResult>();
    const addResult = (
      result: CodeSearchResult,
      kind: 'symbol' | 'semantic' | 'reference' | 'call',
      score: number,
      symbolName?: string,
    ) => {
      const key = `${result.path}:${result.startLine}-${result.endLine}`;
      const existing = byLocation.get(key);
      if (!existing) {
        byLocation.set(key, {
          ...result,
          score,
          matches: [{ kind, score, symbolName }],
        });
        return;
      }
      existing.score += score;
      existing.matches = [...(existing.matches || []), { kind, score, symbolName }];
    };

    for (const symbol of this.searchSymbols(query, 25)) {
      addResult({
        path: symbol.path,
        startLine: symbol.line,
        endLine: symbol.line,
        language: symbol.language,
        score: 0,
        preview: symbol.signature || symbol.name,
      }, 'symbol', this.symbolScore(symbol, normalized), symbol.name);
    }

    for (const semantic of this.semanticSearch(query, 25)) {
      addResult(semantic, 'semantic', semantic.score);
    }

    for (const reference of this.references.filter(item => item.symbolName.toLowerCase().includes(normalized)).slice(0, 25)) {
      addResult({
        path: reference.path,
        startLine: reference.line,
        endLine: reference.line,
        language: reference.language,
        score: 0,
        preview: reference.preview,
      }, 'reference', reference.referenceKind === 'definition' ? 6 : 3, reference.symbolName);
    }

    for (const edge of this.callGraph.filter(item => item.fromSymbol.toLowerCase().includes(normalized) || item.toSymbol.toLowerCase().includes(normalized)).slice(0, 25)) {
      addResult({
        path: edge.path,
        startLine: edge.line,
        endLine: edge.line,
        language: edge.language,
        score: 0,
        preview: edge.preview,
      }, 'call', 4, `${edge.fromSymbol}->${edge.toSymbol}`);
    }

    return [...byLocation.values()]
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, Math.max(1, Math.min(limit, 50)))
      .map(result => ({ ...result, score: Number(result.score.toFixed(4)) }));
  }

  private async resolveRoot(rootPath?: string): Promise<string> {
    const root = rootPath?.trim()
      ? path.resolve(rootPath.trim())
      : path.resolve(process.env.CODE_INTELLIGENCE_ROOT || process.cwd());
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      throw new Error(`Code intelligence root is not a directory: ${root}`);
    }
    return root;
  }

  private async collectSourceFiles(root: string, maxFiles: number): Promise<string[]> {
    const files: string[] = [];
    const visit = async (directory: string) => {
      if (files.length >= maxFiles) return;
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        const absolutePath = path.join(directory, entry.name);
        const relativePath = this.toPosixPath(path.relative(root, absolutePath));

        if (entry.isDirectory()) {
          if (this.shouldSkipDirectory(relativePath, entry.name)) continue;
          await visit(absolutePath);
          continue;
        }

        if (entry.isFile() && this.languageForPath(absolutePath)) {
          files.push(absolutePath);
        }
      }
    };

    await visit(root);
    return files;
  }

  private shouldSkipDirectory(relativePath: string, name: string): boolean {
    if (SKIPPED_DIRS.has(name)) return true;
    return [...SKIPPED_DIRS].some(skipped => relativePath === skipped || relativePath.startsWith(`${skipped}/`));
  }

  private languageForPath(filePath: string): string {
    return LANGUAGE_BY_EXTENSION[path.extname(filePath)] || '';
  }

  private analyzeFile(filePath: string, language: string, text: string): {
    symbols: CodeSymbol[];
    references: CodeReference[];
    callGraph: CodeCallGraphEdge[];
  } {
    const symbols = this.extractSymbols(filePath, language, text);
    if (language.startsWith('typescript') || language.startsWith('javascript')) {
      const astAnalysis = this.extractTypeScriptReferences(filePath, language, text, symbols);
      return { symbols, references: astAnalysis.references, callGraph: astAnalysis.callGraph };
    }

    return {
      symbols,
      references: symbols.map(symbol => ({
        symbolName: symbol.name,
        path: symbol.path,
        line: symbol.line,
        column: symbol.column,
        language: symbol.language,
        referenceKind: 'definition',
        containerName: symbol.containerName,
        preview: symbol.signature || symbol.name,
      })),
      callGraph: [],
    };
  }

  private extractSymbols(filePath: string, language: string, text: string): CodeSymbol[] {
    if (language.startsWith('typescript') || language.startsWith('javascript')) {
      return this.extractTypeScriptSymbols(filePath, language, text);
    }
    if (language === 'rust') return this.extractRegexSymbols(filePath, language, text, [
      { kind: 'function', regex: /\b(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)/g },
      { kind: 'struct', regex: /\b(?:pub\s+)?struct\s+([A-Za-z_][\w]*)/g },
      { kind: 'enum', regex: /\b(?:pub\s+)?enum\s+([A-Za-z_][\w]*)/g },
      { kind: 'trait', regex: /\b(?:pub\s+)?trait\s+([A-Za-z_][\w]*)/g },
      { kind: 'module', regex: /\b(?:pub\s+)?mod\s+([A-Za-z_][\w]*)/g },
    ]);
    if (language === 'python') return this.extractRegexSymbols(filePath, language, text, [
      { kind: 'class', regex: /^\s*class\s+([A-Za-z_][\w]*)/gm },
      { kind: 'function', regex: /^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)/gm },
    ]);
    if (language === 'go') return this.extractRegexSymbols(filePath, language, text, [
      { kind: 'function', regex: /\bfunc\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/g },
      { kind: 'type', regex: /\btype\s+([A-Za-z_][\w]*)\s+(?:struct|interface)/g },
    ]);

    return this.extractRegexSymbols(filePath, language, text, [
      { kind: 'class', regex: /\bclass\s+([A-Za-z_][\w]*)/g },
      { kind: 'interface', regex: /\binterface\s+([A-Za-z_][\w]*)/g },
      { kind: 'function', regex: /\b(?:fun|func|function)\s+([A-Za-z_][\w]*)/g },
      { kind: 'enum', regex: /\benum\s+([A-Za-z_][\w]*)/g },
    ]);
  }

  private extractTypeScriptSymbols(filePath: string, language: string, text: string): CodeSymbol[] {
    const sourceFile = this.createTypeScriptSourceFile(filePath, language, text);
    const symbols: CodeSymbol[] = [];
    const containerStack: string[] = [];
    const lineStarts = this.lineStarts(text);

    const addSymbol = (nameNode: ts.Identifier | ts.PrivateIdentifier | undefined, kind: CodeSymbolKind, node: ts.Node) => {
      if (!nameNode) return;
      const name = nameNode.getText(sourceFile).replace(/^#/, '');
      if (!name || this.isKeyword(name)) return;
      const position = this.offsetToLineColumn(nameNode.getStart(sourceFile), lineStarts);
      symbols.push({
        name,
        kind,
        path: filePath,
        line: position.line,
        column: position.column,
        language,
        containerName: containerStack[containerStack.length - 1],
        signature: this.getLine(text, position.line).trim().slice(0, 240) || node.getText(sourceFile).slice(0, 240),
      });
    };

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node)) {
        addSymbol(node.name, 'class', node);
        if (node.name) containerStack.push(node.name.text);
        ts.forEachChild(node, visit);
        if (node.name) containerStack.pop();
        return;
      }
      if (ts.isInterfaceDeclaration(node)) addSymbol(node.name, 'interface', node);
      else if (ts.isTypeAliasDeclaration(node)) addSymbol(node.name, 'type', node);
      else if (ts.isEnumDeclaration(node)) addSymbol(node.name, 'enum', node);
      else if (ts.isFunctionDeclaration(node)) addSymbol(node.name, 'function', node);
      else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) addSymbol(node.name, 'method', node);
      else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const initializer = node.initializer;
        const kind: CodeSymbolKind = initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
          ? 'function'
          : 'constant';
        addSymbol(node.name, kind, node);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return this.dedupeSymbols(symbols);
  }

  private extractTypeScriptReferences(
    filePath: string,
    language: string,
    text: string,
    symbols: CodeSymbol[],
  ): { references: CodeReference[]; callGraph: CodeCallGraphEdge[] } {
    const sourceFile = this.createTypeScriptSourceFile(filePath, language, text);
    const lineStarts = this.lineStarts(text);
    const references: CodeReference[] = symbols.map(symbol => ({
      symbolName: symbol.name,
      path: symbol.path,
      line: symbol.line,
      column: symbol.column,
      language: symbol.language,
      referenceKind: 'definition',
      containerName: symbol.containerName,
      preview: symbol.signature || symbol.name,
    }));
    const callGraph: CodeCallGraphEdge[] = [];
    const functionStack: string[] = [];

    const pushIfNamedFunction = (node: ts.Node): boolean => {
      const name = this.functionLikeName(node, sourceFile);
      if (!name) return false;
      functionStack.push(name);
      return true;
    };

    const visit = (node: ts.Node) => {
      const didPush = pushIfNamedFunction(node);

      if (ts.isCallExpression(node)) {
        const target = this.callTargetName(node.expression, sourceFile);
        if (target && !this.isKeyword(target)) {
          const position = this.offsetToLineColumn(node.expression.getStart(sourceFile), lineStarts);
          const preview = this.getLine(text, position.line).trim();
          const fromSymbol = functionStack[functionStack.length - 1] || 'module';
          references.push({
            symbolName: target,
            path: filePath,
            line: position.line,
            column: position.column,
            language,
            referenceKind: 'call',
            containerName: fromSymbol,
            preview,
          });
          callGraph.push({
            fromSymbol,
            toSymbol: target,
            path: filePath,
            line: position.line,
            column: position.column,
            language,
            preview,
          });
        }
      }

      ts.forEachChild(node, visit);
      if (didPush) functionStack.pop();
    };

    visit(sourceFile);
    return {
      references: this.dedupeReferences(references),
      callGraph: this.dedupeCallGraph(callGraph),
    };
  }

  private createTypeScriptSourceFile(filePath: string, language: string, text: string): ts.SourceFile {
    const scriptKind = language === 'typescriptreact' ? ts.ScriptKind.TSX
      : language === 'javascript' ? ts.ScriptKind.JS
      : language === 'javascriptreact' ? ts.ScriptKind.JSX
      : ts.ScriptKind.TS;
    return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind);
  }

  private functionLikeName(node: ts.Node, sourceFile: ts.SourceFile): string | null {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const parent = node.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
      if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
    }
    if (ts.isClassDeclaration(node) && node.name) return node.name.text;
    return null;
  }

  private callTargetName(expression: ts.Expression, sourceFile: ts.SourceFile): string | null {
    if (ts.isIdentifier(expression)) return expression.text;
    if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
    if (ts.isElementAccessExpression(expression)) {
      return expression.argumentExpression?.getText(sourceFile).replace(/^['"]|['"]$/g, '') || null;
    }
    return null;
  }

  private extractRegexSymbols(
    filePath: string,
    language: string,
    text: string,
    patterns: Array<{ kind: CodeSymbolKind; regex: RegExp }>,
  ): CodeSymbol[] {
    const symbols: CodeSymbol[] = [];
    const lineStarts = this.lineStarts(text);

    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(text))) {
        const name = match[1];
        if (!name || this.isKeyword(name)) continue;
        const position = this.offsetToLineColumn(match.index, lineStarts);
        const line = this.getLine(text, position.line);
        symbols.push({
          name,
          kind: pattern.kind,
          path: filePath,
          line: position.line,
          column: position.column,
          language,
          signature: line.trim().slice(0, 240),
        });
      }
    }

    return this.dedupeSymbols(symbols);
  }

  private createChunks(filePath: string, language: string, text: string): CodeChunk[] {
    const lines = text.split(/\r?\n/);
    const chunks: CodeChunk[] = [];
    const chunkSize = 80;
    const overlap = 12;

    for (let start = 0; start < lines.length; start += chunkSize - overlap) {
      const end = Math.min(lines.length, start + chunkSize);
      const chunkText = lines.slice(start, end).join('\n').trim();
      if (chunkText.length < 12) continue;
      chunks.push({
        id: `${filePath}:${start + 1}-${end}`,
        path: filePath,
        startLine: start + 1,
        endLine: end,
        text: chunkText,
        language,
        vector: this.vectorize(chunkText),
      });
      if (end >= lines.length) break;
    }

    return chunks;
  }

  private symbolScore(symbol: CodeSymbol, query: string): number {
    const name = symbol.name.toLowerCase();
    const pathScore = symbol.path.toLowerCase().includes(query) ? 1 : 0;
    if (name === query) return 10 + pathScore;
    if (name.startsWith(query)) return 7 + pathScore;
    if (name.includes(query)) return 5 + pathScore;
    const signature = symbol.signature?.toLowerCase() || '';
    if (signature.includes(query)) return 2 + pathScore;
    return pathScore;
  }

  private vectorize(text: string): number[] {
    const vector = new Array(VECTOR_DIMENSIONS).fill(0);
    const tokens = text.toLowerCase().match(/[a-z0-9_.$/-]+|[\u4e00-\u9fa5]+/g) || [];

    for (const token of tokens) {
      const index = this.hashToken(token) % VECTOR_DIMENSIONS;
      vector[index] += 1 / Math.sqrt(Math.max(1, token.length));
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return magnitude > 0 ? vector.map(value => value / magnitude) : vector;
  }

  private cosineSimilarity(left: number[], right: number[]): number {
    let score = 0;
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      score += left[index] * right[index];
    }
    return score;
  }

  private hashToken(token: string): number {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index++) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private lineStarts(text: string): number[] {
    const starts = [0];
    for (let index = 0; index < text.length; index++) {
      if (text[index] === '\n') starts.push(index + 1);
    }
    return starts;
  }

  private offsetToLineColumn(offset: number, lineStarts: number[]): { line: number; column: number } {
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

  private getLine(text: string, lineNumber: number): string {
    return text.split(/\r?\n/)[lineNumber - 1] || '';
  }

  private dedupeSymbols(symbols: CodeSymbol[]): CodeSymbol[] {
    const seen = new Set<string>();
    return symbols.filter(symbol => {
      const key = `${symbol.path}:${symbol.line}:${symbol.name}:${symbol.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private dedupeReferences(references: CodeReference[]): CodeReference[] {
    const seen = new Set<string>();
    return references.filter(reference => {
      const key = `${reference.path}:${reference.line}:${reference.column}:${reference.symbolName}:${reference.referenceKind}:${reference.containerName || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private dedupeCallGraph(edges: CodeCallGraphEdge[]): CodeCallGraphEdge[] {
    const seen = new Set<string>();
    return edges.filter(edge => {
      const key = `${edge.path}:${edge.line}:${edge.column}:${edge.fromSymbol}:${edge.toSymbol}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private isKeyword(name: string): boolean {
    return ['if', 'for', 'while', 'switch', 'catch', 'return'].includes(name);
  }

  private preview(text: string): string {
    return text.replace(/\s+/g, ' ').trim().slice(0, 320);
  }

  private toPosixPath(filePath: string): string {
    return filePath.split(path.sep).join('/');
  }

  private hashText(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }
}