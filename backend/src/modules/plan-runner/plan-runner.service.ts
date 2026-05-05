import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApprovalService } from '../approval/approval.service';
import { Plan as PlanEntity, PlanStepSnapshot, PlanStatus } from '../../entities/plan.entity';

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

  constructor(
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
    private readonly approvals: ApprovalService,
  ) {}

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

    for (let i = 0; i < entity.steps.length; i++) {
      const step = entity.steps[i];
      step.status = 'running';
      entity.steps = [...entity.steps];
      await this.planRepo.save(entity);

      // mock 执行 — 50ms / step
      await new Promise((r) => setTimeout(r, 50));

      step.status = 'done';
      step.result = `[mock] ${step.kind} executed: ${step.description.slice(0, 40)}`;
      entity.steps = [...entity.steps];
      await this.planRepo.save(entity);
    }

    entity.status = 'done';
    entity.finishedAtMs = String(Date.now());
    await this.planRepo.save(entity);
    this.logger.log(`plan ${entity.externalId} completed (${entity.steps.length} steps)`);
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

