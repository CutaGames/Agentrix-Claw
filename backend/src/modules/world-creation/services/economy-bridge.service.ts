import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type {
  RequestChargeRequest,
  RequestPayoutRequest,
  EconomyBridgeResponse,
  PlotSalesReportResponse,
} from '../../../../shared/types/world-creation-api';
import type {
  EcsWorld,
  PlotSaleType,
  WorldCreationError,
} from '../../../../shared/types/world-creation';
import { REVENUE_SHARE_FIRST_SALE } from '../../../../shared/types/world-creation';

import { WorldPlot } from '../entities/world-plot.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { AgentCostRecord } from '../../../entities/agent-cost-record.entity';
import { EcsWorldService } from './ecs-world.service';
import { AxpService } from '../../axp/axp.service';
import {
  priceLineItems,
  type AuthoritativePricing,
  type ProposedLineItem,
} from '../economy/authoritative-pricing';
import { TrustGateService } from '../economy/trust-gate.service';
import {
  PLOT_SALES_STORE,
  type PlotSalesStore,
} from '../economy/plot-sales.store';

/** 1 AXP = $0.001 USD (axp.constants: AXP_USD_CENTS_PER_POINT = 0.1 cent/point). */
const AXP_TO_USD = 0.001;

/** Convert an authoritative AXP amount into USD for the cost-record audit trail. */
function axpToUsd(axp: number): number {
  return Math.round(axp * AXP_TO_USD * 1e6) / 1e6;
}

/**
 * EconomyBridgeService — server-authoritative 经济执行层 (design §6, R7/R15/R16).
 *
 * 不可协商不变量 (Property 2)：金额计算与记账绝不在沙箱内完成。沙箱只能 **request**
 * (`economy.requestCharge` / `economy.requestPayout`)，提议 *买什么* (amountRef → line
 * items)；服务端按 Plot 权威 ECS_World 的声明式 `price` 组件 **重算金额** (忽略沙箱
 * 传入的 `displayHintAmount`)，做 Trust 门控，在事务中扣款 / 入账 owner AgentAccount /
 * 扣平台抽成，并写 `agent_cost_records`。失败拒绝且不改动任何余额。
 *
 * 复用 v5 经济基础设施 (AGENTS.md hard rule, design §6/§13)：
 *  - AXP 钱包 (AxpService.spend / earn，原子 ledger + 余额快照)。
 *  - AgentAccount (Plot owner 收款主体 → 解析为 owner userId 的 AXP 钱包)。
 *  - agent_cost_records (每次经济动作的审计成本记录)。
 *
 * Trust 门控 / 签名校验 (R7.4/R7.6)：Marketplace 购买要求 Trust_Level 3 + 有效
 * 签名确认，由 {@link TrustGateService} 在任何 spend/earn 之前 server-authoritative
 * 地校验；任何失败都返回结构化错误且不改动任何余额 (task 7.2)。
 */
@Injectable()
export class EconomyBridgeService {
  private readonly logger = new Logger(EconomyBridgeService.name);

  constructor(
    @InjectRepository(WorldPlot)
    private readonly plotRepo: Repository<WorldPlot>,
    @InjectRepository(AgentAccount)
    private readonly agentAccountRepo: Repository<AgentAccount>,
    @InjectRepository(AgentCostRecord)
    private readonly costRecordRepo: Repository<AgentCostRecord>,
    private readonly ecsWorldService: EcsWorldService,
    private readonly axpService: AxpService,
    private readonly trustGate: TrustGateService,
    /**
     * `state.kv:sales` 销售聚合 store (R15.5)。可选注入：未绑定时
     * {@link getSalesReport} 返回空报表（无销售）。超市等体验经
     * {@link PLOT_SALES_STORE} 绑定具体实现，结账成功时写入权威销售记录。
     */
    @Optional()
    @Inject(PLOT_SALES_STORE)
    private readonly salesStore?: PlotSalesStore,
  ) {}

  // ============================================================
  // R7.2 / R7.3 / R7.5 / R7.7 — server-authoritative charge
  // ============================================================

