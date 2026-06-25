import { Injectable, Inject, forwardRef, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { AgentSession, SessionStatus } from '../../entities/agent-session.entity';
import { AgentMessage, MessageRole, MessageType } from '../../entities/agent-message.entity';
import { AuditLog, AuditAction, AuditStatus } from '../../entities/audit-log.entity';
import { ProductService } from '../product/product.service';
import { OrderService } from '../order/order.service';
import { PaymentService } from '../payment/payment.service';
import { SearchService } from '../search/search.service';
import { RecommendationService } from '../recommendation/recommendation.service';
import { LogisticsService } from '../logistics/logistics.service';
import { RefundService } from '../payment/refund.service';
import { AgentP0IntegrationService } from './agent-p0-integration.service';
import { AgentRuntimeIntegrationService } from './agent-runtime-integration.service';

export interface ProductSearchResult {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  category: string;
  stock: number;
  merchantId: string;
  commissionRate: number;
  metadata?: any;
  score?: number; // 相似度分数
}

export interface ServiceProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  type: 'virtual_service' | 'consultation' | 'technical_service' | 'subscription';
  merchantId: string;
  metadata?: any;
}

export interface OnChainAsset {
  id: string;
  type: 'nft' | 'token' | 'game_item';
  contract: string;
  tokenId?: string;
  chain: 'solana' | 'ethereum' | 'bsc' | 'polygon';
  name: string;
  description?: string;
  price: number;
  currency: string;
  owner: string;
  metadata?: any;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(AgentSession)
    private sessionRepository: Repository<AgentSession>,
    @InjectRepository(AgentMessage)
    private messageRepository: Repository<AgentMessage>,
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
    @Inject(forwardRef(() => ProductService))
    private productService: ProductService,
    @Inject(forwardRef(() => OrderService))
    private orderService: OrderService,
    @Inject(forwardRef(() => PaymentService))
    private paymentService: PaymentService,
    @Inject(forwardRef(() => SearchService))
    private searchService: SearchService,
    @Inject(forwardRef(() => RecommendationService))
    private recommendationService: RecommendationService,
    @Inject(forwardRef(() => LogisticsService))
    private logisticsService: LogisticsService,
    @Inject(forwardRef(() => RefundService))
    private refundService: RefundService,
    @Inject(forwardRef(() => AgentP0IntegrationService))
    private p0IntegrationService: AgentP0IntegrationService,
    @Inject(forwardRef(() => AgentRuntimeIntegrationService))
    private runtimeIntegration: AgentRuntimeIntegrationService,
  ) {}

  /**
   * 获取或创建会话（支持未登录用户，userId可以为null）
   */
  async getOrCreateSession(
    userId: string | null,
    sessionId?: string,
  ): Promise<AgentSession> {
    if (sessionId) {
      const whereCondition: any = { id: sessionId };
      if (userId) {
        whereCondition.userId = userId;
      } else {
        whereCondition.userId = null;
      }
      const session = await this.sessionRepository.findOne({
        where: whereCondition,
        relations: ['messages'],
      });
      if (session && session.status !== SessionStatus.ARCHIVED) {
        return session;
      }
    }

    // 创建新会话
    const newSession = this.sessionRepository.create({
      userId: userId || null, // 允许null（未登录用户）
      status: SessionStatus.ACTIVE,
      context: {
        intent: null,
        entities: {},
        userProfile: {},
      },
    });

    return this.sessionRepository.save(newSession);
  }

  /**
   * 保存消息到会话（V3.0：上下文管理）
   */
  async saveMessage(
    sessionId: string,
    userId: string | null,
    role: MessageRole,
    content: string,
    type: MessageType = MessageType.TEXT,
    metadata?: any,
  ): Promise<AgentMessage> {
    // 获取当前会话的消息数量
    const messageCount = await this.messageRepository.count({
      where: { sessionId },
    });

    const message = this.messageRepository.create({
      sessionId,
      userId: userId || null, // 允许null（未登录用户）
      role,
      type,
      content,
      metadata,
      sequenceNumber: messageCount + 1,
    });

    const savedMessage = await this.messageRepository.save(message);

    // 更新会话的最后消息时间
    await this.sessionRepository.update(sessionId, {
      lastMessageAt: new Date(),
    });

    return savedMessage;
  }

  /**
   * 获取会话历史（V3.0：上下文恢复）
   */
  async getSessionHistory(
    sessionId: string,
    limit: number = 10,
  ): Promise<AgentMessage[]> {
    return this.messageRepository.find({
      where: { sessionId },
      order: { sequenceNumber: 'DESC' },
      take: limit,
    });
  }

  /**
   * 提取意图和实体（V3.0：意图识别）
   */
  private extractIntentAndEntities(message: string): {
    intent: string;
    entities: Record<string, any>;
  } {
    const lowerMessage = message.toLowerCase();
    const entities: Record<string, any> = {};

    // 提取预算
    const budgetMatch = message.match(/(\d+)\s*(美元|元|USD|CNY|usd|cny)/i);
    if (budgetMatch) {
      entities.budget = parseFloat(budgetMatch[1]);
      entities.currency = budgetMatch[2].toUpperCase().replace('美元', 'USD').replace('元', 'CNY');
    }

    // 提取数量
    const quantityMatch = message.match(/(\d+)\s*(个|件|把|套)/);
    if (quantityMatch) {
      entities.quantity = parseInt(quantityMatch[1]);
    }

    // 提取商品类型
    if (lowerMessage.includes('游戏') || lowerMessage.includes('game')) {
      entities.category = 'gaming';
    }
    if (lowerMessage.includes('剑') || lowerMessage.includes('sword')) {
      entities.productType = 'sword';
    }
    if (lowerMessage.includes('nft') || lowerMessage.includes('代币')) {
      entities.assetType = 'nft';
    }

    // 识别意图
    let intent = 'general';
    if (lowerMessage.includes('搜索') || lowerMessage.includes('找') || lowerMessage.includes('search')) {
      intent = 'search';
    } else if (lowerMessage.includes('购买') || lowerMessage.includes('买') || lowerMessage.includes('buy')) {
      intent = 'purchase';
    } else if (lowerMessage.includes('加入购物车') || lowerMessage.includes('add to cart')) {
      intent = 'add_to_cart';
    } else if (lowerMessage.includes('下单') || lowerMessage.includes('order')) {
      intent = 'create_order';
    } else if (lowerMessage.includes('支付') || lowerMessage.includes('pay')) {
      intent = 'payment';
    } else if (lowerMessage.includes('退款') || lowerMessage.includes('refund')) {
      intent = 'refund';
    } else if (lowerMessage.includes('查询') || lowerMessage.includes('query')) {
      intent = 'query';
    }

    return { intent, entities };
  }

  /**
   * 更新会话上下文（V3.0：上下文管理）
   */
  async updateSessionContext(
    sessionId: string,
    updates: {
      intent?: string;
      entities?: Record<string, any>;
      userProfile?: any;
      conversationSummary?: string;
      lastAction?: string;
    },
  ): Promise<void> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (session) {
      session.context = {
        ...session.context,
        ...updates,
        entities: {
          ...session.context?.entities,
          ...updates.entities,
        },
      };
      await this.sessionRepository.save(session);
    }
  }

  /**
   * 获取用户会话列表
   */
  async getUserSessions(userId: string): Promise<{ sessions: AgentSession[] }> {
    const sessions = await this.sessionRepository.find({
      where: { userId },
      order: { lastMessageAt: 'DESC' },
      take: 20,
    });

    return { sessions };
  }

  /**
   * 获取会话详情和历史消息
   */
  /**
   * 获取情景感知推荐
   */
  async getContextualRecommendations(
    userId: string,
    sessionId?: string,
    query?: string,
    entities?: any,
  ) {
    const context = {
      userId,
      sessionId,
      currentQuery: query,
      entities,
    };

    return this.recommendationService.getContextualRecommendations(context);
  }

  async getSessionDetails(userId: string, sessionId: string): Promise<{
    session: AgentSession;
    messages: AgentMessage[];
  }> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    const messages = await this.getSessionHistory(sessionId, 50);

    return { session, messages: messages.reverse() }; // 按时间正序返回
  }

  /**
   * 记录审计日志（V3.0：可审计性）
   */
  async logAudit(
    userId: string | null,
    action: AuditAction,
    status: AuditStatus,
    description: string,
    requestData?: any,
    responseData?: any,
    metadata?: any,
  ): Promise<AuditLog> {
    const auditLog = this.auditLogRepository.create({
      userId: userId || null, // 允许null（未登录用户）
      action,
      status,
      description,
      requestData,
      responseData,
      metadata,
    });

    return this.auditLogRepository.save(auditLog);
  }

  /**
   * 处理Agent对话消息（V3.0增强版：支持多轮对话和上下文）
   */
  async processMessage(
    message: string,
    context?: any,
    userId?: string,
    sessionId?: string,
  ): Promise<{
    response: string;
    type?: 'product' | 'service' | 'onchain_asset' | 'order' | 'code' | 'guide' | 'faq' | 'refund' | 'logistics';
    data?: any;
    sessionId?: string;
    intent?: string;
    entities?: Record<string, any>;
  }> {
    const startTime = Date.now();

    try {
      // 获取或创建会话（支持未登录用户）
      const session = await this.getOrCreateSession(userId || null, sessionId);

      // 提取意图和实体
      const { intent, entities } = this.extractIntentAndEntities(message);

      // 保存用户消息（支持未登录用户）
      if (session) {
        await this.saveMessage(
          session.id,
          userId || null,
          MessageRole.USER,
          message,
          MessageType.TEXT,
          { intent, entities },
        );
      }

      // 更新会话上下文
      if (userId && session) {
        await this.updateSessionContext(session.id, {
          intent,
          entities,
          lastAction: intent,
        });
      }

      // 获取会话历史（用于上下文理解）
      let history: AgentMessage[] = [];
      if (userId && session) {
        history = await this.getSessionHistory(session.id, 5);
      }

      const lowerMessage = message.toLowerCase();

      // 优先尝试使用 Runtime 处理（电商流程等）
      try {
        const runtimeResult = await this.runtimeIntegration.processMessageWithRuntime(
          message,
          session.id,
          userId,
          context?.mode || 'user',
        );

        // 如果 Runtime 可以处理，使用 Runtime 的结果
        if (runtimeResult.shouldUseWorkflow || runtimeResult.intent !== 'unknown') {
          const response = {
            response: runtimeResult.response,
            type: runtimeResult.type as any,
            data: runtimeResult.data,
            sessionId: session?.id,
            intent: runtimeResult.intent,
            entities: {},
          };

          // 保存助手消息
          if (session) {
            await this.saveMessage(
              session.id,
              userId || null,
              MessageRole.ASSISTANT,
              response.response,
              MessageType.TEXT,
              { intent: runtimeResult.intent, data: runtimeResult.data },
            );
          }

          // 记录审计日志
          await this.logAudit(
            userId || null,
            AuditAction.AGENT_MESSAGE,
            AuditStatus.SUCCESS,
            `Agent Runtime处理: ${message}`,
            { message, intent: runtimeResult.intent },
            response,
            { sessionId: session?.id, duration: Date.now() - startTime },
          );

          return response;
        }
      } catch (runtimeError) {
        // Runtime 处理失败，继续使用原有逻辑
        this.logger.warn(`Runtime处理失败，使用原有逻辑: ${runtimeError.message}`);
      }

      // 首先检查是否是P0功能请求
      const p0Intent = this.p0IntegrationService.identifyP0Intent(message);
      if (p0Intent) {
        // 构建上下文，包含上一次搜索结果
        const p0Context: any = { mode: context?.mode || 'user' };
        if (history.length > 0) {
          const lastSearchMessage = history.find(m => {
            if (m.role !== MessageRole.ASSISTANT || m.metadata?.intent !== 'product_search') {
              return false;
            }
            const metadata = m.metadata as any;
            return metadata?.data?.products || metadata?.searchResults;
          });
          if (lastSearchMessage) {
            // 兼容两种数据结构：metadata.data 或 metadata.searchResults
            const metadata = lastSearchMessage.metadata as any;
            const products = metadata?.data?.products || metadata?.searchResults || [];
            const query = metadata?.data?.query || metadata?.query || '';
            if (products.length > 0) {
              p0Context.lastSearch = {
                query,
                products,
              };
            }
          }
        }
        
        // 传递完整消息到params中，用于上下文识别
        const enhancedParams = {
          ...p0Intent.params,
          message, // 传递完整消息
        };
        
        const p0Response = await this.p0IntegrationService.handleP0Request(
          p0Intent.intent,
          enhancedParams,
          userId,
          context?.mode || 'user',
          p0Context,
        );

        const response = {
          response: p0Response.response,
          type: p0Response.type as any,
          data: p0Response.data,
          sessionId: session?.id,
          intent: p0Intent.intent,
          entities: p0Intent.params,
        };

        // 保存助手消息
        if (session) {
          await this.saveMessage(
            session.id,
            userId || null,
            MessageRole.ASSISTANT,
            response.response,
            MessageType.TEXT,
            { 
              intent: p0Intent.intent, 
              data: p0Response.data,
              // 如果是商品搜索，保存商品列表以便后续使用（确保intent正确）
              ...(p0Intent.intent === 'product_search' && p0Response.data?.products ? {
                intent: 'product_search', // 明确设置intent
                searchResults: p0Response.data.products,
                query: p0Response.data.query || p0Intent.params?.query || '',
              } : {}),
            },
          );
        }

        // 记录审计日志
        await this.logAudit(
          userId || null,
          AuditAction.AGENT_MESSAGE,
          AuditStatus.SUCCESS,
          `Agent P0功能: ${p0Intent.intent}`,
          { message, intent: p0Intent.intent, params: p0Intent.params },
          response,
          { sessionId: session?.id, duration: Date.now() - startTime },
        );

        return response;
      }

      // 使用上下文信息（从会话历史中提取）
      let contextQuery = message;
      if (history.length > 0) {
        // 从历史中提取之前提到的商品、预算等信息
        const lastUserMessage = history.find(m => m.role === MessageRole.USER);
        if (lastUserMessage) {
          const lastEntities = lastUserMessage.metadata?.entities || {};
          if (lastEntities.budget && !entities.budget) {
            entities.budget = lastEntities.budget;
          }
          if (lastEntities.category && !entities.category) {
            entities.category = lastEntities.category;
          }
        }
      }

      // 商品搜索/比价
      if (lowerMessage.includes('商品') || lowerMessage.includes('购买') || lowerMessage.includes('浏览') || 
          lowerMessage.includes('搜索') || lowerMessage.includes('比价') || lowerMessage.includes('对比') ||
          intent === 'search' || intent === 'purchase') {
        const response = {
          response: '让我为您搜索和对比相关商品...',
          type: 'product' as const,
          data: { action: 'search', query: contextQuery, entities },
          sessionId: session?.id,
          intent,
          entities,
        };

        // 保存助手消息（支持未登录用户）
        if (session) {
          await this.saveMessage(
            session.id,
            userId || null,
            MessageRole.ASSISTANT,
            response.response,
            MessageType.PRODUCT,
            { intent, entities, action: 'search' },
          );
        }

        // 记录审计日志（支持未登录用户）
        await this.logAudit(
          userId || null,
          AuditAction.AGENT_SEARCH,
          AuditStatus.SUCCESS,
          `Agent搜索商品: ${message}`,
          { message, entities, intent },
          response,
          { sessionId: session?.id, duration: Date.now() - startTime },
        );

        return response;
      }

    // 服务推荐
    if (lowerMessage.includes('服务') || lowerMessage.includes('咨询') || lowerMessage.includes('设计') || 
        lowerMessage.includes('订阅')) {
      return {
        response: '让我为您推荐相关服务...',
        type: 'service',
        data: { action: 'search', query: message },
      };
    }

    // 链上资产识别
    if (lowerMessage.includes('nft') || lowerMessage.includes('代币') || lowerMessage.includes('链上') || 
        lowerMessage.includes('游戏道具') || lowerMessage.includes('链游')) {
      return {
        response: '让我为您查找链上资产...',
        type: 'onchain_asset',
        data: { action: 'search', query: message },
      };
    }

    // 订单查询/物流跟踪
    if (lowerMessage.includes('订单') || lowerMessage.includes('查询') || lowerMessage.includes('物流') || 
        lowerMessage.includes('跟踪') || lowerMessage.includes('配送')) {
      return {
        response: '让我为您查询订单状态和物流信息...',
        type: 'order',
        data: { action: 'query', query: message },
      };
    }

    // 售后/退款
    if (lowerMessage.includes('退款') || lowerMessage.includes('售后') || lowerMessage.includes('退货') || 
        lowerMessage.includes('取消订单')) {
      return {
        response: '让我为您处理退款或售后请求...',
        type: 'refund',
        data: { action: 'process', query: message },
      };
    }

    // API/SDK相关
    if (lowerMessage.includes('api') || lowerMessage.includes('sdk') || lowerMessage.includes('代码')) {
      return {
        response: '我可以为您生成 API/SDK 调用示例代码。请描述您的需求。',
        type: 'code',
        data: { action: 'generate', prompt: message },
      };
    }

    // 注册/登录引导
    if (lowerMessage.includes('注册') || lowerMessage.includes('登录')) {
      return {
        response: '我可以引导您完成注册或登录流程。',
        type: 'guide',
        data: { action: 'auth' },
      };
    }

      // 默认响应
      const defaultResponse = {
        response: '我理解您的需求。让我为您提供帮助...',
        sessionId: session?.id,
        intent,
        entities,
      };

      // 保存助手消息（支持未登录用户）
      if (session) {
        await this.saveMessage(
          session.id,
          userId || null,
          MessageRole.ASSISTANT,
          defaultResponse.response,
          MessageType.TEXT,
          { intent, entities },
        );
      }

      // 记录审计日志（支持未登录用户）
      await this.logAudit(
        userId || null,
        AuditAction.AGENT_MESSAGE,
        AuditStatus.SUCCESS,
        `Agent对话: ${message}`,
        { message, entities, intent },
        defaultResponse,
        { sessionId: session?.id, duration: Date.now() - startTime },
      );

      return defaultResponse;
    } catch (error) {
      this.logger.error('处理Agent消息失败:', error);
      
      // 记录错误审计日志（支持未登录用户）
      await this.logAudit(
        userId || null,
        AuditAction.AGENT_MESSAGE,
        AuditStatus.FAILED,
        `Agent对话失败: ${error.message}`,
        { message },
        null,
        { errorMessage: error.message, duration: Date.now() - startTime },
      );

      throw error;
    }
  }

  /**
   * 商品搜索/比价（V3.0：多平台聚合、自动比价）
   */
  async searchAndCompareProducts(
    query: string,
    filters?: {
      priceMin?: number;
      priceMax?: number;
      category?: string;
      currency?: string;
      inStock?: boolean;
    },
  ): Promise<{
    products: ProductSearchResult[];
    comparison?: {
      cheapest: ProductSearchResult;
      bestValue: ProductSearchResult;
      averagePrice: number;
    };
  }> {
    try {
      // 使用语义搜索查找相关商品
      const semanticResults = await this.searchService.semanticSearch(query, 20, {
        type: 'product',
        ...filters,
      });

      // 获取完整商品信息
      const productIds = semanticResults.map(r => r.id);
      const products = productIds.length > 0 
        ? await this.productRepository
            .createQueryBuilder('product')
            .where('product.id IN (:...ids)', { ids: productIds })
            .andWhere('product.status = :status', { status: 'active' })
            .getMany()
        : [];

      // 转换为搜索结果格式
      const results: ProductSearchResult[] = products.map((product, index) => ({
        id: product.id,
        name: product.name,
        description: product.description || '',
        price: Number(product.price),
        currency: (product.metadata as any)?.currency || 'CNY',
        category: product.category,
        stock: product.stock,
        merchantId: product.merchantId,
        commissionRate: product.commissionRate,
        metadata: product.metadata,
        score: semanticResults[index]?.score,
      }));

      // 应用过滤器
      let filtered = results;
      if (filters?.priceMin) {
        filtered = filtered.filter(p => p.price >= filters.priceMin!);
      }
      if (filters?.priceMax) {
        filtered = filtered.filter(p => p.price <= filters.priceMax!);
      }
      if (filters?.category) {
        filtered = filtered.filter(p => p.category === filters.category);
      }
      if (filters?.inStock) {
        filtered = filtered.filter(p => p.stock > 0);
      }

      // 排序：按相似度分数和价格
      filtered.sort((a, b) => {
        if (a.score && b.score) {
          return b.score - a.score;
        }
        return a.price - b.price;
      });

      // 生成比价信息
      const comparison = filtered.length > 0 ? {
        cheapest: filtered.reduce((min, p) => p.price < min.price ? p : min),
        bestValue: filtered[0], // 相似度最高的
        averagePrice: filtered.reduce((sum, p) => sum + p.price, 0) / filtered.length,
      } : undefined;

      return {
        products: filtered,
        comparison,
      };
    } catch (error) {
      this.logger.error('商品搜索失败:', error);
      return { products: [] };
    }
  }

  /**
   * 服务推荐（V3.0：虚拟服务、咨询服务、技术服务）
   */
  async searchServices(
    query: string,
    filters?: {
      type?: 'virtual_service' | 'consultation' | 'technical_service' | 'subscription';
      priceMax?: number;
    },
  ): Promise<ServiceProduct[]> {
    try {
      // 搜索服务类商品（category包含'service'）
      const semanticResults = await this.searchService.semanticSearch(query, 20, {
        type: 'product',
        category: 'service',
      });

      const productIds = semanticResults.map(r => r.id);
      const products = productIds.length > 0
        ? await this.productRepository
            .createQueryBuilder('product')
            .where('product.id IN (:...ids)', { ids: productIds })
            .andWhere('product.status = :status', { status: 'active' })
            .getMany()
        : [];

      // 转换为服务格式
      const services: ServiceProduct[] = products
        .filter(p => {
          const metadata = p.metadata as any;
          const serviceType = metadata?.serviceType || 'virtual_service';
          if (filters?.type && serviceType !== filters.type) {
            return false;
          }
          if (filters?.priceMax && Number(p.price) > filters.priceMax) {
            return false;
          }
          return true;
        })
        .map(p => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          price: Number(p.price),
          currency: (p.metadata as any)?.currency || 'CNY',
          type: (p.metadata as any)?.serviceType || 'virtual_service',
          merchantId: p.merchantId,
          metadata: p.metadata,
        }));

      return services;
    } catch (error) {
      this.logger.error('服务搜索失败:', error);
      return [];
    }
  }

  /**
   * 链上资产识别（V3.0：NFT、Token、链游资产）
   */
  async searchOnChainAssets(
    query: string,
    filters?: {
      type?: 'nft' | 'token' | 'game_item';
      chain?: 'solana' | 'ethereum' | 'bsc' | 'polygon';
    },
  ): Promise<OnChainAsset[]> {
    try {
      // 搜索链上资产类商品（category包含'onchain'或'nft'）
      const semanticResults = await this.searchService.semanticSearch(query, 20, {
        type: 'product',
        category: 'onchain',
      });

      const productIds = semanticResults.map(r => r.id);
      const products = productIds.length > 0
        ? await this.productRepository
            .createQueryBuilder('product')
            .where('product.id IN (:...ids)', { ids: productIds })
            .andWhere('product.status = :status', { status: 'active' })
            .getMany()
        : [];

      // 转换为链上资产格式
      const assets: OnChainAsset[] = products
        .filter(p => {
          const metadata = p.metadata as any;
          if (filters?.type && metadata?.assetType !== filters.type) {
            return false;
          }
          if (filters?.chain && metadata?.chain !== filters.chain) {
            return false;
          }
          return metadata?.assetType; // 必须是链上资产
        })
        .map(p => {
          const metadata = p.metadata as any;
          return {
            id: p.id,
            type: metadata.assetType || 'nft',
            contract: metadata.contract || '',
            tokenId: metadata.tokenId,
            chain: metadata.chain || 'ethereum',
            name: p.name,
            description: p.description || '',
            price: Number(p.price),
            currency: metadata.currency || 'USDT',
            owner: metadata.owner || '',
            metadata: metadata,
          };
        });

      return assets;
    } catch (error) {
      this.logger.error('链上资产搜索失败:', error);
      return [];
    }
  }

  /**
   * 自动下单（V3.0：全流程自动化）
   */
  async createOrderAutomatically(
    userId: string,
    productId: string,
    quantity: number = 1,
    metadata?: any,
  ): Promise<{
    order: Order;
    paymentIntent?: any;
  }> {
    try {
      // 获取商品信息
      const product = await this.productService.getProduct(productId);
      if (!product) {
        throw new Error('商品不存在');
      }

      // 检查库存
      if (product.stock < quantity) {
        throw new Error('库存不足');
      }

      // 计算总价
      const totalAmount = Number(product.price) * quantity;
      const currency = (product.metadata as any)?.currency || 'CNY';

      // 创建订单
      const order = await this.orderService.createOrder(userId, {
        merchantId: product.merchantId,
        productId: product.id,
        amount: totalAmount,
        currency,
        metadata: {
          ...metadata,
          quantity,
          productSnapshot: {
            name: product.name,
            price: product.price,
            category: product.category,
          },
        },
      });

      // 创建支付意图（可选，让用户确认后支付）
      let paymentIntent = null;
      if (metadata?.autoPay) {
        // 自动支付模式：直接创建支付
        paymentIntent = await this.paymentService.processPayment(userId, {
          amount: totalAmount,
          currency,
          paymentMethod: metadata.paymentMethod || 'wallet',
          description: `订单支付: ${product.name} x${quantity}`,
          merchantId: product.merchantId,
          metadata: {
            orderId: order.id,
            productId: product.id,
            ...metadata,
          },
        });
      }

      return {
        order,
        paymentIntent,
      };
    } catch (error) {
      this.logger.error('自动下单失败:', error);
      throw error;
    }
  }

  /**
   * 订单查询/物流跟踪（V3.0）
   */
  async queryOrderAndLogistics(
    userId: string,
    orderId?: string,
  ): Promise<{
    orders: Order[];
    logistics?: any[];
  }> {
    try {
      let orders: Order[];

      if (orderId) {
        // 查询单个订单
        const order = await this.orderService.getOrder(userId, orderId);
        orders = [order];
      } else {
        // 查询用户所有订单
        orders = await this.orderService.getOrders(userId);
      }

      // 获取物流信息（使用LogisticsService）
      const logisticsPromises = orders.map(order =>
        this.logisticsService.getLogisticsTracking(order.id),
      );
      const logisticsResults = await Promise.all(logisticsPromises);
      const logistics = logisticsResults.filter(l => l !== null);

      return {
        orders,
        logistics: logistics.length > 0 ? logistics : undefined,
      };
    } catch (error) {
      this.logger.error('订单查询失败:', error);
      return { orders: [] };
    }
  }

  /**
   * 处理退款/售后（V3.0）
   */
  async processRefund(
    userId: string,
    orderId: string,
    reason?: string,
  ): Promise<{
    refund: any;
    order: Order;
  }> {
    try {
      // 获取订单
      const order = await this.orderService.getOrder(userId, orderId);
      if (!order) {
        throw new Error('订单不存在');
      }

      // 检查订单状态
      if (order.status === OrderStatus.SETTLED) {
        throw new Error('订单已结算，无法退款');
      }

      if (order.status === OrderStatus.CANCELLED) {
        throw new Error('订单已取消');
      }

      // 如果有支付记录，创建退款
      let refund = null;
      if (order.paymentId) {
        // 调用退款服务创建退款
        refund = await this.refundService.createRefund({
          paymentId: order.paymentId,
          amount: order.amount,
          reason: reason || '用户申请退款',
          requestedBy: userId,
        });
      }

      // 更新订单状态
      order.status = OrderStatus.REFUNDED;
      order.metadata = {
        ...order.metadata,
        refund: {
          reason,
          requestedAt: new Date(),
          refundId: refund?.refundId,
        },
      };
      await this.orderRepository.save(order);

      return {
        refund,
        order,
      };
    } catch (error) {
      this.logger.error('退款处理失败:', error);
      throw error;
    }
  }

  /**
   * 生成代码示例
   */
  async generateCodeExample(
    prompt: string,
    language: 'typescript' | 'javascript' | 'python',
  ): Promise<{
    title: string;
    description: string;
    code: string;
    language: string;
  }[]> {
    const lowerPrompt = prompt.toLowerCase();
    const examples: any[] = [];

    if (lowerPrompt.includes('支付') || lowerPrompt.includes('payment')) {
      examples.push({
        title: '创建支付',
        description: '创建一个新的支付请求',
        code: this.getPaymentCode(language),
        language,
      });
    }

    if (lowerPrompt.includes('订单') || lowerPrompt.includes('order')) {
      examples.push({
        title: '创建订单',
        description: '创建一个新订单',
        code: this.getOrderCode(language),
        language,
      });
    }

    if (lowerPrompt.includes('商品') || lowerPrompt.includes('product')) {
      examples.push({
        title: '搜索商品',
        description: '在Marketplace中搜索商品',
        code: this.getProductSearchCode(language),
        language,
      });
    }

    if (examples.length === 0) {
      examples.push({
        title: '初始化SDK',
        description: '初始化Agentrix SDK客户端',
        code: this.getInitCode(language),
        language,
      });
    }

    return examples;
  }

  /**
   * 获取FAQ答案
   */
  async getFaqAnswer(question: string): Promise<{ answer: string; related?: string[] }> {
    const faqMap: Record<string, string> = {
      '如何注册': '您可以通过点击右上角的"注册"按钮，选择用户、商户或Agent角色进行注册。',
      '如何接入': '您可以使用我们的SDK快速接入，支持TypeScript、JavaScript和Python。',
      '支付方式': '我们支持多种支付方式：Stripe、钱包支付、X402协议、多签支付等。',
      '分润': 'Agent可以通过推荐商品获得分润，分润率由商户设置。',
    };

    const answer = faqMap[question] || '抱歉，我没有找到相关答案。请尝试其他问题或联系客服。';

    return { answer };
  }

  /**
   * 获取操作引导
   */
  async getGuide(type: 'register' | 'login' | 'api' | 'payment'): Promise<{
    title: string;
    steps: string[];
  }> {
    const guides: Record<string, any> = {
      register: {
        title: '注册引导',
        steps: [
          '1. 点击右上角"注册"按钮',
          '2. 选择您的角色（用户/商户/Agent）',
          '3. 填写基本信息',
          '4. 完成邮箱验证',
          '5. 开始使用',
        ],
      },
      login: {
        title: '登录引导',
        steps: [
          '1. 点击右上角"登录"按钮',
          '2. 选择登录方式（邮箱/钱包/OAuth）',
          '3. 完成身份验证',
          '4. 进入控制台',
        ],
      },
      api: {
        title: 'API接入引导',
        steps: [
          '1. 注册并获取API Key',
          '2. 安装SDK：npm install @agentrix/sdk',
          '3. 初始化客户端',
          '4. 调用API方法',
          '5. 查看文档了解更多',
        ],
      },
      payment: {
        title: '支付流程引导',
        steps: [
          '1. 选择商品或服务',
          '2. 选择支付方式',
          '3. 确认支付信息',
          '4. 完成支付',
          '5. 查看订单状态',
        ],
      },
    };

    return guides[type] || guides.register;
  }

  private getPaymentCode(lang: string): string {
    const codes: Record<string, string> = {
      typescript: `import { Agentrix } from '@agentrix/sdk';

const agentrix = new Agentrix({
  apiKey: process.env.AGENTRIX_API_KEY,
});

const payment = await agentrix.payments.create({
  amount: 100,
  currency: 'CNY',
  description: '商品购买',
});`,
      javascript: `const { Agentrix } = require('@agentrix/sdk');

const agentrix = new Agentrix({
  apiKey: process.env.AGENTRIX_API_KEY,
});

const payment = await agentrix.payments.create({
  amount: 100,
  currency: 'CNY',
  description: '商品购买',
});`,
      python: `from agentrix import Agentrix

agentrix = Agentrix(api_key=os.getenv('AGENTRIX_API_KEY'))

payment = agentrix.payments.create(
    amount=100,
    currency='CNY',
    description='商品购买'
)`,
    };
    return codes[lang] || codes.typescript;
  }

  private getOrderCode(lang: string): string {
    const codes: Record<string, string> = {
      typescript: `const order = await agentrix.orders.create({
  productId: 'prod_123',
  quantity: 1,
  amount: 100,
});`,
      javascript: `const order = await agentrix.orders.create({
  productId: 'prod_123',
  quantity: 1,
  amount: 100,
});`,
      python: `order = agentrix.orders.create(
    product_id='prod_123',
    quantity=1,
    amount=100
)`,
    };
    return codes[lang] || codes.typescript;
  }

  private getProductSearchCode(lang: string): string {
    const codes: Record<string, string> = {
      typescript: `const products = await agentrix.marketplace.searchProducts({
  query: '笔记本电脑',
  priceMax: 10000,
});`,
      javascript: `const products = await agentrix.marketplace.searchProducts({
  query: '笔记本电脑',
  priceMax: 10000,
});`,
      python: `products = agentrix.marketplace.search_products(
    query='笔记本电脑',
    price_max=10000
)`,
    };
    return codes[lang] || codes.typescript;
  }

  /**
   * 增强代码生成（V3.0：支持更多场景）
   */
  async generateEnhancedCode(
    prompt: string,
    language: 'typescript' | 'javascript' | 'python',
  ): Promise<{
    title: string;
    description: string;
    code: string;
    language: string;
    examples?: string[];
  }[]> {
    const lowerPrompt = prompt.toLowerCase();
    const examples: any[] = [];

    // 服务相关代码
    if (lowerPrompt.includes('服务') || lowerPrompt.includes('service')) {
      examples.push({
        title: '搜索服务',
        description: '搜索虚拟服务、咨询服务等',
        code: this.getServiceSearchCode(language),
        language,
      });
    }

    // 链上资产相关代码
    if (lowerPrompt.includes('nft') || lowerPrompt.includes('链上') || lowerPrompt.includes('onchain')) {
      examples.push({
        title: '搜索链上资产',
        description: '搜索NFT、代币、游戏道具等链上资产',
        code: this.getOnChainAssetCode(language),
        language,
      });
    }

    // 自动下单代码
    if (lowerPrompt.includes('下单') || lowerPrompt.includes('order') || lowerPrompt.includes('购买')) {
      examples.push({
        title: '自动下单',
        description: '自动创建订单并支付',
        code: this.getAutoOrderCode(language),
        language,
      });
    }

    // 订单查询代码
    if (lowerPrompt.includes('查询订单') || lowerPrompt.includes('order query')) {
      examples.push({
        title: '查询订单和物流',
        description: '查询订单状态和物流信息',
        code: this.getOrderQueryCode(language),
        language,
      });
    }

    // 退款代码
    if (lowerPrompt.includes('退款') || lowerPrompt.includes('refund')) {
      examples.push({
        title: '处理退款',
        description: '申请订单退款',
        code: this.getRefundCode(language),
        language,
      });
    }

    // 如果已有示例，返回；否则调用基础代码生成
    if (examples.length > 0) {
      return examples;
    }

    return this.generateCodeExample(prompt, language);
  }

  private getServiceSearchCode(lang: string): string {
    const codes: Record<string, string> = {
      typescript: `const services = await agentrix.agents.searchServices({
  query: '设计服务',
  type: 'virtual_service',
  priceMax: 500,
});`,
      javascript: `const services = await agentrix.agents.searchServices({
  query: '设计服务',
  type: 'virtual_service',
  priceMax: 500,
});`,
      python: `services = agentrix.agents.search_services(
    query='设计服务',
    type='virtual_service',
    price_max=500
)`,
    };
    return codes[lang] || codes.typescript;
  }

  private getOnChainAssetCode(lang: string): string {
    const codes: Record<string, string> = {
      typescript: `const assets = await agentrix.agents.searchOnChainAssets({
  query: 'NFT收藏品',
  type: 'nft',
  chain: 'ethereum',
});`,
      javascript: `const assets = await agentrix.agents.searchOnChainAssets({
  query: 'NFT收藏品',
  type: 'nft',
  chain: 'ethereum',
});`,
      python: `assets = agentrix.agents.search_on_chain_assets(
    query='NFT收藏品',
    type='nft',
    chain='ethereum'
)`,
    };
    return codes[lang] || codes.typescript;
  }

  private getAutoOrderCode(lang: string): string {
    const codes: Record<string, string> = {
      typescript: `const result = await agentrix.agents.createOrderAutomatically(
  userId,
  productId,
  1, // quantity
  { autoPay: true, paymentMethod: 'wallet' }
);`,
      javascript: `const result = await agentrix.agents.createOrderAutomatically(
  userId,
  productId,
  1, // quantity
  { autoPay: true, paymentMethod: 'wallet' }
);`,
      python: `result = agentrix.agents.create_order_automatically(
    user_id,
    product_id,
    1,  # quantity
    {'auto_pay': True, 'payment_method': 'wallet'}
)`,
    };
    return codes[lang] || codes.typescript;
  }

  private getOrderQueryCode(lang: string): string {
    const codes: Record<string, string> = {
      typescript: `const { orders, logistics } = await agentrix.agents.queryOrderAndLogistics(
  userId,
  orderId // optional
);`,
      javascript: `const { orders, logistics } = await agentrix.agents.queryOrderAndLogistics(
  userId,
  orderId // optional
);`,
      python: `result = agentrix.agents.query_order_and_logistics(
    user_id,
    order_id  # optional
)
orders = result['orders']
logistics = result.get('logistics')`,
    };
    return codes[lang] || codes.typescript;
  }

  private getRefundCode(lang: string): string {
    const codes: Record<string, string> = {
      typescript: `const { refund, order } = await agentrix.agents.processRefund(
  userId,
  orderId,
  '不需要了' // reason
);`,
      javascript: `const { refund, order } = await agentrix.agents.processRefund(
  userId,
  orderId,
  '不需要了' // reason
);`,
      python: `result = agentrix.agents.process_refund(
    user_id,
    order_id,
    '不需要了'  # reason
)
refund = result['refund']
order = result['order']`,
    };
    return codes[lang] || codes.typescript;
  }

  private getInitCode(lang: string): string {
    const codes: Record<string, string> = {
      typescript: `import { Agentrix } from '@agentrix/sdk';

const agentrix = new Agentrix({
  apiKey: process.env.AGENTRIX_API_KEY,
});`,
      javascript: `const { Agentrix } = require('@agentrix/sdk');

const agentrix = new Agentrix({
  apiKey: process.env.AGENTRIX_API_KEY,
});`,
      python: `from agentrix import Agentrix

agentrix = Agentrix(api_key=os.getenv('AGENTRIX_API_KEY'))`,
    };
    return codes[lang] || codes.typescript;
  }
}

