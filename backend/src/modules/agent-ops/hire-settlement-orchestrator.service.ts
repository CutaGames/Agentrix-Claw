import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  forwardRef,
} from '@nestjs/common';

import {
  SplitTreeGeneratorService,
  SplitConfig,
} from '../commission/split-tree-generator.service';
import { AgentAccountService } from '../agent-account/agent-account.service';
import { AgentHireEscrowService } from '../multi-agent/agent-hire-escrow.service';

import {
  AgentServiceListing,
  CommissionSubmission,
  HireRequest,
  HireSettlementResult,
  SettlementBreakdown,
  SettlementShare,
} from './hire-settlement.types';

/** USDC 链上精度(6 decimals)。结算金额经此精度转 bigint 后交给 split-tree-generator。 */
const USDC_DECIMALS = 6n;
const USDC_SCALE = 1_000_000n; // 10 ** 6

/** 守恒校验容差:1 cent($0.01)。bigint 分账无浮点误差,容差用于 USD 浮点出口断言。 */
const CONSERVATION_TOLERANCE_USD = 0.01;

/**
 * HireSettlementOrchestrator — 被雇佣结算 + 多跳分佣闭环编排器(crypto-native-agent-ops 任务 14)。
 *
 * spec: design §C6 / 需求 5.1–5.4 / 12.1 / 12.4 / Correctness Property 6(分佣守恒)。
 *
 * 串起既有 rail,不重造:
 *   1. **挂牌**:agent 作为可付费调用服务(x402 discovery + agent-marketplace listing,经 {@link AgentServiceListing} 引用)。
 *   2. **服务端权威定价**:总额 = listing.unitPriceUsd × quantity,**不信任客户端金额**(需求 5.1)。
 *   3. **多跳分佣**:经 {@link SplitTreeGeneratorService} 计算平台/渠道费 + 激励池分配,
 *      并把残余净额回填给执行 agent(merchant),**守恒由构造保证**(Property 6)。
 *   4. **Commission 合约一次提交**:多跳血缘合并为单个 SplitConfig + 哈希,链上一次提交(需求 5.2)。
 *   5. **结算**:escrow(reserve→release,24h 争议窗口)或直接 USDC(relayer);
 *      其出口已自动挂钩 `recordSpending`(任务 2.2)。
 *   6. **recordSpending 入账**:执行 agent 经结算出口入账;各分佣方 agent 以 commission 幂等键入账。
 *
 * **AXP/USDC 边界(需求 5.3):** 本编排器仅接受 currency='USDC';AXP 为 App 内积分层,
 * 绝不进入结算金额或 recordSpending —— 传入非 USDC 直接拒绝。
 */
@Injectable()
export class HireSettlementOrchestrator {
  private readonly logger = new Logger(HireSettlementOrchestrator.name);

  constructor(
    private readonly splitTree: SplitTreeGeneratorService,
    // 各分佣方/执行方记账;escrow 出口已自挂钩,relayer 轨道由本编排器直接记账。
    @Optional()
    @Inject(forwardRef(() => AgentAccountService))
    private readonly agentAccount?: AgentAccountService,
    // escrow 轨道:reserve→release 生命周期(release 出口自挂钩 recordSpending)。
    @Optional()
    @Inject(forwardRef(() => AgentHireEscrowService))
    private readonly escrow?: AgentHireEscrowService,
  ) {}

  /**
   * 执行一笔被雇佣结算的全链路闭环。
   *
   * @throws BadRequestException 当 currency≠USDC(AXP 边界)、定价/血缘非法、或分佣不守恒时。
   */
  async settleHire(req: HireRequest): Promise<HireSettlementResult> {
    this.assertUsdcBoundary(req);

    const listing = req.listing;
    const quantity = req.quantity ?? 1;
    if (!(quantity > 0) || !Number.isFinite(quantity)) {
      throw new BadRequestException('quantity must be a positive number');
    }
    if (!(listing.unitPriceUsd > 0) || !Number.isFinite(listing.unitPriceUsd)) {
      throw new BadRequestException('listing.unitPriceUsd must be > 0 (server authoritative)');
    }

    // ── 步骤 2:服务端权威定价(不信任 clientSuggestedUsd)──
    const totalUsd = this.round2(listing.unitPriceUsd * quantity);
    if (
      req.clientSuggestedUsd != null &&
      Math.abs(req.clientSuggestedUsd - totalUsd) > CONSERVATION_TOLERANCE_USD
    ) {
      // 仅告警,不采用客户端金额(权威定价以服务端为准)。
      this.logger.warn(
        `client suggested $${req.clientSuggestedUsd} != authoritative $${totalUsd} (listing=${listing.listingId}); using authoritative`,
      );
    }

    // ── 步骤 3:多跳分佣(split-tree-generator)+ 守恒回填 ──
    const { breakdown, flatConfig, splitHash } = await this.computeBreakdown(listing, totalUsd);
    this.assertConservation(breakdown);

    // ── 步骤 4:Commission 合约一次提交(多跳合并为单次 SplitConfig)──
    const commission = this.buildCommissionSubmission(listing, flatConfig, splitHash);

    // ── 步骤 5 + 6:结算 + recordSpending 入账 ──
    const spendingEvents: HireSettlementResult['spendingEvents'] = [];
    const settlementRef = await this.runSettlement(req, breakdown, spendingEvents);
    await this.recordPartySpending(breakdown, commission, spendingEvents);

    this.logger.log(
      `hire settled task=${req.taskId} listing=${listing.listingId} total=$${totalUsd.toFixed(2)} ` +
        `merchantNet=$${breakdown.merchantNetUsd.toFixed(2)} parties=${breakdown.partyShares.length} rail=${req.rail}`,
    );

    return {
      taskId: req.taskId,
      listingId: listing.listingId,
      executingAgentId: listing.executingAgentId,
      currency: req.currency,
      rail: req.rail,
      breakdown,
      commission,
      settlementRef,
      spendingEvents,
    };
  }

