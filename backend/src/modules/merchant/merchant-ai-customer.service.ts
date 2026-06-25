import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { ConversationHistory } from '../../entities/conversation-history.entity';

export interface AICustomerServiceConfig {
  merchantId: string;
  enabled: boolean;
  language: string;
  tone: 'professional' | 'friendly' | 'casual';
  autoReplyEnabled: boolean;
  workingHours?: {
    start: string;
    end: string;
  };
  outOfHoursMessage?: string;
}

export interface CustomerMessage {
  id: string;
  customerId: string;
  message: string;
  timestamp: Date;
  context?: {
    orderId?: string;
    productId?: string;
    previousMessages?: CustomerMessage[];
  };
}

export interface AIResponse {
  message: string;
  suggestedActions?: Array<{
    type: 'product_recommendation' | 'order_status' | 'refund' | 'contact_human';
    data?: any;
  }>;
  confidence: number;
}

@Injectable()
export class MerchantAICustomerService {
  private readonly logger = new Logger(MerchantAICustomerService.name);
  private configs: Map<string, AICustomerServiceConfig> = new Map(); // 配置仍使用内存

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ConversationHistory)
    private conversationHistoryRepository: Repository<ConversationHistory>,
  ) {}

  /**
   * 配置AI客服
   */
  async configureAICustomerService(config: AICustomerServiceConfig): Promise<AICustomerServiceConfig> {
    this.configs.set(config.merchantId, config);
    this.logger.log(`配置AI客服: merchantId=${config.merchantId}, enabled=${config.enabled}`);
    return config;
  }

  /**
   * 获取AI客服配置
   */
  async getAICustomerServiceConfig(merchantId: string): Promise<AICustomerServiceConfig | null> {
    return this.configs.get(merchantId) || null;
  }

  /**
   * 处理客户消息并生成AI回复
   */
  async handleCustomerMessage(
    merchantId: string,
    message: CustomerMessage,
  ): Promise<AIResponse> {
    const config = await this.getAICustomerServiceConfig(merchantId);

    if (!config || !config.enabled) {
      return {
        message: 'AI客服暂未启用，请稍后联系人工客服',
        confidence: 0,
      };
    }

    // 检查工作时间
    if (config.workingHours) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (currentTime < config.workingHours.start || currentTime > config.workingHours.end) {
        return {
          message: config.outOfHoursMessage || '当前非工作时间，我们会在工作时间尽快回复您',
          confidence: 1,
        };
      }
    }

    // 获取对话历史
    const historyRecords = await this.conversationHistoryRepository.find({
      where: { merchantId, customerId: message.customerId },
      order: { createdAt: 'DESC' },
      take: 10, // 最近10条
    });

    const history = historyRecords.reverse().map(record => ({
      id: record.id,
      customerId: record.customerId,
      message: record.message,
      timestamp: record.createdAt,
    }));

    // TODO: 集成真实AI模型（如OpenAI GPT、Claude等）
    // 分析消息意图，生成回复

    // MOCK: 简单的规则匹配
    const response = await this.generateResponse(message, history, config);

    // 保存对话历史
    const conversationRecord = this.conversationHistoryRepository.create({
      merchantId,
      customerId: message.customerId,
      message: message.message,
      response: response.message,
      context: message.context,
      metadata: { suggestedActions: response.suggestedActions },
    });
    await this.conversationHistoryRepository.save(conversationRecord);

    return response;
  }

  /**
   * 生成AI回复（MOCK实现）
   */
  private async generateResponse(
    message: CustomerMessage,
    history: CustomerMessage[],
    config: AICustomerServiceConfig,
  ): Promise<AIResponse> {
    const msg = message.message.toLowerCase();

    // 问候语
    if (msg.includes('你好') || msg.includes('hello') || msg.includes('hi')) {
      return {
        message: this.getGreeting(config.language, config.tone),
        confidence: 0.9,
      };
    }

    // 订单查询
    if (msg.includes('订单') || msg.includes('order') || msg.includes('物流')) {
      return {
        message: '请提供您的订单号，我来帮您查询订单状态和物流信息。',
        suggestedActions: [
          {
            type: 'order_status',
            data: { orderId: message.context?.orderId },
          },
        ],
        confidence: 0.8,
      };
    }

    // 产品咨询
    if (msg.includes('产品') || msg.includes('product') || msg.includes('商品')) {
      return {
        message: '我可以为您推荐相关产品，请告诉我您的需求或预算。',
        suggestedActions: [
          {
            type: 'product_recommendation',
            data: { category: this.extractCategory(msg) },
          },
        ],
        confidence: 0.7,
      };
    }

    // 退款
    if (msg.includes('退款') || msg.includes('refund') || msg.includes('退货')) {
      return {
        message: '我理解您需要退款。请提供订单号，我会帮您处理退款申请。',
        suggestedActions: [
          {
            type: 'refund',
            data: { orderId: message.context?.orderId },
          },
        ],
        confidence: 0.8,
      };
    }

    // 转人工
    if (msg.includes('人工') || msg.includes('human') || msg.includes('客服')) {
      return {
        message: '正在为您转接人工客服，请稍候...',
        suggestedActions: [
          {
            type: 'contact_human',
          },
        ],
        confidence: 1,
      };
    }

    // 默认回复
    return {
      message: '感谢您的咨询。如果您需要帮助，可以询问订单、产品、退款等问题，或输入"人工"转接人工客服。',
      confidence: 0.5,
    };
  }

  /**
   * 获取问候语
   */
  private getGreeting(language: string, tone: string): string {
    if (language === 'zh-CN') {
      switch (tone) {
        case 'professional':
          return '您好，我是AI客服助手，很高兴为您服务。';
        case 'friendly':
          return '您好！我是AI客服小助手，有什么可以帮您的吗？';
        case 'casual':
          return '嗨！我是AI客服，有什么问题尽管问我~';
        default:
          return '您好，我是AI客服助手。';
      }
    } else {
      switch (tone) {
        case 'professional':
          return 'Hello, I am an AI customer service assistant. How can I help you?';
        case 'friendly':
          return 'Hi there! I am your AI assistant. What can I do for you?';
        case 'casual':
          return 'Hey! I am your AI assistant. What\'s up?';
        default:
          return 'Hello, I am an AI customer service assistant.';
      }
    }
  }

  /**
   * 提取产品类别
   */
  private extractCategory(message: string): string | null {
    // 简单的关键词匹配
    if (message.includes('nft') || message.includes('数字')) {
      return 'nft';
    }
    if (message.includes('token') || message.includes('代币')) {
      return 'token';
    }
    if (message.includes('服务') || message.includes('service')) {
      return 'service';
    }
    return null;
  }

  /**
   * 清除对话历史
   */
  async clearConversationHistory(merchantId: string, customerId: string): Promise<void> {
    await this.conversationHistoryRepository.delete({
      merchantId,
      customerId,
    });
  }
}

