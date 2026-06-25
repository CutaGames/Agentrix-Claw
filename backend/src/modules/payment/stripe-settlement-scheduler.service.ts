import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeConnectService } from './stripe-connect.service';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';
import { StripeSettlement, StripeSettlementStatus } from '../../entities/stripe-settlement.entity';

/**
 * Stripe 批量结算调度服务
 * 
 * 功能：
 * 1. T+3 批量结算：每天执行，结算 3 天前的成功支付
 * 2. 分佣计算：根据 V5 技能层分佣机制计算
 * 3. Stripe Connect 分账：自动转账给商户
 * 4. 对账报表：生成每日结算报表
 * 
 * 改进：
 * - 使用数据库持久化（stripe_settlements 表）
 * - 集成 Stripe Connect 自动分账
 */
@Injectable()
export class StripeSettlementSchedulerService {
  private readonly logger = new Logger(StripeSettlementSchedulerService.name);
  private batchCounter = 0;

  constructor(
    private stripeWebhookService: StripeWebhookService,
    private stripeConnectService: StripeConnectService,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(StripeSettlement)
    private stripeSettlementRepository: Repository<StripeSettlement>,
  ) {}

  /**
   * T+3 批量结算任务
   * 每天凌晨 3:00 执行
   */
  @Cron('0 3 * * *', {
    name: 'stripe-settlement',
    timeZone: 'Asia/Shanghai',
  })
  async executeT3Settlement() {
    this.logger.log('Starting T+3 Stripe settlement...');
    
    const batchId = `BATCH-${Date.now()}-${++this.batchCounter}`;
    const settlementDate = new Date();
    settlementDate.setDate(settlementDate.getDate() - 3); // T+3

    try {
      // 1. 从数据库获取待结算记录
      const pendingSettlements = await this.stripeSettlementRepository.find({
        where: {
          status: StripeSettlementStatus.PENDING,
          createdAt: LessThanOrEqual(settlementDate),
        },
        order: { createdAt: 'ASC' },
      });
      
      if (pendingSettlements.length === 0) {
        this.logger.log('No pending Stripe settlements found');
        return { batchId, processed: 0, failed: 0 };
      }

      this.logger.log(`Found ${pendingSettlements.length} settlements to process`);

      // 2. 执行批量结算
      const result = await this.processBatchSettlement(pendingSettlements, batchId);

      // 3. 记录结算结果
      this.logger.log(`Settlement completed: Batch ${batchId}`);
      this.logger.log(`  - Processed: ${result.processed}`);
      this.logger.log(`  - Failed: ${result.failed}`);
      this.logger.log(`  - Total Merchant Amount: $${result.totalMerchantAmount}`);
      this.logger.log(`  - Total Agent Amount: $${result.totalAgentAmount}`);
      this.logger.log(`  - Total Platform Commission: $${result.totalPlatformCommission}`);

      // 4. 生成结算报表
      await this.generateSettlementReport(batchId, result);

      return { batchId, ...result };
    } catch (error) {
      this.logger.error(`Settlement batch ${batchId} failed:`, error);
      throw error;
    }
  }

