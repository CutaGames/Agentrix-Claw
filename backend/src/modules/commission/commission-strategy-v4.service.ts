import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommissionSettlement, SettlementStatus } from '../../entities/commission-settlement.entity';
import { CommissionAllocation } from '../../entities/commission-allocation.entity';
import { FundPath, FundPathType } from '../../entities/fund-path.entity';

export interface SplitRoles {
  promoter?: string; // Wallet Address or ID
  referrer?: string;
  executor?: string;
}

export interface SplitOptions {
  isX402?: boolean;  // Whether this is an X402 V2 payment
  paymentId?: string;
  orderId?: string;
  transactionHash?: string;
  customerAddress?: string;
  merchantAddress?: string;
}

export interface SplitResult {
  merchant: bigint;
  platform: bigint;
  channel: bigint; // ARN/X402 0.3% - deducted from platform fee
  promoter: bigint;
  referrer: bigint;
  executor: bigint;
  platformFund: bigint;
  isX402: boolean;
}

@Injectable()
export class CommissionStrategyV4Service {
  private readonly logger = new Logger(CommissionStrategyV4Service.name);
  
  constructor(
    @InjectRepository(CommissionSettlement)
    private settlementRepo: Repository<CommissionSettlement>,
    @InjectRepository(CommissionAllocation)
    private allocationRepo: Repository<CommissionAllocation>,
    @InjectRepository(FundPath)
    private fundPathRepo: Repository<FundPath>,
  ) {}

  // X402 V2 Channel Fee Rate - cancelled, no longer charged
  private readonly X402_CHANNEL_FEE_RATE = 0; // 0% (X402 channel fee cancelled)

  // Rates based on V5.0 Design (channel fee removed)
  private readonly RATES = {
    physical: { pool: 0.025, platform: 0.005, channel: 0 },
    service: { pool: 0.040, platform: 0.010, channel: 0 },
    virtual: { pool: 0.025, platform: 0.005, channel: 0 },
    nft: { pool: 0.020, platform: 0.005, channel: 0 },
  };

  /**
   * Calculate fund splits with X402 V2 support
   * When isX402 is true, the 0.3% channel fee is deducted from the platform fee
   */
  calculate(
    amount: bigint, 
    productType: 'physical' | 'service' | 'virtual' | 'nft', 
    roles: SplitRoles,
    options: SplitOptions = {}
  ): SplitResult {
    const rates = this.RATES[productType] || this.RATES.physical;
    const isX402 = options.isX402 || false;
    
    // 1. Base Fees
    const platformFeeTotal = this.calculateShare(amount, rates.platform);
    const incentivePool = this.calculateShare(amount, rates.pool);
    
    // 2. X402 V2 Channel Fee Logic
    // When using X402, the 0.3% channel fee is deducted FROM the platform fee
    // This means platform receives less, but merchant receives the same
    let channelFee: bigint;
    let platformNet: bigint;
    
    if (isX402) {
      // X402 V2: Channel fee comes from platform fee
      channelFee = this.calculateShare(amount, this.X402_CHANNEL_FEE_RATE);
      // Ensure channel fee doesn't exceed platform fee
      if (channelFee > platformFeeTotal) {
        channelFee = platformFeeTotal;
        this.logger.warn(`X402 channel fee exceeds platform fee, capping at platform fee`);
      }
      platformNet = platformFeeTotal - channelFee;
    } else {
      // Non-X402: Channel fee is separate (traditional flow)
      channelFee = this.calculateShare(amount, rates.channel);
      platformNet = platformFeeTotal;
    }
    
    // 3. Platform Fee Allocation (Promoter Logic)
    // Promoter gets 20% of Platform Fee (after X402 deduction)
    let promoterShare = 0n;
    
    if (roles.promoter) {
      promoterShare = platformNet * 20n / 100n;
      platformNet -= promoterShare;
    }
    
    // 4. Incentive Pool Allocation (Agent Logic)
    let executorShare = 0n;
    let referrerShare = 0n;
    let platformFund = 0n;
    
    // Executor (70%)
    const executorBudget = incentivePool * 70n / 100n;
    if (roles.executor) {
      executorShare = executorBudget;
    } else {
      platformFund += executorBudget;
    }
    
    // Referrer (30%)
    const referrerBudget = incentivePool * 30n / 100n;
    if (roles.referrer) {
      referrerShare = referrerBudget;
    } else {
      platformFund += referrerBudget;
    }
    
    // 5. Merchant Net
    // For X402, merchant receives the same as non-X402 (channel fee comes from platform)
    const merchantNet = isX402 
      ? amount - platformFeeTotal - incentivePool  // X402: channel fee is from platform
      : amount - channelFee - platformFeeTotal - incentivePool;  // Traditional: channel fee separate
    
    return {
      merchant: merchantNet,
      platform: platformNet,
      channel: channelFee,
      promoter: promoterShare,
      referrer: referrerShare,
      executor: executorShare,
      platformFund: platformFund,
      isX402,
    };
  }
  
