import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as path from 'path';
import { Repository } from 'typeorm';
import {
  AgentRepairAttempt,
  AgentRepairAttemptStatus,
} from '../../entities/agent-repair-attempt.entity';
import {
  AgentRepairJob,
  AgentRepairJobStatus,
} from '../../entities/agent-repair-job.entity';
import {
  AgentRepairPatch,
  AgentRepairPatchStatus,
} from '../../entities/agent-repair-patch.entity';

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
  status: 'passed' | 'patched' | 'failed' | 'needs_patch_generator' | 'needs_approval';
  audit?: {
    jobId?: string;
    attemptId?: string;
    patchId?: string;
    approvalRequired?: boolean;
  };
}

export interface AutoRepairLoopOptions {
  command: string;
  maxAttempts?: number;
  audit?: {
    userId?: string;
    agentId?: string;
    sessionId?: string;
    workspaceRoot?: string;
    approvalRequired?: boolean;
    createdBy?: string;
    metadata?: Record<string, any>;
    autoApprove?: boolean;
  };
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
  status: 'passed' | 'failed' | 'needs_patch_generator' | 'needs_approval';
  attempts: AutoRepairAttempt[];
  finalDiagnostics: RepairDiagnostic[];
  jobId?: string;
}

export interface CreateRepairJobOptions {
  userId?: string;
  agentId?: string;
  sessionId?: string;
  command: string;
  workspaceRoot?: string;
  approvalRequired?: boolean;
  createdBy?: string;
  metadata?: Record<string, any>;
}

export interface RecordRepairAttemptOptions {
  attempt: number;
  commandResult: RepairCommandResult;
  diagnostics?: RepairDiagnostic[];
  status?: AutoRepairAttempt['status'];
  repairPrompt?: string;
  patchPlan?: RepairPatchPlan;
  metadata?: Record<string, any>;
}

