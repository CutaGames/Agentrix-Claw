import {
  Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ModuleRef } from '@nestjs/core';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { Workflow, WorkflowRunStatus } from '../../entities/workflow.entity';

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  triggerType?: 'cron' | 'webhook' | 'manual';
  cronExpression?: string;
  prompt: string;
  enabled?: boolean;
}

export interface UpdateWorkflowDto extends Partial<CreateWorkflowDto> {
  enabled?: boolean;
}

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectRepository(Workflow)
    private readonly workflowRepo: Repository<Workflow>,
    private readonly moduleRef: ModuleRef,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async findAll(userId: string): Promise<Workflow[]> {
    return this.workflowRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, userId: string): Promise<Workflow> {
    const wf = await this.workflowRepo.findOne({ where: { id } });
    if (!wf) throw new NotFoundException('Workflow not found');
    if (wf.userId !== userId) throw new ForbiddenException();
    return wf;
  }

  async create(userId: string, dto: CreateWorkflowDto): Promise<Workflow> {
    if (dto.triggerType === 'cron' && dto.cronExpression) {
      this.validateCronFrequency(dto.cronExpression);
    }
    const wf = this.workflowRepo.create({
      userId,
      name: dto.name,
      description: dto.description ?? '',
      triggerType: dto.triggerType ?? 'manual',
      cronExpression: dto.triggerType === 'cron' ? dto.cronExpression : undefined,
      webhookToken:
        dto.triggerType === 'webhook'
          ? crypto.randomBytes(24).toString('hex')
          : undefined,
      prompt: dto.prompt,
      enabled: dto.enabled ?? true,
    });
    return this.workflowRepo.save(wf);
  }

  async update(id: string, userId: string, dto: UpdateWorkflowDto): Promise<Workflow> {
    if (dto.cronExpression !== undefined) {
      this.validateCronFrequency(dto.cronExpression);
    }
    const wf = await this.findOne(id, userId);
    Object.assign(wf, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.triggerType !== undefined && { triggerType: dto.triggerType }),
      ...(dto.cronExpression !== undefined && { cronExpression: dto.cronExpression }),
      ...(dto.prompt !== undefined && { prompt: dto.prompt }),
      ...(dto.enabled !== undefined && { enabled: dto.enabled }),
    });
    return this.workflowRepo.save(wf);
  }

  async toggle(id: string, userId: string, enabled: boolean): Promise<Workflow> {
    const wf = await this.findOne(id, userId);
    wf.enabled = enabled;
    return this.workflowRepo.save(wf);
  }

  async remove(id: string, userId: string): Promise<void> {
    const wf = await this.findOne(id, userId);
    await this.workflowRepo.remove(wf);
  }

  // ─── Run ──────────────────────────────────────────────────────────────────

  async run(id: string, userId: string): Promise<{ runId: string }> {
    const wf = await this.findOne(id, userId);
    return this.executeWorkflow(wf);
  }

  /**
   * Find a workflow by webhook token (no auth — token IS the credential)
   */
  async findByWebhookToken(token: string): Promise<Workflow | null> {
    return this.workflowRepo.findOne({ where: { webhookToken: token, enabled: true } });
  }

  async runByWebhook(token: string): Promise<{ runId: string } | null> {
    const wf = await this.findByWebhookToken(token);
    if (!wf) return null;
    return this.executeWorkflow(wf);
  }

  // ─── Internal Execution ───────────────────────────────────────────────────

  private async executeWorkflow(wf: Workflow): Promise<{ runId: string }> {
    const runId = crypto.randomUUID();
    this.logger.log(`Running workflow "${wf.name}" (${wf.id}) — runId: ${runId}`);

    // Mark as running
    await this.workflowRepo.update(wf.id, {
      lastRunAt: new Date(),
      lastRunStatus: 'running' as WorkflowRunStatus,
    });

    // Fire-and-forget execution (non-blocking)
    this.doRun(wf, runId).catch((err) => {
      this.logger.error(`Workflow ${wf.id} failed: ${err.message}`);
    });

    return { runId };
  }

  private async doRun(wf: Workflow, _runId: string): Promise<void> {
    try {
      this.logger.log(`Executing prompt for "${wf.name}": ${wf.prompt.slice(0, 80)}...`);

      // Lazy-resolve OpenClawProxyService to avoid circular module deps
      const { OpenClawProxyService } = await import('../openclaw-proxy/openclaw-proxy.service');
      const proxyService = this.moduleRef.get(OpenClawProxyService, { strict: false });

      if (proxyService) {
        const result = await proxyService.sendDefaultChat(wf.userId, {
          message: `[Scheduled Workflow: ${wf.name}]\n\n${wf.prompt}`,
          mode: 'agent',
          platform: 'web',
        });
        this.logger.log(`Workflow "${wf.name}" completed. Response length: ${result?.text?.length || 0}`);
      } else {
        this.logger.warn(`Workflow "${wf.name}": OpenClawProxyService not available, skipping LLM execution`);
      }

      await this.workflowRepo.update(wf.id, {
        lastRunStatus: 'success' as WorkflowRunStatus,
        runCount: () => 'run_count + 1',
      });
    } catch (err: any) {
      this.logger.error(`Workflow "${wf.name}" execution failed: ${err.message}`);
      await this.workflowRepo.update(wf.id, {
        lastRunStatus: 'error' as WorkflowRunStatus,
      });
      throw err;
    }
  }

  /**
   * Reject cron expressions that fire more frequently than every 5 minutes.
   * Prevents runaway workflows from burning API quota.
   */
  private validateCronFrequency(cron: string): void {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return; // malformed — let cron lib handle it
    const minuteField = parts[0];
    // "* * * * *" or "*/1 * * * *" or similar patterns that fire every 1–4 minutes
    if (minuteField === '*' || /^\*\/[1-4]$/.test(minuteField)) {
      throw new BadRequestException(
        'Cron expression fires too frequently. Minimum interval is every 5 minutes (e.g. "*/5 * * * *").',
      );
    }
  }

  // ─── Cron Dispatcher ─────────────────────────────────────────────────────
  // Runs every minute and dispatches any workflow whose cron expression matches
  // the current time using node-schedule-compatible minute-level granularity.

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchCronWorkflows(): Promise<void> {
    const enabled = await this.workflowRepo.find({
      where: { triggerType: 'cron', enabled: true },
    });

    if (enabled.length === 0) return;

    const now = new Date();
    for (const wf of enabled) {
      if (this.cronMatches(wf.cronExpression, now)) {
        this.logger.log(`Cron dispatch: ${wf.name}`);
        await this.executeWorkflow(wf).catch((e) =>
          this.logger.warn(`Cron dispatch failed for ${wf.id}: ${e.message}`),
        );
      }
    }
  }

  /**
   * Minimal cron expression evaluator (supports standard 5-part POSIX cron).
   * Format: MIN HOUR DOM MON DOW
   */
  private cronMatches(expr: string, now: Date): boolean {
    if (!expr) return false;
    try {
      const parts = expr.trim().split(/\s+/);
      if (parts.length !== 5) return false;
      const [min, hour, _dom, _mon, dow] = parts;
      const matchPart = (part: string, val: number): boolean => {
        if (part === '*') return true;
        if (part.startsWith('*/')) {
          const step = parseInt(part.slice(2));
          return val % step === 0;
        }
        if (part.includes('-')) {
          const [lo, hi] = part.split('-').map(Number);
          return val >= lo && val <= hi;
        }
        if (part.includes(',')) {
          return part.split(',').map(Number).includes(val);
        }
        return parseInt(part) === val;
      };
      return (
        matchPart(min, now.getMinutes()) &&
        matchPart(hour, now.getHours()) &&
        matchPart(dow, now.getDay())
      );
    } catch {
      return false;
    }
  }
}