  private calculateShare(amount: bigint, rate: number): bigint {
      // Rate is like 0.03 (3%)
      // We want amount * 0.03
      // = amount * 300 / 10000
      const bps = BigInt(Math.round(rate * 10000));
      return amount * bps / 10000n;
  }

  /**
   * Calculate and record commission with fund path tracking
   */
  async calculateAndRecordCommission(
    orderId: string,
    amount: string, // Decimal string
    productType: 'physical' | 'service' | 'virtual' | 'nft',
    roles: SplitRoles,
    options: SplitOptions = {}
  ): Promise<CommissionSettlement> {
      const decimals = 6;
      const amountBigInt = this.parseDecimal(amount, decimals);
      
      const result = this.calculate(amountBigInt, productType, roles, options);
      
      // Save Settlement
      const settlement = this.settlementRepo.create({
          orderId,
          totalAmount: amount,
          merchantAmount: this.formatDecimal(result.merchant, decimals),
          platformFee: this.formatDecimal(result.platform + result.platformFund, decimals),
          channelFee: this.formatDecimal(result.channel, decimals),
          status: SettlementStatus.PENDING,
      });
      
      const savedSettlement = await this.settlementRepo.save(settlement);
      
      // Save Allocations
      const allocations = [];
      
      // Promoter
      if (result.promoter > 0n && roles.promoter) {
          allocations.push(this.allocationRepo.create({
              settlement: savedSettlement,
              agentWallet: roles.promoter,
              role: 'promoter',
              amount: this.formatDecimal(result.promoter, decimals),
              status: 'pending'
          }));
      }
      
      // Executor
      if (result.executor > 0n && roles.executor) {
          allocations.push(this.allocationRepo.create({
              settlement: savedSettlement,
              agentWallet: roles.executor,
              role: 'executor',
              amount: this.formatDecimal(result.executor, decimals),
              status: 'pending'
          }));
      }
      
      // Referrer
      if (result.referrer > 0n && roles.referrer) {
          allocations.push(this.allocationRepo.create({
              settlement: savedSettlement,
              agentWallet: roles.referrer,
              role: 'referrer',
              amount: this.formatDecimal(result.referrer, decimals),
              status: 'pending'
          }));
      }
      
      if (allocations.length > 0) {
          await this.allocationRepo.save(allocations);
      }

      // Record Fund Paths for admin tracking
      await this.recordFundPaths(
        options.paymentId || orderId,
        orderId,
        amount,
        'USDT', // Default currency
        result,
        roles,
        options
      );
      
      return savedSettlement;
  }

