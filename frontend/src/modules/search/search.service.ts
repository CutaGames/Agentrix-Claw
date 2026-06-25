import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../../entities/payment.entity';
import { Order } from '../../entities/order.entity';
import { Product } from '../../entities/product.entity';
import { VectorDbService } from './vector-db.service';
import { EmbeddingService } from './embedding.service';
import { CacheService } from '../cache/cache.service';

export interface SearchResult {
  id: string;
  type: 'page' | 'product' | 'user' | 'transaction';
  title: string;
  description?: string;
  url: string;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    private vectorDb: VectorDbService,
    private embeddingService: EmbeddingService,
    private cacheService: CacheService,
  ) {}

  /**
   * 语义搜索（使用向量数据库 + 缓存优化 + 文本搜索fallback）
   */
  async semanticSearch(
    query: string,
    topK: number = 10,
    filters?: Record<string, any>,
  ): Promise<Array<{ id: string; score: number; metadata: any; text: string }>> {
    try {
      // 生成缓存键
      const cacheKey = `semantic_search:${query}:${topK}:${JSON.stringify(filters || {})}`;

      // 尝试从缓存获取
      const cached = await this.cacheService.get<Array<{ id: string; score: number; metadata: any; text: string }>>(cacheKey);
      if (cached) {
        this.logger.debug(`从缓存获取搜索结果: ${query}`);
        return cached;
      }

      // 首先尝试使用向量数据库搜索
      let results: Array<{ id: string; score: number; metadata: any; text: string }> = [];
      try {
        const vectorResults = await this.vectorDb.searchSimilar(query, topK, filters);
        results = vectorResults.map(r => ({
          ...r,
          text: r.metadata.text || r.metadata.description || '',
        }));
        this.logger.debug(`向量搜索找到 ${results.length} 个结果`);
      } catch (vectorError) {
        this.logger.warn('向量数据库搜索失败，使用文本搜索fallback:', vectorError);
      }

      // 如果向量搜索没有结果，使用文本搜索作为fallback（对于商品搜索，总是启用文本搜索作为备用）
      if (results.length === 0 && filters?.type === 'product') {
        this.logger.log(`向量搜索无结果，使用文本搜索fallback: ${query}`);
        const searchTerm = query.toLowerCase().trim();
        
        // 提取关键词（去除常见的前缀）
        const keywords = searchTerm
          .replace(/^(我要|我想|我想要|帮我|幫我|帮我找|幫我找|帮我买|幫我買|请|請|幫|帮|搜索|找|买|购买|查找|iphone|iPhone)/, '')
          .trim();
        
        // 如果提取后为空，使用原始查询
        const finalSearchTerm = keywords || searchTerm;
        
        this.logger.log(`文本搜索关键词: "${finalSearchTerm}"`);
        
        // 文本搜索商品（支持多个关键词匹配）
        const queryBuilder = this.productRepository
          .createQueryBuilder('product')
          .where('product.status = :status', { status: 'active' });
        
        // 如果有关键词，添加搜索条件
        if (finalSearchTerm) {
          // 将关键词拆分为多个词（支持中英文），但中文通常不分词
          // 对于中文，直接使用整个字符串；对于英文，按空格分词
          let terms: string[] = [];
          if (/[\u4e00-\u9fa5]/.test(finalSearchTerm)) {
            // 包含中文，直接使用整个字符串
            terms = [finalSearchTerm];
          } else {
            // 纯英文，按空格分词
            terms = finalSearchTerm.split(/\s+/).filter(t => t.length > 0);
          }
          
          if (terms.length > 0) {
            // 构建 OR 条件，只要匹配任何一个关键词即可
            const conditions = terms.map((term, idx) => {
              const paramName = `term${idx}`;
              return `(LOWER(product.name) LIKE :${paramName} OR LOWER(product.description) LIKE :${paramName} OR LOWER(product.category) LIKE :${paramName})`;
            });
            
            queryBuilder.andWhere(`(${conditions.join(' OR ')})`);
            terms.forEach((term, idx) => {
              queryBuilder.setParameter(`term${idx}`, `%${term}%`);
            });
          }
        }
        
        const products = await queryBuilder
          .orderBy('product.createdAt', 'DESC')
          .limit(topK)
          .getMany();

        results = products.map((product, index) => ({
          id: product.id,
          score: 0.8 - (index * 0.05), // 简单的相关性分数
          metadata: {
            type: 'product',
            name: product.name,
            description: product.description,
            category: product.category,
            price: product.price,
            currency: (product.metadata as any)?.currency || 'CNY',
            stock: product.stock,
            merchantId: product.merchantId,
          },
          text: `${product.name} ${product.description || ''}`,
        }));

        this.logger.log(`文本搜索找到 ${results.length} 个商品`);
      }

      // 缓存结果（5分钟）
      if (results.length > 0) {
        await this.cacheService.set(cacheKey, results, 300);
      }

      return results;
    } catch (error) {
      this.logger.error('语义搜索失败:', error);
      // 最后的fallback：返回空数组
      return [];
    }
  }

  /**
   * 添加商品到向量数据库
   */
  async indexProduct(productId: string, name: string, description: string, metadata: Record<string, any>): Promise<void> {
    try {
      const text = `${name} ${description}`;
      await this.vectorDb.addVector(productId, text, {
        ...metadata,
        type: 'product',
        text,
        name,
        description,
      });
    } catch (error) {
      this.logger.error('索引商品失败:', error);
      throw error;
    }
  }

  async search(
    userId: string,
    query: string,
    type?: string,
    limit: number = 20,
  ): Promise<{ results: SearchResult[] }> {
    const results: SearchResult[] = [];
    const searchTerm = query.toLowerCase().trim();

    // 首先尝试语义搜索
    try {
      const semanticResults = await this.semanticSearch(query, limit, type ? { type } : undefined);
      
      for (const result of semanticResults) {
        if (result.metadata.type === 'product') {
          results.push({
            id: result.id,
            type: 'product',
            title: result.metadata.name || result.id,
            description: result.metadata.description,
            url: `/app/merchant/products/${result.id}`,
          });
        }
      }
    } catch (error) {
      this.logger.warn('语义搜索失败，使用文本搜索:', error);
    }

    try {
      // 搜索交易记录
      if (!type || type === 'transaction') {
        const payments = await this.paymentRepository
          .createQueryBuilder('payment')
          .where('payment.userId = :userId', { userId })
          .andWhere(
            '(LOWER(payment.id::text) LIKE :term OR LOWER(payment.description) LIKE :term)',
            { term: `%${searchTerm}%` },
          )
          .orderBy('payment.createdAt', 'DESC')
          .limit(5)
          .getMany();

        payments.forEach((payment) => {
          results.push({
            id: payment.id,
            type: 'transaction',
            title: `交易 ${payment.id.slice(0, 8)}...`,
            description: payment.description || `金额: ${payment.amount} ${payment.currency}`,
            url: `/app/user/transactions?paymentId=${payment.id}`,
          });
        });
      }

      // 搜索产品
      if (!type || type === 'product') {
        const products = await this.productRepository
          .createQueryBuilder('product')
          .where('product.merchantId = :userId', { userId })
          .andWhere(
            '(LOWER(product.name) LIKE :term OR LOWER(product.description) LIKE :term)',
            { term: `%${searchTerm}%` },
          )
          .orderBy('product.createdAt', 'DESC')
          .limit(5)
          .getMany();

        products.forEach((product) => {
          results.push({
            id: product.id,
            type: 'product',
            title: product.name,
            description: product.description,
            url: `/app/merchant/products/${product.id}`,
          });
        });
      }

      // 搜索订单
      if (!type || type === 'transaction') {
        const orders = await this.orderRepository
          .createQueryBuilder('order')
          .leftJoinAndSelect('order.product', 'product')
          .where('order.userId = :userId', { userId })
          .andWhere(
            '(LOWER(order.id::text) LIKE :term OR LOWER(product.name) LIKE :term)',
            { term: `%${searchTerm}%` },
          )
          .orderBy('order.createdAt', 'DESC')
          .limit(5)
          .getMany();

        orders.forEach((order) => {
          results.push({
            id: order.id,
            type: 'transaction',
            title: `订单 ${order.id.slice(0, 8)}...`,
            description: order.product?.name || order.metadata?.productName || `金额: ${order.amount}`,
            url: `/app/user/transactions?orderId=${order.id}`,
          });
        });
      }

      // 添加页面搜索结果
      const pageResults = this.searchPages(searchTerm);
      results.push(...pageResults);

      // 限制结果数量
      return { results: results.slice(0, limit) };
    } catch (error) {
      this.logger.error(`搜索失败: ${error.message}`, error.stack);
      return { results: [] };
    }
  }

  private searchPages(query: string): SearchResult[] {
    const pages = [
      { title: '支付页面', description: '查看支付相关功能', url: '/pay/agent', keywords: ['支付', 'pay', 'payment'] },
      { title: '产品管理', description: '管理您的产品', url: '/app/merchant/products', keywords: ['产品', 'product', '商品'] },
      { title: '交易记录', description: '查看交易历史', url: '/app/user/transactions', keywords: ['交易', 'transaction', '历史'] },
      { title: '个人中心', description: '查看个人信息', url: '/app/user/profile', keywords: ['个人', 'profile', '信息'] },
      { title: '钱包管理', description: '管理您的钱包', url: '/app/user/wallets', keywords: ['钱包', 'wallet', '连接'] },
    ];

    const results: SearchResult[] = [];
    const searchTerm = query.toLowerCase();

    pages.forEach((page) => {
      const matches = page.keywords.some((keyword) =>
        keyword.toLowerCase().includes(searchTerm) ||
        searchTerm.includes(keyword.toLowerCase()),
      );

      if (matches || page.title.toLowerCase().includes(searchTerm)) {
        results.push({
          id: `page-${page.url}`,
          type: 'page',
          title: page.title,
          description: page.description,
          url: page.url,
        });
      }
    });

    return results;
  }
}

