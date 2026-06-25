/**
 * Headless UCP Scanner Service
 * 
 * 外部UCP站点扫描适配层
 * 解决不同UCP实现的兼容性问题
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill, SkillStatus, SkillSource, SkillLayer, SkillCategory } from '../../entities/skill.entity';

export interface UCPScanResult {
  success: boolean;
  url: string;
  profile?: any;
  products?: UCPExternalProduct[];
  error?: string;
  scanMethod: 'direct' | 'proxy' | 'headless' | 'cached';
  responseTime: number;
}

export interface UCPExternalProduct {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  category?: string;
  images?: string[];
  checkoutUrl?: string;
  merchantId: string;
  merchantName: string;
  sourceUrl: string;
}

export interface UCPSiteConfig {
  url: string;
  name: string;
  adapter: 'standard' | 'google-ucp' | 'shopify-ucp' | 'custom';
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  proxyRequired?: boolean;
  lastScanAt?: Date;
  scanInterval?: number; // hours
}

// 已知的UCP站点配置
const KNOWN_UCP_SITES: UCPSiteConfig[] = [
  {
    url: 'https://shop.universal-commerce-protocol.org',
    name: 'UCP Demo Shop',
    adapter: 'standard',
    timeout: 15000,
    retries: 3,
  },
  {
    url: 'https://demo.ucp.dev',
    name: 'UCP Dev Demo',
    adapter: 'standard',
    timeout: 10000,
    retries: 2,
  },
  {
    url: 'https://shopping.google.com',
    name: 'Google Shopping',
    adapter: 'google-ucp',
    timeout: 20000,
    retries: 3,
    proxyRequired: true,
  },
];

@Injectable()
export class UCPScannerService {
  private readonly logger = new Logger(UCPScannerService.name);
  private readonly scanCache = new Map<string, { result: UCPScanResult; timestamp: number }>();
  private readonly CACHE_TTL = 3600000; // 1 hour
  private readonly customSites: UCPSiteConfig[] = [];

  constructor(
    private configService: ConfigService,
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
  ) {}

  /**
   * 扫描单个UCP站点 - 带适配层
   */
  async scanSite(url: string, options?: Partial<UCPSiteConfig>): Promise<UCPScanResult> {
    const startTime = Date.now();
    const normalizedUrl = url.replace(/\/$/, '');

    // 检查缓存
    const cached = this.scanCache.get(normalizedUrl);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      this.logger.debug(`Using cached scan result for ${normalizedUrl}`);
      return { ...cached.result, scanMethod: 'cached', responseTime: 0 };
    }

    // 获取站点配置
    const siteConfig = this.getSiteConfig(normalizedUrl, options);
    
    // 尝试多种扫描方法
    let result: UCPScanResult;

    // Method 1: Direct fetch
    result = await this.directScan(normalizedUrl, siteConfig);
    if (result.success) {
      this.cacheResult(normalizedUrl, result);
      return result;
    }

    // Method 2: With custom headers/user-agent
    result = await this.headlessScan(normalizedUrl, siteConfig);
    if (result.success) {
      this.cacheResult(normalizedUrl, result);
      return result;
    }

    // Method 3: Through proxy (if configured)
    if (siteConfig.proxyRequired || this.configService.get('UCP_SCAN_PROXY_URL')) {
      result = await this.proxyScan(normalizedUrl, siteConfig);
      if (result.success) {
        this.cacheResult(normalizedUrl, result);
        return result;
      }
    }

    // All methods failed
    const failedResult: UCPScanResult = {
      success: false,
      url: normalizedUrl,
      error: result.error || 'All scan methods failed',
      scanMethod: 'direct',
      responseTime: Date.now() - startTime,
    };

    return failedResult;
  }

  /**
   * 直接扫描 - 标准方法
   */
  private async directScan(url: string, config: UCPSiteConfig): Promise<UCPScanResult> {
    const startTime = Date.now();
    const ucpUrl = `${url}/.well-known/ucp`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 10000);

      const response = await fetch(ucpUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Agentrix-UCP-Scanner/1.0',
          ...config.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          url,
          error: `HTTP ${response.status}: ${response.statusText}`,
          scanMethod: 'direct',
          responseTime: Date.now() - startTime,
        };
      }

      const profile = await response.json();
      const products = await this.fetchProducts(url, profile, config);

      return {
        success: true,
        url,
        profile,
        products,
        scanMethod: 'direct',
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        url,
        error: error.message,
        scanMethod: 'direct',
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Headless扫描 - 模拟浏览器行为
   */
  private async headlessScan(url: string, config: UCPSiteConfig): Promise<UCPScanResult> {
    const startTime = Date.now();
    const ucpUrl = `${url}/.well-known/ucp`;

    try {
      // 使用更完整的浏览器头
      const browserHeaders = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        ...config.headers,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout || 15000);

      const response = await fetch(ucpUrl, {
        headers: browserHeaders,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          success: false,
          url,
          error: `HTTP ${response.status}`,
          scanMethod: 'headless',
          responseTime: Date.now() - startTime,
        };
      }

      const profile = await response.json();
      const products = await this.fetchProducts(url, profile, config);

      return {
        success: true,
        url,
        profile,
        products,
        scanMethod: 'headless',
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        url,
        error: error.message,
        scanMethod: 'headless',
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 代理扫描 - 通过代理服务器
   */
  private async proxyScan(url: string, config: UCPSiteConfig): Promise<UCPScanResult> {
    const startTime = Date.now();
    const proxyUrl = this.configService.get('UCP_SCAN_PROXY_URL');

    if (!proxyUrl) {
      return {
        success: false,
        url,
        error: 'Proxy not configured',
        scanMethod: 'proxy',
        responseTime: Date.now() - startTime,
      };
    }

    try {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: `${url}/.well-known/ucp`,
          timeout: config.timeout || 20000,
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          url,
          error: `Proxy error: ${response.status}`,
          scanMethod: 'proxy',
          responseTime: Date.now() - startTime,
        };
      }

      const data = await response.json();
      const profile = data.body;
      const products = await this.fetchProducts(url, profile, config);

      return {
        success: true,
        url,
        profile,
        products,
        scanMethod: 'proxy',
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        url,
        error: error.message,
        scanMethod: 'proxy',
        responseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * 获取产品列表
   */
  private async fetchProducts(baseUrl: string, profile: any, config: UCPSiteConfig): Promise<UCPExternalProduct[]> {
    try {
      // 根据适配器类型选择获取方式
      switch (config.adapter) {
        case 'google-ucp':
          return this.fetchGoogleProducts(baseUrl, profile);
        case 'shopify-ucp':
          return this.fetchShopifyProducts(baseUrl, profile);
        default:
          return this.fetchStandardProducts(baseUrl, profile);
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch products from ${baseUrl}: ${error.message}`);
      return [];
    }
  }

  /**
   * 标准UCP产品获取
   */
  private async fetchStandardProducts(baseUrl: string, profile: any): Promise<UCPExternalProduct[]> {
    const productsUrl = `${baseUrl}/ucp/v1/products`;
    
    try {
      const response = await fetch(productsUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Agentrix-UCP-Scanner/1.0',
        },
      });

      if (!response.ok) return [];

      const data = await response.json();
      const products = data.products || data.items || [];

      return products.map((p: any) => ({
        id: p.id,
        name: p.name || p.title,
        description: p.description,
        price: p.price?.amount || p.price || 0,
        currency: p.price?.currency || 'USD',
        category: p.category,
        images: p.images || (p.image ? [p.image] : []),
        checkoutUrl: p.checkoutUrl || `${baseUrl}/checkout?productId=${p.id}`,
        merchantId: profile.business?.id || 'unknown',
        merchantName: profile.business?.name || baseUrl,
        sourceUrl: baseUrl,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Google UCP适配器
   */
  private async fetchGoogleProducts(baseUrl: string, profile: any): Promise<UCPExternalProduct[]> {
    // Google Shopping specific adapter
    this.logger.debug('Google UCP adapter not fully implemented');
    return [];
  }

  /**
   * Shopify UCP适配器
   */
  private async fetchShopifyProducts(baseUrl: string, profile: any): Promise<UCPExternalProduct[]> {
    // Shopify specific adapter
    this.logger.debug('Shopify UCP adapter not fully implemented');
    return [];
  }

  /**
   * 获取站点配置
   */
  private getSiteConfig(url: string, options?: Partial<UCPSiteConfig>): UCPSiteConfig {
    // 查找已知站点
    const known = KNOWN_UCP_SITES.find(s => url.includes(new URL(s.url).hostname));
    if (known) {
      return { ...known, ...options };
    }

    // 查找自定义站点
    const custom = this.customSites.find(s => url.includes(new URL(s.url).hostname));
    if (custom) {
      return { ...custom, ...options };
    }

    // 返回默认配置
    return {
      url,
      name: 'Unknown',
      adapter: 'standard',
      timeout: 10000,
      retries: 2,
      ...options,
    };
  }

  /**
   * 缓存结果
   */
  private cacheResult(url: string, result: UCPScanResult): void {
    this.scanCache.set(url, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * 添加自定义站点配置
   */
  addCustomSite(config: UCPSiteConfig): void {
    const existing = this.customSites.findIndex(s => s.url === config.url);
    if (existing >= 0) {
      this.customSites[existing] = config;
    } else {
      this.customSites.push(config);
    }
    this.logger.log(`Added custom UCP site: ${config.name} (${config.url})`);
  }

  /**
   * 批量扫描所有已知站点
   */
  async scanAllKnownSites(): Promise<UCPScanResult[]> {
    const allSites = [...KNOWN_UCP_SITES, ...this.customSites];
    const results: UCPScanResult[] = [];

    for (const site of allSites) {
      this.logger.log(`Scanning UCP site: ${site.name}`);
      const result = await this.scanSite(site.url, site);
      results.push(result);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * 将外部产品导入为Skill
   */
  async importExternalProducts(scanResult: UCPScanResult): Promise<number> {
    if (!scanResult.success || !scanResult.products?.length) {
      return 0;
    }

    let imported = 0;
    const baseUrl = this.configService.get('API_BASE_URL', 'https://api.agentrix.io');

    for (const product of scanResult.products) {
      // 检查是否已导入
      const existing = await this.skillRepository.findOne({
        where: {
          externalSkillId: `ucp:${product.sourceUrl}:${product.id}`,
        },
      });

      if (existing) {
        continue;
      }

      // 创建Skill
      const skill = this.skillRepository.create({
        name: `ucp_product_${product.id}`,
        displayName: product.name,
        description: product.description || `Product from ${product.merchantName}`,
        status: SkillStatus.PUBLISHED,
        source: SkillSource.IMPORTED,
        layer: SkillLayer.RESOURCE,
        category: SkillCategory.COMMERCE,
        externalSkillId: `ucp:${product.sourceUrl}:${product.id}`,
        ucpEnabled: true,
        ucpCheckoutEndpoint: product.checkoutUrl || `${product.sourceUrl}/checkout`,
        imageUrl: product.images?.[0],
        pricing: {
          type: 'per_call' as any,
          pricePerCall: product.price,
          currency: product.currency,
        },
        inputSchema: {
          type: 'object',
          properties: {
            quantity: { type: 'number', description: 'Quantity to purchase', default: 1 },
          },
          required: [],
        },
        executor: {
          type: 'http',
          endpoint: product.checkoutUrl,
          method: 'POST',
        },
        metadata: {
          externalSource: 'ucp',
          merchantId: product.merchantId,
          merchantName: product.merchantName,
          sourceUrl: product.sourceUrl,
          originalProductId: product.id,
          importedAt: new Date().toISOString(),
        },
      });

      await this.skillRepository.save(skill);
      imported++;
    }

    this.logger.log(`Imported ${imported} products from ${scanResult.url}`);
    return imported;
  }

  /**
   * 定时扫描任务 (每6小时)
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async scheduledScan(): Promise<void> {
    this.logger.log('Starting scheduled UCP scan...');
    const results = await this.scanAllKnownSites();
    
    let totalImported = 0;
    for (const result of results) {
      if (result.success) {
        const imported = await this.importExternalProducts(result);
        totalImported += imported;
      }
    }

    this.logger.log(`Scheduled scan complete. Imported ${totalImported} new products.`);
  }

  /**
   * 获取扫描统计
   */
  getScanStats(): {
    knownSites: number;
    customSites: number;
    cachedResults: number;
    lastScanTime?: string;
  } {
    return {
      knownSites: KNOWN_UCP_SITES.length,
      customSites: this.customSites.length,
      cachedResults: this.scanCache.size,
    };
  }
}
