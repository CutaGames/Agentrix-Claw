import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { WebhookConfig } from '../../entities/webhook-config.entity';
import { WebhookEvent } from '../../entities/webhook-event.entity';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(WebhookConfig)
    private webhookConfigRepository: Repository<WebhookConfig>,
    @InjectRepository(WebhookEvent)
    private webhookEventRepository: Repository<WebhookEvent>,
    private configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * 创建Webhook配置
   */
  async createWebhookConfig(params: {
    userId: string;
    url: string;
    events: string[];
  }): Promise<WebhookConfig> {
    const secret = crypto.randomBytes(32).toString('hex');
    const config = this.webhookConfigRepository.create({
      userId: params.userId,
      url: params.url,
      events: params.events,
      secret,
      active: true,
      retryCount: 3,
    });

    const savedConfig = await this.webhookConfigRepository.save(config);
    this.logger.log(`创建Webhook配置: ${savedConfig.id} for user ${params.userId}`);

    return savedConfig;
  }

  /**
   * 获取用户的Webhook配置列表
   */
  async getWebhookConfigs(userId: string): Promise<WebhookConfig[]> {
    return this.webhookConfigRepository.find({
      where: { userId },
    });
  }

  /**
   * 更新Webhook配置
   */
  async updateWebhookConfig(
    configId: string,
    updates: Partial<WebhookConfig>,
  ): Promise<WebhookConfig> {
    const config = await this.webhookConfigRepository.findOne({ where: { id: configId } });
    if (!config) {
      throw new Error('Webhook配置不存在');
    }

    Object.assign(config, updates);
    return this.webhookConfigRepository.save(config);
  }

  /**
   * 删除Webhook配置
   */
  async deleteWebhookConfig(configId: string): Promise<void> {
    await this.webhookConfigRepository.delete(configId);
    this.logger.log(`删除Webhook配置: ${configId}`);
  }

  /**
   * 发送Webhook事件
   */
  async sendWebhookEvent(
    userId: string,
    eventType: string,
    payload: any,
  ): Promise<void> {
    const configs = await this.webhookConfigRepository.find({
      where: { userId, active: true },
    });

    for (const config of configs) {
      // 检查事件类型是否在配置中
      if (!config.events.includes(eventType) && !config.events.includes('*')) {
        continue;
      }

      // 创建Webhook事件记录
      const event = this.webhookEventRepository.create({
        configId: config.id,
        eventType,
        payload,
        status: 'pending',
        attempts: 0,
      });

      const savedEvent = await this.webhookEventRepository.save(event);

      // 发送Webhook（异步）
      this.deliverWebhook(savedEvent, config).catch(error => {
        this.logger.error(`Webhook发送失败: ${error.message}`);
      });
    }
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
        const response = await firstValueFrom(
          this.httpService.post(config.url, event.payload, {
            headers: {
              'Content-Type': 'application/json',
              'X-Agentrix-Event': event.eventType,
              'X-Agentrix-Signature': signature,
              'X-Agentrix-Event-Id': event.id,
            },
            timeout: 10000, // 10秒超时
          })
        );

        if (response.status >= 200 && response.status < 300) {
          // 成功
          event.status = 'delivered';
          event.deliveredAt = new Date();
          event.attempts = attempt + 1;
          await this.webhookEventRepository.save(event);
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
          await this.webhookEventRepository.save(event);
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
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * 获取Webhook事件历史
   */
  async getWebhookEvents(
    configId: string,
    limit: number = 50,
  ): Promise<WebhookEvent[]> {
    return this.webhookEventRepository.find({
      where: { configId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}