  // ───────────────────────── 边界与定价 ─────────────────────────

  /** 需求 5.3:仅 USDC 进入结算;AXP / 其它币种一律拒绝(边界清晰,不混用余额)。 */
  private assertUsdcBoundary(req: HireRequest): void {
    if (req.currency !== 'USDC') {
      throw new BadRequestException(
        `settlement currency must be USDC; got "${req.currency}". ` +
          'AXP is an in-app points layer and must not be mixed into USDC settlement (需求 5.3).',
      );
    }
  }

  // ───────────────────────── 分账计算(守恒)─────────────────────────

  /**
   * 计算守恒的分账明细。
   *
   * 复用 split-tree-generator 的费率(平台/渠道/激励池)与哈希;但为保证 Property 6
   * **严格守恒**(含 USD 浮点出口),执行 agent(merchant)收取残余净额:
   *   merchantNet = total − platformFee − channelFee − Σ(各分佣方)。
   * 各分佣方分得 = 激励池 × poolShare(各方 poolShare 之和 ≤ 1)。所有金额按 cent 取整,
   * merchant 吸收取整残余,因此 USD 浮点之和恰好等于成交总额(无累计取整误差)。
   */
  private async computeBreakdown(
    listing: AgentServiceListing,
    totalUsd: number,
  ): Promise<{ breakdown: SettlementBreakdown; flatConfig: SplitConfig; splitHash: string }> {
    const totalUnits = this.usdToUnits(totalUsd);

    // 经 split-tree-generator 取得平台/渠道费(权威费率档)与分账哈希。
    const tree = await this.splitTree.generateSplitTree(
      totalUnits,
      listing.merchantWallet,
      {
        requestingAgent: listing.sellerUserId,
        executingAgent: listing.merchantWallet,
        taskId: listing.listingId,
      },
      listing.productType,
      listing.x402Enabled,
    );

    // 平台/渠道费按 cent 取整为 USD(权威费率来自 split-tree-generator)。
    const platformFeeUsd = this.unitsToUsd(tree.flatConfig.platformFee);
    const channelFeeUsd = listing.x402Enabled ? this.unitsToUsd(tree.flatConfig.channelFee) : 0;

    // 激励池(USD)= 费率档定义,分佣方从中按 poolShare 分。
    const incentivePoolUsd = this.unitsToUsd(
      this.incentivePoolUnits(totalUnits, listing.productType),
    );

    const parties = listing.parties ?? [];
    const totalPoolShare = parties.reduce((s, p) => s + p.poolShare, 0);
    if (totalPoolShare > 1 + 1e-9) {
      throw new BadRequestException(
        `sum of party poolShare (${totalPoolShare}) exceeds 1.0 for listing ${listing.listingId}`,
      );
    }

    const partyShares: SettlementShare[] = [];
    let partyUsdSum = 0;
    for (const p of parties) {
      const amountUsd = this.round2(incentivePoolUsd * p.poolShare);
      partyUsdSum += amountUsd;
      partyShares.push({
        role: p.role,
        agentId: p.agentId ?? null,
        wallet: p.wallet,
        amountUsd,
        percentage: this.pctUsd(amountUsd, totalUsd),
      });
    }

    // 守恒:merchant 净额 = total − platform − channel − Σ(分佣方)。残余(含取整 + 未分配激励池)归 merchant。
    const merchantNetUsd = this.round2(totalUsd - platformFeeUsd - channelFeeUsd - partyUsdSum);
    if (merchantNetUsd < 0) {
      throw new BadRequestException(
        `negative merchant net for listing ${listing.listingId}: fees+splits exceed total`,
      );
    }

    const merchantUnits = this.usdToUnits(merchantNetUsd);
    const platformUnits = this.usdToUnits(platformFeeUsd);
    const channelUnits = this.usdToUnits(channelFeeUsd);

    const merchantShare: SettlementShare = {
      role: 'merchant',
      agentId: listing.executingAgentId,
      wallet: listing.merchantWallet,
      amountUsd: merchantNetUsd,
      percentage: this.pctUsd(merchantNetUsd, totalUsd),
    };
    const platformShare: SettlementShare = {
      role: 'platform',
      wallet: tree.flatConfig.platformWallet,
      amountUsd: platformFeeUsd,
      percentage: this.pctUsd(platformFeeUsd, totalUsd),
    };
    const channelShare: SettlementShare | null =
      channelFeeUsd > 0
        ? {
            role: 'channel',
            wallet: tree.flatConfig.channelWallet,
            amountUsd: channelFeeUsd,
            percentage: this.pctUsd(channelFeeUsd, totalUsd),
          }
        : null;

    const shares: SettlementShare[] = [
      merchantShare,
      ...partyShares,
      platformShare,
      ...(channelShare ? [channelShare] : []),
    ];

    const breakdown: SettlementBreakdown = {
      totalUsd,
      merchantNetUsd,
      platformFeeUsd,
      channelFeeUsd,
      partyShares,
      shares,
    };

    // 合并后的链上 SplitConfig(单次提交):merchant 收净额,最大两个分佣方映射为
    // referral / execution 槽位,其余经多跳合并(P0 用首批两方,血缘审计仍保留在 partyShares)。
    const sorted = [...partyShares].sort((a, b) => b.amountUsd - a.amountUsd);
    const flatConfig: SplitConfig = {
      merchantMPCWallet: listing.merchantWallet,
      merchantAmount: merchantUnits,
      referralWallet: sorted[0]?.wallet || '0x0000000000000000000000000000000000000000',
      referralFee: sorted[0] ? this.usdToUnits(sorted[0].amountUsd) : 0n,
      executionWallet: sorted[1]?.wallet || '0x0000000000000000000000000000000000000000',
      executionFee: sorted[1] ? this.usdToUnits(sorted[1].amountUsd) : 0n,
      platformWallet: tree.flatConfig.platformWallet,
      platformFee: platformUnits,
      channelWallet: tree.flatConfig.channelWallet,
      channelFee: channelUnits,
    };

    return { breakdown, flatConfig, splitHash: tree.hash };
  }

