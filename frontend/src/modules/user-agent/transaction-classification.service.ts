import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../entities/payment.entity';

export interface TransactionCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  parentId?: string;
}

export interface ClassifiedTransaction {
  paymentId: string;
  category: string;
  subcategory?: string;
  confidence: number; // 0-1
  method?: 'rule' | 'ml' | 'manual';
  tags?: string[];
  metadata?: Record<string, any>;
}

@Injectable()
export class TransactionClassificationService {
  private readonly logger = new Logger(TransactionClassificationService.name);

  // 预定义的分类规则
  private readonly categoryRules: Array<{
    pattern: RegExp | ((payment: Payment) => boolean);
    category: string;
    subcategory?: string;
  }> = [
    {
      pattern: (p) => p.metadata?.orderType === 'product',
      category: '购物',
      subcategory: '商品',
    },
    {
      pattern: (p) => p.metadata?.orderType === 'service',
      category: '服务',
      subcategory: '服务费',
    },
    {
      pattern: (p) => p.metadata?.orderType === 'nft',
      category: '数字资产',
      subcategory: 'NFT',
    },
    {
      pattern: /subscription|订阅/i,
      category: '订阅',
      subcategory: '会员费',
    },
    {
      pattern: /food|restaurant|餐厅|外卖/i,
      category: '餐饮',
      subcategory: '外卖',
    },
    {
      pattern: /transport|交通|打车/i,
      category: '交通',
      subcategory: '出行',
    },
  ];

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {}

  /**
   * 分类交易
   */
  async classifyTransaction(paymentId: string): Promise<ClassifiedTransaction> {
    // 验证paymentId是否为有效的UUID格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(paymentId)) {
      // 如果不是有效的UUID，直接返回默认分类
      return {
        paymentId,
        category: 'Other',
        confidence: 0.5,
        subcategory: 'Unknown',
        tags: [],
        metadata: {
          reason: 'Invalid payment ID format, using default classification',
        },
      };
    }

    let payment;
    try {
      payment = await this.paymentRepository.findOne({
        where: { id: paymentId },
      });
    } catch (error) {
      // 如果查询失败（例如数据库错误），返回默认分类
      this.logger.warn(`Failed to query payment ${paymentId}: ${error.message}`);
      return {
        paymentId,
        category: 'Other',
        confidence: 0.5,
        subcategory: 'Unknown',
        tags: [],
        metadata: {
          reason: 'Database query failed, using default classification',
        },
      };
    }

    if (!payment) {
      // 如果payment不存在，返回默认分类
      return {
        paymentId,
        category: 'Other',
        confidence: 0.5,
        subcategory: 'Unknown',
        tags: [],
        metadata: {
          reason: 'Payment not found, using default classification',
        },
      };
    }

    // 使用规则引擎分类
    for (const rule of this.categoryRules) {
      let matches = false;
      if (rule.pattern instanceof RegExp) {
        matches = rule.pattern.test(payment.description || '');
      } else if (typeof rule.pattern === 'function') {
        matches = rule.pattern(payment);
      }

      if (matches) {
        return {
          paymentId,
          category: rule.category,
          subcategory: rule.subcategory,
          confidence: 0.8, // 规则匹配的置信度
          method: 'rule',
        };
      }
    }

    // 如果没有匹配，返回默认分类
    return {
      paymentId,
      category: '其他',
      confidence: 0.5,
      method: 'rule',
    };
  }

  /**
   * 批量分类交易
   */
  async classifyTransactions(paymentIds: string[]): Promise<ClassifiedTransaction[]> {
    const results: ClassifiedTransaction[] = [];
    for (const paymentId of paymentIds) {
      try {
        const result = await this.classifyTransaction(paymentId);
        results.push(result);
      } catch (error) {
        this.logger.warn(`分类交易失败: ${paymentId}, ${error.message}`);
      }
    }
    return results;
  }

  /**
   * 获取用户的交易分类统计
   */
  async getCategoryStatistics(userId: string): Promise<Record<string, number>> {
    const payments = await this.paymentRepository.find({
      where: { userId },
    });

    const statistics: Record<string, number> = {};

    for (const payment of payments) {
      const classification = await this.classifyTransaction(payment.id);
      const category = classification.category;
      statistics[category] = (statistics[category] || 0) + Number(payment.amount);
    }

    return statistics;
  }
}

