import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IProvider, ProviderQuote, OnRampParams, OnRampResult, OffRampParams, OffRampResult } from './provider-abstract.service';
import axios, { AxiosError } from 'axios';
import { ExchangeRateService } from './exchange-rate.service';

/**
 * Transak Provider Service
 * 实现 Transak 的 On-ramp 和 Off-ramp 功能
 * 
 * 文档: https://docs.transak.com/docs
 * Transak 主要通过 SDK/iframe 方式集成，本服务提供后端支持
 */
@Injectable()
export class TransakProviderService implements IProvider {
  private readonly logger = new Logger(TransakProviderService.name);
  
  id = 'transak';
  name = 'Transak';
  supportsOnRamp = true;
  supportsOffRamp = true;

  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly environment: 'STAGING' | 'PRODUCTION';
  private readonly webhookSecret: string;
  private readonly webhookUrl: string;
  private readonly baseUrl: string;
  private readonly gatewayBaseUrl: string;
  private cachedAccessToken: string | null = null;
  private cachedAccessTokenExpiresAt = 0;

  constructor(
    private configService: ConfigService,
    private exchangeRateService: ExchangeRateService,
  ) {
    // 从环境变量读取 Transak 配置
    const envValue = this.configService.get<string>('TRANSAK_ENVIRONMENT') || 'STAGING';
    this.environment = (envValue.toUpperCase() === 'PRODUCTION' ? 'PRODUCTION' : 'STAGING') as 'STAGING' | 'PRODUCTION';
    
    // 根据环境选择对应的 API Key
    // 支持分别配置：TRANSAK_API_KEY_STAGING 和 TRANSAK_API_KEY_PRODUCTION
    // 也支持统一配置：TRANSAK_API_KEY（如果环境特定的 key 不存在，则使用统一的）
    if (this.environment === 'PRODUCTION') {
      this.apiKey = this.configService.get<string>('TRANSAK_API_KEY_PRODUCTION') || 
                     this.configService.get<string>('TRANSAK_API_KEY') || '';
    } else {
      this.apiKey = this.configService.get<string>('TRANSAK_API_KEY_STAGING') || 
                     this.configService.get<string>('TRANSAK_API_KEY') || '';
    }

    if (this.environment === 'PRODUCTION') {
      this.apiSecret = this.configService.get<string>('TRANSAK_API_SECRET_PRODUCTION') ||
                       this.configService.get<string>('TRANSAK_API_SECRET') || '';
    } else {
      this.apiSecret = this.configService.get<string>('TRANSAK_API_SECRET_STAGING') ||
                       this.configService.get<string>('TRANSAK_API_SECRET') || '';
    }
    
    // 验证配置
    if (!this.apiKey) {
      this.logger.warn('⚠️ Transak API Key not configured. Transak features will be disabled.');
    } else {
      this.logger.log(`✅ Transak configured: Environment=${this.environment}, API Key=${this.apiKey.substring(0, 8)}...`);
      
      // 检查环境与 API Key 是否匹配（简单检查）
      if (this.environment === 'PRODUCTION' && this.apiKey.includes('staging')) {
        this.logger.warn('⚠️ Using PRODUCTION environment but API Key may be for STAGING. Please verify your configuration.');
      }
      if (this.environment === 'STAGING' && this.apiKey.includes('prod')) {
        this.logger.warn('⚠️ Using STAGING environment but API Key may be for PRODUCTION. Please verify your configuration.');
      }
    }

    if (!this.apiSecret) {
      this.logger.warn('⚠️ Transak API Secret not configured. Create Session API will fail until it is provided.');
    }
    
    this.webhookSecret = this.configService.get<string>('TRANSAK_WEBHOOK_SECRET') || '';
    
    // Transak API 基础 URL
    if (this.environment === 'PRODUCTION') {
      this.baseUrl = 'https://api.transak.com';
    } else {
      // STAGING 环境：使用 api-stg.transak.com
      const alternateApiUrl = this.configService.get<string>('TRANSAK_API_URL_ALTERNATE');
      if (alternateApiUrl) {
        this.baseUrl = alternateApiUrl;
        this.logger.warn(`⚠️ STAGING environment using alternate API URL: ${alternateApiUrl}`);
      } else {
        this.baseUrl = 'https://api-stg.transak.com';
        this.logger.log(`✅ STAGING environment using api-stg.transak.com`);
      }
    }

    const gatewayOverride = this.configService.get<string>('TRANSAK_GATEWAY_BASE_URL');
    this.gatewayBaseUrl = gatewayOverride ||
      (this.environment === 'PRODUCTION'
        ? 'https://api-gateway.transak.com'
        : 'https://api-gateway-stg.transak.com');

    if (gatewayOverride) {
      this.logger.warn(`⚠️ Using custom Transak gateway base URL: ${gatewayOverride}`);
    }
    
    // 记录配置信息（用于调试）
    this.logger.debug(`Transak Provider initialized: environment=${this.environment}, baseUrl=${this.baseUrl}, apiKey=${this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'NOT SET'}`);
    
    this.webhookUrl = this.configService.get<string>('TRANSAK_WEBHOOK_URL') || 
      `${this.configService.get<string>('API_BASE_URL') || 'http://localhost:3001'}/api/payments/provider/transak/webhook`;

    if (!this.apiKey) {
      this.logger.warn('Transak API key not configured. Transak Provider will not work.');
    }
  }

