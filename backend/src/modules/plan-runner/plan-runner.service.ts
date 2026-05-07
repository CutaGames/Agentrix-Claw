import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter } from 'events';
import { ApprovalService } from '../approval/approval.service';
import { ToolRegistryService } from '../tool-registry/tool-registry.service';
import {
  Plan as PlanEntity,
  PlanStepSnapshot,
  PlanStatus,
  PlanArtifact,
} from '../../entities/plan.entity';

/** Events emitted on the plan event bus (consumed by SSE controller). */
export type PlanEvent =
  | { type: 'plan.started'; planId: string; at: number }
  | { type: 'plan.step.started'; planId: string; stepId: string; index: number; at: number }
  | { type: 'plan.step.progress'; planId: string; stepId: string; message: string; at: number }
  | { type: 'plan.step.artifact'; planId: string; stepId: string; artifact: PlanArtifact; at: number }
  | { type: 'plan.step.done'; planId: string; stepId: string; result?: string; at: number }
  | { type: 'plan.step.failed'; planId: string; stepId: string; error: string; at: number }
  | { type: 'plan.done'; planId: string; at: number }
  | { type: 'plan.failed'; planId: string; error: string; at: number };

/**
 * 顿领 §5.4 Plan-Approval 闭环（v3 持久化版 / §9.3 spike）
 *
 *   submit  → 创建 Plan + 关联 ApprovalRequest（risk 由 plan 自评） → 推送审批
 *   approve → ApprovalRequest 通过后由 Plan Runner 执行（mock 顺序执行步骤）
 *
 *   持久化：plans 表（PlanEntity）。原 in-memory `plans` Map / `approvalToPlan`
 *   反向索引 全部由数据库承载。
 */
export type PlanStep = PlanStepSnapshot;

export interface Plan {
  id: string;
  userId: string;
  title: string;
  intent: string;
  steps: PlanStep[];
  approvalId?: string;
  status: PlanStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface SubmitPlanInput {
  title: string;
  intent: string;
  steps: Array<{ kind: string; description: string; args?: Record<string, unknown> }>;
  initiator_surface: 'mobile' | 'desktop' | 'web' | 'watch' | 'glass';
  /** 可选：覆盖默认风险评估 */
  risk_level?: 0 | 1 | 2 | 3;
}

@Injectable()
export class PlanRunnerService {
  private readonly logger = new Logger(PlanRunnerService.name);
  /** Per-plan event bus. Consumers (SSE controller) subscribe via subscribe(). */
  private readonly bus = new EventEmitter();

  constructor(
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
    private readonly approvals: ApprovalService,
    private readonly tools: ToolRegistryService,
  ) {
    // Avoid "too many listeners" warnings under high concurrency
    this.bus.setMaxListeners(0);
  }

  /** Subscribe to all events for a given plan. Returns an unsubscribe fn. */
  subscribe(planId: string, handler: (e: PlanEvent) => void): () => void {
    const wrapped = (e: PlanEvent) => {
      if ((e as any).planId === planId) handler(e);
    };
    this.bus.on('event', wrapped);
    return () => this.bus.off('event', wrapped);
  }

  private emit(e: PlanEvent): void {
    this.bus.emit('event', e);
  }

  async submit(userId: string, input: SubmitPlanInput): Promise<Plan> {
    const externalId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const steps: PlanStep[] = input.steps.map((s, i) => ({
      id: `${externalId}.s${i}`,
      kind: s.kind,
      description: s.description,
      args: s.args,
      status: 'pending',
    }));
    const risk = input.risk_level ?? this.assessRisk(input);

    const approval = await this.approvals.create({
      userId,
      action: {
        kind: 'write',
        resource: `plan:${input.title.slice(0, 40)}`,
        payload: {
          plan_id: externalId,
          steps_count: steps.length,
          intent: input.intent,
          kind: 'plan',
        },
      },
      riskLevel: risk,
      initiatorSurface: input.initiator_surface,
    });

    const status: PlanStatus =
      approval.status === 'approved' ? 'approved' : 'awaiting_approval';

    const entity = this.planRepo.create({
      externalId,
      userId,
      title: input.title,
      intent: input.intent,
      steps,
      approvalId: approval.id,
      status,
      createdAtMs: String(Date.now()),
      startedAtMs: null,
      finishedAtMs: null,
    });
    const saved = await this.planRepo.save(entity);

    if (saved.status === 'approved') {
      this.runAsync(saved.externalId).catch((e) =>
        this.logger.warn(`auto-run failed: ${e?.message ?? e}`),
      );
    }

    return this.toPlan(saved);
  }

