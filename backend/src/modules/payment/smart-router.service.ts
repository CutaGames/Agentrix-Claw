import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod } from '../../entities/payment.entity';
import { KYCLevel } from '../../entities/user.entity';

export interface PaymentChannel {
  method: PaymentMethod;
  priority: number;
  minAmount: number;
  maxAmount: number;
  cost: number; // 成本（手续费率）
  speed: number; // 速度（1-10，10最快）
  available: boolean;
  kycRequired?: boolean; // 是否需要KYC
  crossBorder?: boolean; // 是否支持跨境
  supportedCurrencies?: string[]; // 支持的货币
}

export type ScenarioType = 'qr_pay' | 'micro_sub' | 'wallet_direct' | 'standard';
export type FlowType = 'fiat' | 'fiat_to_crypto' | 'crypto';

export interface RoutingDecision {
  recommendedMethod: PaymentMethod;
  channels: PaymentChannel[];
  reason: string;
  requiresKYC?: boolean;
  crossBorderRoute?: {
    fiatToCrypto: boolean;
    cryptoToFiat: boolean;
    recommendedProvider?: string;
  };
  // 价格对比信息（用于前端显示）
  priceComparison?: {
    cryptoPrice?: number; // 数字货币直接支付价格
    stripePrice?: number; // Stripe支付价格
    fiatToCryptoPrice?: number; // 法币转数字货币最优价格
    fiatToCryptoProvider?: string; // 最优Provider名称
  };
  // V3.0新增：总手续费和汇率信息
  totalFeeRate?: number; // 总手续费比例（用于前端显示）
  exchangeRate?: {
    from: string; // 源货币
    to: string; // 目标货币
    rate: number; // 汇率
  }; // 汇率信息（如果涉及转换）
  scenarioType: ScenarioType;
  flowType: FlowType;
}

export interface RoutingContext {
  amount: number;
  currency: string;
  userCurrency?: string; // 用户所在国家货币
  merchantCurrency?: string; // 商户所在国家货币
  isOnChain?: boolean;
  userKYCLevel?: KYCLevel;
  isCrossBorder?: boolean; // 是否跨境
  userCountry?: string;
  merchantCountry?: string;
  merchantPaymentConfig?: 'fiat_only' | 'crypto_only' | 'both'; // 商家收款方式配置
  walletConnected?: boolean;
  quickPayEligible?: boolean;
  scenario?: ScenarioType;
}

@Injectable()
export class SmartRouterService {
  private readonly logger = new Logger(SmartRouterService.name);
  private channels: Map<PaymentMethod, PaymentChannel> = new Map();

  constructor(private configService: ConfigService) {
    this.initializeChannels();
  }

  private initializeChannels() {
    // Stripe通道（境内支付）
    this.channels.set(PaymentMethod.STRIPE, {
      method: PaymentMethod.STRIPE,
      priority: 50,
      minAmount: 1,
      maxAmount: 1000000,
      cost: 0.029, // 2.9% + 固定费用
      speed: 9,
      available: true,
      kycRequired: false,
      crossBorder: false,
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CNY', 'JPY'],
    });

    // 钱包支付通道
    this.channels.set(PaymentMethod.WALLET, {
      method: PaymentMethod.WALLET,
      priority: 60,
      minAmount: 0.001,
      maxAmount: 1000000,
      cost: 0.001, // Gas费用
      speed: 7,
      available: true,
      kycRequired: false,
      crossBorder: true,
      supportedCurrencies: ['USDC', 'USDT', 'ETH', 'BTC'],
    });

    // X402协议通道（优先）
    this.channels.set(PaymentMethod.X402, {
      method: PaymentMethod.X402,
      priority: 80, // 高优先级
      minAmount: 0.001,
      maxAmount: 1000000,
      cost: 0.0006, // 比标准链上支付低40%
      speed: 8,
      available: true,
      kycRequired: false,
      crossBorder: true,
      supportedCurrencies: ['USDC', 'USDT', 'ETH', 'BTC'],
    });

    // 多签通道
    this.channels.set(PaymentMethod.MULTISIG, {
      method: PaymentMethod.MULTISIG,
      priority: 40,
      minAmount: 1000,
      maxAmount: 10000000,
      cost: 0.002, // 多签Gas费用
      speed: 5,
      available: true,
      kycRequired: false,
      crossBorder: true,
      supportedCurrencies: ['USDC', 'USDT', 'ETH', 'BTC'],
    });
  }