  /**
   * 服务端权威 charge：重算金额 (忽略沙箱传值)、入 owner AgentAccount、扣平台抽成、
   * 写 agent_cost_records。失败返回结构化错误且不改动任何余额。
   *
   * @param userId 经认证的发起用户 (= 付款方 payer)。**绝不信任沙箱传入的付款方身份**，
   *               防止沙箱伪造他人账户扣款。
   */
  async requestCharge(
    userId: string,
    req: RequestChargeRequest,
  ): Promise<EconomyBridgeResponse> {
    // 0. Trust 门控 + 签名校验 (R7.4/R7.6)。在任何 spend/earn 之前执行；
    //    任何失败都返回结构化错误且 **绝不**触碰余额。
    const trust = this.checkTrustGate(userId, req);
    if (trust) return { ok: false, error: trust };

    // 1. 解析 Plot 与其权威 ECS_World。
    const resolved = await this.loadAuthoritativeWorld(req.plotId);
    if ('error' in resolved) return { ok: false, error: resolved.error };
    const { plot, world } = resolved;

    // 2. 服务端按权威定价重算金额 (R7.3)。沙箱 displayHintAmount 仅记录，绝不参与记账。
    const pricing = this.resolveAuthoritativeCharge(world, req);
    if (!pricing) {
      this.logger.warn(
        `requestCharge rejected: no authoritative price for amountRef="${req.amountRef}" on plot ${req.plotId} ` +
          `(sandbox displayHint=${req.displayHintAmount ?? 'n/a'} ignored)`,
      );
      return {
        ok: false,
        error: {
          error: 'ECONOMY_REJECTED',
          detail: `No authoritative price resolved for amountRef="${req.amountRef}"`,
        },
      };
    }
    const authoritativeAmount = pricing.totalAxp;

    // 3. 解析 owner 收款钱包 (Plot owner AgentAccount → owner userId)。
    const ownerUserId = await this.resolveOwnerUserId(plot);
    if (!ownerUserId) {
      return {
        ok: false,
        error: { error: 'ECONOMY_REJECTED', detail: 'Plot owner account not resolvable' },
      };
    }

    // 4. 平台抽成 (R7.5)。体验内营收沿用一级销售 5% (design §6, REVENUE_SHARE 常量)。
    const platformCut = this.computePlatformCut(authoritativeAmount, 'first');
    const ownerCredit = authoritativeAmount - platformCut;

    // 5. 事务执行：扣 payer → 入 owner (净额) → 写成本记录。失败补偿退款。
    try {
      await this.axpService.spend({
        userId,
        source: 'plot_purchase',
        amount: authoritativeAmount,
        refId: plot.id,
        note: `Plot charge (${plot.title ?? plot.id})`,
        metadata: {
          plotId: plot.id,
          amountRef: req.amountRef,
          authoritativeAmount,
          // 显式留痕：沙箱传值仅 hint，不参与记账。
          ignoredSandboxHint: req.displayHintAmount ?? null,
          lineItems: pricing.lineItems,
        },
      });
    } catch (err) {
      // spend 在扣款前原子校验余额；抛错即余额未变 (R7.6)。
      return {
        ok: false,
        error: {
          error: 'ECONOMY_REJECTED',
          detail: this.toDetail(err, 'charge failed (insufficient balance or invalid)'),
        },
      };
    }

    try {
      if (ownerCredit > 0 && ownerUserId !== userId) {
        await this.axpService.earn({
          userId: ownerUserId,
          source: 'plot_revenue',
          amount: ownerCredit,
          refId: plot.id,
          note: `Plot revenue (net of ${platformCut} AXP platform cut)`,
          metadata: { plotId: plot.id, gross: authoritativeAmount, platformCut },
        });
      }
    } catch (err) {
      // owner 入账失败 → 退款 payer，保证余额最终不变 (R7.6)。
      await this.bestEffortRefund(userId, authoritativeAmount, plot.id, 'owner credit failed');
      return {
        ok: false,
        error: {
          error: 'ECONOMY_REJECTED',
          detail: this.toDetail(err, 'owner credit failed; payer refunded'),
        },
      };
    }

    // 6. 写 agent_cost_records (R7.7)。
    await this.recordEconomyCost({
      userId,
      plotId: plot.id,
      action: 'economy.requestCharge',
      amountAxp: authoritativeAmount,
      eventType: 'economy_charge',
    });

    return { ok: true, authoritativeAmount, platformCut, lineItems: pricing.lineItems };
  }

