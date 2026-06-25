import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditAction, AuditLog, AuditStatus } from '../../entities/audit-log.entity';
import {
  BudgetPool as BudgetPoolEntity,
  BudgetPoolStatus,
  FundingSource,
} from '../../entities/budget-pool.entity';
import {
  SplitPlan as SplitPlanEntity,
  SplitPlanStatus,
  SplitRule,
  SplitSource,
} from '../../entities/split-plan.entity';

/**
 * 顿领 §9.3 + §9.5 SplitPlan + BudgetPool (P1-8)
 *
 *   SplitPlan   收入分账模板：每条 payee 占 X bps（合计 10000）
 *   BudgetPool  支出预算池：每月配额 + 已用 + 关联 agents
 *   AuditEntry  合规审计日志（P1-8 部分 + P3-7 隐私围栏一起继续扩展）
 *
 * 当前 P1：进程内实现，可被 Web Console 直接调用。Commission V4 实际写库
 * 留给 P2 做替换 — 这里返回 commission_settlement_preview 作为占位。
 */
export interface SplitPayee {
  payee_kind: 'user' | 'agent' | 'team' | 'external';
  payee_id: string;
  bps: number; // basis points 0-10000
  label?: string;
}

export interface SplitPlan {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  payees: SplitPayee[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BudgetPool {
  id: string;
  ownerId: string;
  name: string;
  monthlyLimitCents: number;
  spentCents: number;
  resetAt: number;
  agentIds: string[];
  active: boolean;
  createdAt: number;
}

export interface AuditEntry {
  id: string;
  userId: string;
  ts: number;
  actor: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SplitBudgetService {
  constructor(
    @InjectRepository(SplitPlanEntity)
    private readonly splitPlanRepository: Repository<SplitPlanEntity>,
    @InjectRepository(BudgetPoolEntity)
    private readonly budgetPoolRepository: Repository<BudgetPoolEntity>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  // ── SplitPlan ─────────────────────────────────────────────────────────

  async createSplit(
    ownerId: string,
    input: { name: string; description?: string; payees: SplitPayee[] },
  ): Promise<SplitPlan> {
    const sum = input.payees.reduce((acc, p) => acc + (p.bps || 0), 0);
    if (sum !== 10000) {
      throw new BadRequestException(`payees bps must sum to 10000, got ${sum}`);
    }
    const entity = this.splitPlanRepository.create({
      ownerId,
      name: input.name,
      description: input.description ?? null,
      version: 1,
      productType: 'agent_task',
      rules: input.payees.map((payee) => this.toSplitRule(payee)),
      status: SplitPlanStatus.ACTIVE,
      isSystemTemplate: false,
      metadata: {
        v3SplitBudget: true,
        payees: input.payees,
      },
    });
    const saved = await this.splitPlanRepository.save(entity);
    await this.log(ownerId, 'split.create', saved.id, {
      name: input.name,
      payees_count: input.payees.length,
    });
    return this.toSplitPlan(saved);
  }

  async listSplits(ownerId: string): Promise<SplitPlan[]> {
    const entities = await this.splitPlanRepository.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
    return entities.filter((entity) => this.isSplitBudgetPlan(entity)).map((entity) => this.toSplitPlan(entity));
  }

  async getSplit(ownerId: string, id: string): Promise<SplitPlan> {
    const entity = await this.getSplitEntity(ownerId, id);
    return this.toSplitPlan(entity);
  }

  async toggleSplit(ownerId: string, id: string, active: boolean): Promise<SplitPlan> {
    const entity = await this.getSplitEntity(ownerId, id);
    entity.status = active ? SplitPlanStatus.ACTIVE : SplitPlanStatus.ARCHIVED;
    entity.metadata = {
      ...(entity.metadata ?? {}),
      v3SplitBudget: true,
      payees: this.extractSplitPayees(entity),
    };
    const saved = await this.splitPlanRepository.save(entity);
    await this.log(ownerId, 'split.toggle', id, { active });
    return this.toSplitPlan(saved);
  }

  /** 模拟一笔收入按 split 分账（commission V4 占位） */
  async previewSettlement(ownerId: string, id: string, amountCents: number) {
    const s = await this.getSplit(ownerId, id);
    if (!s.active) throw new BadRequestException('split-plan inactive');
    const splits = s.payees.map((p) => ({
      payee_kind: p.payee_kind,
      payee_id: p.payee_id,
      label: p.label || null,
      bps: p.bps,
      amount_cents: Math.floor((amountCents * p.bps) / 10000),
    }));
    const allocated = splits.reduce((acc, x) => acc + x.amount_cents, 0);
    // 余数补给最后一个 payee（避免精度损失）
    if (splits.length && allocated < amountCents) {
      splits[splits.length - 1].amount_cents += amountCents - allocated;
    }
    await this.log(ownerId, 'split.preview', id, { amount_cents: amountCents });
    return {
      split_id: id,
      total_cents: amountCents,
      splits,
      commission_settlement_preview: true,
    };
  }

  // ── BudgetPool ────────────────────────────────────────────────────────

  async createPool(
    ownerId: string,
    input: { name: string; monthlyLimitCents: number; agentIds?: string[] },
  ): Promise<BudgetPool> {
    if (input.monthlyLimitCents <= 0) throw new BadRequestException('monthlyLimitCents must be > 0');
    const now = Date.now();
    const resetAt = this.nextMonthReset(now);
    const entity = this.budgetPoolRepository.create({
      ownerId,
      name: input.name,
      description: null,
      totalBudget: String(input.monthlyLimitCents),
      fundedAmount: String(input.monthlyLimitCents),
      reservedAmount: '0',
      releasedAmount: '0',
      currency: 'USD',
      fundingSource: FundingSource.WALLET,
      status: BudgetPoolStatus.ACTIVE,
      expiresAt: new Date(resetAt),
      metadata: {
        v3SplitBudget: true,
        monthlyLimitCents: input.monthlyLimitCents,
        spentCents: 0,
        resetAt,
        agentIds: input.agentIds ?? [],
      },
    });
    const saved = await this.budgetPoolRepository.save(entity);
    await this.log(ownerId, 'budget.create', saved.id, { limit: input.monthlyLimitCents });
    return this.toBudgetPool(saved);
  }

  async listPools(ownerId: string): Promise<BudgetPool[]> {
    const entities = await this.budgetPoolRepository.find({
      where: { ownerId },
      order: { createdAt: 'DESC' },
    });
    const managed = entities.filter((entity) => this.isSplitBudgetPool(entity));
    const normalized = await Promise.all(managed.map((entity) => this.maybeReset(entity)));
    return normalized.map((entity) => this.toBudgetPool(entity));
  }

  async getPool(ownerId: string, id: string): Promise<BudgetPool> {
    const entity = await this.getPoolEntity(ownerId, id);
    const normalized = await this.maybeReset(entity);
    return this.toBudgetPool(normalized);
  }

  async spend(ownerId: string, id: string, cents: number, note?: string) {
    const entity = await this.getPoolEntity(ownerId, id);
    const normalized = await this.maybeReset(entity);
    const p = this.toBudgetPool(normalized);
    if (!p.active) throw new BadRequestException('budget-pool inactive');
    if (p.spentCents + cents > p.monthlyLimitCents) {
      throw new BadRequestException(
        `budget exceeded: ${p.spentCents + cents} > ${p.monthlyLimitCents}`,
      );
    }
    const nextSpent = p.spentCents + cents;
    normalized.releasedAmount = String(nextSpent);
    normalized.metadata = {
      ...(normalized.metadata ?? {}),
      v3SplitBudget: true,
      monthlyLimitCents: p.monthlyLimitCents,
      spentCents: nextSpent,
      resetAt: p.resetAt,
      agentIds: p.agentIds,
    };
    const saved = await this.budgetPoolRepository.save(normalized);
    await this.log(ownerId, 'budget.spend', id, { cents, note });
    return { ...this.toBudgetPool(saved), last_spend_cents: cents };
  }

  // ── Audit ─────────────────────────────────────────────────────────────

  async listAudit(userId: string, limit = 100): Promise<AuditEntry[]> {
    const rows = await this.auditLogRepository.find({
      where: { userId, action: AuditAction.SYSTEM_CONFIG_UPDATE },
      order: { createdAt: 'DESC' },
      take: Math.max(limit * 3, limit),
    });
    return rows
      .filter((row) => {
        const metadata = row.metadata as Record<string, unknown> | null;
        return metadata?.module === 'split-budget';
      })
      .slice(0, limit)
      .map((row) => {
        const metadata = row.metadata as Record<string, unknown> | null;
        return {
          id: row.id,
          userId: row.userId,
          ts: row.createdAt.getTime(),
          actor: String(metadata?.actor || row.userId),
          action: row.description || row.action,
          target: typeof metadata?.targetId === 'string' ? metadata.targetId : undefined,
          metadata: row.requestData ?? metadata ?? undefined,
        };
      });
  }

  // ── internals ────────────────────────────────────────────────────────

  private async getSplitEntity(ownerId: string, id: string): Promise<SplitPlanEntity> {
    const entity = await this.splitPlanRepository.findOne({ where: { id, ownerId } });
    if (!entity || !this.isSplitBudgetPlan(entity)) {
      throw new NotFoundException('split-plan not found');
    }
    return entity;
  }

  private async getPoolEntity(ownerId: string, id: string): Promise<BudgetPoolEntity> {
    const entity = await this.budgetPoolRepository.findOne({ where: { id, ownerId } });
    if (!entity || !this.isSplitBudgetPool(entity)) {
      throw new NotFoundException('budget-pool not found');
    }
    return entity;
  }

  private isSplitBudgetPlan(entity: SplitPlanEntity) {
    return Boolean(entity.metadata?.v3SplitBudget);
  }

  private isSplitBudgetPool(entity: BudgetPoolEntity) {
    return Boolean(entity.metadata?.v3SplitBudget);
  }

  private toSplitRule(payee: SplitPayee): SplitRule {
    return {
      recipient: payee.payee_id,
      shareBps: payee.bps,
      role: 'custom',
      source: SplitSource.PLATFORM,
      customRoleName: payee.label,
      active: true,
    };
  }

  private extractSplitPayees(entity: SplitPlanEntity): SplitPayee[] {
    const metadataPayees = Array.isArray(entity.metadata?.payees) ? entity.metadata.payees : null;
    if (metadataPayees) {
      return metadataPayees.map((payee: any) => ({
        payee_kind: payee.payee_kind,
        payee_id: payee.payee_id,
        bps: payee.bps,
        label: payee.label,
      }));
    }
    return (entity.rules ?? []).map((rule) => ({
      payee_kind: 'external',
      payee_id: rule.recipient,
      bps: rule.shareBps,
      label: rule.customRoleName,
    }));
  }

  private toSplitPlan(entity: SplitPlanEntity): SplitPlan {
    return {
      id: entity.id,
      ownerId: entity.ownerId,
      name: entity.name,
      description: entity.description ?? undefined,
      payees: this.extractSplitPayees(entity),
      active: entity.status === SplitPlanStatus.ACTIVE,
      createdAt: entity.createdAt.getTime(),
      updatedAt: entity.updatedAt.getTime(),
    };
  }

  private toBudgetPool(entity: BudgetPoolEntity): BudgetPool {
    const monthlyLimitCents = Number(entity.metadata?.monthlyLimitCents ?? entity.totalBudget ?? 0);
    const spentCents = Number(entity.metadata?.spentCents ?? entity.releasedAmount ?? 0);
    const resetAt = Number(entity.metadata?.resetAt ?? entity.expiresAt?.getTime() ?? this.nextMonthReset(Date.now()));
    const agentIds = Array.isArray(entity.metadata?.agentIds) ? entity.metadata.agentIds : [];

    return {
      id: entity.id,
      ownerId: entity.ownerId,
      name: entity.name,
      monthlyLimitCents,
      spentCents,
      resetAt,
      agentIds,
      active: entity.status === BudgetPoolStatus.ACTIVE,
      createdAt: entity.createdAt.getTime(),
    };
  }

  private async log(userId: string, action: string, target?: string, metadata?: Record<string, unknown>) {
    const entry = this.auditLogRepository.create({
      userId,
      action: AuditAction.SYSTEM_CONFIG_UPDATE,
      status: AuditStatus.SUCCESS,
      description: action,
      requestData: metadata ?? null,
      responseData: target ? { target } : null,
      metadata: {
        ...(metadata ?? {}),
        module: 'split-budget',
        actor: userId,
        targetId: target,
      } as any,
    });
    await this.auditLogRepository.save(entry);
  }

  private async maybeReset(p: BudgetPoolEntity): Promise<BudgetPoolEntity> {
    const resetAt = Number(p.metadata?.resetAt ?? p.expiresAt?.getTime() ?? 0);
    if (Date.now() >= resetAt) {
      const nextReset = this.nextMonthReset(Date.now());
      p.releasedAmount = '0';
      p.expiresAt = new Date(nextReset);
      p.metadata = {
        ...(p.metadata ?? {}),
        v3SplitBudget: true,
        monthlyLimitCents: Number(p.metadata?.monthlyLimitCents ?? p.totalBudget ?? 0),
        spentCents: 0,
        resetAt: nextReset,
        agentIds: Array.isArray(p.metadata?.agentIds) ? p.metadata.agentIds : [],
      };
      const saved = await this.budgetPoolRepository.save(p);
      await this.log(p.ownerId, 'budget.reset', p.id, { resetAt: nextReset });
      return saved;
    }
    return p;
  }

  private nextMonthReset(now: number) {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.getTime();
  }
}