  /**
   * 选择最佳支付通道（增强版，支持商家收款方式配置、跨境和KYC检查）
   */
  selectBestChannel(
    amount: number,
    currency: string,
    isOnChain: boolean = false,
    context?: RoutingContext,
  ): RoutingDecision {
    const ctx: RoutingContext = context || {
      amount,
      currency,
      isOnChain,
    };

    const scenarioType = this.detectScenario(ctx);
    const walletConnected = ctx.walletConnected;

    // 判断是否跨境
    const isCrossBorder = ctx.isCrossBorder || 
      (ctx.userCountry && ctx.merchantCountry && ctx.userCountry !== ctx.merchantCountry);

    // 商家收款方式配置（默认两种都接受）
    const merchantConfig = ctx.merchantPaymentConfig || 'both';

    const availableChannels = Array.from(this.channels.values()).filter(
      (channel) => {
        if (!channel.available) return false;
        if (amount < channel.minAmount || amount > channel.maxAmount) return false;
        
        // 根据商家收款方式配置过滤通道
        if (merchantConfig === 'fiat_only') {
          // 只收法币：只允许Stripe
          if (channel.method !== PaymentMethod.STRIPE) {
            return false;
          }
        } else if (merchantConfig === 'crypto_only') {
          // 只收数字货币：不允许Stripe
          if (channel.method === PaymentMethod.STRIPE) {
            return false;
          }
        }
        // merchantConfig === 'both' 时，所有通道都可用
        
        // 检查货币支持
        if (channel.supportedCurrencies && 
            !channel.supportedCurrencies.includes(currency)) {
          return false;
        }

        // 跨境场景：优先使用支持跨境的通道
        if (isCrossBorder && !channel.crossBorder && channel.method === PaymentMethod.STRIPE) {
          return false; // 境内支付不支持跨境
        }

        // KYC检查
        if (channel.kycRequired && ctx.userKYCLevel === KYCLevel.NONE) {
          return false;
        }

        if (
          (channel.method === PaymentMethod.WALLET || channel.method === PaymentMethod.X402) &&
          scenarioType === 'qr_pay' &&
          walletConnected === false
        ) {
          return false;
        }

        return true;
      },
    );

    // 如果没有可用通道，尝试添加默认通道（Stripe作为兜底）
    if (availableChannels.length === 0) {
      // 检查Stripe通道是否可用（即使被过滤掉，也尝试作为兜底）
      const stripeChannel = this.channels.get(PaymentMethod.STRIPE);
      const isCryptoCurrency = !['USD', 'EUR', 'GBP', 'CNY', 'JPY'].includes(currency.toUpperCase());
      
      if (stripeChannel && stripeChannel.available && !isCryptoCurrency) {
        // 放宽条件：只要金额在范围内，且不是数字货币，就允许使用Stripe
        if (amount >= stripeChannel.minAmount && amount <= stripeChannel.maxAmount) {
          availableChannels.push({ ...stripeChannel });
          this.logger.warn(`没有可用支付通道，使用Stripe作为兜底通道`);
        }
      }
      
      // 如果还是没有可用通道，抛出错误
      if (availableChannels.length === 0) {
        this.logger.error(`没有可用的支付通道。金额: ${amount}, 货币: ${currency}, 场景: ${scenarioType}, 商家配置: ${merchantConfig}`);
        throw new Error(`没有可用的支付通道支持 ${currency}。请检查支付金额、货币或联系客服。`);
      }
    }

    // 优先推荐数字货币支付（成本更低，用户体验更好）
    // 数字货币通道获得额外加分
    availableChannels.forEach((channel) => {
      if (channel.method === PaymentMethod.X402 || channel.method === PaymentMethod.WALLET) {
        channel.priority += 25; // 数字货币支付优先
      }
    });

    // 如果是链上支付，X402协议获得额外加分
    if (ctx.isOnChain) {
      const x402Channel = availableChannels.find(
        (c) => c.method === PaymentMethod.X402,
      );
      if (x402Channel) {
        x402Channel.priority += 30; // 额外加分
      }
    }

    // 跨境场景：数字货币通道优先
    if (isCrossBorder) {
      availableChannels.forEach((channel) => {
        if (channel.crossBorder) {
          channel.priority += 20; // 跨境场景加分
        }
      });
    }

    if (scenarioType === 'micro_sub' || ctx.quickPayEligible) {
      const x402Channel = availableChannels.find((c) => c.method === PaymentMethod.X402);
      if (x402Channel) {
        x402Channel.priority += 25;
      }
    }

    if (scenarioType === 'wallet_direct' && walletConnected) {
      const walletChannel = availableChannels.find((c) => c.method === PaymentMethod.WALLET);
      if (walletChannel) {
        walletChannel.priority += 25;
      }
    }

    // 计算综合得分
    const scoredChannels = availableChannels.map((channel) => {
      // 得分 = 优先级 * 0.4 + (1/成本) * 0.3 + 速度 * 0.3
      const costScore = 1 / (channel.cost + 0.001); // 避免除零
      const speedScore = channel.speed / 10;
      const priorityScore = channel.priority / 100;

      const score =
        priorityScore * 0.4 + costScore * 0.3 + speedScore * 0.3;

      return {
        channel,
        score,
      };
    });

    // 按得分排序
    scoredChannels.sort((a, b) => b.score - a.score);

    const recommended = scoredChannels[0].channel;
    const flowType = this.getFlowType(recommended.method, merchantConfig, scenarioType);

    // 跨境路由建议
    let crossBorderRoute;
    if (isCrossBorder && recommended.crossBorder) {
      crossBorderRoute = {
        fiatToCrypto: ctx.userCurrency !== 'USDC' && ctx.userCurrency !== 'USDT',
        cryptoToFiat: ctx.merchantCurrency !== 'USDC' && ctx.merchantCurrency !== 'USDT',
        recommendedProvider: 'binance', // 默认推荐Binance（费率最低）
      };
    }

    // 计算价格对比信息
    const priceComparison = this.calculatePriceComparison(
      amount,
      currency,
      availableChannels,
      merchantConfig,
    );

    return {
      recommendedMethod: recommended.method,
      channels: availableChannels,
      reason: this.getReasoning(recommended, amount, ctx.isOnChain, isCrossBorder, merchantConfig),
      requiresKYC: recommended.kycRequired && ctx.userKYCLevel === KYCLevel.NONE,
      crossBorderRoute,
      priceComparison,
      scenarioType,
      flowType,
    };
  }

