import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { TransakProviderService } from '../../payment/transak-provider.service';

/**
 * 法币入金能力执行器 (On-Ramp Skill)
 * 允许用户在 AI 对话中直接通过法币购买加密货币
 * 
 * 使用场景：
 * - ChatGPT 用户余额不足时，AI 可以调用此 Skill 生成充值链接
 * - 支持多种法币 (USD, EUR, CNY 等) 和加密货币 (USDC, ETH, SOL 等)
 */
@Injectable()
export class OnrampExecutor implements ICapabilityExecutor {
  readonly name = 'OnrampExecutor';
  private readonly logger = new Logger(OnrampExecutor.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => TransakProviderService))
    private readonly transakService: TransakProviderService,
  ) {}

  async execute(
    params: Record<string, any>,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const userId = context.userId;
    const capabilityId = context.capabilityId || params.capabilityId;

    this.logger.log(`OnrampExecutor called: capabilityId=${capabilityId}, userId=${userId}`);

    try {
      switch (capabilityId) {
        case 'onramp_fiat':
        case 'onramp':
          return await this.createOnrampSession(params, userId);
        case 'get_onramp_quote':
          return await this.getOnrampQuote(params);
        case 'get_supported_currencies':
          return await this.getSupportedCurrencies();
        default:
          return {
            success: false,
            error: 'UNKNOWN_CAPABILITY',
            message: `未知的入金能力: ${capabilityId}`,
          };
      }
    } catch (error: any) {
      this.logger.error(`OnrampExecutor failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: `入金操作失败: ${error.message}`,
      };
    }
  }

  /**
   * 创建入金会话
   * 返回 Transak 支付页面 URL
   */
  private async createOnrampSession(
    params: Record<string, any>,
    userId?: string,
  ): Promise<ExecutionResult> {
    const {
      fiatAmount,
      fiatCurrency = 'USD',
      cryptoCurrency = 'USDC',
      walletAddress,
      network = 'bsc',
    } = params;

    if (!fiatAmount || fiatAmount <= 0) {
      return {
        success: false,
        error: 'INVALID_AMOUNT',
        message: '请提供有效的充值金额',
      };
    }

    // 如果没有提供钱包地址，需要用户先开通钱包
    if (!walletAddress) {
      return {
        success: false,
        error: 'WALLET_REQUIRED',
        message: '请先开通或绑定钱包地址。您可以说"帮我开通一个钱包"来创建 MPC 托管钱包。',
        data: {
          nextAction: 'wallet_onboarding',
          hint: '需要先创建或绑定钱包才能充值',
        },
      };
    }

    try {
      // 使用 Transak executeOnRamp 创建入金会话
      const result = await this.transakService.executeOnRamp({
        amount: Number(fiatAmount),
        fromCurrency: fiatCurrency.toUpperCase(),
        toCurrency: cryptoCurrency.toUpperCase(),
        userId: userId || 'anonymous',
        metadata: {
          walletAddress,
          network,
        },
      });

      // 构建 Transak Widget URL
      const apiKey = this.configService.get<string>('TRANSAK_API_KEY_STAGING') || 
                     this.configService.get<string>('TRANSAK_API_KEY') || '';
      const environment = this.configService.get<string>('TRANSAK_ENVIRONMENT') || 'STAGING';
      
      const widgetBaseUrl = environment === 'PRODUCTION' 
        ? 'https://global.transak.com'
        : 'https://global-stg.transak.com';
      
      const widgetParams = new URLSearchParams({
        apiKey,
        fiatCurrency: fiatCurrency.toUpperCase(),
        cryptoCurrencyCode: cryptoCurrency.toUpperCase(),
        walletAddress,
        network,
        fiatAmount: String(fiatAmount),
        disableWalletAddressForm: 'true',
        themeColor: '6366f1',
      });

      const checkoutUrl = `${widgetBaseUrl}?${widgetParams.toString()}`;

      return {
        success: true,
        data: {
          transactionId: result.transactionId,
          checkoutUrl,
          fiatAmount: fiatAmount,
          fiatCurrency: fiatCurrency.toUpperCase(),
          cryptoCurrency: cryptoCurrency.toUpperCase(),
          walletAddress,
          status: result.status,
        },
        message: `已为您创建 ${fiatAmount} ${fiatCurrency} 的充值订单。请点击链接完成支付，${cryptoCurrency} 将自动到账您的钱包。`,
      };
    } catch (error: any) {
      this.logger.error(`Transak onRamp failed: ${error.message}`);
      
      // 提供友好的错误信息
      if (error.message?.includes('unsupported')) {
        return {
          success: false,
          error: 'UNSUPPORTED_CURRENCY',
          message: `当前不支持 ${fiatCurrency} -> ${cryptoCurrency} 的兑换。请尝试其他货币组合。`,
        };
      }

      return {
        success: false,
        error: 'ONRAMP_FAILED',
        message: `创建充值订单失败: ${error.message}`,
      };
    }
  }

  /**
   * 获取入金报价
   * 使用 TransakProviderService.getQuote() 获取实时报价
   */
  private async getOnrampQuote(params: Record<string, any>): Promise<ExecutionResult> {
    const {
      fiatAmount,
      fiatCurrency = 'USD',
      cryptoCurrency = 'USDC',
    } = params;

    if (!fiatAmount) {
      return {
        success: false,
        error: 'MISSING_AMOUNT',
        message: '请提供充值金额以获取报价',
      };
    }

    try {
      // 使用 TransakProviderService.getQuote() - 接收 4 个参数
      // getQuote(amount, fromCurrency, toCurrency, isSourceAmount)
      const quote = await this.transakService.getQuote(
        Number(fiatAmount),
        fiatCurrency.toUpperCase(),
        cryptoCurrency.toUpperCase(),
        true, // isSourceAmount = true，因为用户提供的是法币金额
      );

      // ProviderQuote 接口: { providerId, rate, fee, estimatedAmount, expiresAt }
      const estimatedCryptoAmount = quote.estimatedAmount;
      const exchangeRate = quote.rate;
      const fee = quote.fee;

      return {
        success: true,
        data: {
          fiatAmount,
          fiatCurrency: fiatCurrency.toUpperCase(),
          cryptoCurrency: cryptoCurrency.toUpperCase(),
          estimatedCryptoAmount,
          exchangeRate,
          fee,
          totalFiatAmount: Number(fiatAmount) + fee,
          expiresAt: quote.expiresAt,
        },
        message: `${fiatAmount} ${fiatCurrency} 约可兑换 ${estimatedCryptoAmount.toFixed(4)} ${cryptoCurrency}（汇率: ${exchangeRate.toFixed(4)}，手续费: ${fee.toFixed(2)} ${fiatCurrency}）`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'QUOTE_FAILED',
        message: `获取报价失败: ${error.message}`,
      };
    }
  }

  /**
   * 获取支持的货币列表
   */
  private async getSupportedCurrencies(): Promise<ExecutionResult> {
    return {
      success: true,
      data: {
        fiatCurrencies: ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'KRW', 'INR', 'AUD', 'CAD'],
        cryptoCurrencies: ['USDC', 'USDT', 'ETH', 'BNB', 'SOL', 'MATIC'],
        networks: ['bsc', 'ethereum', 'polygon', 'solana', 'arbitrum', 'optimism'],
        recommendedPairs: [
          { fiat: 'USD', crypto: 'USDC', network: 'bsc' },
          { fiat: 'EUR', crypto: 'USDC', network: 'polygon' },
          { fiat: 'CNY', crypto: 'USDT', network: 'bsc' },
        ],
      },
      message: '支持多种法币和加密货币的兑换。推荐使用 USDC 作为充值目标货币。',
    };
  }
}
