import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { Product } from '../../entities/product.entity';

export interface AutoOrderConfig {
  merchantId: string;
  enabled: boolean;
  autoAcceptThreshold?: number; // 自动接单金额阈值
  autoRejectReasons?: string[]; // 自动拒单原因
  aiDecisionEnabled: boolean; // 是否使用AI决策
  workingHours?: {
    start: string; // '09:00'
    end: string; // '18:00'
  };
}

export interface OrderDecision {
  orderId: string;
  decision: 'accept' | 'reject' | 'manual_review';
  reason?: string;
  confidence?: number; // AI决策置信度
}

@Injectable()
export class MerchantAutoOrderService {
  private readonly logger = new Logger(MerchantAutoOrderService.name);
  private configs: Map<string, AutoOrderConfig> = new Map();

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  /**
   * 配置自动接单
   */
  async configureAutoOrder(config: AutoOrderConfig): Promise<AutoOrderConfig> {
    this.configs.set(config.merchantId, config);
    this.logger.log(`配置自动接单: merchantId=${config.merchantId}, enabled=${config.enabled}`);
    return config;
  }

  /**
   * 获取自动接单配置
   */
  async getAutoOrderConfig(merchantId: string): Promise<AutoOrderConfig | null> {
    return this.configs.get(merchantId) || null;
  }

  /**
   * AI决策订单是否接受
   */
  async makeOrderDecision(
    merchantId: string,
    orderId: string,
    orderData: {
      amount: number;
      currency: string;
      customerId: string;
      items: Array<{ productId: string; quantity: number }>;
      customerHistory?: {
        totalOrders: number;
        totalSpent: number;
        refundRate: number;
        avgRating: number;
      };
    },
  ): Promise<OrderDecision> {
    const config = await this.getAutoOrderConfig(merchantId);

    if (!config || !config.enabled) {
      return {
        orderId,
        decision: 'manual_review',
        reason: '自动接单未启用',
      };
    }

    // 检查工作时间
    if (config.workingHours) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (currentTime < config.workingHours.start || currentTime > config.workingHours.end) {
        return {
          orderId,
          decision: 'manual_review',
          reason: '非工作时间，需要人工审核',
        };
      }
    }

    // 检查金额阈值
    if (config.autoAcceptThreshold && orderData.amount > config.autoAcceptThreshold) {
      return {
        orderId,
        decision: 'manual_review',
        reason: `订单金额超过自动接单阈值 ${config.autoAcceptThreshold}`,
      };
    }

    // AI决策（MOCK）
    if (config.aiDecisionEnabled) {
      // TODO: 集成真实AI模型
      // 分析订单特征、客户历史、风险评分等

      const riskScore = this.calculateRiskScore(orderData);
      const confidence = 1 - riskScore;

      if (riskScore < 0.2) {
        // 低风险，自动接受
        return {
          orderId,
          decision: 'accept',
          reason: 'AI评估：低风险订单',
          confidence,
        };
      } else if (riskScore > 0.7) {
        // 高风险，自动拒绝
        return {
          orderId,
          decision: 'reject',
          reason: 'AI评估：高风险订单',
          confidence,
        };
      } else {
        // 中等风险，人工审核
        return {
          orderId,
          decision: 'manual_review',
          reason: 'AI评估：需要人工审核',
          confidence,
        };
      }
    }

    // 简单规则决策
    if (orderData.customerHistory) {
      const { refundRate, avgRating } = orderData.customerHistory;

      if (refundRate > 0.3 || avgRating < 3.0) {
        return {
          orderId,
          decision: 'reject',
          reason: '客户历史记录不佳',
        };
      }
    }

    // 默认接受
    return {
      orderId,
      decision: 'accept',
      reason: '符合自动接单条件',
      confidence: 0.8,
    };
  }

  /**
   * 计算订单风险评分（0-1，越高越风险）
   */
  private calculateRiskScore(orderData: {
    amount: number;
    customerHistory?: {
      totalOrders: number;
      totalSpent: number;
      refundRate: number;
      avgRating: number;
    };
  }): number {
    let riskScore = 0.5; // 基础风险

    // 金额风险（大额订单风险更高）
    if (orderData.amount > 1000) {
      riskScore += 0.2;
    } else if (orderData.amount < 100) {
      riskScore -= 0.1;
    }

    // 客户历史风险
    if (orderData.customerHistory) {
      const { totalOrders, refundRate, avgRating } = orderData.customerHistory;

      // 新客户风险稍高
      if (totalOrders === 0) {
        riskScore += 0.1;
      } else if (totalOrders > 10) {
        riskScore -= 0.1;
      }

      // 退款率风险
      riskScore += refundRate * 0.3;

      // 评分风险
      if (avgRating < 3.0) {
        riskScore += 0.2;
      } else if (avgRating > 4.5) {
        riskScore -= 0.1;
      }
    } else {
      // 无历史记录，风险稍高
      riskScore += 0.1;
    }

    return Math.max(0, Math.min(1, riskScore));
  }

  /**
   * 自动处理订单
   */
  async processOrder(
    merchantId: string,
    orderId: string,
    orderData: any,
  ): Promise<{ success: boolean; decision: OrderDecision }> {
    const decision = await this.makeOrderDecision(merchantId, orderId, orderData);

    if (decision.decision === 'accept') {
      // TODO: 自动接受订单，更新订单状态
      this.logger.log(`自动接受订单: ${orderId}`);
    } else if (decision.decision === 'reject') {
      // TODO: 自动拒绝订单，发送通知
      this.logger.log(`自动拒绝订单: ${orderId}, 原因: ${decision.reason}`);
    } else {
      // TODO: 标记为需要人工审核
      this.logger.log(`订单需要人工审核: ${orderId}`);
    }

    return {
      success: true,
      decision,
    };
  }
}

