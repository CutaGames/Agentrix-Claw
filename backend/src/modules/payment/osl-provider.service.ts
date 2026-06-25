import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IProvider, ProviderQuote, OnRampParams, OnRampResult, OffRampParams, OffRampResult } from './provider-abstract.service';
import * as crypto from 'crypto';
import * as https from 'https';
import axios from 'axios';

/**
 * OSL Pay Provider Service
 * 实现OSL Pay支付网关的On-ramp和Off-ramp功能
 * 
 * 文档: https://docs.osl-pay.com/docs/
 * OSL Pay是OSL Group (HKEX: 863)的支付部门，提供合规的法币与数字货币转换服务
 */
@Injectable()
export class OSLProviderService implements IProvider {
  private readonly logger = new Logger(OSLProviderService.name);
  
  id = 'osl';
  name = 'OSL Pay';
  supportsOnRamp = true;
  supportsOffRamp = true;

  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string; // 测试环境或生产环境URL
  private readonly webhookUrl: string; // PayMind接收OSL Pay回调的URL

  constructor(private configService: ConfigService) {
    // 从环境变量读取OSL Pay配置
    this.apiKey = this.configService.get<string>('OSL_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('OSL_API_SECRET') || '';
    
    // 根据环境选择URL（测试环境或生产环境）
    const isTest = this.configService.get<string>('NODE_ENV') !== 'production';
    this.baseUrl = isTest 
      ? this.configService.get<string>('OSL_TEST_URL') || 'https://sandbox-api.osl-pay.com'
      : this.configService.get<string>('OSL_PRODUCTION_URL') || 'https://api.osl-pay.com';
    
    this.webhookUrl = this.configService.get<string>('OSL_WEBHOOK_URL') || 
      `${this.configService.get<string>('API_BASE_URL') || 'http://localhost:3001'}/api/payments/provider/osl/webhook`;

    if (!this.apiKey || !this.apiSecret) {
      this.logger.warn('OSL Pay credentials not configured. OSL Pay Provider will not work.');
    }
  }

  /**
   * 生成签名
   * OSL Pay使用HMAC-SHA256签名算法
   */
  private generateSignature(params: Record<string, any>, timestamp: string): string {
    // 按ASCII排序参数
    const sortedKeys = Object.keys(params).sort();
    const sortedParams: Record<string, any> = {};
    sortedKeys.forEach(key => {
      if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
        sortedParams[key] = params[key];
      }
    });

    // 构建签名字符串
    const signString = sortedKeys
      .filter(key => params[key] !== null && params[key] !== undefined && params[key] !== '')
      .map(key => `${key}=${typeof params[key] === 'object' ? JSON.stringify(params[key]) : params[key]}`)
      .join('&');

    // 添加时间戳
    const fullSignString = `${signString}&timestamp=${timestamp}`;

    // 使用HMAC-SHA256生成签名
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(fullSignString)
      .digest('hex');

    return signature;
  }

