import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface ProviderRoute {
  provider: 'moonpay' | 'meld';
  rate: number;
  rateLockedUntil: Date;
  prefillLink: string;
  fees: {
    providerFee: number;
    networkFee: number;
    total: number;
  };
}

interface ProviderQuote {
  rate: number;
  rateLockedUntil: Date;
  fees: {
    providerFee: number;
    networkFee: number;
    total: number;
  };
}

@Injectable()
export class CryptoRailService {
  private readonly logger = new Logger(CryptoRailService.name);

  constructor(private configService: ConfigService) {}

  /**
   * 选择最优 Provider
   */
  async selectProvider(
    amount: number,
    currency: string,
    userId: string,
  ): Promise<ProviderRoute> {
    try {
      // 1. 获取所有 Provider 的报价
      const [moonpayQuote, meldQuote] = await Promise.allSettled([
        this.getMoonPayQuote(amount, currency),
        this.getMeldQuote(amount, currency),
      ]);

      // 2. 比较费用，选择最优
      const providers: Array<{
        name: 'moonpay' | 'meld';
        quote: ProviderQuote | null;
      }> = [
        {
          name: 'moonpay',
          quote:
            moonpayQuote.status === 'fulfilled' ? moonpayQuote.value : null,
        },
        {
          name: 'meld',
          quote: meldQuote.status === 'fulfilled' ? meldQuote.value : null,
        },
      ].filter((p) => p.quote !== null) as Array<{
        name: 'moonpay' | 'meld';
        quote: ProviderQuote;
      }>;

      if (providers.length === 0) {
        throw new Error('No provider available');
      }

      const bestProvider = providers.reduce((best, current) => {
        return current.quote.fees.total < best.quote.fees.total
          ? current
          : best;
      });

      // 3. 生成预填充链接
      const prefillLink = await this.generatePrefillLink(
        bestProvider.name,
        amount,
        currency,
        userId,
      );

      return {
        provider: bestProvider.name,
        rate: bestProvider.quote.rate,
        rateLockedUntil: bestProvider.quote.rateLockedUntil,
        prefillLink,
        fees: bestProvider.quote.fees,
      };
    } catch (error) {
      this.logger.error(`Failed to select provider: ${error.message}`);
      // 降级到 MoonPay
      return this.getFallbackRoute(amount, currency, userId);
    }
  }

  /**
   * 生成预填充链接（自动填入 PayMind 合约地址）
   */
  private async generatePrefillLink(
    provider: 'moonpay' | 'meld',
    amount: number,
    currency: string,
    userId: string,
  ): Promise<string> {
    const contractAddress = this.configService.get<string>(
      'PAYMIND_CONTRACT_ADDRESS',
    );
    const orderId = `order_${userId}_${Date.now()}`;

    if (provider === 'moonpay') {
      // MoonPay 预填充链接
      const apiKey = this.configService.get<string>('MOONPAY_API_KEY');
      return `https://buy.moonpay.com/?apiKey=${apiKey}&walletAddress=${contractAddress}&currencyCode=${currency}&baseCurrencyAmount=${amount}&orderId=${orderId}`;
    } else {
      // Meld 预填充链接
      return `https://meld.com/buy?wallet=${contractAddress}&amount=${amount}&currency=${currency}&orderId=${orderId}`;
    }
  }

  /**
   * 获取 MoonPay 报价
   */
  private async getMoonPayQuote(
    amount: number,
    currency: string,
  ): Promise<ProviderQuote> {
    try {
      const apiKey = this.configService.get<string>('MOONPAY_API_KEY');
      if (!apiKey) {
        throw new Error('MOONPAY_API_KEY not configured');
      }

      // 调用 MoonPay API 获取报价
      const response = await axios.get(
        `https://api.moonpay.com/v3/currencies/${currency}/quote`,
        {
          params: {
            baseCurrencyAmount: amount,
            apiKey: apiKey,
          },
          timeout: 5000, // 5秒超时
        },
      );

      return {
        rate: response.data.quoteCurrencyPrice || 1.0,
        rateLockedUntil: new Date(Date.now() + 5 * 60 * 1000), // 5 分钟锁定
        fees: {
          providerFee: response.data.feeAmount || amount * 0.029,
          networkFee: response.data.networkFeeAmount || 0,
          total: response.data.totalAmount || amount * 1.029,
        },
      };
    } catch (error) {
      this.logger.warn(`MoonPay quote failed: ${error.message}`);
      // 返回默认报价
      return {
        rate: 1.0,
        rateLockedUntil: new Date(Date.now() + 5 * 60 * 1000),
        fees: {
          providerFee: amount * 0.029, // 2.9%
          networkFee: 0,
          total: amount * 1.029,
        },
      };
    }
  }

  /**
   * 获取 Meld 报价
   */
  private async getMeldQuote(
    amount: number,
    currency: string,
  ): Promise<ProviderQuote> {
    try {
      // 调用 Meld API 获取报价
      // 这里简化实现，实际应该调用 Meld API
      return {
        rate: 1.0,
        rateLockedUntil: new Date(Date.now() + 5 * 60 * 1000),
        fees: {
          providerFee: amount * 0.02, // 2%
          networkFee: 0,
          total: amount * 1.02,
        },
      };
    } catch (error) {
      this.logger.warn(`Meld quote failed: ${error.message}`);
      // 返回默认报价
      return {
        rate: 1.0,
        rateLockedUntil: new Date(Date.now() + 5 * 60 * 1000),
        fees: {
          providerFee: amount * 0.02,
          networkFee: 0,
          total: amount * 1.02,
        },
      };
    }
  }

  /**
   * 降级路由（当所有 Provider 都失败时）
   */
  private async getFallbackRoute(
    amount: number,
    currency: string,
    userId: string,
  ): Promise<ProviderRoute> {
    const contractAddress = this.configService.get<string>(
      'PAYMIND_CONTRACT_ADDRESS',
    ) || '0x0000000000000000000000000000000000000000';
    const orderId = `order_${userId}_${Date.now()}`;

    return {
      provider: 'moonpay',
      rate: 1.0,
      rateLockedUntil: new Date(Date.now() + 5 * 60 * 1000),
      prefillLink: `https://buy.moonpay.com/?walletAddress=${contractAddress}&currencyCode=${currency}&baseCurrencyAmount=${amount}&orderId=${orderId}`,
      fees: {
        providerFee: amount * 0.029,
        networkFee: 0,
        total: amount * 1.029,
      },
    };
  }

  /**
   * 检查 KYC 状态（聚合多个 Provider）
   */
  async checkKYCStatus(userId: string, provider?: 'moonpay' | 'meld'): Promise<{
    verified: boolean;
    provider?: string;
    requiresInfo?: string[];
  }> {
    // 这里应该检查用户 DID 的 KYC 状态
    // 如果未认证，返回需要补充的资料
    // 简化实现
    return {
      verified: false,
      requiresInfo: ['ID Photo', 'Address Proof'],
    };
  }
}

