import { Injectable } from '@nestjs/common';

export type RepairDiagnosticSource = 'typescript' | 'rust' | 'eslint' | 'jest' | 'generic';

export interface RepairCommandResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  timedOut?: boolean;
}

export interface RepairDiagnostic {
  source: RepairDiagnosticSource;
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  severity: 'error' | 'warning';
  raw: string;
}

export interface RepairPatchPlan {
  summary: string;
  patches: Array<{
    file: string;
    description: string;
    unifiedDiff?: string;
  }>;
}

export interface AutoRepairAttempt {
  attempt: number;
  commandResult: RepairCommandResult;
  diagnostics: RepairDiagnostic[];
  patchPlan?: RepairPatchPlan;
  status: 'passed' | 'patched' | 'failed' | 'needs_patch_generator';
}

export interface AutoRepairLoopOptions {
  command: string;
  maxAttempts?: number;
  runCommand: () => Promise<RepairCommandResult>;
  generatePatch?: (input: {
    command: string;
    attempt: number;
    diagnostics: RepairDiagnostic[];
    repairPrompt: string;
  }) => Promise<RepairPatchPlan | null>;
  applyPatch?: (patchPlan: RepairPatchPlan) => Promise<void>;
}

export interface AutoRepairLoopResult {
  status: 'passed' | 'failed' | 'needs_patch_generator';
  attempts: AutoRepairAttempt[];
  finalDiagnostics: RepairDiagnostic[];
}

@Injectable()
export class AutoRepairService {
  parseDiagnostics(result: RepairCommandResult): RepairDiagnostic[] {
    const output = [result.stdout || '', result.stderr || ''].filter(Boolean).join('\n');
    const diagnostics = [
      ...this.parseTypeScriptDiagnostics(output),
      ...this.parseRustDiagnostics(output),
      ...this.parseEslintDiagnostics(output),
      ...this.parseJestDiagnostics(output),
    ];

    if (diagnostics.length > 0) {
      return this.dedupeDiagnostics(diagnostics).slice(0, 80);
    }

    if ((result.exitCode ?? 0) !== 0 || result.timedOut) {
      return [{
        source: 'generic',
        severity: 'error',
        message: result.timedOut ? 'Command timed out' : 'Command failed without parseable diagnostics',
        raw: output.slice(0, 2_000),
      }];
    }

    return [];
  }

  buildRepairPrompt(command: string, diagnostics: RepairDiagnostic[]): string {
    const lines = diagnostics.slice(0, 20).map((diagnostic, index) => {
      const location = diagnostic.file
        ? `${diagnostic.file}${diagnostic.line ? `:${diagnostic.line}` : ''}${diagnostic.column ? `:${diagnostic.column}` : ''}`
        : 'unknown location';
      const code = diagnostic.code ? ` ${diagnostic.code}` : '';
      return `${index + 1}. [${diagnostic.source}${code}] ${location} - ${diagnostic.message}`;
    });

    return [
      'You are running an automatic repair loop.',
      `Command: ${command}`,
      'Diagnostics:',
      ...lines,
      'Generate the smallest safe patch that addresses the root cause, then rerun the command.',
    ].join('\n');
  }

  async runRepairLoop(options: AutoRepairLoopOptions): Promise<AutoRepairLoopResult> {
    const maxAttempts = Math.max(1, Math.min(options.maxAttempts || 3, 6));
    const attempts: AutoRepairAttempt[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const commandResult = await options.runCommand();
      const diagnostics = this.parseDiagnostics(commandResult);

      if (!commandResult.timedOut && (commandResult.exitCode ?? 0) === 0 && diagnostics.length === 0) {
        attempts.push({ attempt, commandResult, diagnostics, status: 'passed' });
        return { status: 'passed', attempts, finalDiagnostics: [] };
      }

      if (!options.generatePatch || !options.applyPatch) {
        attempts.push({ attempt, commandResult, diagnostics, status: 'needs_patch_generator' });
        return { status: 'needs_patch_generator', attempts, finalDiagnostics: diagnostics };
      }

      const repairPrompt = this.buildRepairPrompt(options.command, diagnostics);
      const patchPlan = await options.generatePatch({
        command: options.command,
        attempt,
        diagnostics,
        repairPrompt,
      });

      if (!patchPlan || patchPlan.patches.length === 0) {
        attempts.push({ attempt, commandResult, diagnostics, patchPlan: patchPlan || undefined, status: 'failed' });
        return { status: 'failed', attempts, finalDiagnostics: diagnostics };
      }

      await options.applyPatch(patchPlan);
      attempts.push({ attempt, commandResult, diagnostics, patchPlan, status: 'patched' });
    }

    const finalDiagnostics = attempts[attempts.length - 1]?.diagnostics || [];
    return { status: 'failed', attempts, finalDiagnostics };
  }

  private parseTypeScriptDiagnostics(output: string): RepairDiagnostic[] {
    const diagnostics: RepairDiagnostic[] = [];
    const pattern = /^(.+?\.(?:ts|tsx|js|jsx))\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(output))) {
      diagnostics.push({
        source: 'typescript',
        file: this.normalizePath(match[1]),
        line: Number(match[2]),
        column: Number(match[3]),
        code: match[4],
        message: match[5].trim(),
        severity: 'error',
        raw: match[0],
      });
    }
    return diagnostics;
  }

  private parseRustDiagnostics(output: string): RepairDiagnostic[] {
    const diagnostics: RepairDiagnostic[] = [];
    const pattern = /error(?:\[(E\d+)\])?:\s+([^\n]+)\n\s+-->\s+([^:\n]+):(\d+):(\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(output))) {
      diagnostics.push({
        source: 'rust',
        file: this.normalizePath(match[3]),
        line: Number(match[4]),
        column: Number(match[5]),
        code: match[1],
        message: match[2].trim(),
        severity: 'error',
        raw: match[0],
      });
    }
    return diagnostics;
  }

  private parseEslintDiagnostics(output: string): RepairDiagnostic[] {
    const diagnostics: RepairDiagnostic[] = [];
    const lines = output.split(/\r?\n/);
    let currentFile = '';

    for (const line of lines) {
      if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(line.trim())) {
        currentFile = this.normalizePath(line.trim());
        continue;
      }

      const match = line.match(/^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+([@\w/-]+)$/);
      if (!match || !currentFile) continue;
      diagnostics.push({
        source: 'eslint',
        file: currentFile,
        line: Number(match[1]),
        column: Number(match[2]),
        code: match[5],
        message: match[4].trim(),
        severity: match[3] as 'error' | 'warning',
        raw: line,
      });
    }

    return diagnostics;
  }

  private parseJestDiagnostics(output: string): RepairDiagnostic[] {
    const diagnostics: RepairDiagnostic[] = [];
    const failPattern = /^FAIL\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = failPattern.exec(output))) {
      diagnostics.push({
        source: 'jest',
        file: this.normalizePath(match[1].trim()),
        message: 'Jest test suite failed',
        severity: 'error',
        raw: match[0],
      });
    }
    return diagnostics;
  }

  private dedupeDiagnostics(diagnostics: RepairDiagnostic[]): RepairDiagnostic[] {
    const seen = new Set<string>();
    return diagnostics.filter(diagnostic => {
      const key = [diagnostic.source, diagnostic.file, diagnostic.line, diagnostic.column, diagnostic.code, diagnostic.message].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }
}