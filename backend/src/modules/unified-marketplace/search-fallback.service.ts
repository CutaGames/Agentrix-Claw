/**
 * Search Fallback Service
 * 
 * 语义搜索降级处理
 * 当内部搜索无结果时，自动降级到外部UCP搜索或Web搜索
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnifiedMarketplaceService, UnifiedSearchParams, UnifiedSearchResult } from '../unified-marketplace/unified-marketplace.service';
import { UCPScannerService, UCPExternalProduct } from '../ucp/ucp-scanner.service';
import { SkillExecutorService } from '../skill/skill-executor.service';

export interface SearchFallbackResult {
  source: 'internal' | 'external_ucp' | 'web_search' | 'combined';
  items: any[];
  total: number;
  fallbackUsed: boolean;
  fallbackChain: string[];
  searchTime: number;
  suggestions?: string[];
}

export interface FallbackConfig {
  enableExternalUCP: boolean;
  enableWebSearch: boolean;
  minInternalResults: number; // 低于此数量触发降级
  externalUCPSites: string[];
  webSearchSkillId?: string;
  maxFallbackResults: number;
  timeout: number;
}

@Injectable()
export class SearchFallbackService {
  private readonly logger = new Logger(SearchFallbackService.name);
  private readonly config: FallbackConfig;

  constructor(
    private configService: ConfigService,
    private unifiedMarketplace: UnifiedMarketplaceService,
    @Inject(forwardRef(() => UCPScannerService))
    private ucpScanner: UCPScannerService,
    @Inject(forwardRef(() => SkillExecutorService))
    private skillExecutor: SkillExecutorService,
  ) {
    this.config = {
      enableExternalUCP: configService.get('SEARCH_FALLBACK_UCP', 'true') === 'true',
      enableWebSearch: configService.get('SEARCH_FALLBACK_WEB', 'true') === 'true',
      minInternalResults: parseInt(configService.get('SEARCH_FALLBACK_MIN_RESULTS', '3')),
      externalUCPSites: [
        'https://shop.universal-commerce-protocol.org',
        'https://demo.ucp.dev',
      ],
      webSearchSkillId: configService.get('WEB_SEARCH_SKILL_ID'),
      maxFallbackResults: parseInt(configService.get('SEARCH_FALLBACK_MAX', '20')),
      timeout: parseInt(configService.get('SEARCH_FALLBACK_TIMEOUT', '10000')),
    };
  }

  /**
   * 执行带降级的搜索
   */
  async searchWithFallback(
    params: UnifiedSearchParams,
    options?: {
      skipInternal?: boolean;
      forceExternal?: boolean;
      userId?: string;
    },
  ): Promise<SearchFallbackResult> {
    const startTime = Date.now();
    const fallbackChain: string[] = [];
    let allItems: any[] = [];

    // Step 1: 内部搜索 (除非跳过)
    if (!options?.skipInternal) {
      fallbackChain.push('internal');
      
      try {
        const internalResult = await this.unifiedMarketplace.search(params);
        allItems = [...internalResult.items];
        
        // 如果内部结果足够，直接返回
        if (internalResult.total >= this.config.minInternalResults && !options?.forceExternal) {
          return {
            source: 'internal',
            items: allItems,
            total: internalResult.total,
            fallbackUsed: false,
            fallbackChain,
            searchTime: Date.now() - startTime,
          };
        }
      } catch (error) {
        this.logger.warn(`Internal search failed: ${error.message}`);
      }
    }

    // Step 2: 外部UCP搜索
    if (this.config.enableExternalUCP && allItems.length < this.config.minInternalResults) {
      fallbackChain.push('external_ucp');
      
      const externalItems = await this.searchExternalUCP(params.query || '');
      allItems = [...allItems, ...externalItems];
      
      if (allItems.length >= this.config.minInternalResults && !options?.forceExternal) {
        return {
          source: allItems.length === externalItems.length ? 'external_ucp' : 'combined',
          items: allItems.slice(0, this.config.maxFallbackResults),
          total: allItems.length,
          fallbackUsed: true,
          fallbackChain,
          searchTime: Date.now() - startTime,
        };
      }
    }

    // Step 3: Web搜索 (最后手段)
    if (this.config.enableWebSearch && allItems.length < this.config.minInternalResults) {
      fallbackChain.push('web_search');
      
      const webItems = await this.searchWeb(params.query || '', options?.userId);
      allItems = [...allItems, ...webItems];
    }

    // 生成搜索建议
    const suggestions = this.generateSuggestions(params.query || '', allItems.length);

    return {
      source: this.determineSource(fallbackChain, allItems.length),
      items: allItems.slice(0, this.config.maxFallbackResults),
      total: allItems.length,
      fallbackUsed: fallbackChain.length > 1,
      fallbackChain,
      searchTime: Date.now() - startTime,
      suggestions,
    };
  }

  /**
   * 搜索外部UCP站点
   */
  private async searchExternalUCP(query: string): Promise<any[]> {
    const results: any[] = [];

    for (const siteUrl of this.config.externalUCPSites) {
      try {
        const scanResult = await this.ucpScanner.scanSite(siteUrl);
        
        if (scanResult.success && scanResult.products) {
          // 在产品中搜索匹配项
          const matchingProducts = scanResult.products.filter(p => 
            this.matchesQuery(p, query)
          );
          
          // 转换为标准格式
          const formattedProducts = matchingProducts.map(p => this.formatExternalProduct(p));
          results.push(...formattedProducts);
        }
      } catch (error) {
        this.logger.warn(`External UCP search failed for ${siteUrl}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * 执行Web搜索
   */
  private async searchWeb(query: string, userId?: string): Promise<any[]> {
    if (!this.config.webSearchSkillId) {
      return [];
    }

    try {
      const result = await this.skillExecutor.execute(
        this.config.webSearchSkillId,
        { 
          query: `${query} buy purchase shop`,
          type: 'shopping',
        },
        { userId },
      );

      if (result.success && result.data?.results) {
        return result.data.results.map((r: any) => this.formatWebResult(r));
      }
    } catch (error) {
      this.logger.warn(`Web search failed: ${error.message}`);
    }

    return [];
  }

  /**
   * 检查产品是否匹配查询
   */
  private matchesQuery(product: UCPExternalProduct, query: string): boolean {
    const lowerQuery = query.toLowerCase();
    const searchFields = [
      product.name,
      product.description,
      product.category,
    ].filter(Boolean).join(' ').toLowerCase();

    return searchFields.includes(lowerQuery);
  }

  /**
   * 格式化外部产品
   */
  private formatExternalProduct(product: UCPExternalProduct): any {
    return {
      id: `external_${product.id}`,
      name: product.name,
      displayName: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      imageUrl: product.images?.[0],
      category: product.category || 'commerce',
      source: 'external_ucp',
      sourceUrl: product.sourceUrl,
      checkoutUrl: product.checkoutUrl,
      merchant: {
        id: product.merchantId,
        name: product.merchantName,
      },
      // 标记为外部商品，用于服务费计算
      metadata: {
        externalSource: 'ucp',
        originalProductId: product.id,
        merchantId: product.merchantId,
      },
    };
  }

  /**
   * 格式化Web搜索结果
   */
  private formatWebResult(result: any): any {
    return {
      id: `web_${Buffer.from(result.url || '').toString('base64').slice(0, 16)}`,
      name: result.title,
      displayName: result.title,
      description: result.snippet,
      price: result.price || 0,
      currency: result.currency || 'USD',
      imageUrl: result.image,
      category: 'commerce',
      source: 'web_search',
      sourceUrl: result.url,
      checkoutUrl: result.url,
      metadata: {
        externalSource: 'web',
        webUrl: result.url,
      },
    };
  }

  /**
   * 确定结果来源
   */
  private determineSource(chain: string[], itemCount: number): SearchFallbackResult['source'] {
    if (itemCount === 0) return 'internal';
    if (chain.length === 1) return chain[0] as any;
    return 'combined';
  }

  /**
   * 生成搜索建议
   */
  private generateSuggestions(query: string, resultCount: number): string[] {
    const suggestions: string[] = [];

    if (resultCount === 0) {
      suggestions.push(`Try simpler terms like "${query.split(' ')[0]}"`);
      suggestions.push('Browse categories instead');
      suggestions.push('Check spelling');
    } else if (resultCount < 5) {
      suggestions.push(`Try "${query}" with different keywords`);
      suggestions.push('Use broader terms');
    }

    return suggestions;
  }

  /**
   * 获取降级配置
   */
  getFallbackConfig(): FallbackConfig {
    return { ...this.config };
  }

  /**
   * 添加外部UCP站点
   */
  addExternalUCPSite(url: string): void {
    if (!this.config.externalUCPSites.includes(url)) {
      this.config.externalUCPSites.push(url);
      this.logger.log(`Added external UCP site: ${url}`);
    }
  }

  /**
   * 设置Web搜索Skill
   */
  setWebSearchSkill(skillId: string): void {
    this.config.webSearchSkillId = skillId;
    this.logger.log(`Set web search skill: ${skillId}`);
  }
}