  /**
   * 获取报价
   */
  async getQuote(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    isSourceAmount: boolean = false,
  ): Promise<ProviderQuote> {
    try {
      const timestamp = Date.now().toString();
      const params = {
        amount: amount.toString(),
        fromCurrency,
        toCurrency,
        isSourceAmount: isSourceAmount.toString(),
      };

      const signature = this.generateSignature(params, timestamp);

      const httpsAgent = new https.Agent({
        rejectUnauthorized: false, // 测试环境可能需要
      });

      const response = await axios.post(
        `${this.baseUrl}/api/v1/quote`,
        {
          ...params,
          timestamp,
          signature,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
          },
          httpsAgent,
        },
      );

      if (response.data && response.data.success) {
        const toAmount = parseFloat(response.data.data.quoteAmount || response.data.data.toAmount);
        const rate = parseFloat(response.data.data.exchangeRate || response.data.data.rate);
        return {
          providerId: this.id,
          rate,
          fee: parseFloat(response.data.data.fee || '0'),
          estimatedAmount: toAmount,
          expiresAt: response.data.data.expiresAt 
            ? new Date(response.data.data.expiresAt) 
            : new Date(Date.now() + 5 * 60 * 1000), // 默认5分钟过期
        };
      }

      throw new Error(response.data?.message || 'Failed to get quote from OSL Pay');
    } catch (error: any) {
      this.logger.error(`Failed to get quote from OSL Pay: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * 执行On-ramp（法币转数字货币）
   */
  async executeOnRamp(params: OnRampParams): Promise<OnRampResult> {
    try {
      const timestamp = Date.now().toString();
      const requestParams = {
        amount: params.amount.toString(),
        fromCurrency: params.fromCurrency,
        toCurrency: params.toCurrency,
        userId: params.userId,
        orderId: params.orderId,
        webhookUrl: this.webhookUrl,
        returnUrl: params.metadata?.returnUrl || `${this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/payment/callback`,
        paymentMethod: params.metadata?.paymentMethod || 'card',
        customerId: params.metadata?.customerId || params.userId,
      };

      const signature = this.generateSignature(requestParams, timestamp);

      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });

      const response = await axios.post(
        `${this.baseUrl}/api/v1/onramp/create`,
        {
          ...requestParams,
          timestamp,
          signature,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
          },
          httpsAgent,
        },
      );

      if (response.data && response.data.success) {
        const data = response.data.data;
        return {
          transactionId: data.transactionId || data.id,
          status: (data.status || 'pending') as 'pending' | 'completed' | 'failed',
          cryptoAmount: parseFloat(data.cryptoAmount || data.toAmount || params.amount.toString()),
          cryptoCurrency: params.toCurrency,
          transactionHash: data.transactionHash || data.txHash,
        };
      }

      throw new Error(response.data?.message || 'Failed to create on-ramp transaction');
    } catch (error: any) {
      this.logger.error(`Failed to execute on-ramp: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * 执行Off-ramp（数字货币转法币）
   */
  async executeOffRamp(params: OffRampParams): Promise<OffRampResult> {
    try {
      const timestamp = Date.now().toString();
      const requestParams = {
        amount: params.amount.toString(),
        fromCurrency: params.fromCurrency,
        toCurrency: params.toCurrency,
        merchantId: params.merchantId,
        bankAccount: params.bankAccount,
        webhookUrl: this.webhookUrl,
        returnUrl: params.metadata?.returnUrl || `${this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/payment/callback`,
        customerId: params.metadata?.customerId,
        orderId: params.metadata?.orderId,
      };

      const signature = this.generateSignature(requestParams, timestamp);

      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });

      const response = await axios.post(
        `${this.baseUrl}/api/v1/offramp/create`,
        {
          ...requestParams,
          timestamp,
          signature,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
          },
          httpsAgent,
        },
      );

      if (response.data && response.data.success) {
        const data = response.data.data;
        return {
          transactionId: data.transactionId || data.id,
          status: (data.status || 'pending') as 'pending' | 'completed' | 'failed',
          fiatAmount: parseFloat(data.fiatAmount || data.toAmount || params.amount.toString()),
          fiatCurrency: params.toCurrency,
          transactionHash: data.transactionHash || data.txHash,
        };
      }

      throw new Error(response.data?.message || 'Failed to create off-ramp transaction');
    } catch (error: any) {
      this.logger.error(`Failed to execute off-ramp: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * 查询订单状态
   */
  async queryOrder(transactionId: string): Promise<any> {
    try {
      const timestamp = Date.now().toString();
      const params = {
        transactionId,
      };

      const signature = this.generateSignature(params, timestamp);

      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });

      const response = await axios.post(
        `${this.baseUrl}/api/v1/order/query`,
        {
          ...params,
          timestamp,
          signature,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
          },
          httpsAgent,
        },
      );

      if (response.data && response.data.success) {
        return response.data.data;
      }

      throw new Error(response.data?.message || 'Failed to query order');
    } catch (error: any) {
      this.logger.error(`Failed to query order: ${error.message}`, error);
      throw error;
    }
  }
}