export interface RequestPatchApprovalOptions {
  jobId: string;
  attempt: number;
  attemptId?: string;
  patchPlan: RepairPatchPlan;
  requestedBy?: string;
  approvalReason?: string;
  workspaceRoot?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AutoRepairService {
  private readonly memoryJobs = new Map<string, AgentRepairJob>();
  private readonly memoryAttempts = new Map<string, AgentRepairAttempt>();
  private readonly memoryPatches = new Map<string, AgentRepairPatch>();

  constructor(
    @Optional()
    @InjectRepository(AgentRepairJob)
    private readonly repairJobRepo?: Repository<AgentRepairJob>,
    @Optional()
    @InjectRepository(AgentRepairAttempt)
    private readonly repairAttemptRepo?: Repository<AgentRepairAttempt>,
    @Optional()
    @InjectRepository(AgentRepairPatch)
    private readonly repairPatchRepo?: Repository<AgentRepairPatch>,
  ) {}

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
    const job = options.audit
      ? await this.createRepairJob({
          userId: options.audit.userId,
          agentId: options.audit.agentId,
          sessionId: options.audit.sessionId,
          command: options.command,
          workspaceRoot: options.audit.workspaceRoot,
          approvalRequired: options.audit.approvalRequired !== false,
          createdBy: options.audit.createdBy,
          metadata: options.audit.metadata,
        })
      : undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const commandResult = await options.runCommand();
      const diagnostics = this.parseDiagnostics(commandResult);

      if (!commandResult.timedOut && (commandResult.exitCode ?? 0) === 0 && diagnostics.length === 0) {
        const recordedAttempt = job
          ? await this.recordRepairAttempt(job.id, { attempt, commandResult, diagnostics, status: 'passed' })
          : undefined;
        attempts.push({ attempt, commandResult, diagnostics, status: 'passed', audit: this.buildAttemptAudit(job, recordedAttempt) });
        await this.updateRepairJobStatus(job?.id, AgentRepairJobStatus.PASSED, []);
        return { status: 'passed', attempts, finalDiagnostics: [], jobId: job?.id };
      }

      if (!options.generatePatch || !options.applyPatch) {
        const recordedAttempt = job
          ? await this.recordRepairAttempt(job.id, { attempt, commandResult, diagnostics, status: 'needs_patch_generator' })
          : undefined;
        attempts.push({
          attempt,
          commandResult,
          diagnostics,
          status: 'needs_patch_generator',
          audit: this.buildAttemptAudit(job, recordedAttempt),
        });
        await this.updateRepairJobStatus(job?.id, AgentRepairJobStatus.FAILED, diagnostics);
        return { status: 'needs_patch_generator', attempts, finalDiagnostics: diagnostics, jobId: job?.id };
      }

      const repairPrompt = this.buildRepairPrompt(options.command, diagnostics);
      const patchPlan = await options.generatePatch({
        command: options.command,
        attempt,
        diagnostics,
        repairPrompt,
      });

      if (!patchPlan || patchPlan.patches.length === 0) {
        const recordedAttempt = job
          ? await this.recordRepairAttempt(job.id, { attempt, commandResult, diagnostics, patchPlan: patchPlan || undefined, status: 'failed' })
          : undefined;
        attempts.push({
          attempt,
          commandResult,
          diagnostics,
          patchPlan: patchPlan || undefined,
          status: 'failed',
          audit: this.buildAttemptAudit(job, recordedAttempt),
        });
        await this.updateRepairJobStatus(job?.id, AgentRepairJobStatus.FAILED, diagnostics);
        return { status: 'failed', attempts, finalDiagnostics: diagnostics, jobId: job?.id };
      }

      let recordedAttempt: AgentRepairAttempt | undefined;
      let patchRecord: AgentRepairPatch | undefined;
      if (job) {
        recordedAttempt = await this.recordRepairAttempt(job.id, {
          attempt,
          commandResult,
          diagnostics,
          patchPlan,
          status: options.audit?.approvalRequired === false ? 'patched' : 'needs_approval',
          repairPrompt,
        });
        patchRecord = await this.requestPatchApproval({
          jobId: job.id,
          attempt,
          attemptId: recordedAttempt.id,
          patchPlan,
          requestedBy: options.audit?.createdBy,
          workspaceRoot: options.audit?.workspaceRoot,
          approvalReason: 'Auto repair generated a patch plan from diagnostics.',
        });

        if (job.approvalRequired && options.audit?.autoApprove !== true) {
          attempts.push({
            attempt,
            commandResult,
            diagnostics,
            patchPlan,
            status: 'needs_approval',
            audit: this.buildAttemptAudit(job, recordedAttempt, patchRecord),
          });
          await this.updateRepairJobStatus(job.id, AgentRepairJobStatus.NEEDS_APPROVAL, diagnostics);
          return { status: 'needs_approval', attempts, finalDiagnostics: diagnostics, jobId: job.id };
        }

        if (job.approvalRequired && options.audit?.autoApprove === true) {
          patchRecord = await this.reviewRepairPatch(patchRecord.id, {
            reviewerId: options.audit.createdBy || 'auto-repair-policy',
            decision: 'approved',
            reason: 'Auto-approved by repair loop policy.',
          });
        }
      }

      await options.applyPatch(patchPlan);
      if (patchRecord) {
        await this.markPatchApplied(patchRecord.id);
      }
      attempts.push({
        attempt,
        commandResult,
        diagnostics,
        patchPlan,
        status: 'patched',
        audit: this.buildAttemptAudit(job, recordedAttempt, patchRecord),
      });
      await this.updateRepairJobStatus(job?.id, AgentRepairJobStatus.PATCHED, diagnostics);
    }