  /**
   * 计算价格对比（用于前端显示）
   * 价格单位：USDC（统一使用USDC作为基准货币）
   */
  private calculatePriceComparison(
    amount: number,
    currency: string,
    availableChannels: PaymentChannel[],
    merchantConfig: 'fiat_only' | 'crypto_only' | 'both',
  ): RoutingDecision['priceComparison'] {
    const comparison: RoutingDecision['priceComparison'] = {};

    // 获取USDC汇率（用于统一价格显示）
    const usdcRate = this.getUSDCExchangeRate(currency);

    // Stripe价格（法币支付）- 转换为USDC
    if (merchantConfig === 'fiat_only' || merchantConfig === 'both') {
      const stripeChannel = availableChannels.find(c => c.method === PaymentMethod.STRIPE);
      if (stripeChannel) {
        // Stripe费用：2.9% + 固定费用（假设0.3）
        const fiatPrice = amount * (1 + stripeChannel.cost) + 0.3;
        // 转换为USDC价格
        comparison.stripePrice = fiatPrice * usdcRate;
      }
    }

    // 数字货币直接支付价格（已经是USDC，无需转换）
    if (merchantConfig === 'crypto_only' || merchantConfig === 'both') {
      const cryptoChannels = availableChannels.filter(
        c => c.method === PaymentMethod.X402 || c.method === PaymentMethod.WALLET
      );
      if (cryptoChannels.length > 0) {
        // 选择成本最低的数字货币通道
        const bestCrypto = cryptoChannels.reduce((a, b) => 
          (a.cost < b.cost ? a : b)
        );
        // 数字货币支付：金额 + Gas费用（通常很小）
        // 如果原始金额是法币，需要转换为USDC
        const cryptoAmount = currency === 'USDC' || currency === 'USDT' 
          ? amount 
          : amount * usdcRate;
        comparison.cryptoPrice = cryptoAmount * (1 + bestCrypto.cost);
      }
    }

    // 法币转数字货币价格（如果商家接受法币）- 转换为USDC
    if (merchantConfig === 'fiat_only' || merchantConfig === 'both') {
      // 这里应该调用FiatToCryptoService获取最优Provider报价
      // 暂时使用估算值（通常比Stripe低5-10%）
      if (comparison.stripePrice) {
        comparison.fiatToCryptoPrice = comparison.stripePrice * 0.92; // 假设最优Provider比Stripe便宜8%
        comparison.fiatToCryptoProvider = 'MoonPay'; // 默认Provider
      }
    }

    return comparison;
  }

