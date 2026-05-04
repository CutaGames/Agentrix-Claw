import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

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
  private splits = new Map<string, SplitPlan>();
  private pools = new Map<string, BudgetPool>();
  private audit: AuditEntry[] = [];

  // ── SplitPlan ─────────────────────────────────────────────────────────

  createSplit(ownerId: string, input: { name: string; description?: string; payees: SplitPayee[] }): SplitPlan {
    const sum = input.payees.reduce((acc, p) => acc + (p.bps || 0), 0);
    if (sum !== 10000) {
      throw new BadRequestException(`payees bps must sum to 10000, got ${sum}`);
    }
    const id = `sp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const plan: SplitPlan = {
      id,
      ownerId,
      name: input.name,
      description: input.description,
      payees: input.payees,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.splits.set(id, plan);
    this.log(ownerId, 'split.create', id, { name: input.name, payees_count: input.payees.length });
    return plan;
  }

  listSplits(ownerId: string): SplitPlan[] {
    return [...this.splits.values()].filter((s) => s.ownerId === ownerId).sort((a, b) => b.createdAt - a.createdAt);
  }

  getSplit(ownerId: string, id: string): SplitPlan {
    const s = this.splits.get(id);
    if (!s || s.ownerId !== ownerId) throw new NotFoundException('split-plan not found');
    return s;
  }

  toggleSplit(ownerId: string, id: string, active: boolean): SplitPlan {
    const s = this.getSplit(ownerId, id);
    s.active = active;
    s.updatedAt = Date.now();
    this.log(ownerId, 'split.toggle', id, { active });
    return s;
  }

  /** 模拟一笔收入按 split 分账（commission V4 占位） */
  previewSettlement(ownerId: string, id: string, amountCents: number) {
    const s = this.getSplit(ownerId, id);
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
    this.log(ownerId, 'split.preview', id, { amount_cents: amountCents });
    return {
      split_id: id,
      total_cents: amountCents,
      splits,
      commission_settlement_preview: true,
    };
  }

  // ── BudgetPool ────────────────────────────────────────────────────────

  createPool(
    ownerId: string,
    input: { name: string; monthlyLimitCents: number; agentIds?: string[] },
  ): BudgetPool {
    if (input.monthlyLimitCents <= 0) throw new BadRequestException('monthlyLimitCents must be > 0');
    const id = `bp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const pool: BudgetPool = {
      id,
      ownerId,
      name: input.name,
      monthlyLimitCents: input.monthlyLimitCents,
      spentCents: 0,
      resetAt: this.nextMonthReset(now),
      agentIds: input.agentIds ?? [],
      active: true,
      createdAt: now,
    };
    this.pools.set(id, pool);
    this.log(ownerId, 'budget.create', id, { limit: input.monthlyLimitCents });
    return pool;
  }

  listPools(ownerId: string): BudgetPool[] {
    return [...this.pools.values()].filter((p) => p.ownerId === ownerId).sort((a, b) => b.createdAt - a.createdAt);
  }

  getPool(ownerId: string, id: string): BudgetPool {
    const p = this.pools.get(id);
    if (!p || p.ownerId !== ownerId) throw new NotFoundException('budget-pool not found');
    this.maybeReset(p);
    return p;
  }

  spend(ownerId: string, id: string, cents: number, note?: string) {
    const p = this.getPool(ownerId, id);
    if (!p.active) throw new BadRequestException('budget-pool inactive');
    if (p.spentCents + cents > p.monthlyLimitCents) {
      throw new BadRequestException(
        `budget exceeded: ${p.spentCents + cents} > ${p.monthlyLimitCents}`,
      );
    }
    p.spentCents += cents;
    this.log(ownerId, 'budget.spend', id, { cents, note });
    return { ...p, last_spend_cents: cents };
  }

  // ── Audit ─────────────────────────────────────────────────────────────

  listAudit(userId: string, limit = 100): AuditEntry[] {
    return this.audit.filter((a) => a.userId === userId).slice(0, limit);
  }

  // ── internals ────────────────────────────────────────────────────────

  private log(userId: string, action: string, target?: string, metadata?: Record<string, unknown>) {
    const id = `au_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry: AuditEntry = { id, userId, ts: Date.now(), actor: userId, action, target, metadata };
    this.audit.unshift(entry);
    if (this.audit.length > 1000) this.audit.length = 1000;
  }

  private maybeReset(p: BudgetPool) {
    if (Date.now() >= p.resetAt) {
      p.spentCents = 0;
      p.resetAt = this.nextMonthReset(Date.now());
      this.log(p.ownerId, 'budget.reset', p.id, { resetAt: p.resetAt });
    }
  }

  private nextMonthReset(now: number) {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.getTime();
  }
}
