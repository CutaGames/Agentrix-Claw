import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../../entities/order.entity';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import axios from 'axios';

export interface WebhookConfig {
  merchantId: string;
  url: string;
  events: string[];
  secret?: string;
  retryCount?: number;
  timeout?: number;
}

export interface WebhookEvent {
  id: string;
  merchantId: string;
  eventType: string;
  payload: any;
  status: 'pending' | 'success' | 'failed';
  retryCount: number;
  createdAt: Date;
  processedAt?: Date;
}

@Injectable()
export class WebhookHandlerService {
  private readonly logger = new Logger(WebhookHandlerService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {}

  /**
   * 处理订单Webhook（支付成功后自动触发）
   */
  async handleOrderWebhook(
    merchantId: string,
    orderId: string,
    paymentId: string,
    webhookConfig: WebhookConfig,
  ): Promise<void> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, merchantId },
    });

    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });

    if (!order || !payment) {
      this.logger.warn(`订单或支付记录不存在: orderId=${orderId}, paymentId=${paymentId}`);
      return;
    }

    // 构建Webhook payload
    const payload = {
      event: 'order.paid',
      order: {
        id: order.id,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        items: order.items,
      },
      payment: {
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        transactionHash: payment.transactionHash,
      },
      timestamp: new Date().toISOString(),
    };

    // 发送Webhook
    await this.sendWebhook(webhookConfig, payload);
  }

  /**
   * 发送Webhook请求
   */
  private async sendWebhook(
    config: WebhookConfig,
    payload: any,
    retryCount: number = 0,
  ): Promise<void> {
    const maxRetries = config.retryCount || 3;
    const timeout = config.timeout || 5000;

    try {
      const response = await axios.post(
        config.url,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Agentrix-Event': payload.event,
            'X-Agentrix-Signature': this.generateSignature(payload, config.secret),
          },
          timeout,
        },
      );

      if (response.status >= 200 && response.status < 300) {
        this.logger.log(`Webhook发送成功: ${config.url}, event: ${payload.event}`);
        return;
      }

      throw new Error(`Webhook返回状态码: ${response.status}`);
    } catch (error: any) {
      this.logger.warn(
        `Webhook发送失败 (重试 ${retryCount}/${maxRetries}): ${config.url}, 错误: ${error.message}`,
      );

      if (retryCount < maxRetries) {
        // 指数退避重试
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendWebhook(config, payload, retryCount + 1);
      }

      // 记录失败
      this.logger.error(`Webhook最终失败: ${config.url}, 错误: ${error.message}`);
      throw error;
    }
  }

  /**
   * 生成Webhook签名
   */
  private generateSignature(payload: any, secret?: string): string {
    if (!secret) return '';
    // 简单的HMAC签名（实际应该使用crypto）
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  /**
   * 处理支付状态变更Webhook
   */
  async handlePaymentStatusChange(
    merchantId: string,
    paymentId: string,
    newStatus: PaymentStatus,
    webhookConfig: WebhookConfig,
  ): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, merchantId },
    });

    if (!payment) {
      return;
    }

    const payload = {
      event: `payment.${newStatus}`,
      payment: {
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethod: payment.paymentMethod,
        transactionHash: payment.transactionHash,
      },
      timestamp: new Date().toISOString(),
    };

    await this.sendWebhook(webhookConfig, payload);
  }

  /**
   * 配置Webhook
   */
  async configureWebhook(config: WebhookConfig): Promise<WebhookConfig> {
    // TODO: 保存到数据库
    this.logger.log(`配置Webhook: merchantId=${config.merchantId}, url=${config.url}`);
    return config;
  }

  /**
   * 获取Webhook配置
   */
  async getWebhookConfig(merchantId: string): Promise<WebhookConfig | null> {
    // TODO: 从数据库查询
    this.logger.log(`获取Webhook配置: merchantId=${merchantId}`);
    return null;
  }

  /**
   * 获取Webhook日志
   */
  async getWebhookLogs(merchantId: string, limit: number = 50): Promise<WebhookEvent[]> {
    // TODO: 从数据库查询
    this.logger.log(`获取Webhook日志: merchantId=${merchantId}, limit=${limit}`);
    return [];
  }
}