  // ============================================================
  // R7.x — server-authoritative payout (e.g. wager settlement)
  // ============================================================

  /**
   * 服务端权威 payout：金额由服务端按权威来源重算 (忽略沙箱传值)，入目标账户钱包，
   * 写 agent_cost_records。失败返回结构化错误且不改动任何余额。
   *
   * NOTE: 资金来源 (如竞技场下注 pot) 的完整结算闭环见 task 12.2/16.5；本方法提供
   * server-authoritative 打款执行层与金额权威性 (R7.1/7.3)。
   */
  async requestPayout(
    userId: string,
    req: RequestPayoutRequest,
  ): Promise<EconomyBridgeResponse> {
    const resolved = await this.loadAuthoritativeWorld(req.plotId);
    if ('error' in resolved) return { ok: false, error: resolved.error };
    const { plot, world } = resolved;

    // 服务端权威重算打款金额；沙箱 amountRef 仅作 *引用*，金额由权威定价决定。
    const amountAxp = this.resolveAuthoritativePayout(world, req);
    if (amountAxp === null) {
      return {
        ok: false,
        error: {
          error: 'ECONOMY_REJECTED',
          detail: `No authoritative payout amount resolved for amountRef="${req.amountRef}"`,
        },
      };
    }

    const targetUserId = await this.resolveAccountUserId(req.targetAccountId);
    if (!targetUserId) {
      return {
        ok: false,
        error: { error: 'ECONOMY_REJECTED', detail: 'Payout target account not resolvable' },
      };
    }

    try {
      await this.axpService.earn({
        userId: targetUserId,
        source: 'plot_payout',
        amount: amountAxp,
        refId: plot.id,
        note: `Plot payout (${plot.title ?? plot.id})`,
        metadata: { plotId: plot.id, amountRef: req.amountRef, authoritativeAmount: amountAxp },
      });
    } catch (err) {
      return {
        ok: false,
        error: {
          error: 'ECONOMY_REJECTED',
          detail: this.toDetail(err, 'payout failed'),
        },
      };
    }

    await this.recordEconomyCost({
      userId,
      plotId: plot.id,
      action: 'economy.requestPayout',
      amountAxp,
      eventType: 'economy_payout',
    });

    return { ok: true, authoritativeAmount: amountAxp, platformCut: 0 };
  }

  /**
   * R15.5 从 `state.kv:sales` 聚合的每日销售报表。
   *
   * 平台据此向 Plot owner 呈现某一天的销售汇总：总额（AXP）、成交笔数、按商品聚合
   * 的售出件数与营收。金额均取自 Economy_Bridge 服务端权威结算结果（沙箱不可计算，
   * Property 2）—— 本方法只做**只读聚合**，不触碰任何余额。
   *
   * `day` 缺省为当前 UTC 日期（`YYYY-MM-DD`）。未绑定 {@link PLOT_SALES_STORE} 时
   * 返回当天空报表（无销售）。
   */
  async getSalesReport(
    _userId: string,
    plotId: string,
    day?: string,
  ): Promise<PlotSalesReportResponse> {
    const reportDay = this.normalizeDay(day);

    const empty: PlotSalesReportResponse = {
      plotId,
      day: reportDay,
      totalAxp: 0,
      saleCount: 0,
      byGood: [],
    };
    if (!this.salesStore) return empty;

    const sales = await this.salesStore.getSales(plotId);
    // 只聚合归属该 Plot、且发生在报表当天 (UTC) 的销售记录。
    const daySales = (sales ?? []).filter(
      (s) => s.plotId === plotId && this.toUtcDay(s.ts) === reportDay,
    );
    if (daySales.length === 0) return empty;

    let totalAxp = 0;
    const byGoodMap = new Map<string, { units: number; axp: number }>();
    for (const sale of daySales) {
      totalAxp += sale.totalAxp;
      for (const line of sale.lineItems ?? []) {
        const agg = byGoodMap.get(line.goodId) ?? { units: 0, axp: 0 };
        agg.units += line.units;
        agg.axp += line.axp;
        byGoodMap.set(line.goodId, agg);
      }
    }

    const byGood = [...byGoodMap.entries()]
      .map(([goodId, agg]) => ({ goodId, units: agg.units, axp: agg.axp }))
      .sort((a, b) => b.axp - a.axp);

    return {
      plotId,
      day: reportDay,
      totalAxp,
      saleCount: daySales.length,
      byGood,
    };
  }

