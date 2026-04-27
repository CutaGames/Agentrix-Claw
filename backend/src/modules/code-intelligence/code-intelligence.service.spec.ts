import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { CodeIntelligenceService } from './code-intelligence.service';

describe('CodeIntelligenceService', () => {
  let tempDir: string;
  let service: CodeIntelligenceService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentrix-code-index-'));
    service = new CodeIntelligenceService();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('indexes TypeScript and Rust symbols with LSP-style locations', async () => {
    await fs.writeFile(path.join(tempDir, 'agent.ts'), [
      'export interface AgentPlan { id: string }',
      'export class ParallelLaneRunner {',
      '  async executeLane() { return true; }',
      '}',
      'export function mergeResults() { return []; }',
    ].join('\n'));
    await fs.writeFile(path.join(tempDir, 'bridge.rs'), [
      'pub struct DesktopBridge;',
      'pub async fn search_workspace_files() {}',
    ].join('\n'));

    const snapshot = await service.indexWorkspace({ rootPath: tempDir });
    const symbols = service.searchSymbols('ParallelLaneRunner');
    const rustSymbols = service.searchSymbols('search_workspace_files');

    expect(snapshot.fileCount).toBe(2);
    expect(snapshot.symbolCount).toBeGreaterThanOrEqual(5);
    expect(symbols[0]).toEqual(expect.objectContaining({
      name: 'ParallelLaneRunner',
      kind: 'class',
      path: 'agent.ts',
      line: 2,
      language: 'typescript',
    }));
    expect(rustSymbols[0]).toEqual(expect.objectContaining({
      name: 'search_workspace_files',
      kind: 'function',
      path: 'bridge.rs',
      language: 'rust',
    }));
    expect(service.getDocumentSymbols('agent.ts').map(symbol => symbol.name)).toContain('mergeResults');
  });

  it('returns semantic vector results for related code text', async () => {
    await fs.writeFile(path.join(tempDir, 'repair.ts'), [
      'export function parseTypeScriptDiagnostics(output: string) {',
      '  return output.split("\\n").filter(line => line.includes("error TS"));',
      '}',
    ].join('\n'));
    await fs.writeFile(path.join(tempDir, 'billing.ts'), 'export const invoiceTotal = 42;');

    await service.indexWorkspace({ rootPath: tempDir });
    const results = service.semanticSearch('typescript diagnostics error parser', 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].path).toBe('repair.ts');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('skips heavy directories while walking the workspace', async () => {
    await fs.mkdir(path.join(tempDir, 'node_modules'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'node_modules', 'ignored.ts'), 'export const ignored = true;');
    await fs.writeFile(path.join(tempDir, 'kept.ts'), 'export const kept = true;');

    await service.indexWorkspace({ rootPath: tempDir });

    expect(service.searchSymbols('kept')).toHaveLength(1);
    expect(service.searchSymbols('ignored')).toHaveLength(0);
  });

  it('indexes TypeScript references, call graph edges, and file hashes', async () => {
    await fs.writeFile(path.join(tempDir, 'runner.ts'), [
      'export class AgentRunner {',
      '  executeLane() { return helper(); }',
      '}',
      'export function helper() { return true; }',
      'export function run() {',
      '  const runner = new AgentRunner();',
      '  return runner.executeLane();',
      '}',
    ].join('\n'));

    const snapshot = await service.indexWorkspace({ rootPath: tempDir });
    const references = service.findReferences('executeLane');
    const callers = service.getCallGraph('executeLane', 'callers');
    const hybrid = service.hybridSearch('executeLane', 5);

    expect(snapshot.files[0]).toEqual(expect.objectContaining({ path: 'runner.ts', hash: expect.any(String) }));
    expect(snapshot.referenceCount).toBeGreaterThanOrEqual(3);
    expect(references.map(ref => ref.referenceKind)).toEqual(expect.arrayContaining(['definition', 'call']));
    expect(callers).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromSymbol: 'run', toSymbol: 'executeLane' }),
    ]));
    expect(hybrid[0].path).toBe('runner.ts');
  });
});