  /**
   * 获取USDC汇率（用于统一价格显示）
   */
  private getUSDCExchangeRate(currency: string): number {
    // 实际应该调用实时汇率API
    // 这里使用模拟汇率
    const rates: Record<string, number> = {
      'CNY': 0.14, // 1 CNY = 0.14 USDC
      'USD': 1.0,  // 1 USD = 1.0 USDC
      'EUR': 1.08, // 1 EUR = 1.08 USDC
      'GBP': 1.27, // 1 GBP = 1.27 USDC
      'JPY': 0.0067, // 1 JPY = 0.0067 USDC
      'USDC': 1.0,
      'USDT': 1.0,
    };

    return rates[currency] || 1.0;
  }

  private getReasoning(
    channel: PaymentChannel,
    amount: number,
    isOnChain: boolean,
    isCrossBorder: boolean = false,
    merchantConfig: 'fiat_only' | 'crypto_only' | 'both' = 'both',
  ): string {
    if (channel.method === PaymentMethod.X402 && isOnChain) {
      return `X402协议：链上支付成本降低40%，推荐用于链上交易${isCrossBorder ? '（跨境场景）' : ''}`;
    }
    if (channel.method === PaymentMethod.STRIPE && amount < 100 && !isCrossBorder) {
      if (merchantConfig === 'fiat_only') {
        return `Stripe支付：商家只接受法币，快速到账`;
      }
      return `Stripe支付：小额支付，快速到账，推荐用于境内支付`;
    }
    if (channel.method === PaymentMethod.WALLET) {
      if (merchantConfig === 'crypto_only') {
        return `钱包支付：商家只接受数字货币，链上交易，推荐用于Web3支付`;
      }
      return `钱包支付：中等金额，链上交易，推荐用于Web3支付${isCrossBorder ? '（跨境场景）' : ''}`;
    }
    if (channel.method === PaymentMethod.MULTISIG && amount >= 1000) {
      return `多签支付：大额交易，安全可靠，推荐用于大额支付${isCrossBorder ? '（跨境场景）' : ''}`;
    }
    if (isCrossBorder) {
      return `跨境支付：推荐使用数字货币通道，成本更低，到账更快`;
    }
    if (merchantConfig === 'fiat_only') {
      return `商家只接受法币：推荐使用Stripe支付，快速到账`;
    }
    if (merchantConfig === 'crypto_only') {
      return `商家只接受数字货币：推荐使用X402或钱包支付，成本更低`;
    }
    return `综合评估：成本、速度、安全性最优`;
  }

  private detectScenario(ctx: RoutingContext): ScenarioType {
    if (ctx.scenario) {
      return ctx.scenario;
    }
    if (ctx.quickPayEligible) {
      return 'micro_sub';
    }
    if (ctx.walletConnected) {
      return 'wallet_direct';
    }
    if (ctx.merchantPaymentConfig === 'crypto_only' && ctx.walletConnected === false) {
      return 'qr_pay';
    }
    return 'standard';
  }

  private getFlowType(
    method: PaymentMethod,
    merchantConfig: 'fiat_only' | 'crypto_only' | 'both',
    scenario: ScenarioType,
  ): FlowType {
    if (scenario === 'qr_pay') {
      return 'fiat_to_crypto';
    }
    if (method === PaymentMethod.STRIPE) {
      return merchantConfig === 'crypto_only' ? 'fiat_to_crypto' : 'fiat';
    }
    return 'crypto';
  }

  /**
   * 获取所有可用通道
   */
  getAvailableChannels(): PaymentChannel[] {
    return Array.from(this.channels.values()).filter(
      (channel) => channel.available,
    );
  }

  /**
   * 更新通道状态
   */
  updateChannelStatus(method: PaymentMethod, available: boolean) {
    const channel = this.channels.get(method);
    if (channel) {
      channel.available = available;
    }
  }