  /** Normalize a `day` query into a `YYYY-MM-DD` UTC date (defaults to today). */
  private normalizeDay(day?: string): string {
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
    return this.toUtcDay(Date.now());
  }

  /** Convert a Unix epoch-millis timestamp into a `YYYY-MM-DD` UTC date string. */
  private toUtcDay(ts: number): string {
    return new Date(ts).toISOString().slice(0, 10);
  }

  // ============================================================
  // Authoritative amount resolution (Property 2 core)
  // ============================================================

  /**
   * R7.3 解析 charge 的权威金额。沙箱传入的 `amountRef` 仅用于 *引用要买什么*；
   * 每个商品的单价一律由服务端从 ECS_World 的声明式 `price` 组件重新查得。
   *
   * 当前 (task 7.1) 的 line-item 解析：`amountRef` 直接命名一个带 `price` 组件的
   * 商品实体 id (如 "good_milk" / 塔防升级项 / 竞技场入场费实体)。购物车聚合
   * ("cart.total" → 多商品) 的 state.kv 解析在 task 18.1 (超市) 通过 override
   * {@link resolveProposedLineItems} 接入。
   */
  protected resolveAuthoritativeCharge(
    world: EcsWorld,
    req: RequestChargeRequest,
  ): AuthoritativePricing | null {
    const proposed = this.resolveProposedLineItems(world, req);
    return priceLineItems(world, proposed);
  }

  /**
   * 把沙箱请求映射为 *提议的* line items (entityId + quantity)。
   * 价格绝不取自此处 — 仅 *买什么/几个*。可被后续任务 (如超市购物车) override。
   */
  protected resolveProposedLineItems(
    _world: EcsWorld,
    req: RequestChargeRequest,
  ): ProposedLineItem[] {
    // 默认：amountRef 直接引用单个权威定价的商品实体。
    if (req.amountRef) {
      return [{ entityId: req.amountRef, quantity: 1 }];
    }
    return [];
  }

  /**
   * R7.3 解析 payout 的权威金额。沙箱 `amountRef` 仅作引用；金额由服务端从权威
   * ECS_World 定价 (奖金/奖品实体的 `price.axp`) 重算。
   */
  protected resolveAuthoritativePayout(
    world: EcsWorld,
    req: RequestPayoutRequest,
  ): number | null {
    if (!req.amountRef) return null;
    const pricing = priceLineItems(world, [{ entityId: req.amountRef, quantity: 1 }]);
    return pricing ? pricing.totalAxp : null;
  }

  /** 平台抽成：一级 5% / 二级 30% (REVENUE_SHARE 常量，design §6, R7.5)。 */
  private computePlatformCut(amountAxp: number, saleType: PlotSaleType): number {
    const rate =
      saleType === 'secondary'
        ? 0.3 /* REVENUE_SHARE_SECONDARY_SALE — 地块二级转让，见 task 8.3 */
        : REVENUE_SHARE_FIRST_SALE;
    return Math.round(amountAxp * rate);
  }

  // ============================================================
  // Trust gating + signature verification (R7.4 / R7.6)
  // ============================================================