  async onApprovalApproved(approvalId: string): Promise<Plan | undefined> {
    const entity = await this.planRepo.findOne({ where: { approvalId } });
    if (!entity) return undefined;
    if (entity.status !== 'awaiting_approval') return this.toPlan(entity);
    entity.status = 'approved';
    const saved = await this.planRepo.save(entity);
    this.runAsync(saved.externalId).catch((e) =>
      this.logger.warn(`run failed: ${e?.message ?? e}`),
    );
    return this.toPlan(saved);
  }

  /** Mobile/Desktop/Watch 任一端审批通过后，前端调此 endpoint 触发执行 */
  async runAfterApproval(planId: string, userId: string): Promise<Plan> {
    const entity = await this.planRepo.findOne({ where: { externalId: planId } });
    if (!entity || entity.userId !== userId) throw new NotFoundException('plan not found');
    if (entity.status !== 'awaiting_approval' && entity.status !== 'approved') {
      return this.toPlan(entity);
    }

    if (entity.approvalId) {
      const a = await this.approvals.get(entity.approvalId, userId).catch(() => null);
      if (!a || a.status !== 'approved') {
        return this.toPlan(entity);
      }
    }
    entity.status = 'approved';
    const saved = await this.planRepo.save(entity);
    this.runAsync(saved.externalId).catch((e) =>
      this.logger.warn(`run failed: ${e?.message ?? e}`),
    );
    return this.toPlan(saved);
  }

  async get(planId: string, userId: string): Promise<Plan> {
    const entity = await this.planRepo.findOne({ where: { externalId: planId } });
    if (!entity || entity.userId !== userId) throw new NotFoundException('plan not found');
    return this.toPlan(entity);
  }

  async list(userId: string, status?: Plan['status']): Promise<Plan[]> {
    const where: Record<string, unknown> = { userId };
    if (status) where.status = status;
    const rows = await this.planRepo.find({
      where,
      order: { createdAtMs: 'DESC' },
    });
    return rows.map((e) => this.toPlan(e));
  }

  // ── internals ─────────────────────────────────────────────────────────

  private assessRisk(input: SubmitPlanInput): 0 | 1 | 2 | 3 {
    const text = (input.title + ' ' + input.intent).toLowerCase();
    if (/\b(transfer|withdraw|swap|sign|deploy|delete)\b/.test(text)) return 2;
    if (/\b(send|post|publish|email|message)\b/.test(text)) return 1;
    return 0;
  }

