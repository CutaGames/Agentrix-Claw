import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApprovalService } from '../approval/approval.service';

/**
 * 顿领 §5.4 Plan-Approval 闭环（P1-4）
 *
 *   submit  → 创建 Plan + 关联 ApprovalRequest（risk 由 plan 自评） → 推送审批
 *   approve → ApprovalRequest 通过后由 Plan Runner 执行（mock 顺序执行步骤）
 *
 * 当前 P1 阶段：进程内 plans，run 用 setTimeout mock，每步生成 result 摘要。
 */
export interface PlanStep {
  id: string;
  kind: string;
  description: string;
  args?: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'failed';
  result?: string;
}

export interface Plan {
  id: string;
  userId: string;
  title: string;
  intent: string;
  steps: PlanStep[];
  approvalId?: string;
  status: 'draft' | 'awaiting_approval' | 'approved' | 'denied' | 'running' | 'done' | 'failed';
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
  private plans = new Map<string, Plan>();
  /** approvalId → planId reverse index */
  private approvalToPlan = new Map<string, string>();

  constructor(private readonly approvals: ApprovalService) {}

  async submit(userId: string, input: SubmitPlanInput): Promise<Plan> {
    const id = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const steps: PlanStep[] = input.steps.map((s, i) => ({
      id: `${id}.s${i}`,
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
        payload: { plan_id: id, steps_count: steps.length, intent: input.intent, kind: 'plan' },
      },
      riskLevel: risk,
      initiatorSurface: input.initiator_surface,
    });

    const plan: Plan = {
      id,
      userId,
      title: input.title,
      intent: input.intent,
      steps,
      approvalId: approval.id,
      status: approval.status === 'approved' ? 'approved' : 'awaiting_approval',
      createdAt: Date.now(),
    };
    this.plans.set(id, plan);
    this.approvalToPlan.set(approval.id, id);

    if (plan.status === 'approved') {
      this.runAsync(plan).catch((e) => this.logger.warn(`auto-run failed: ${e.message}`));
    }

    return plan;
  }

  async onApprovalApproved(approvalId: string): Promise<Plan | undefined> {
    const planId = this.approvalToPlan.get(approvalId);
    if (!planId) return undefined;
    const plan = this.plans.get(planId);
    if (!plan || plan.status !== 'awaiting_approval') return plan;
    plan.status = 'approved';
    this.runAsync(plan).catch((e) => this.logger.warn(`run failed: ${e.message}`));
    return plan;
  }

  /** Mobile/Desktop/Watch 任一端审批通过后，前端调此 endpoint 触发执行 */
  async runAfterApproval(planId: string, userId: string): Promise<Plan> {
    const plan = this.plans.get(planId);
    if (!plan || plan.userId !== userId) throw new NotFoundException('plan not found');
    if (plan.status !== 'awaiting_approval' && plan.status !== 'approved') return plan;

    // 检查 approval 状态
    if (plan.approvalId) {
      const a = await this.approvals.get(plan.approvalId, userId).catch(() => null);
      if (!a || a.status !== 'approved') {
        return plan;
      }
    }
    plan.status = 'approved';
    this.runAsync(plan).catch((e) => this.logger.warn(`run failed: ${e.message}`));
    return plan;
  }

  get(planId: string, userId: string): Plan {
    const plan = this.plans.get(planId);
    if (!plan || plan.userId !== userId) throw new NotFoundException('plan not found');
    return plan;
  }

  list(userId: string, status?: Plan['status']): Plan[] {
    const out: Plan[] = [];
    for (const p of this.plans.values()) {
      if (p.userId !== userId) continue;
      if (status && p.status !== status) continue;
      out.push(p);
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out;
  }

  // ── internals ─────────────────────────────────────────────────────────

  private assessRisk(input: SubmitPlanInput): 0 | 1 | 2 | 3 {
    const text = (input.title + ' ' + input.intent).toLowerCase();
    if (/\b(transfer|withdraw|swap|sign|deploy|delete)\b/.test(text)) return 2;
    if (/\b(send|post|publish|email|message)\b/.test(text)) return 1;
    return 0;
  }

  private async runAsync(plan: Plan) {
    plan.status = 'running';
    plan.startedAt = Date.now();
    for (const step of plan.steps) {
      step.status = 'running';
      // mock 执行 — 50ms / step
      await new Promise((r) => setTimeout(r, 50));
      step.status = 'done';
      step.result = `[mock] ${step.kind} executed: ${step.description.slice(0, 40)}`;
    }
    plan.status = 'done';
    plan.finishedAt = Date.now();
    this.logger.log(`plan ${plan.id} completed (${plan.steps.length} steps)`);
  }
}