  /**
   * Record detailed fund paths for a transaction
   */
  async recordFundPaths(
    paymentId: string,
    orderId: string,
    totalAmount: string,
    currency: string,
    result: SplitResult,
    roles: SplitRoles,
    options: SplitOptions = {}
  ): Promise<FundPath[]> {
    const decimals = 6;
    const fundPaths: FundPath[] = [];
    const txHash = options.transactionHash;
    const customerAddress = options.customerAddress || 'Customer';
    const merchantAddress = options.merchantAddress || 'Merchant';

    // 1. Merchant Net
    if (result.merchant > 0n) {
      fundPaths.push(this.fundPathRepo.create({
        paymentId,
        orderId,
        transactionHash: txHash,
        pathType: FundPathType.MERCHANT_NET,
        fromAddress: customerAddress,
        fromLabel: '客户',
        toAddress: merchantAddress,
        toLabel: '商户',
        amount: this.formatDecimal(result.merchant, decimals),
        currency,
        description: '商户实收金额',
        isX402: result.isX402,
      }));
    }

    // 2. Platform Fee
    if (result.platform > 0n) {
      fundPaths.push(this.fundPathRepo.create({
        paymentId,
        orderId,
        transactionHash: txHash,
        pathType: FundPathType.PLATFORM_FEE,
        fromAddress: customerAddress,
        fromLabel: '客户',
        toAddress: 'platform',
        toLabel: 'PayMind平台',
        amount: this.formatDecimal(result.platform, decimals),
        currency,
        description: '平台服务费',
        isX402: result.isX402,
      }));
    }

    // 3. X402/ARN Channel Fee (0.3%)
    if (result.channel > 0n) {
      fundPaths.push(this.fundPathRepo.create({
        paymentId,
        orderId,
        transactionHash: txHash,
        pathType: FundPathType.CHANNEL_FEE,
        fromAddress: result.isX402 ? 'platform' : customerAddress,
        fromLabel: result.isX402 ? 'PayMind平台' : '客户',
        toAddress: 'arn_treasury',
        toLabel: 'X402/ARN 通道',
        amount: this.formatDecimal(result.channel, decimals),
        currency,
        rate: '0',
        description: result.isX402 
          ? 'X402 V2 通道费 (从平台费扣除)' 
          : 'ARN 通道费',
        isX402: result.isX402,
      }));
    }

    // 4. Promoter Share
    if (result.promoter > 0n && roles.promoter) {
      fundPaths.push(this.fundPathRepo.create({
        paymentId,
        orderId,
        transactionHash: txHash,
        pathType: FundPathType.PROMOTER_SHARE,
        fromAddress: 'platform',
        fromLabel: 'PayMind平台',
        toAddress: roles.promoter,
        toLabel: '推广Agent',
        amount: this.formatDecimal(result.promoter, decimals),
        currency,
        rate: '0.20', // 20% of platform fee
        description: '推广者分成 (平台费的20%)',
        isX402: result.isX402,
      }));
    }

    // 5. Executor Share
    if (result.executor > 0n && roles.executor) {
      fundPaths.push(this.fundPathRepo.create({
        paymentId,
        orderId,
        transactionHash: txHash,
        pathType: FundPathType.EXECUTOR_SHARE,
        fromAddress: 'incentive_pool',
        fromLabel: '激励池',
        toAddress: roles.executor,
        toLabel: '执行Agent',
        amount: this.formatDecimal(result.executor, decimals),
        currency,
        rate: '0.70', // 70% of incentive pool
        description: '执行Agent分成 (激励池的70%)',
        isX402: result.isX402,
      }));
    }

    // 6. Referrer Share
    if (result.referrer > 0n && roles.referrer) {
      fundPaths.push(this.fundPathRepo.create({
        paymentId,
        orderId,
        transactionHash: txHash,
        pathType: FundPathType.REFERRER_SHARE,
        fromAddress: 'incentive_pool',
        fromLabel: '激励池',
        toAddress: roles.referrer,
        toLabel: '推荐Agent',
        amount: this.formatDecimal(result.referrer, decimals),
        currency,
        rate: '0.30', // 30% of incentive pool
        description: '推荐Agent分成 (激励池的30%)',
        isX402: result.isX402,
      }));
    }

    // 7. Platform Fund (unclaimed agent shares)
    if (result.platformFund > 0n) {
      fundPaths.push(this.fundPathRepo.create({
        paymentId,
        orderId,
        transactionHash: txHash,
        pathType: FundPathType.PLATFORM_FUND,
        fromAddress: 'incentive_pool',
        fromLabel: '激励池',
        toAddress: 'platform_fund',
        toLabel: '平台基金池',
        amount: this.formatDecimal(result.platformFund, decimals),
        currency,
        description: '无Agent时归入平台基金',
        isX402: result.isX402,
      }));
    }

    // Save all fund paths
    if (fundPaths.length > 0) {
      await this.fundPathRepo.save(fundPaths);
      this.logger.log(`Recorded ${fundPaths.length} fund paths for payment ${paymentId}`);
    }

    return fundPaths;
  }

  /**
   * Get fund paths for a specific payment
   */
  async getFundPathsByPaymentId(paymentId: string): Promise<FundPath[]> {
    return this.fundPathRepo.find({
      where: { paymentId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Get fund paths for a specific transaction hash
   */
  async getFundPathsByTxHash(transactionHash: string): Promise<FundPath[]> {
    return this.fundPathRepo.find({
      where: { transactionHash },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Get all fund paths with pagination for admin view
   */
  async getAllFundPaths(options: {
    page?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
    pathType?: FundPathType;
    isX402?: boolean;
  } = {}): Promise<{ items: FundPath[]; total: number; page: number; limit: number }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const queryBuilder = this.fundPathRepo.createQueryBuilder('fp');

    if (options.startDate) {
      queryBuilder.andWhere('fp.createdAt >= :startDate', { startDate: options.startDate });
    }
    if (options.endDate) {
      queryBuilder.andWhere('fp.createdAt <= :endDate', { endDate: options.endDate });
    }
    if (options.pathType) {
      queryBuilder.andWhere('fp.pathType = :pathType', { pathType: options.pathType });
    }
    if (options.isX402 !== undefined) {
      queryBuilder.andWhere('fp.isX402 = :isX402', { isX402: options.isX402 });
    }

    const [items, total] = await queryBuilder
      .orderBy('fp.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit };
  }
  
  private parseDecimal(value: string, decimals: number): bigint {
      const [intPart, fracPart = ''] = value.split('.');
      const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals);
      return BigInt(intPart + paddedFrac);
  }
  
  private formatDecimal(value: bigint, decimals: number): string {
      const s = value.toString().padStart(decimals + 1, '0');
      const intPart = s.slice(0, -decimals);
      const fracPart = s.slice(-decimals);
      return `${intPart}.${fracPart}`;
  }
}
