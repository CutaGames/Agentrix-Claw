import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentAccount } from '../../entities/agent-account.entity';

/**
 * 顿领 §5.3 Wallet Projection
 *
 * read-only 跨端钱包投影。聚合：
 *   - balances        （来自 wallet 模块；阶段 1 占位）
 *   - agent_accounts  （AgentAccount 表）
 *   - recent_txs      （阶段 1 占位，等接 ledger / commerce-ledger）
 *   - stripe_subscriptions （来自 payment 模块；阶段 1 占位）
 *
 * 后续阶段会接入真实数据源；当前先建立稳定契约 + DTO 形态，
 * 保证前端 5 端可以提前 import shared/types 联调。
 */
@Injectable()
export class WalletProjectionService {
  private readonly logger = new Logger(WalletProjectionService.name);

  constructor(
    @InjectRepository(AgentAccount)
    private readonly agentAccountRepo: Repository<AgentAccount>,
  ) {}

  async getProjection(userId: string) {
    const now = Date.now();

    const agentAccounts = await this.agentAccountRepo
      .find({ where: { ownerId: userId } as any, take: 100 })
      .catch(() => [] as AgentAccount[]);

    const accountSummaries = agentAccounts.map((a) => ({
      agent_id: (a as any).agentId || a.id,
      balance_usd_cents: this.toCents((a as any).balance),
      auto_earn_today_cents: 0,
      pending_splits_cents: 0,
    }));

    const totalBalance = accountSummaries.reduce(
      (sum, a) => sum + (a.balance_usd_cents || 0),
      0,
    );

    return {
      user_id: userId,
      as_of: now,
      // Aggregate totals (mobile WalletDashboard hero card)
      totals: {
        fiat_cents: 0,
        crypto_usd_cents: totalBalance,
        pending_cents: 0,
      },
      // Auto-Earn aggregate (mobile dashboard stats row)
      auto_earn: {
        mrr_cents: 0,
        last_24h_cents: accountSummaries.reduce(
          (s, a) => s + (a.auto_earn_today_cents || 0),
          0,
        ),
        active_executors: 0,
      },
      balances: [] as Array<{
        chain: string;
        symbol: string;
        amount_raw: string;
        amount_usd_cents: number;
      }>,
      agent_accounts: accountSummaries,
      recent_txs: [] as Array<{
        tx_id: string;
        kind: 'earn' | 'spend' | 'transfer' | 'split';
        agent_id?: string;
        amount_usd_cents: number;
        at: number;
        source: 'auto_earn' | 'a2a' | 'stripe' | 'manual';
      }>,
      stripe_subscriptions: [] as Array<{
        subscription_id: string;
        status: string;
        period_end: number;
      }>,
    };
  }

  private toCents(raw: unknown): number {
    if (raw == null) return 0;
    const n = typeof raw === 'string' ? Number(raw) : (raw as number);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }
}