  /**
   * 获取报价
   * Transak 通过 API 获取实时报价
   * 
   * @param amount 金额
   * @param fromCurrency 源货币 (法币)
   * @param toCurrency 目标货币 (加密货币)
   * @param isSourceAmount 是否为源金额 (true: amount 是法币, false: amount 是加密货币)
   */
  async getQuote(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    isSourceAmount: boolean = false, // 默认 false，因为我们通常知道要收多少加密货币
  ): Promise<ProviderQuote> {
    let normalizedAmount = amount;
    let normalizedFromCurrency = fromCurrency;

    // 如果是 CNY、HKD 或 INR，Transak 可能不支持或支持不好，转换为 USD 获取报价
    const unsupportedCurrencies = ['CNY', 'HKD', 'INR'];
    if (unsupportedCurrencies.includes(fromCurrency.toUpperCase())) {
      try {
        const rate = await this.exchangeRateService.getExchangeRate(fromCurrency, 'USD');
        // 如果 isSourceAmount 为 true，转换法币金额
        if (isSourceAmount) {
          normalizedAmount = amount * rate;
        }
        normalizedFromCurrency = 'USD';
        this.logger.log(`Transak: Using USD for quote (original: ${fromCurrency})`);
      } catch (error) {
        this.logger.warn(`Transak: Failed to convert ${fromCurrency} to USD for quote: ${error.message}`);
      }
    }

    this.logger.log(
      `Transak: Get quote for ${normalizedAmount} ${isSourceAmount ? normalizedFromCurrency : toCurrency} -> ${isSourceAmount ? toCurrency : normalizedFromCurrency}`,
    );

    try {
      const params: any = {
        fiatCurrency: normalizedFromCurrency,
        cryptoCurrency: toCurrency,
        partnerApiKey: this.apiKey,
        isBuyOrSell: 'BUY',
        isSourceAmount: isSourceAmount,
      };

      if (isSourceAmount) {
        params.fiatAmount = normalizedAmount;
      } else {
        params.cryptoAmount = normalizedAmount;
      }

      // 根据币种设置默认网络
      if (toCurrency.toUpperCase() === 'USDT' || toCurrency.toUpperCase() === 'USDC') {
        params.network = 'bsc';
      } else if (toCurrency.toUpperCase() === 'ETH') {
        params.network = 'ethereum';
      } else if (toCurrency.toUpperCase() === 'BNB') {
        params.network = 'bsc';
      } else if (toCurrency.toUpperCase() === 'MATIC') {
        params.network = 'polygon';
      } else if (toCurrency.toUpperCase() === 'SOL') {
        params.network = 'solana';
      } else if (toCurrency.toUpperCase() === 'TRX') {
        params.network = 'tron';
      }

      this.logger.debug(`Transak: Requesting quote from ${this.baseUrl}/api/v2/currencies/price with params: ${JSON.stringify(params)}`);

      // 创建专用的 axios 实例，绕过全局代理配置
      const httpsAgent = new (await import('https')).Agent({
        rejectUnauthorized: true,
      });

      const response = await axios.get(`${this.baseUrl}/api/v2/currencies/price`, {
        params,
        headers: {
          'apiKey': this.apiKey,
        },
        timeout: 10000,
        httpsAgent,
        proxy: false, // 禁用代理，避免 HTTP/HTTPS 混淆
      });

      const data = response.data?.response || response.data;
      
      // 如果 isSourceAmount 为 false，我们关心的是 fiatAmount (用户需要支付多少法币)
      // 如果 isSourceAmount 为 true，我们关心的是 cryptoAmount (用户能得到多少加密货币)
      const cryptoAmount = parseFloat(data.cryptoAmount || data.amount || '0');
      const fiatAmount = parseFloat(data.fiatAmount || '0');
      let fee = parseFloat(data.totalFee || data.fee || '0');
      
      // 如果我们之前为了获取报价将 CNY 转换成了 USD，现在需要将返回的 USD fee 转换回 CNY
      if (fromCurrency.toUpperCase() === 'CNY' && normalizedFromCurrency === 'USD') {
        try {
          const backRate = await this.exchangeRateService.getExchangeRate('USD', 'CNY');
          fee = fee * backRate;
          this.logger.log(`Transak: Converted fee back to CNY: ${fee.toFixed(2)} (rate: ${backRate})`);
        } catch (error) {
          this.logger.warn(`Transak: Failed to convert fee back to CNY: ${error.message}`);
          // 如果转换失败，使用近似汇率 7.1
          fee = fee * 7.1;
        }
      }

      // 汇率计算：1 单位法币兑换多少加密货币
      const rate = isSourceAmount ? (cryptoAmount / amount) : (amount / fiatAmount);

      return {
        providerId: this.id,
        rate,
        fee,
        estimatedAmount: isSourceAmount ? cryptoAmount : fiatAmount,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5分钟有效期
      };
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data;
        
        // 如果是 403 (Cloudflare 拦截) 或 400 (参数错误)，在开发环境下返回 Mock 数据
        if ((status === 403 || status === 400) && process.env.NODE_ENV !== 'production') {
          this.logger.warn(`Transak API failed with status ${status}, returning mock quote for development`);
          const mockRate = 0.98; // 模拟汇率
          const mockCryptoAmount = amount * mockRate;
          return {
            providerId: this.id,
            rate: mockRate,
            fee: amount * 0.01,
            estimatedAmount: mockCryptoAmount,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          };
        }

        this.logger.error(
          `Transak: Failed to get quote${status ? ` (status ${status})` : ''}: ${
            typeof data === 'object' ? JSON.stringify(data) : data || error.message
          }`,
        );
      } else {
        this.logger.error(`Transak: Failed to get quote: ${error.message}`);
      }
      throw new Error(`Failed to get quote from Transak: ${error.message}`);
    }
  }

  /**
   * 执行 On-ramp（法币转数字货币）
   * Transak 主要通过前端 SDK/iframe 集成，这里返回用于前端集成的配置
   */
  async executeOnRamp(params: OnRampParams): Promise<OnRampResult> {
    this.logger.log(
      `Transak: Execute On-ramp for ${params.amount} ${params.fromCurrency} -> ${params.toCurrency}`,
    );

    try {
      // Transak 的 On-ramp 主要通过前端 SDK 完成
      // 这里创建一个订单 ID 用于跟踪
      const orderId = `transak_on_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 返回结果，包含用于前端 SDK 的配置
      return {
        transactionId: orderId,
        status: 'pending',
        cryptoAmount: 0, // 实际金额由前端 SDK 完成交易后通过 webhook 更新
        cryptoCurrency: params.toCurrency,
      };
    } catch (error: any) {
      this.logger.error(`Transak: On-ramp failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * 执行 Off-ramp（数字货币转法币）
   * 用于商家将 MPC 钱包中的数字货币转换成法币
   * 
   * 使用场景：
   * 1. 自动 Off-ramp：商家只接受法币时，合约分佣后自动从 MPC 钱包转换
   * 2. 手动 Off-ramp：商家接受 crypto，但想手动将 MPC 钱包中的数字货币转换成法币
   * 
   * 资金流：
   * - 从商家 MPC 钱包（数字货币）→ 通过 Transak Off-ramp → 打到商家银行账户（法币）
   * 
   * 文档: https://docs.transak.com/docs/transak-off-ramp
   */
  async executeOffRamp(params: OffRampParams): Promise<OffRampResult> {
    this.logger.log(
      `Transak: Execute Off-ramp for ${params.amount} ${params.fromCurrency} -> ${params.toCurrency}`,
    );

    try {
      // Transak Off-ramp API 调用
      // 注意：实际 API 端点需要根据 Transak 文档确认
      const orderId = `transak_off_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 构建请求参数
      const requestBody = {
        apiKey: this.apiKey,
        cryptoCurrency: params.fromCurrency,
        fiatCurrency: params.toCurrency,
        cryptoAmount: params.amount.toString(),
        walletAddress: params.metadata?.fromWalletAddress, // 从 MPC 钱包地址
        bankAccount: params.bankAccount, // 商家银行账户
        partnerOrderId: orderId,
        webhookURL: this.webhookUrl,
        // 其他可选参数
        ...(params.metadata?.email && { email: params.metadata.email }),
        ...(params.metadata?.countryCode && { countryCode: params.metadata.countryCode }),
      };

      // 调用 Transak Off-ramp API
      const response = await axios.post(
        `${this.baseUrl}/api/v2/offramp/order`,
        requestBody,
        {
          headers: {
            'apiKey': this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      const data = response.data;
      
      // Transak 返回的订单信息
      const transakOrderId = data.orderId || data.id;
      const fiatAmount = parseFloat(data.fiatAmount || data.expectedFiatAmount || '0');
      
      this.logger.log(
        `Transak Off-ramp order created: ${transakOrderId}, expected fiat: ${fiatAmount} ${params.toCurrency}`,
      );

      return {
        transactionId: transakOrderId || orderId,
        status: 'pending', // 等待 Transak 处理，通过 webhook 更新状态
        fiatAmount: fiatAmount || 0,
        fiatCurrency: params.toCurrency,
      };
    } catch (error: any) {
      this.logger.error(`Transak: Off-ramp failed: ${error.message}`, error.stack);
      throw new Error(`Failed to execute Off-ramp with Transak: ${error.message}`);
    }
  }

  /**
   * 验证 Webhook 签名
   * Transak 使用 HMAC SHA256 签名
   */
  verifySignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn('Transak webhook secret not configured, skipping signature verification');
      return true; // 开发环境可能没有配置
    }

    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch (error: any) {
      this.logger.error(`Transak: Signature verification failed: ${error.message}`);
      return false;
    }
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.cachedAccessToken && Date.now() < this.cachedAccessTokenExpiresAt) {
      return this.cachedAccessToken;
    }

    if (!this.apiSecret) {
      this.logger.warn('⚠️ Transak API Secret not configured. Create Session API will use API Key as fallback.');
      // 不再抛出错误，而是回退到使用 API Key
      // throw new Error('Transak API Secret is missing. Please configure TRANSAK_API_SECRET in environment variables.');
      return this.apiKey;
    }

    try {
      // 注意：获取 Token 的端点
      // V3.0: 使用 /auth/v2/token 端点
      // 尝试多个可能的端点以应对不同环境的域名差异
      const tokenUrls = this.environment === 'PRODUCTION' 
        ? ['https://api.transak.com/auth/v2/token']
        : [
            'https://api-stg.transak.com/auth/v2/token',
            'https://api-staging.transak.com/auth/v2/token'
          ];
      
      let lastError = null;
      for (const tokenUrl of tokenUrls) {
        try {
          this.logger.log(`Transak: Fetching access token from ${tokenUrl}`);
          const response = await axios.post(tokenUrl, {
            apiKey: this.apiKey,
            apiSecret: this.apiSecret,
          }, { timeout: 10000 });

          const data = response.data?.data || response.data;
          if (data?.accessToken) {
            this.cachedAccessToken = data.accessToken;
            this.cachedAccessTokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
            this.logger.log(`Transak: Access token fetched successfully from ${tokenUrl}`);
            return this.cachedAccessToken;
          }
        } catch (e: any) {
          lastError = e;
          this.logger.warn(`Transak: Failed to fetch token from ${tokenUrl}: ${e.message}`);
        }
      }

      this.logger.warn('Transak: All token API endpoints failed, falling back to API Key');
      return this.apiKey;
    } catch (error: any) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `Transak: Failed to fetch access token: ${axiosError.message}`,
        axiosError.response?.data ? JSON.stringify(axiosError.response.data) : undefined
      );
      return this.apiKey; // 回退到 API Key
    }
  }

  /**
   * 创建 Transak Session（使用 Create Session API）
   * 这是 Transak 推荐的方式，可以更好地控制 Widget 参数，包括锁定金额
   * 
   * 文档: https://docs.transak.com/docs/transak-integration-update-mandatory-migration-to-create-session-api
   */
  async createSession(params: {
    amount: number;  // 金额：当 isFiatAmount=true 时为法币金额（用户支出），当 isFiatAmount=false 时为加密货币金额（用户收到）
    fiatCurrency: string;  // 用户选择的支付法币
    cryptoCurrency: string;
    network?: string;
    walletAddress?: string;
    orderId?: string;
    userId?: string;
    email?: string;
    redirectURL?: string;
    hideMenu?: boolean;
    disableWalletAddressForm?: boolean;
    disableFiatAmountEditing?: boolean;
    isKYCRequired?: boolean;
    referrerDomain?: string;
    productType?: 'BUY' | 'SELL';  // BUY = onramp (default), SELL = offramp
    isFiatAmount?: boolean;  // true=用户指定法币支出金额(fiatAmount)，false=用户指定收到的加密货币数量(cryptoAmount)
  }): Promise<{ sessionId: string; widgetUrl: string }> {
    // 参数验证
    if (!params.amount || params.amount <= 0) {
      throw new Error('Amount is required and must be greater than 0');
    }
    if (!params.cryptoCurrency) {
      params.cryptoCurrency = 'USDC'; // 默认使用 USDC
    }
    
    // 判断金额类型：
    // isFiatAmount=true  → 用户指定法币支出（如存款 $10 USD），Transak 计算收到多少加密货币
    // isFiatAmount=false → 用户指定收到的加密货币数量（如购买商品需要 10 USDC），Transak 计算需要支付多少法币
    const isFiatAmount = params.isFiatAmount === true;
    
    // 对于 Transak 不支持的法币（CNY），转换为 USD
    let fiatCurrency = params.fiatCurrency || 'USD';
    if (fiatCurrency.toUpperCase() === 'CNY') {
      this.logger.log(`Transak: CNY not supported, switching to USD for fiat selection`);
      fiatCurrency = 'USD';
    }

    this.logger.log(
      `Transak: Creating session for ${params.amount} ${isFiatAmount ? fiatCurrency + ' (fiat spend mode)' : params.cryptoCurrency + ' (crypto receive mode)'} (user pays in ${fiatCurrency})`,
    );
    this.logger.debug(`Transak: Environment=${this.environment}, BaseUrl=${this.baseUrl}`);

    try {
      // 获取 referrerDomain（从请求或环境变量中获取）
      const resolvedReferrerDomain = params.referrerDomain ||
        this.configService.get<string>('TRANSAK_REFERRER_DOMAIN') || 
        this.configService.get<string>('FRONTEND_URL')?.replace(/^https?:\/\//, '')?.replace(/\/$/, '') || 
        'localhost:3000';

      // 构建 widgetParams（这些参数会在 Session 创建时锁定）
      const widgetParams: Record<string, any> = {
        referrerDomain: resolvedReferrerDomain,
        // 根据 isFiatAmount 选择正确的金额参数：
        // fiatAmount  = 用户支出法币（存款模式）：用户付 $10，Transak 扣费后收到约 $9-9.5 USDC
        // cryptoAmount = 用户收到加密货币（购买模式）：用户要收到 10 USDC，Transak 计算需要额外支付多少法币
        ...(isFiatAmount
          ? { fiatAmount: params.amount.toString() }      // 法币锁定：用户花 X 法币
          : { cryptoAmount: params.amount.toString() }    // 加密货币锁定：用户收到 X USDC
        ),
        // isFiatAmount=true 时强制锁定法币金额（用户不得修改）
        ...(isFiatAmount && {
          disableFiatAmountEditing: true,
          isReadOnlyFiatAmount: true,
        }),
        fiatCurrency: fiatCurrency, // 用户选择的支付法币
        cryptoCurrencyCode: params.cryptoCurrency,
        ...(params.network && { network: params.network }),
        ...(params.walletAddress && { walletAddress: params.walletAddress }),
        ...(params.orderId && { partnerOrderId: params.orderId }),
        ...(params.email && { email: params.email }),
        ...(params.redirectURL && { redirectURL: params.redirectURL }),
        // 界面控制参数
        ...(params.hideMenu !== undefined && { hideMenu: params.hideMenu }),
        ...(params.disableWalletAddressForm !== undefined && { 
          disableWalletAddressForm: params.disableWalletAddressForm 
        }),
        ...(params.disableFiatAmountEditing !== undefined && { 
          disableFiatAmountEditing: params.disableFiatAmountEditing,
          isReadOnlyFiatAmount: params.disableFiatAmountEditing
        }),
        // 锁定币种
        isReadOnlyCryptoCurrency: true,
        disableCryptoCurrencyCode: true,
        ...(params.isKYCRequired !== undefined ? { isKYCRequired: params.isKYCRequired } : { isKYCRequired: false }),
        isAutoFillUserData: true,
        disableEmail: false, // 不禁用 email，确保不跳过 email OTA
        skipEmailOTA: false, // 明确不跳过 email OTA
        // Off-ramp: productType=SELL
        ...(params.productType === 'SELL' && { productType: 'SELL', isBuyOrSell: 'SELL' }),
      };

      // 调用 Transak Create Session API
      // V3.0: 使用 /auth/public/v2/session 端点
      const sessionUrl = `${this.baseUrl}/auth/public/v2/session`;
      const accessToken = await this.getAccessToken();
      
      // 判断是使用 access-token 还是 api-key
      const isRealToken = accessToken && accessToken.length > 64; // JWT token 通常很长
      const authHeader = isRealToken ? { 'access-token': accessToken } : { 'api-key': this.apiKey };

      this.logger.debug(`Transak: Calling Create Session API: ${sessionUrl}`);
      this.logger.debug(`Transak: Request payload:`, JSON.stringify({ widgetParams }, null, 2));

      const response = await axios.post(
        sessionUrl,
        { widgetParams },
        {
          headers: {
            accept: 'application/json',
            ...authHeader,
            'content-type': 'application/json',
          },
          timeout: 30000,
        },
      );

      const data = response.data?.data || response.data;
      const sessionId = data?.sessionId || data?.session_id;

      if (!sessionId) {
        this.logger.error(`Transak: Create Session API response missing sessionId:`, JSON.stringify(response.data));
        throw new Error('Transak Create Session API did not return sessionId');
      }

      // 构建 Widget URL（使用 sessionId）
      // 注意：staging-global.transak.com 会重定向到 global-stg.transak.com
      const widgetBaseUrl = this.environment === 'PRODUCTION'
        ? 'https://global.transak.com'
        : 'https://global-stg.transak.com';
      
      const widgetUrl = `${widgetBaseUrl}?apiKey=${this.apiKey}&sessionId=${sessionId}`;

      this.logger.log(`Transak: Session created successfully, sessionId=${sessionId}`);

      return {
        sessionId,
        widgetUrl,
      };
    } catch (error: any) {
      const axiosError = error as AxiosError;
      if (axiosError?.isAxiosError) {
        const status = axiosError.response?.status;
        const data = axiosError.response?.data;
        this.logger.error(
          `Transak: Create Session API failed${status ? ` (status ${status})` : ''}`,
          typeof data === 'object' ? JSON.stringify(data) : data || axiosError.message,
        );

        if (status === 401) {
          this.cachedAccessToken = null;
          this.cachedAccessTokenExpiresAt = 0;
        }
      } else {
        this.logger.error(`Transak: Failed to create session`, error);
      }

      // ✅ V3.2 FIX: 当 Create Session API 失败时，回退到直接 Widget URL 方式
      // Transak staging API 有 bug (返回 500 "error must be a string")
      // Production API 需要 OAuth token (不是 api-key)
      // 直接 Widget URL 是 Transak 官方支持的方式
      this.logger.warn('Transak: Create Session API failed, falling back to direct widget URL');
      return this.createDirectWidgetUrl(params);
    }
  }

  /**
   * 创建直接 Widget URL（不使用 Create Session API）
   * 当 Create Session API 不可用时的回退方案
   * 
   * 注意：直接 URL 方式不支持某些高级功能（如完全锁定金额）
   * 但仍然可以通过 URL 参数预填充大部分字段
   */
  private createDirectWidgetUrl(params: {
    amount: number;
    fiatCurrency: string;
    cryptoCurrency: string;
    network?: string;
    walletAddress?: string;
    orderId?: string;
    email?: string;
    redirectURL?: string;
    hideMenu?: boolean;
    disableWalletAddressForm?: boolean;
    disableFiatAmountEditing?: boolean;
    productType?: 'BUY' | 'SELL';
  }): { sessionId: string; widgetUrl: string } {
    // 生成一个虚拟的 sessionId 用于追踪
    const sessionId = `direct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 选择正确的 Widget 基础 URL
    const widgetBaseUrl = this.environment === 'PRODUCTION'
      ? 'https://global.transak.com'
      : 'https://global-stg.transak.com';
    
    // 对于 Transak 不支持的法币（CNY），转换为 USD
    // 如果没有提供 fiatCurrency，默认使用 USD
    let fiatCurrency = params.fiatCurrency || 'USD';
    if (fiatCurrency.toUpperCase() === 'CNY') {
      fiatCurrency = 'USD';
    }
    
    // 验证必要参数
    if (!params.amount || params.amount <= 0) {
      throw new Error('Amount is required and must be greater than 0');
    }
    if (!params.cryptoCurrency) {
      throw new Error('Crypto currency is required');
    }
    
    // 构建 URL 参数
    const urlParams = new URLSearchParams();
    urlParams.set('apiKey', this.apiKey);
    urlParams.set('defaultCryptoAmount', String(params.amount));
    urlParams.set('cryptoCurrencyCode', params.cryptoCurrency);
    urlParams.set('defaultCryptoCurrency', params.cryptoCurrency);
    urlParams.set('fiatCurrency', fiatCurrency);
    urlParams.set('defaultFiatCurrency', fiatCurrency);
    
    if (params.network) {
      urlParams.set('network', params.network);
      urlParams.set('defaultNetwork', params.network);
    }
    if (params.walletAddress) {
      urlParams.set('walletAddress', params.walletAddress);
      urlParams.set('disableWalletAddressForm', 'true');
    }
    if (params.orderId) {
      urlParams.set('partnerOrderId', params.orderId);
    }
    if (params.email) {
      urlParams.set('email', params.email);
    }
    if (params.redirectURL) {
      urlParams.set('redirectURL', params.redirectURL);
    }
    if (params.hideMenu) {
      urlParams.set('hideMenu', 'true');
    }
    
    // 尝试锁定金额（通过 disablePaymentMethods 等间接方式）
    // 注意：直接 URL 方式可能无法完全锁定金额编辑
    urlParams.set('themeColor', '4f46e5'); // 主题色
    // productType: BUY (default onramp) or SELL (offramp)
    const productType = params.productType || 'BUY';
    urlParams.set('productsAvailed', productType);
    if (productType === 'SELL') {
      urlParams.set('isBuyOrSell', 'SELL');
    }
    
    const widgetUrl = `${widgetBaseUrl}?${urlParams.toString()}`;
    
    this.logger.log(`Transak: Created direct widget URL (fallback mode), sessionId=${sessionId}`);
    this.logger.debug(`Transak: Widget URL: ${widgetUrl}`);
    
    return {
      sessionId,
      widgetUrl,
    };
  }

  /**
   * 获取前端 SDK 配置
   * 用于前端集成 Transak SDK
   */
  getSDKConfig(params: {
    amount?: number;
    fiatCurrency?: string;
    cryptoCurrency?: string;
    walletAddress?: string;
    orderId?: string;
    userId?: string;
    email?: string;
    redirectURL?: string;
  }): Record<string, any> {
    return {
      apiKey: this.apiKey,
      environment: this.environment,
      widgetHeight: '700px',
      widgetWidth: '500px',
      ...params,
      // Transak 特定配置
      defaultCryptoCurrency: params.cryptoCurrency,
      defaultFiatCurrency: params.fiatCurrency,
      defaultAmount: params.amount,
      walletAddress: params.walletAddress,
      partnerOrderId: params.orderId,
      email: params.email,
      redirectURL: params.redirectURL || `${this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/payment/callback`,
      // Transak 特定配置
      isAutoFillUserData: true,
      disableEmail: false,
      skipEmailOTA: false,
      // Webhook URL
      webhookURL: this.webhookUrl,
    };
  }
}

