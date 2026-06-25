import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Withdrawal, WithdrawalStatus } from '../../entities/withdrawal.entity';
import { FiatToCryptoService } from './fiat-to-crypto.service';
import { Inject, forwardRef } from '@nestjs/common';
import { CommissionService } from '../commission/commission.service';
import { OffRampCommissionService } from './off-ramp-commission.service';
import { ProviderManagerService } from './provider-manager.service';
import { emitWalletDelta } from '../desktop-sync/companion-presence.helpers';

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);

  constructor(
    @InjectRepository(Withdrawal)
    private withdrawalRepository: Repository<Withdrawal>,
    private fiatToCryptoService: FiatToCryptoService,
    @Inject(forwardRef(() => CommissionService))
    private commissionService: CommissionService,
    private offRampCommissionService: OffRampCommissionService,
    private providerManagerService: ProviderManagerService,
  ) {}

  /**
   * 创建提现申请
   */
  /**
   * 创建提现请求（手动触发 Off-ramp）
   * 
   * 允许商家手动将 MPC 钱包中的数字货币转换成法币
   * 即使商家接受 crypto 支付，也可以手动触发 Off-ramp 兑换
   * 
   * @param merchantId 商家ID
   * @param amount 提现金额（数字货币）
   * @param fromCurrency 源货币（数字货币，如 USDC）
   * @param toCurrency 目标货币（法币，如 CNY）
   * @param bankAccount 商家银行账户
   */
  async createWithdrawal(
    merchantId: string,
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    bankAccount: string,
  ): Promise<Withdrawal> {
    // 验证提现金额
    if (amount <= 0) {
      throw new BadRequestException('提现金额必须大于0');
    }

    // 获取Provider报价（用于计算Provider费率）
    const providers = this.providerManagerService.getOffRampProviders();
    let providerRate = 0.02; // 默认2%
    
    if (providers.length > 0) {
      try {
        const quote = await providers[0].getQuote(amount, fromCurrency, toCurrency);
        // Provider费率 = (amount - estimatedAmount) / amount
        providerRate = quote.fee / amount || 0.02;
      } catch (error) {
        this.logger.warn('获取Provider报价失败，使用默认费率', error);
      }
    }
    
    // 使用OffRampCommissionService计算分佣（支持可配置费率，可为0）
    const commission = this.offRampCommissionService.calculateOffRampCommission(
      amount,
      providerRate,
    );
    
    const providerFee = commission.providerFee;
    const paymindFee = commission.paymindFee; // 可配置，可为0
    const totalFees = commission.totalDeduction;

    if (amount < totalFees) {
      throw new BadRequestException(
        `提现金额必须大于手续费 ${totalFees} ${fromCurrency}`,
      );
    }

    // 获取汇率（数字货币转法币）
    const exchangeRate = await this.fiatToCryptoService.getExchangeRate(
      fromCurrency,
      toCurrency,
    );

    // 计算最终到账金额
    const netAmount = amount - totalFees; // 扣除手续费后的金额
    const finalAmount = netAmount * exchangeRate;

    // 创建提现记录
    const withdrawal = this.withdrawalRepository.create({
      merchantId,
      amount,
      fromCurrency,
      toCurrency,
      exchangeRate,
      finalAmount,
      providerFee,
      paymindFee,
      bankAccount,
      status: WithdrawalStatus.PENDING,
    });

    const savedWithdrawal = await this.withdrawalRepository.save(withdrawal);

    this.logger.log(
      `创建提现申请: ${savedWithdrawal.id}, 金额: ${amount} ${fromCurrency} -> ${finalAmount} ${toCurrency}`,
    );

    // 异步处理提现
    this.processWithdrawal(savedWithdrawal.id).catch((error) => {
      this.logger.error(`处理提现失败: ${savedWithdrawal.id}`, error);
    });

    return savedWithdrawal;
  }

  /**
   * 处理提现（数字货币转法币）
   * 
   * 用途：
   * 1. 商家手动触发：接受数字货币的商家可以手动将 MPC 钱包中的数字货币转换成法币
   * 2. 自动触发：商家只接受法币时，系统自动从 MPC 钱包转换（通过 payment.service.ts）
   * 
   * 流程：
   * - 从商家 MPC 钱包（数字货币）→ 通过 Provider Off-ramp（如 Transak）→ 打到商家银行账户（法币）
   */
  async processWithdrawal(withdrawalId: string): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepository.findOne({
      where: { id: withdrawalId },
    });

    if (!withdrawal) {
      throw new NotFoundException('提现记录不存在');
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException(`提现状态错误: ${withdrawal.status}`);
    }

    // 更新状态为处理中
    withdrawal.status = WithdrawalStatus.PROCESSING;
    await this.withdrawalRepository.save(withdrawal);

    try {
      // 调用Provider API转换数字货币为法币
      const providerResult = await this.fiatToCryptoService.convertCryptoToFiat(
        withdrawal.amount - withdrawal.providerFee - withdrawal.paymindFee, // 扣除手续费后的金额
        withdrawal.fromCurrency,
        withdrawal.toCurrency,
        withdrawal.bankAccount,
        undefined, // fromWalletAddress (MPC钱包地址，如果需要可以从metadata获取)
        {
          merchantId: withdrawal.merchantId,
          withdrawalId: withdrawal.id,
        },
      );

      // 更新提现记录
      withdrawal.providerId = providerResult.providerId;
      withdrawal.providerTransactionId = providerResult.transactionId;
      withdrawal.transactionHash = providerResult.transactionHash;
      withdrawal.status = WithdrawalStatus.COMPLETED;
      withdrawal.metadata = {
        ...withdrawal.metadata,
        providerResponse: providerResult,
      };

      const savedWithdrawal = await this.withdrawalRepository.save(withdrawal);

      this.logger.log(`提现处理完成: ${withdrawalId}`);

      // P-9 Companion Redesign — emit wallet.delta so the mobile Companion_Ball
      // shows a Wallet_Capsule transient and Lock_Screen_Pet briefly displays
      // the withdrawal amount. Wrapped in try/catch so any presence failure
      // never blocks the withdrawal itself.
      try {
        emitWalletDelta({
          userId: withdrawal.merchantId,
          delta: -Math.abs(withdrawal.amount),
          currency: withdrawal.fromCurrency,
          balanceAfter: 0, // upstream callers should overwrite when balance is queryable
          source: 'withdrawal',
          refId: savedWithdrawal.id,
          note: `提现 ${withdrawal.amount} ${withdrawal.fromCurrency}`,
        });
      } catch (err) {
        this.logger.warn(`emit wallet.delta failed for withdrawal ${withdrawalId}: ${(err as Error).message}`);
      }

      // 触发结算（如果有待结算的分润）
      await this.commissionService.executeSettlement(
        withdrawal.merchantId,
        'merchant' as any,
        withdrawal.toCurrency,
      ).catch((error) => {
        this.logger.error(`触发结算失败: ${withdrawal.merchantId}`, error);
      });

      return savedWithdrawal;
    } catch (error) {
      // 处理失败
      withdrawal.status = WithdrawalStatus.FAILED;
      withdrawal.failureReason = error.message || '处理失败';
      await this.withdrawalRepository.save(withdrawal);

      this.logger.error(`提现处理失败: ${withdrawalId}`, error);
      throw error;
    }
  }

  /**
   * 查询提现记录
   */
  async getWithdrawal(withdrawalId: string): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepository.findOne({
      where: { id: withdrawalId },
    });

    if (!withdrawal) {
      throw new NotFoundException('提现记录不存在');
    }

    return withdrawal;
  }

  /**
   * 查询商家的提现列表
   */
  async getWithdrawalsByMerchant(
    merchantId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<{ withdrawals: Withdrawal[]; total: number }> {
    const [withdrawals, total] = await this.withdrawalRepository.findAndCount({
      where: { merchantId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { withdrawals, total };
  }

  /**
   * 取消提现
   */
  async cancelWithdrawal(
    withdrawalId: string,
    merchantId: string,
  ): Promise<Withdrawal> {
    const withdrawal = await this.withdrawalRepository.findOne({
      where: { id: withdrawalId },
    });

    if (!withdrawal) {
      throw new NotFoundException('提现记录不存在');
    }

    if (withdrawal.merchantId !== merchantId) {
      throw new BadRequestException('无权操作此提现记录');
    }

    if (withdrawal.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException('只能取消待处理的提现');
    }

    withdrawal.status = WithdrawalStatus.CANCELLED;
    return this.withdrawalRepository.save(withdrawal);
  }
}