  /**
   * 获取待结算的 Stripe 支付记录（从数据库）
   */
  private async getPendingSettlements(beforeDate: Date): Promise<StripeSettlement[]> {
    return await this.stripeSettlementRepository.find({
      where: {
        status: StripeSettlementStatus.PENDING,
        createdAt: LessThanOrEqual(beforeDate),
      },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 执行批量结算（使用 Stripe Connect）
   */
  private async processBatchSettlement(
    settlements: StripeSettlement[],
    batchId: string,
  ): Promise<{
    processed: number;
    failed: number;
    totalMerchantAmount: number;
    totalAgentAmount: number;
    totalPlatformCommission: number;
  }> {
    let processed = 0;
    let failed = 0;
    let totalMerchantAmount = 0;
    let totalAgentAmount = 0;
    let totalPlatformCommission = 0;

    for (const settlement of settlements) {
      try {
        // 更新批次 ID
        settlement.settlementBatchId = batchId;
        settlement.status = StripeSettlementStatus.PROCESSING;
        await this.stripeSettlementRepository.save(settlement);

        // 尝试使用 Stripe Connect 分账
        if (settlement.stripeConnectAccountId) {
          const result = await this.stripeConnectService.executeSettlementTransfer(settlement.id);
          if (!result.success) {
            throw new Error(result.error || 'Connect transfer failed');
          }
        } else {
          // 没有 Connect 账户，标记为已结算（需要手动处理）
          settlement.status = StripeSettlementStatus.SETTLED;
          settlement.settledAt = new Date();
          settlement.metadata = {
            ...settlement.metadata,
            requiresManualPayout: true,
            manualPayoutReason: 'No Stripe Connect account',
          };
          await this.stripeSettlementRepository.save(settlement);
        }

        // 累计金额
        totalMerchantAmount += Number(settlement.merchantAmount);
        totalAgentAmount += Number(settlement.agentAmount);
        totalPlatformCommission += Number(settlement.platformCommission);
        processed++;

      } catch (error) {
        settlement.status = StripeSettlementStatus.FAILED;
        settlement.failureReason = error instanceof Error ? error.message : String(error);
        await this.stripeSettlementRepository.save(settlement);
        this.logger.error(`Failed to settle ${settlement.id}:`, error);
        failed++;
      }
    }

    return {
      processed,
      failed,
      totalMerchantAmount: Math.round(totalMerchantAmount * 100) / 100,
      totalAgentAmount: Math.round(totalAgentAmount * 100) / 100,
      totalPlatformCommission: Math.round(totalPlatformCommission * 100) / 100,
    };
  }

  /**
   * V5.0 分账费率配置
   */
  private readonly V5_FEE_CONFIGS: Record<string, {
    baseFeeRate: number;
    poolRate: number;
  }> = {
    'PHYSICAL': { baseFeeRate: 0.005, poolRate: 0.025 },  // 实物: 0.5% + 2.5% = 3%
    'DIGITAL': { baseFeeRate: 0.01, poolRate: 0.04 },     // 数字: 1% + 4% = 5%
    'SERVICE': { baseFeeRate: 0.015, poolRate: 0.065 },   // 服务: 1.5% + 6.5% = 8%
    'INFRA': { baseFeeRate: 0.005, poolRate: 0.02 },      // 基础设施: 0.5% + 2% = 2.5%
    'RESOURCE': { baseFeeRate: 0.005, poolRate: 0.025 },  // 资源: 0.5% + 2.5% = 3%
    'LOGIC': { baseFeeRate: 0.01, poolRate: 0.04 },       // 逻辑: 1% + 4% = 5%
    'COMPOSITE': { baseFeeRate: 0.02, poolRate: 0.08 },   // 复合: 2% + 8% = 10%
  };

  private readonly V5_SPLIT_RATIOS = {
    executionAgentRatio: 0.70,     // 激励池 70% 给执行 Agent
    recommendationAgentRatio: 0.30, // 激励池 30% 给推荐 Agent
    referralAgentRatio: 0.20,      // 平台管理费 20% 给推广 Agent
  };

  /**
   * 计算分佣（V5.0 五方分账机制）
   * 
   * V5.0 分账模型：
   * 1. Stripe 通道费: 2.9% + $0.30
   * 2. 平台管理费 (Base): 按商品类型 0.5-2%
   * 3. 激励池 (Pool): 按商品类型 2.5-8%
   * 4. 商户: 净额 - 平台管理费 - 激励池
   * 
   * 例：$100 实物商品
   * → Stripe $3.20 → 净额 $96.80
   * → 平台管理费 $0.50 (推广Agent $0.10, 平台净 $0.40)
   * → 激励池 $2.50 (执行Agent $1.75, 推荐Agent $0.75)
   * → 商户 $93.80
   */
  private calculateCommission(payment: Payment): {
    stripeFee: number;
    netAmount: number;
    platformCommission: number;
    merchantAmount: number;
    agentAmount: number;
    commissionRate: number;
    // V5.0 新增字段
    baseFee: number;
    poolFee: number;
    executionAgentAmount: number;
    recommendationAgentAmount: number;
    referralAgentAmount: number;
    platformNetAmount: number;
  } {
    const amount = Number(payment.amount);
    
    // 1. 计算 Stripe 手续费（2.9% + $0.30）
    const stripeFee = amount * 0.029 + 0.30;
    const netAmount = amount - stripeFee;

    // 2. 获取商品类型的费率配置
    const productType = payment.metadata?.productType || payment.metadata?.skillLayerType || 'PHYSICAL';
    const config = this.V5_FEE_CONFIGS[productType] || this.V5_FEE_CONFIGS['PHYSICAL'];

    // 3. 计算平台管理费和激励池（基于总金额）
    const baseFee = amount * config.baseFeeRate;
    const poolFee = amount * config.poolRate;
    const platformCommission = baseFee + poolFee;

    // 4. 商户最终所得
    const merchantAmount = netAmount - platformCommission;

    // 5. V5.0 激励池分配
    const hasExecutionAgent = !!payment.metadata?.executionAgentId;
    const hasRecommendationAgent = !!payment.metadata?.recommendationAgentId;
    const hasReferralAgent = !!payment.metadata?.referralAgentId;

    const executionAgentAmount = hasExecutionAgent 
      ? poolFee * this.V5_SPLIT_RATIOS.executionAgentRatio 
      : 0;
    const recommendationAgentAmount = hasRecommendationAgent 
      ? poolFee * this.V5_SPLIT_RATIOS.recommendationAgentRatio 
      : 0;
    const referralAgentAmount = hasReferralAgent 
      ? baseFee * this.V5_SPLIT_RATIOS.referralAgentRatio 
      : 0;

    // 未分配的归平台
    const unallocatedPool = poolFee - executionAgentAmount - recommendationAgentAmount;
    const platformNetAmount = (baseFee - referralAgentAmount) + unallocatedPool;

    // 兼容旧版：agentAmount = executionAgentAmount
    const agentAmount = executionAgentAmount;

    // 总费率
    const commissionRate = config.baseFeeRate + config.poolRate;

    return {
      stripeFee: Math.round(stripeFee * 100) / 100,
      netAmount: Math.round(netAmount * 100) / 100,
      platformCommission: Math.round(platformCommission * 100) / 100,
      merchantAmount: Math.round(merchantAmount * 100) / 100,
      agentAmount: Math.round(agentAmount * 100) / 100,
      commissionRate,
      // V5.0 新增
      baseFee: Math.round(baseFee * 100) / 100,
      poolFee: Math.round(poolFee * 100) / 100,
      executionAgentAmount: Math.round(executionAgentAmount * 100) / 100,
      recommendationAgentAmount: Math.round(recommendationAgentAmount * 100) / 100,
      referralAgentAmount: Math.round(referralAgentAmount * 100) / 100,
      platformNetAmount: Math.round(platformNetAmount * 100) / 100,
    };
  }

  /**
   * 根据技能层类型获取分佣率（V5.0 - 返回 baseFee + pool 总费率）
   */
  private getCommissionRateBySkillLayer(skillLayerType: string): number {
    const config = this.V5_FEE_CONFIGS[skillLayerType] || this.V5_FEE_CONFIGS['LOGIC'];
    return config.baseFeeRate + config.poolRate;
  }

  /**
   * 生成结算报表
   */
  private async generateSettlementReport(
    batchId: string,
    result: {
      processed: number;
      failed: number;
      totalMerchantAmount: number;
      totalAgentAmount: number;
      totalPlatformCommission: number;
    },
  ): Promise<void> {
    // 从数据库获取本批次的记录
    const batchRecords = await this.stripeSettlementRepository.find({
      where: { settlementBatchId: batchId },
    });

    const report = {
      batchId,
      generatedAt: new Date().toISOString(),
      summary: {
        totalProcessed: result.processed,
        totalFailed: result.failed,
        totalMerchantAmount: result.totalMerchantAmount,
        totalAgentAmount: result.totalAgentAmount,
        totalPlatformCommission: result.totalPlatformCommission,
        totalSettled: result.totalMerchantAmount + result.totalAgentAmount + result.totalPlatformCommission,
      },
      recordCount: batchRecords.length,
    };

    this.logger.log(`Settlement Report for ${batchId}:`);
    this.logger.log(JSON.stringify(report.summary, null, 2));

    // TODO: 保存报表到文件或发送邮件通知
  }

  /**
   * 手动触发结算（用于测试或补跑）
   */
  async manualSettlement(daysAgo: number = 3): Promise<any> {
    const settlementDate = new Date();
    settlementDate.setDate(settlementDate.getDate() - daysAgo);
    
    this.logger.log(`Manual settlement triggered for payments before ${settlementDate.toISOString()}`);
    return await this.executeT3Settlement();
  }

  /**
   * 获取结算统计（从数据库）
   */
  async getSettlementStats(): Promise<{
    totalRecords: number;
    pendingCount: number;
    settledCount: number;
    failedCount: number;
    totalSettledAmount: number;
  }> {
    const [totalRecords, pendingCount, settledCount, failedCount] = await Promise.all([
      this.stripeSettlementRepository.count(),
      this.stripeSettlementRepository.count({ where: { status: StripeSettlementStatus.PENDING } }),
      this.stripeSettlementRepository.count({ where: { status: StripeSettlementStatus.SETTLED } }),
      this.stripeSettlementRepository.count({ where: { status: StripeSettlementStatus.FAILED } }),
    ]);

    // 计算已结算金额
    const settledRecords = await this.stripeSettlementRepository.find({
      where: { status: StripeSettlementStatus.SETTLED },
      select: ['merchantAmount', 'agentAmount'],
    });
    const totalSettledAmount = settledRecords.reduce(
      (sum, r) => sum + Number(r.merchantAmount) + Number(r.agentAmount),
      0,
    );

    return {
      totalRecords,
      pendingCount,
      settledCount,
      failedCount,
      totalSettledAmount: Math.round(totalSettledAmount * 100) / 100,
    };
  }

  /**
   * 获取商户结算汇总（从数据库）
   */
  async getMerchantSettlementSummary(merchantId: string): Promise<{
    pendingAmount: number;
    settledAmount: number;
    failedAmount: number;
    records: StripeSettlement[];
  }> {
    const merchantRecords = await this.stripeSettlementRepository.find({
      where: { merchantId },
      order: { createdAt: 'DESC' },
    });

    const pendingAmount = merchantRecords
      .filter(r => r.status === StripeSettlementStatus.PENDING || r.status === StripeSettlementStatus.PROCESSING)
      .reduce((sum, r) => sum + Number(r.merchantAmount), 0);
    const settledAmount = merchantRecords
      .filter(r => r.status === StripeSettlementStatus.SETTLED)
      .reduce((sum, r) => sum + Number(r.merchantAmount), 0);
    const failedAmount = merchantRecords
      .filter(r => r.status === StripeSettlementStatus.FAILED)
      .reduce((sum, r) => sum + Number(r.merchantAmount), 0);

    return {
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      settledAmount: Math.round(settledAmount * 100) / 100,
      failedAmount: Math.round(failedAmount * 100) / 100,
      records: merchantRecords,
    };
  }

  /**
   * 获取 Agent 结算汇总（从数据库）
   */
  async getAgentSettlementSummary(agentId: string): Promise<{
    pendingAmount: number;
    settledAmount: number;
    failedAmount: number;
    records: StripeSettlement[];
  }> {
    const agentRecords = await this.stripeSettlementRepository.find({
      where: { agentId },
      order: { createdAt: 'DESC' },
    });

    const pendingAmount = agentRecords
      .filter(r => r.status === StripeSettlementStatus.PENDING || r.status === StripeSettlementStatus.PROCESSING)
      .reduce((sum, r) => sum + Number(r.agentAmount), 0);
    const settledAmount = agentRecords
      .filter(r => r.status === StripeSettlementStatus.SETTLED)
      .reduce((sum, r) => sum + Number(r.agentAmount), 0);
    const failedAmount = agentRecords
      .filter(r => r.status === StripeSettlementStatus.FAILED)
      .reduce((sum, r) => sum + Number(r.agentAmount), 0);

    return {
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      settledAmount: Math.round(settledAmount * 100) / 100,
      failedAmount: Math.round(failedAmount * 100) / 100,
      records: agentRecords,
    };
  }

  /**
   * 重试失败的结算
   */
  async retryFailedSettlements(): Promise<{
    retried: number;
    succeeded: number;
    failed: number;
  }> {
    const failedRecords = await this.stripeSettlementRepository.find({
      where: { status: StripeSettlementStatus.FAILED },
    });

    let succeeded = 0;
    let failed = 0;

    for (const record of failedRecords) {
      try {
        record.status = StripeSettlementStatus.PENDING;
        record.failureReason = null;
        await this.stripeSettlementRepository.save(record);

        if (record.stripeConnectAccountId) {
          const result = await this.stripeConnectService.executeSettlementTransfer(record.id);
          if (result.success) {
            succeeded++;
          } else {
            failed++;
          }
        } else {
          // 没有 Connect 账户，标记为已结算
          record.status = StripeSettlementStatus.SETTLED;
          record.settledAt = new Date();
          await this.stripeSettlementRepository.save(record);
          succeeded++;
        }
      } catch (error) {
        failed++;
        this.logger.error(`Retry failed for ${record.id}:`, error);
      }
    }

    return {
      retried: failedRecords.length,
      succeeded,
      failed,
    };
  }
}
