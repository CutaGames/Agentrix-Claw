import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentBudgetEntity } from '../entities/agent-budget.entity';

/** 周期窗口:滚动一周(毫秒)。 */
const PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

/** 额度核销结果。 */
export type BudgetChargeResult =
  | { ok: true; remaining: number }
  | { ok: false; reason: 'QUOTA_EXCEEDED'; remaining: number; preset: number };

/**
 * AgentBudgetService — Agent 代付「预设额度」核销(world-creation-feed task 9.2)。
 *
 * spec: 需求 13.4 —— 额度内免逐次确认放行;超额拒绝(QUOTA_EXCEEDED)并要求重新授权。
 *
 * 核销语义(原子,服务端权威):
 *   - 跨周期自动重置 periodSpent;
 *   - `periodSpent + amount > preset` → 拒绝(余额/用量不变,保证 Property 2);
 *   - 否则 `periodSpent += amount` 并持久化。
 *
 * 注:此处以"预设额度账本"作为 Agent 代付的统一核销;与全局钱包/Economy_Bridge 的
 * 实际资金清算在深合并迁移阶段(task 12.3)对接 —— 二者通过权威金额一致。
 */
@Injectable()
export class AgentBudgetService {
  private readonly logger = new Logger(AgentBudgetService.name);

  constructor(
    @InjectRepository(AgentBudgetEntity)
    private readonly repo: Repository<AgentBudgetEntity>,
  ) {}

  /** 读取(或惰性创建)某账户的额度记录。 */
  async getOrCreate(accountId: string): Promise<AgentBudgetEntity> {
    let row = await this.repo.findOne({ where: { onBehalfOfAccountId: accountId } });
    if (!row) {
      row = this.repo.create({
        onBehalfOfAccountId: accountId,
        presetBudgetAxp: '0',
        periodStart: new Date(),
        periodSpentAxp: '0',
        whitelistCreationIds: [],
      });
      row = await this.repo.save(row);
    }
    return this.rollIfElapsed(row);
  }

  /** 设置预设额度(需求 13.4 授权;task 9.4 前端"我的 Agent 代付"调用)。 */
  async setBudget(
    accountId: string,
    presetBudgetAxp: number,
    whitelistCreationIds?: string[],
  ): Promise<AgentBudgetEntity> {
    const row = await this.getOrCreate(accountId);
    row.presetBudgetAxp = String(Math.max(0, presetBudgetAxp));
    if (whitelistCreationIds) {
      row.whitelistCreationIds = whitelistCreationIds;
    }
    return this.repo.save(row);
  }

  /**
   * 核销一笔消费(原子):额度内 → 扣减并放行;超额 → 拒绝(用量不变)。
   * `amount <= 0`(免费/查询)直接放行,不动用量。
   */
  async charge(accountId: string, amount: number): Promise<BudgetChargeResult> {
    const row = await this.getOrCreate(accountId);
    const preset = Number(row.presetBudgetAxp);
    const spent = Number(row.periodSpentAxp);

    if (amount <= 0) {
      return { ok: true, remaining: Math.max(0, preset - spent) };
    }
    if (spent + amount > preset) {
      this.logger.warn(
        `Budget exceeded: account=${accountId} spent=${spent} +${amount} > preset=${preset}`,
      );
      return {
        ok: false,
        reason: 'QUOTA_EXCEEDED',
        remaining: Math.max(0, preset - spent),
        preset,
      };
    }
    row.periodSpentAxp = String(spent + amount);
    await this.repo.save(row);
    return { ok: true, remaining: Math.max(0, preset - (spent + amount)) };
  }

  /** 退回一笔已核销的消费(结算失败时回滚用量,保证余额最终不变,需求 13.4)。 */
  async refund(accountId: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    const row = await this.getOrCreate(accountId);
    const spent = Number(row.periodSpentAxp);
    row.periodSpentAxp = String(Math.max(0, spent - amount));
    await this.repo.save(row);
  }

  /** 当前周期视图(供前端展示用量)。 */
  async snapshot(
    accountId: string,
  ): Promise<{ preset: number; spent: number; remaining: number; periodStart: number; whitelist: string[] }> {
    const row = await this.getOrCreate(accountId);
    const preset = Number(row.presetBudgetAxp);
    const spent = Number(row.periodSpentAxp);
    return {
      preset,
      spent,
      remaining: Math.max(0, preset - spent),
      periodStart: row.periodStart.getTime(),
      whitelist: row.whitelistCreationIds ?? [],
    };
  }

  /** 跨周期自动重置:若 periodStart 已过一周,重置周期起点与用量。 */
  private async rollIfElapsed(row: AgentBudgetEntity): Promise<AgentBudgetEntity> {
    const now = Date.now();
    if (now - row.periodStart.getTime() >= PERIOD_MS) {
      row.periodStart = new Date(now);
      row.periodSpentAxp = '0';
      return this.repo.save(row);
    }
    return row;
  }
}