  private async runAsync(externalId: string): Promise<void> {
    const entity = await this.planRepo.findOne({ where: { externalId } });
    if (!entity) return;
    entity.status = 'running';
    entity.startedAtMs = String(Date.now());
    await this.planRepo.save(entity);
    this.emit({ type: 'plan.started', planId: entity.externalId, at: Date.now() });

    let planFailed = false;
    let planFailReason = '';

    for (let i = 0; i < entity.steps.length; i++) {
      const step = entity.steps[i];
      const startedAt = Date.now();
      step.status = 'running';
      step.startedAtMs = startedAt;
      entity.steps = [...entity.steps];
      await this.planRepo.save(entity);
      this.emit({
        type: 'plan.step.started',
        planId: entity.externalId,
        stepId: step.id,
        index: i,
        at: startedAt,
      });

      try {
        await this.executeStep(entity, step);
        const finishedAt = Date.now();
        step.status = 'done';
        step.finishedAtMs = finishedAt;
        step.durationMs = finishedAt - startedAt;
        entity.steps = [...entity.steps];
        await this.planRepo.save(entity);
        this.emit({
          type: 'plan.step.done',
          planId: entity.externalId,
          stepId: step.id,
          result: step.result,
          at: finishedAt,
        });
      } catch (err: any) {
        const finishedAt = Date.now();
        step.status = 'failed';
        step.error = err?.message ?? String(err);
        step.finishedAtMs = finishedAt;
        step.durationMs = finishedAt - startedAt;
        entity.steps = [...entity.steps];
        await this.planRepo.save(entity);
        this.emit({
          type: 'plan.step.failed',
          planId: entity.externalId,
          stepId: step.id,
          error: step.error!,
          at: finishedAt,
        });
        planFailed = true;
        planFailReason = step.error!;
        // Mark remaining as skipped
        for (let j = i + 1; j < entity.steps.length; j++) {
          entity.steps[j].status = 'skipped';
        }
        entity.steps = [...entity.steps];
        await this.planRepo.save(entity);
        break;
      }
    }

    entity.status = planFailed ? 'failed' : 'done';
    entity.finishedAtMs = String(Date.now());
    await this.planRepo.save(entity);
    if (planFailed) {
      this.emit({ type: 'plan.failed', planId: entity.externalId, error: planFailReason, at: Date.now() });
      this.logger.warn(`plan ${entity.externalId} failed: ${planFailReason}`);
    } else {
      this.emit({ type: 'plan.done', planId: entity.externalId, at: Date.now() });
      this.logger.log(`plan ${entity.externalId} completed (${entity.steps.length} steps)`);
    }
  }

  /**
   * Execute a single step. Routes by step.kind:
   *   - `tool:<toolName>` → ToolRegistry.execute(toolName, args)
   *   - anything else     → mock (50ms sleep)
   */
  private async executeStep(entity: PlanEntity, step: PlanStepSnapshot): Promise<void> {
    if (step.kind.startsWith('tool:')) {
      const toolName = step.kind.slice('tool:'.length).trim();
      const tool = this.tools.get(toolName);
      if (!tool) {
        throw new Error(`tool not registered: ${toolName}`);
      }
      const result = await this.tools.execute(toolName, step.args ?? {}, {
        userId: entity.userId,
        sessionId: entity.externalId,
        metadata: { planStepId: step.id },
      });
      if (!result.success) {
        throw new Error(result.error ?? 'tool execution failed');
      }
      const dataStr =
        typeof result.data === 'string' ? result.data : JSON.stringify(result.data ?? {});
      step.result = dataStr.slice(0, 240);
      // Store full result as a json artifact for UI
      const artifact: PlanArtifact = {
        id: `${step.id}.a0`,
        kind: typeof result.data === 'string' ? 'text' : 'json',
        title: `${toolName} output`,
        content: dataStr.length > 8000 ? dataStr.slice(0, 8000) + '\n...[truncated]' : dataStr,
        bytes: dataStr.length,
        createdAtMs: Date.now(),
      };
      step.artifacts = [...(step.artifacts ?? []), artifact];
      this.emit({
        type: 'plan.step.artifact',
        planId: entity.externalId,
        stepId: step.id,
        artifact,
        at: Date.now(),
      });
      return;
    }

    // Legacy mock path (kept for backward compat with existing tests)
    await new Promise((r) => setTimeout(r, 50));
    step.result = `[mock] ${step.kind} executed: ${step.description.slice(0, 40)}`;
  }

  private toPlan(entity: PlanEntity): Plan {
    return {
      id: entity.externalId,
      userId: entity.userId,
      title: entity.title,
      intent: entity.intent,
      steps: entity.steps ?? [],
      approvalId: entity.approvalId ?? undefined,
      status: entity.status,
      createdAt: Number(entity.createdAtMs),
      startedAt: entity.startedAtMs ? Number(entity.startedAtMs) : undefined,
      finishedAt: entity.finishedAtMs ? Number(entity.finishedAtMs) : undefined,
    };
  }
}