    const finalDiagnostics = attempts[attempts.length - 1]?.diagnostics || [];
    await this.updateRepairJobStatus(job?.id, AgentRepairJobStatus.FAILED, finalDiagnostics);
    return { status: 'failed', attempts, finalDiagnostics, jobId: job?.id };
  }

  async createRepairJob(options: CreateRepairJobOptions): Promise<AgentRepairJob> {
    if (!options.command?.trim()) {
      throw new BadRequestException('Repair job command is required');
    }

    const job = this.repairJobRepo?.create({
      userId: options.userId,
      agentId: options.agentId,
      sessionId: options.sessionId,
      command: options.command.trim(),
      workspaceRoot: options.workspaceRoot ? this.normalizePath(options.workspaceRoot) : undefined,
      approvalRequired: options.approvalRequired !== false,
      status: AgentRepairJobStatus.CREATED,
      attemptsCount: 0,
      createdBy: options.createdBy,
      metadata: options.metadata,
    }) || this.createMemoryJob(options);

    const saved = this.repairJobRepo ? await this.repairJobRepo.save(job) : job;
    if (!this.repairJobRepo) this.memoryJobs.set(saved.id, saved);
    return saved;
  }

  async recordRepairAttempt(jobId: string, options: RecordRepairAttemptOptions): Promise<AgentRepairAttempt> {
    const job = await this.findRepairJob(jobId);
    const diagnostics = options.diagnostics || this.parseDiagnostics(options.commandResult || {});
    const status = this.toAttemptStatus(options.status || 'failed');
    const attempt = this.repairAttemptRepo?.create({
      jobId,
      attempt: options.attempt,
      status,
      commandResult: options.commandResult || {},
      diagnostics,
      repairPrompt: options.repairPrompt,
      patchPlan: options.patchPlan as any,
      metadata: options.metadata,
    }) || this.createMemoryAttempt(jobId, options, diagnostics, status);

    const saved = this.repairAttemptRepo ? await this.repairAttemptRepo.save(attempt) : attempt;
    if (!this.repairAttemptRepo) this.memoryAttempts.set(saved.id, saved);

    job.attemptsCount = Math.max(job.attemptsCount || 0, options.attempt);
    await this.saveRepairJob(job);
    return saved;
  }

  async requestPatchApproval(options: RequestPatchApprovalOptions): Promise<AgentRepairPatch> {
    const job = await this.findRepairJob(options.jobId);
    if (!options.patchPlan?.patches?.length) {
      throw new BadRequestException('Patch plan must contain at least one patch');
    }

    const workspaceRoot = options.workspaceRoot || job.workspaceRoot;
    const affectedFiles = options.patchPlan.patches.map(patch => this.normalizePath(patch.file));
    for (const file of affectedFiles) {
      if (!this.isWorkspaceContainedFile(file, workspaceRoot)) {
        throw new BadRequestException(`Patch file is outside workspace containment: ${file}`);
      }
    }

    const unifiedDiff = options.patchPlan.patches
      .map(patch => patch.unifiedDiff)
      .filter((diff): diff is string => typeof diff === 'string' && diff.length > 0)
      .join('\n');

    const patch = this.repairPatchRepo?.create({
      jobId: options.jobId,
      attemptId: options.attemptId,
      attempt: options.attempt,
      status: job.approvalRequired ? AgentRepairPatchStatus.PENDING_APPROVAL : AgentRepairPatchStatus.APPROVED,
      patchPlan: options.patchPlan as any,
      affectedFiles,
      unifiedDiff: unifiedDiff || undefined,
      reverseDiff: unifiedDiff ? this.invertUnifiedDiff(unifiedDiff) : undefined,
      approvalReason: options.approvalReason,
      requestedBy: options.requestedBy,
      metadata: options.metadata,
    }) || this.createMemoryPatch(job, options, affectedFiles, unifiedDiff);

    const saved = this.repairPatchRepo ? await this.repairPatchRepo.save(patch) : patch;
    if (!this.repairPatchRepo) this.memoryPatches.set(saved.id, saved);
    if (job.approvalRequired) await this.updateRepairJobStatus(job.id, AgentRepairJobStatus.NEEDS_APPROVAL, undefined);
    return saved;
  }

  async reviewRepairPatch(
    patchId: string,
    options: { reviewerId?: string; decision?: 'approved' | 'rejected'; reason?: string },
  ): Promise<AgentRepairPatch> {
    const patch = await this.findRepairPatch(patchId);
    const decision = options.decision || 'approved';
    patch.status = decision === 'approved' ? AgentRepairPatchStatus.APPROVED : AgentRepairPatchStatus.REJECTED;
    patch.approvedBy = options.reviewerId;
    patch.approvedAt = new Date();
    patch.approvalReason = options.reason || patch.approvalReason;
    const saved = await this.saveRepairPatch(patch);
    await this.updateRepairJobStatus(
      patch.jobId,
      decision === 'approved' ? AgentRepairJobStatus.PATCHED : AgentRepairJobStatus.FAILED,
      undefined,
    );
    return saved;
  }

  async markPatchApplied(patchId: string): Promise<AgentRepairPatch> {
    const patch = await this.findRepairPatch(patchId);
    if (patch.status !== AgentRepairPatchStatus.APPROVED && patch.status !== AgentRepairPatchStatus.APPLIED) {
      throw new BadRequestException(`Patch ${patchId} must be approved before apply`);
    }
    patch.status = AgentRepairPatchStatus.APPLIED;
    return this.saveRepairPatch(patch);
  }

  async getRepairJobTimeline(jobId: string): Promise<{
    job: AgentRepairJob;
    attempts: AgentRepairAttempt[];
    patches: AgentRepairPatch[];
  }> {
    const job = await this.findRepairJob(jobId);
    const attempts = this.repairAttemptRepo
      ? await this.repairAttemptRepo.find({ where: { jobId }, order: { attempt: 'ASC', createdAt: 'ASC' } })
      : [...this.memoryAttempts.values()].filter(attempt => attempt.jobId === jobId).sort((a, b) => a.attempt - b.attempt);
    const patches = this.repairPatchRepo
      ? await this.repairPatchRepo.find({ where: { jobId }, order: { attempt: 'ASC', createdAt: 'ASC' } })
      : [...this.memoryPatches.values()].filter(patch => patch.jobId === jobId).sort((a, b) => a.attempt - b.attempt);
    return { job, attempts, patches };
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

  private async updateRepairJobStatus(jobId: string | undefined, status: AgentRepairJobStatus, diagnostics?: RepairDiagnostic[]): Promise<void> {
    if (!jobId) return;
    const job = await this.findRepairJob(jobId);
    job.status = status;
    if (diagnostics) job.finalDiagnostics = diagnostics;
    if ([AgentRepairJobStatus.PASSED, AgentRepairJobStatus.FAILED, AgentRepairJobStatus.CANCELLED].includes(status)) {
      job.completedAt = new Date();
    }
    await this.saveRepairJob(job);
  }

  private async findRepairJob(jobId: string): Promise<AgentRepairJob> {
    const job = this.repairJobRepo
      ? await this.repairJobRepo.findOne({ where: { id: jobId } })
      : this.memoryJobs.get(jobId);
    if (!job) throw new NotFoundException(`Repair job not found: ${jobId}`);
    return job;
  }

  private async findRepairPatch(patchId: string): Promise<AgentRepairPatch> {
    const patch = this.repairPatchRepo
      ? await this.repairPatchRepo.findOne({ where: { id: patchId } })
      : this.memoryPatches.get(patchId);
    if (!patch) throw new NotFoundException(`Repair patch not found: ${patchId}`);
    return patch;
  }

  private async saveRepairJob(job: AgentRepairJob): Promise<AgentRepairJob> {
    if (this.repairJobRepo) return this.repairJobRepo.save(job);
    job.updatedAt = new Date();
    this.memoryJobs.set(job.id, job);
    return job;
  }

  private async saveRepairPatch(patch: AgentRepairPatch): Promise<AgentRepairPatch> {
    if (this.repairPatchRepo) return this.repairPatchRepo.save(patch);
    patch.updatedAt = new Date();
    this.memoryPatches.set(patch.id, patch);
    return patch;
  }

  private createMemoryJob(options: CreateRepairJobOptions): AgentRepairJob {
    const now = new Date();
    return {
      id: this.newMemoryId('repair-job'),
      userId: options.userId,
      agentId: options.agentId,
      sessionId: options.sessionId,
      command: options.command.trim(),
      workspaceRoot: options.workspaceRoot ? this.normalizePath(options.workspaceRoot) : undefined,
      approvalRequired: options.approvalRequired !== false,
      status: AgentRepairJobStatus.CREATED,
      attemptsCount: 0,
      metadata: options.metadata,
      createdBy: options.createdBy,
      createdAt: now,
      updatedAt: now,
    } as AgentRepairJob;
  }

  private createMemoryAttempt(
    jobId: string,
    options: RecordRepairAttemptOptions,
    diagnostics: RepairDiagnostic[],
    status: AgentRepairAttemptStatus,
  ): AgentRepairAttempt {
    return {
      id: this.newMemoryId('repair-attempt'),
      jobId,
      attempt: options.attempt,
      status,
      commandResult: options.commandResult || {},
      diagnostics,
      repairPrompt: options.repairPrompt,
      patchPlan: options.patchPlan as any,
      metadata: options.metadata,
      createdAt: new Date(),
    } as AgentRepairAttempt;
  }

  private createMemoryPatch(
    job: AgentRepairJob,
    options: RequestPatchApprovalOptions,
    affectedFiles: string[],
    unifiedDiff: string,
  ): AgentRepairPatch {
    const now = new Date();
    return {
      id: this.newMemoryId('repair-patch'),
      jobId: job.id,
      attemptId: options.attemptId,
      attempt: options.attempt,
      status: job.approvalRequired ? AgentRepairPatchStatus.PENDING_APPROVAL : AgentRepairPatchStatus.APPROVED,
      patchPlan: options.patchPlan as any,
      affectedFiles,
      unifiedDiff: unifiedDiff || undefined,
      reverseDiff: unifiedDiff ? this.invertUnifiedDiff(unifiedDiff) : undefined,
      approvalReason: options.approvalReason,
      requestedBy: options.requestedBy,
      metadata: options.metadata,
      createdAt: now,
      updatedAt: now,
    } as AgentRepairPatch;
  }

  private toAttemptStatus(status: AutoRepairAttempt['status']): AgentRepairAttemptStatus {
    switch (status) {
      case 'passed': return AgentRepairAttemptStatus.PASSED;
      case 'patched': return AgentRepairAttemptStatus.PATCHED;
      case 'needs_patch_generator': return AgentRepairAttemptStatus.NEEDS_PATCH_GENERATOR;
      case 'needs_approval': return AgentRepairAttemptStatus.NEEDS_APPROVAL;
      default: return AgentRepairAttemptStatus.FAILED;
    }
  }

  private buildAttemptAudit(
    job?: AgentRepairJob,
    attempt?: AgentRepairAttempt,
    patch?: AgentRepairPatch,
  ): AutoRepairAttempt['audit'] | undefined {
    if (!job && !attempt && !patch) return undefined;
    return {
      jobId: job?.id,
      attemptId: attempt?.id,
      patchId: patch?.id,
      approvalRequired: job?.approvalRequired,
    };
  }

  private isWorkspaceContainedFile(filePath: string, workspaceRoot?: string): boolean {
    const normalized = this.normalizePath(filePath);
    if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith('/')) {
      if (!workspaceRoot) return false;
      const root = path.resolve(workspaceRoot);
      const absolute = path.resolve(normalized);
      return absolute === root || absolute.startsWith(`${root}${path.sep}`);
    }
    if (!workspaceRoot) {
      return !normalized.split('/').includes('..');
    }
    const root = path.resolve(workspaceRoot);
    const absolute = path.resolve(root, normalized);
    return absolute === root || absolute.startsWith(`${root}${path.sep}`);
  }

  private invertUnifiedDiff(diff: string): string {
    return diff
      .split(/\r?\n/)
      .map(line => {
        if (line.startsWith('+++ ')) return line.replace(/^\+\+\+ b\//, '+++ a/');
        if (line.startsWith('--- ')) return line.replace(/^--- a\//, '--- b/');
        if (line.startsWith('+') && !line.startsWith('+++')) return `-${line.slice(1)}`;
        if (line.startsWith('-') && !line.startsWith('---')) return `+${line.slice(1)}`;
        return line;
      })
      .join('\n');
  }

  private newMemoryId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}