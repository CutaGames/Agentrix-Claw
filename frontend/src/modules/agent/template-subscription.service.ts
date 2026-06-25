import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentTemplate } from '../../entities/agent-template.entity';
import { User } from '../../entities/user.entity';

export interface TemplateSubscription {
  templateId: string;
  userId: string;
  subscriptionType: 'free' | 'premium' | 'enterprise';
  price?: number;
  currency?: string;
  expiresAt?: Date;
}

@Injectable()
export class TemplateSubscriptionService {
  private readonly logger = new Logger(TemplateSubscriptionService.name);

  constructor(
    @InjectRepository(AgentTemplate)
    private readonly templateRepository: Repository<AgentTemplate>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * 检查模板订阅状态
   */
  async checkSubscription(
    templateId: string,
    userId: string,
  ): Promise<{ hasAccess: boolean; subscriptionType?: string; reason?: string }> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // 检查模板是否免费
    const isFree = !template.metadata?.isPremium && (!template.metadata?.price || template.metadata.price === 0);

    if (isFree) {
      return { hasAccess: true, subscriptionType: 'free' };
    }

    // 检查用户是否已购买
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['subscriptions'], // 假设 User 有 subscriptions 关系
    });

    if (!user) {
      return { hasAccess: false, reason: 'User not found' };
    }

    // 检查订阅（简化实现，实际应该查询订阅表）
    const hasSubscription = this.checkUserSubscription(userId, templateId);

    if (hasSubscription) {
      return { hasAccess: true, subscriptionType: 'premium' };
    }

    return {
      hasAccess: false,
      reason: 'Template requires subscription',
      subscriptionType: template.metadata?.subscriptionType || 'premium',
    };
  }

  /**
   * 购买模板订阅
   */
  async purchaseSubscription(
    templateId: string,
    userId: string,
    paymentMethod?: string,
  ): Promise<{ success: boolean; subscriptionId?: string; url?: string }> {
    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    // 检查是否已订阅
    const subscription = await this.checkSubscription(templateId, userId);
    if (subscription.hasAccess) {
      throw new BadRequestException('Already subscribed');
    }

    // 创建支付订单（简化实现，实际应该调用支付服务）
    const price = template.metadata?.price || 0;
    const currency = template.metadata?.currency || 'USD';

    // 这里应该调用支付服务创建订单
    // const paymentOrder = await this.paymentService.createOrder(...);

    // 模拟订阅创建
    const subscriptionId = `sub_${Date.now()}`;

    this.logger.log(`用户 ${userId} 购买了模板 ${templateId} 的订阅`);

    return {
      success: true,
      subscriptionId,
      // url: paymentOrder.paymentUrl, // 支付链接
    };
  }

  /**
   * 检查用户订阅（简化实现）
   */
  private async checkUserSubscription(userId: string, templateId: string): Promise<boolean> {
    // 实际应该查询订阅表
    // const subscription = await this.subscriptionRepository.findOne({
    //   where: { userId, templateId, status: 'active' },
    // });
    // return !!subscription;

    // 临时实现：检查用户是否创建过该模板的 Agent
    // 如果创建过，视为已订阅
    return false;
  }
}