  /**
   * R7.4 / R7.6 — Marketplace-purchase Trust gate + signed-confirmation
   * verification, delegated to {@link TrustGateService}.
   *
   * 校验语义 (server-authoritative，沙箱不可达)：
   *  - `signedConfirmation` 缺失 → 拒绝。
   *  - 签名无效 / 篡改 / 与本次 charge 上下文不匹配 / 过期 → 拒绝。
   *  - 解析的 Trust 等级 < {@link TRUST_LEVEL_PURCHASE} (3) → 拒绝。
   *
   * 返回 null = 通过；返回 {@link WorldCreationError} = 拒绝。**所有拒绝都在
   * 任何 spend/earn 之前发生** (调用点为 requestCharge 第 0 步)，保证余额不变。
   *
   * @param userId 经认证的发起用户（付款方）；绝不取自沙箱。
   */
  protected checkTrustGate(
    userId: string,
    req: RequestChargeRequest,
  ): WorldCreationError | null {
    return this.trustGate.checkPurchaseGate({
      userId,
      plotId: req.plotId,
      amountRef: req.amountRef,
      signedConfirmation: req.signedConfirmation,
    });
  }

  // ============================================================
  // Helpers
  // ============================================================

  /** 加载 Plot + 其当前权威 ECS_World 快照；缺失返回结构化错误。 */
  private async loadAuthoritativeWorld(
    plotId: string,
  ): Promise<{ plot: WorldPlot; world: EcsWorld } | { error: WorldCreationError }> {
    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) {
      return { error: { error: 'ECONOMY_REJECTED', detail: `Plot not found: ${plotId}` } };
    }
    if (!plot.ecsVersionId) {
      return {
        error: { error: 'ECONOMY_REJECTED', detail: `Plot has no ECS_World: ${plotId}` },
      };
    }
    const world = await this.ecsWorldService.loadWorldAtVersion(plot.ecsVersionId);
    return { plot, world };
  }

  /** Plot owner AgentAccount → owner userId (AXP 钱包以 userId 为键)。 */
  private async resolveOwnerUserId(plot: WorldPlot): Promise<string | null> {
    if (!plot.ownerAccountId) return null;
    return this.resolveAccountUserId(plot.ownerAccountId);
  }

  /** AgentAccount id → 其 owner userId。 */
  private async resolveAccountUserId(accountId: string): Promise<string | null> {
    const account = await this.agentAccountRepo.findOne({ where: { id: accountId } });
    return account?.ownerId ?? null;
  }

  /** R7.7 写一条经济动作的成本审计记录到 agent_cost_records。 */
  private async recordEconomyCost(params: {
    userId: string;
    plotId: string;
    action: string;
    amountAxp: number;
    eventType: 'economy_charge' | 'economy_payout';
  }): Promise<void> {
    try {
      await this.costRecordRepo.save(
        this.costRecordRepo.create({
          userId: params.userId,
          sessionId: `plot:${params.plotId}`,
          model: params.action,
          provider: 'world-creation-economy',
          costUsd: axpToUsd(params.amountAxp),
          eventType: params.eventType,
        }),
      );
    } catch (err) {
      // 成本记录失败不回滚已提交的经济动作，仅告警 (审计补偿由对账流程处理)。
      this.logger.error(
        `Failed to write agent_cost_records for ${params.action} on plot ${params.plotId}: ${this.toDetail(err, 'unknown')}`,
      );
    }
  }

  /** owner 入账失败时尽力退款 payer，保证余额最终不变 (R7.6)。 */
  private async bestEffortRefund(
    userId: string,
    amountAxp: number,
    plotId: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.axpService.earn({
        userId,
        source: 'plot_payout',
        amount: amountAxp,
        refId: plotId,
        note: `Refund: ${reason}`,
        metadata: { plotId, refund: true, reason },
      });
    } catch (err) {
      this.logger.error(
        `Refund failed for user ${userId} on plot ${plotId} (${amountAxp} AXP): ${this.toDetail(err, 'unknown')}`,
      );
    }
  }

  private toDetail(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return fallback;
  }
}