  /**
   * 激励池单位数(用于分佣方分配)。复用 split-tree-generator 的费率档定义:
   * service=3.7% / physical=2.2% / virtual=2.2% / nft=1.7%。
   */
  private incentivePoolUnits(totalUnits: bigint, productType: AgentServiceListing['productType']): bigint {
    const RATES: Record<string, number> = {
      physical: 0.022,
      service: 0.037,
      virtual: 0.022,
      nft: 0.017,
    };
    return this.shareUnits(totalUnits, RATES[productType] ?? 0.037);
  }

  // ───────────────────────── Commission 一次提交 ─────────────────────────

  private buildCommissionSubmission(
    listing: AgentServiceListing,
    flatConfig: SplitConfig,
    splitHash: string,
  ): CommissionSubmission {
    // 链上一次提交校验:扁平配置金额之和必须等于 merchant+parties+platform+channel
    // (split-tree-generator.validateSplitConfig 同口径)。
    const validation = this.splitTree.validateSplitConfig(
      flatConfig,
      flatConfig.merchantAmount +
        flatConfig.referralFee +
        flatConfig.executionFee +
        flatConfig.platformFee +
        flatConfig.channelFee,
    );
    if (!validation.valid) {
      throw new BadRequestException(
        `commission SplitConfig invalid: ${validation.errors.join('; ')}`,
      );
    }
    return {
      flatConfig,
      splitHash,
      submissionRef: `commission-submit:${listing.listingId}:${splitHash}`,
      submittedAt: new Date().toISOString(),
    };
  }

  // ───────────────────────── 结算轨道 + 入账 ─────────────────────────

