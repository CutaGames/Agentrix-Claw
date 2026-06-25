import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../../entities/payment.entity';

export interface ChainAccount {
  chain: string;
  address: string;
  balance: number;
  currency: string;
  lastUpdated: Date;
}

export interface MultiChainAccountSummary {
  merchantId: string;
  accounts: ChainAccount[];
  totalBalance: number;
  totalBalanceUSD: number;
  lastUpdated: Date;
}

@Injectable()
export class MultiChainAccountService {
  private readonly logger = new Logger(MultiChainAccountService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {}

  /**
   * 获取商户的多链账户汇总
   */
  async getMultiChainAccountSummary(merchantId: string): Promise<MultiChainAccountSummary> {
    // 查询商户的所有收款记录
    const payments = await this.paymentRepository.find({
      where: { merchantId, status: PaymentStatus.COMPLETED },
    });

    // 按链和货币分组统计
    const accountMap = new Map<string, ChainAccount>();

    payments.forEach(payment => {
      const chain = payment.metadata?.chain || 'ethereum';
      const currency = payment.currency;
      const key = `${chain}_${currency}`;

      if (!accountMap.has(key)) {
        accountMap.set(key, {
          chain,
          address: payment.metadata?.merchantAddress || '',
          balance: 0,
          currency,
          lastUpdated: new Date(),
        });
      }

      const account = accountMap.get(key)!;
      account.balance += Number(payment.amount);
      if (payment.createdAt > account.lastUpdated) {
        account.lastUpdated = payment.createdAt;
      }
    });

    const accounts = Array.from(accountMap.values());
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);

    // 简化：假设所有货币都按1:1转换为USD（实际应该查询汇率）
    const totalBalanceUSD = totalBalance;

    return {
      merchantId,
      accounts,
      totalBalance,
      totalBalanceUSD,
      lastUpdated: new Date(),
    };
  }

  /**
   * 获取指定链的账户余额
   */
  async getChainBalance(merchantId: string, chain: string, currency: string): Promise<number> {
    const summary = await this.getMultiChainAccountSummary(merchantId);
    const account = summary.accounts.find(
      acc => acc.chain === chain && acc.currency === currency,
    );
    return account?.balance || 0;
  }
}