  /**
   * 智能路由：Stripe vs Transak 选择
   * 
   * 选择逻辑：
   * 1. 商户配置 fiat_only → 优先 Stripe
   * 2. 商户配置 crypto_only → 只能用 Transak（法币转加密货币）
   * 3. 目标是加密货币 → Transak
   * 4. 目标是法币 → Stripe
   * 5. 跨境支付 → 优先数字货币通道
   * 6. 小额支付（<$50）→ 考虑 Stripe 固定费用影响
   */
  selectStripeOrTransak(params: {
    amount: number;
    fromCurrency: string;
    toCurrency: string;
    merchantPaymentConfig: 'fiat_only' | 'crypto_only' | 'both';
    isCrossBorder?: boolean;
    preferCrypto?: boolean;
  }): {
    provider: 'stripe' | 'transak';
    reason: string;
    estimatedFee: number;
    feeBreakdown: {
      providerFee: number;
      networkFee?: number;
      platformFee: number;
    };
  } {
    const { amount, fromCurrency, toCurrency, merchantPaymentConfig, isCrossBorder, preferCrypto } = params;
    
    const cryptoCurrencies = ['USDC', 'USDT', 'ETH', 'BTC', 'BNB', 'SOL'];
    const isToCrypto = cryptoCurrencies.includes(toCurrency.toUpperCase());
    const isFromCrypto = cryptoCurrencies.includes(fromCurrency.toUpperCase());

    // 计算 Stripe 费用（2.9% + $0.30）
    const stripeFee = amount * 0.029 + 0.30;
    const stripePlatformFee = amount * 0.01; // 平台额外抽成 1%

    // 计算 Transak 费用（约 3.5-5%）
    const transakFee = amount * 0.04; // 平均 4%
    const transakNetworkFee = 0.5; // 预估网络费用
    const transakPlatformFee = amount * 0.01; // 平台额外抽成 1%

    // 1. 商户只收法币 → Stripe
    if (merchantPaymentConfig === 'fiat_only' && !isToCrypto) {
      return {
        provider: 'stripe',
        reason: '商户只接受法币，使用 Stripe 直接支付',
        estimatedFee: stripeFee + stripePlatformFee,
        feeBreakdown: {
          providerFee: stripeFee,
          platformFee: stripePlatformFee,
        },
      };
    }

    // 2. 商户只收加密货币 → Transak
    if (merchantPaymentConfig === 'crypto_only') {
      return {
        provider: 'transak',
        reason: '商户只接受加密货币，使用 Transak 将法币转换为加密货币',
        estimatedFee: transakFee + transakNetworkFee + transakPlatformFee,
        feeBreakdown: {
          providerFee: transakFee,
          networkFee: transakNetworkFee,
          platformFee: transakPlatformFee,
        },
      };
    }

    // 3. 目标是加密货币 → Transak
    if (isToCrypto && !isFromCrypto) {
      return {
        provider: 'transak',
        reason: '支付目标是加密货币，使用 Transak 进行法币转加密货币',
        estimatedFee: transakFee + transakNetworkFee + transakPlatformFee,
        feeBreakdown: {
          providerFee: transakFee,
          networkFee: transakNetworkFee,
          platformFee: transakPlatformFee,
        },
      };
    }

    // 4. 跨境支付场景 → 倾向加密货币
    if (isCrossBorder) {
      // 跨境场景下，数字货币通常更便宜
      const stripeInternationalFee = stripeFee + (amount * 0.01); // 国际卡额外 1%
      
      if (transakFee + transakNetworkFee < stripeInternationalFee) {
        return {
          provider: 'transak',
          reason: '跨境支付场景，使用 Transak 的数字货币通道成本更低',
          estimatedFee: transakFee + transakNetworkFee + transakPlatformFee,
          feeBreakdown: {
            providerFee: transakFee,
            networkFee: transakNetworkFee,
            platformFee: transakPlatformFee,
          },
        };
      }
    }

    // 5. 小额支付（<$50）→ 考虑固定费用影响
    if (amount < 50) {
      // Stripe 的 $0.30 固定费用在小额支付中占比较高
      const stripeEffectiveRate = (stripeFee / amount) * 100;
      const transakEffectiveRate = ((transakFee + transakNetworkFee) / amount) * 100;

      if (stripeEffectiveRate > 5 && transakEffectiveRate < stripeEffectiveRate) {
        return {
          provider: 'transak',
          reason: `小额支付（$${amount}），Transak 有效费率更低`,
          estimatedFee: transakFee + transakNetworkFee + transakPlatformFee,
          feeBreakdown: {
            providerFee: transakFee,
            networkFee: transakNetworkFee,
            platformFee: transakPlatformFee,
          },
        };
      }
    }

    // 6. 用户偏好加密货币支付
    if (preferCrypto) {
      return {
        provider: 'transak',
        reason: '用户偏好加密货币支付',
        estimatedFee: transakFee + transakNetworkFee + transakPlatformFee,
        feeBreakdown: {
          providerFee: transakFee,
          networkFee: transakNetworkFee,
          platformFee: transakPlatformFee,
        },
      };
    }

    // 默认：使用 Stripe（法币直接支付，更快、更简单）
    return {
      provider: 'stripe',
      reason: '法币直接支付，Stripe 提供即时确认和良好的欺诈保护',
      estimatedFee: stripeFee + stripePlatformFee,
      feeBreakdown: {
        providerFee: stripeFee,
        platformFee: stripePlatformFee,
      },
    };
  }