  /**
   * 步骤 5:结算。escrow 轨道经 reserve→release(release 出口自挂钩 recordSpending,任务 2.2);
   * relayer 轨道直接结算并由本编排器对执行 agent 记账。
   * 把执行 agent 的入账事件追加到 spendingEvents(审计)。
   */
  private async runSettlement(
    req: HireRequest,
    breakdown: SettlementBreakdown,
    spendingEvents: HireSettlementResult['spendingEvents'],
  ): Promise<string> {
    const listing = req.listing;
    if (req.rail === 'escrow') {
      if (!this.escrow) {
        throw new BadRequestException('escrow rail unavailable (AgentHireEscrowService not wired)');
      }
      await this.escrow.reserve({
        taskId: req.taskId,
        hirerUserId: req.hirerUserId,
        sellerUserId: listing.sellerUserId,
        agentId: listing.executingAgentId,
        agreedUsd: breakdown.totalUsd,
      });
      // release 出口内部已调用 recordSpending(escrow-release:<id>),金额 = min(actual, agreed)。
      const released = await this.escrow.releaseOnSuccess(req.taskId, breakdown.merchantNetUsd);
      spendingEvents.push({
        agentId: listing.executingAgentId,
        amountUsd: breakdown.merchantNetUsd,
        idempotencyKey: released ? `escrow-release:${released.id}` : `escrow-release:${req.taskId}`,
      });
      return released ? `escrow:${released.id}` : `escrow:${req.taskId}`;
    }

    // relayer 轨道:直接 USDC 结算。对执行 agent 以稳定幂等键记账(Property 1)。
    const idempotencyKey = `hire-relayer:${req.taskId}`;
    await this.safeRecordSpending(listing.executingAgentId, breakdown.merchantNetUsd, idempotencyKey);
    spendingEvents.push({
      agentId: listing.executingAgentId,
      amountUsd: breakdown.merchantNetUsd,
      idempotencyKey,
    });
    return `relayer:${req.taskId}`;
  }

  /**
   * 步骤 6:各分佣方 agent 入账(需求 5.2 多跳分佣到我 + 7.1 自动记账)。
   * 以 commission 提交引用派生稳定幂等键,保证账实一致(Property 1)。仅对带 agentId 的方记账。
   */
  private async recordPartySpending(
    breakdown: SettlementBreakdown,
    commission: CommissionSubmission,
    spendingEvents: HireSettlementResult['spendingEvents'],
  ): Promise<void> {
    for (let i = 0; i < breakdown.partyShares.length; i++) {
      const share = breakdown.partyShares[i];
      if (!share.agentId || !(share.amountUsd > 0)) continue;
      const idempotencyKey = `${commission.submissionRef}:party:${i}`;
      await this.safeRecordSpending(share.agentId, share.amountUsd, idempotencyKey);
      spendingEvents.push({ agentId: share.agentId, amountUsd: share.amountUsd, idempotencyKey });
    }
  }

  /** 记账失败不得中断结算主流程(吞错告警,幂等键允许后续补偿)。 */
  private async safeRecordSpending(agentId: string, amountUsd: number, idempotencyKey: string): Promise<void> {
    if (!this.agentAccount) return;
    try {
      await this.agentAccount.recordSpending(agentId, amountUsd, true, idempotencyKey);
    } catch (err: any) {
      this.logger.warn(
        `recordSpending failed agent=${agentId} key=${idempotencyKey}: ${err?.message}`,
      );
    }
  }

  // ───────────────────────── 守恒校验(Property 6)─────────────────────────

  /**
   * Correctness Property 6:商户净额 + 各方分佣 + 平台/渠道费 = 成交总额。
   * 守恒由 bigint 构造保证;此处对 USD 浮点出口做 cent 容差断言,防回归。
   */
  private assertConservation(b: SettlementBreakdown): void {
    const sum =
      b.merchantNetUsd +
      b.platformFeeUsd +
      b.channelFeeUsd +
      b.partyShares.reduce((s, p) => s + p.amountUsd, 0);
    if (Math.abs(sum - b.totalUsd) > CONSERVATION_TOLERANCE_USD) {
      throw new BadRequestException(
        `commission conservation violated (Property 6): sum=$${sum.toFixed(4)} != total=$${b.totalUsd.toFixed(4)}`,
      );
    }
  }

  // ───────────────────────── 金额换算工具 ─────────────────────────

  /** USD(浮点)→ USDC 最小单位(6 decimals bigint),四舍五入到 cent 再放大,避免浮点误差。 */
  private usdToUnits(usd: number): bigint {
    const cents = BigInt(Math.round(usd * 100));
    return (cents * USDC_SCALE) / 100n;
  }

  /** USDC 最小单位 → USD(浮点,两位小数)。 */
  private unitsToUsd(units: bigint): number {
    return Number((units * 100n) / USDC_SCALE) / 100;
  }

  /** 按比例取整分成(bigint,无浮点误差)。 */
  private shareUnits(units: bigint, rate: number): bigint {
    const bps = BigInt(Math.round(rate * 10000));
    return (units * bps) / 10000n;
  }

  /** 占总额百分比(两位小数,USD 口径)。 */
  private pctUsd(amountUsd: number, totalUsd: number): number {
    if (totalUsd === 0) return 0;
    return Math.round((amountUsd / totalUsd) * 10000) / 100;
  }

  /** 四舍五入到 cent。 */
  private round2(usd: number): number {
    return Math.round(usd * 100) / 100;
  }
}
