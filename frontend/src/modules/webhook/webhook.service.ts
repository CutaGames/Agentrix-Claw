import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface WebhookConfig {
  id: string;
  userId: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEvent {
  id: string;
  configId: string;
  eventType: string;
  payload: any;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastAttemptAt?: Date;
  deliveredAt?: Date;
  error?: string;
  createdAt: Date;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private webhookConfigs: Map<string, WebhookConfig> = new Map();
  private webhookEvents: Map<string, WebhookEvent> = new Map();

  constructor(
    private configService: ConfigService,
  ) {
    // 初始化时加载配置
    this.loadWebhookConfigs();
  }

  /**
   * 创建Webhook配置
   */
  async createWebhookConfig(params: {
    userId: string;
    url: string;
    events: string[];
  }): Promise<WebhookConfig> {
    const secret = crypto.randomBytes(32).toString('hex');
    const config: WebhookConfig = {
      id: `webhook_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      userId: params.userId,
      url: params.url,
      events: params.events,
      secret,
      active: true,
      retryCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.webhookConfigs.set(config.id, config);
    this.logger.log(`创建Webhook配置: ${config.id} for user ${params.userId}`);

    return config;
  }

  /**
   * 获取用户的Webhook配置列表
   */
  async getWebhookConfigs(userId: string): Promise<WebhookConfig[]> {
    return Array.from(this.webhookConfigs.values()).filter(
      config => config.userId === userId,
    );
  }

  /**
   * 更新Webhook配置
   */
  async updateWebhookConfig(
    configId: string,
    updates: Partial<WebhookConfig>,
  ): Promise<WebhookConfig> {
    const config = this.webhookConfigs.get(configId);
    if (!config) {
      throw new Error('Webhook配置不存在');
    }

    Object.assign(config, updates, { updatedAt: new Date() });
    this.webhookConfigs.set(configId, config);

    return config;
  }

  /**
   * 删除Webhook配置
   */
  async deleteWebhookConfig(configId: string): Promise<void> {
    this.webhookConfigs.delete(configId);
    this.logger.log(`删除Webhook配置: ${configId}`);
  }

  /**
   * 发送Webhook事件
   */
  async sendWebhookEvent(
    configId: string,
    eventType: string,
    payload: any,
  ): Promise<void> {
    const config = this.webhookConfigs.get(configId);
    if (!config || !config.active) {
      return;
    }

    // 检查事件类型是否在配置中
    if (!config.events.includes(eventType) && !config.events.includes('*')) {
      return;
    }

    // 创建Webhook事件记录
    const event: WebhookEvent = {
      id: `event_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      configId,
      eventType,
      payload,
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
    };

    this.webhookEvents.set(event.id, event);

    // 发送Webhook（异步）
    this.deliverWebhook(event, config).catch(error => {
      this.logger.error(`Webhook发送失败: ${error.message}`);
    });
  }

  /**
   * 投递Webhook
   */
  private async deliverWebhook(
    event: WebhookEvent,
    config: WebhookConfig,
  ): Promise<void> {
    const maxAttempts = config.retryCount || 3;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        // 生成签名
        const signature = this.generateSignature(JSON.stringify(event.payload), config.secret);

        // 发送HTTP请求
        const response = await fetch(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Agentrix-Event': event.eventType,
            'X-Agentrix-Signature': signature,
            'X-Agentrix-Event-Id': event.id,
          },
          body: JSON.stringify(event.payload),
        });

        if (response.ok) {
          // 成功
          event.status = 'delivered';
          event.deliveredAt = new Date();
          event.attempts = attempt + 1;
          this.webhookEvents.set(event.id, event);
          this.logger.log(`Webhook投递成功: ${event.id}`);
          return;
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error: any) {
        attempt++;
        event.attempts = attempt;
        event.lastAttemptAt = new Date();
        event.error = error.message;

        if (attempt < maxAttempts) {
          // 指数退避重试
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          event.status = 'failed';
          this.webhookEvents.set(event.id, event);
          this.logger.error(`Webhook投递失败: ${event.id}, 错误: ${error.message}`);
        }
      }
    }
  }

  /**
   * 生成Webhook签名
   */
  private generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * 验证Webhook签名
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  /**
   * 获取Webhook事件历史
   */
  async getWebhookEvents(
    configId: string,
    limit: number = 50,
  ): Promise<WebhookEvent[]> {
    return Array.from(this.webhookEvents.values())
      .filter(event => event.configId === configId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * 加载Webhook配置
   */
  private loadWebhookConfigs(): void {
    // 这里应该从数据库加载
    // 暂时使用内存存储
    this.logger.log('Webhook配置已加载');
  }
}