  /**
   * 获取多通道报价比较
   */
  async getMultiChannelQuotes(params: {
    amount: number;
    fromCurrency: string;
    toCurrency?: string;
    merchantPaymentConfig: 'fiat_only' | 'crypto_only' | 'both';
  }): Promise<{
    stripe?: {
      available: boolean;
      fee: number;
      netAmount: number;
      estimatedTime: string;
    };
    transak?: {
      available: boolean;
      fee: number;
      cryptoAmount?: number;
      estimatedTime: string;
    };
    wallet?: {
      available: boolean;
      fee: number;
      estimatedTime: string;
    };
    recommendation: 'stripe' | 'transak' | 'wallet';
    reason: string;
  }> {
    const { amount, fromCurrency, toCurrency, merchantPaymentConfig } = params;
    
    const cryptoCurrencies = ['USDC', 'USDT', 'ETH', 'BTC'];
    const isFiatCurrency = !cryptoCurrencies.includes(fromCurrency.toUpperCase());
    const targetIsCrypto = toCurrency && cryptoCurrencies.includes(toCurrency.toUpperCase());

    // Stripe 报价
    const stripeAvailable = isFiatCurrency && merchantPaymentConfig !== 'crypto_only';
    const stripeFee = amount * 0.029 + 0.30;
    const stripeNetAmount = amount - stripeFee;

    // Transak 报价
    const transakAvailable = isFiatCurrency && (targetIsCrypto || merchantPaymentConfig === 'crypto_only');
    const transakFee = amount * 0.04;
    const transakCryptoAmount = (amount - transakFee) / 1; // 假设 1:1 汇率

    // Wallet 报价（直接加密货币支付）
    const walletAvailable = !isFiatCurrency || merchantPaymentConfig !== 'fiat_only';
    const walletFee = amount * 0.001; // Gas 费用

    // 选择推荐通道
    let recommendation: 'stripe' | 'transak' | 'wallet' = 'stripe';
    let reason = '';

    if (merchantPaymentConfig === 'fiat_only') {
      recommendation = 'stripe';
      reason = '商户只接受法币，推荐使用 Stripe';
    } else if (merchantPaymentConfig === 'crypto_only') {
      recommendation = walletAvailable && !isFiatCurrency ? 'wallet' : 'transak';
      reason = '商户只接受加密货币，' + 
        (recommendation === 'wallet' ? '推荐使用钱包直接支付' : '推荐使用 Transak 转换');
    } else if (targetIsCrypto) {
      recommendation = 'transak';
      reason = '目标是加密货币，推荐使用 Transak';
    } else if (stripeAvailable && stripeFee < transakFee) {
      recommendation = 'stripe';
      reason = 'Stripe 费用更低，推荐使用';
    }

    return {
      stripe: stripeAvailable ? {
        available: true,
        fee: Math.round(stripeFee * 100) / 100,
        netAmount: Math.round(stripeNetAmount * 100) / 100,
        estimatedTime: '即时',
      } : { available: false, fee: 0, netAmount: 0, estimatedTime: 'N/A' },
      transak: transakAvailable ? {
        available: true,
        fee: Math.round(transakFee * 100) / 100,
        cryptoAmount: Math.round(transakCryptoAmount * 100) / 100,
        estimatedTime: '3-5 分钟',
      } : { available: false, fee: 0, cryptoAmount: 0, estimatedTime: 'N/A' },
      wallet: walletAvailable ? {
        available: true,
        fee: Math.round(walletFee * 100) / 100,
        estimatedTime: '1-2 分钟',
      } : { available: false, fee: 0, estimatedTime: 'N/A' },
      recommendation,
      reason,
    };
  }
}

