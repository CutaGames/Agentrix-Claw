import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { GeminiIntegrationService } from '../ai-integration/gemini/gemini-integration.service';

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
    private geminiService: GeminiIntegrationService,
  ) {}

  /**
   * 使用 AI 分类交易
   */
  async classifyWithAI(payment: Payment): Promise<Partial<ClassifiedTransaction>> {
    try {
      const prompt = `
        请根据以下交易信息，将其分类。
        交易描述: ${payment.description || '无'}
        金额: ${payment.amount} ${payment.currency}
        商户ID: ${payment.merchantId || '未知'}
        元数据: ${JSON.stringify(payment.metadata || {})}

        请返回 JSON 格式，包含 category (分类) 和 subcategory (子分类)。
        可选分类: 购物, 服务, 数字资产, 订阅, 餐饮, 交通, 娱乐, 医疗, 教育, 其他。
      `;

      const response = await this.geminiService.chatWithFunctions([
        { role: 'user', content: prompt }
      ]);
      
      const text = response.text;
      
      // 简单解析 JSON (实际应更健壮)
      const jsonMatch = text.match(/\{.*\}/s);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return {
          category: data.category || '其他',
          subcategory: data.subcategory,
          confidence: 0.9,
          method: 'ml',
        };
      }
    } catch (error) {
      this.logger.warn(`AI 分类失败: ${error.message}`);
    }
    return { category: '其他', confidence: 0.5, method: 'ml' };
  }

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

    // 如果没有匹配，尝试使用 AI 分类
    const aiResult = await this.classifyWithAI(payment);
    if (aiResult.category && aiResult.category !== '其他') {
      return {
        paymentId,
        category: aiResult.category,
        subcategory: aiResult.subcategory,
        confidence: aiResult.confidence || 0.9,
        method: 'ml',
      };
    }

    // 如果 AI 也没有好的结果，返回默认分类
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

  /**
   * 获取用户的所有已分类交易
   */
  async getClassifiedTransactions(userId: string): Promise<any[]> {
    const payments = await this.paymentRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    const results = [];
    for (const payment of payments) {
      const classification = await this.classifyTransaction(payment.id);
      results.push({
        ...payment,
        classification,
      });
    }

    return results;
  }
}

