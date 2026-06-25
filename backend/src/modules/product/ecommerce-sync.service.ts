import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { 
  EcommerceConnection, 
  EcommercePlatform, 
  SyncStatus 
} from '../../entities/ecommerce-connection.entity';
import { ProductSyncMapping } from '../../entities/product-sync-mapping.entity';
import { Product, ProductType, ProductStatus } from '../../entities/product.entity';

/**
 * 创建连接DTO
 */
export interface CreateConnectionDto {
  platform: EcommercePlatform;
  storeName: string;
  storeUrl?: string;
  credentials: EcommerceConnection['credentials'];
  syncConfig?: Partial<EcommerceConnection['syncConfig']>;
}

/**
 * 同步结果
 */
export interface SyncResult {
  success: boolean;
  imported: number;
  updated: number;
  failed: number;
  errors: string[];
  products: Array<{
    externalId: string;
    agentrixId?: string;
    title: string;
    status: 'imported' | 'updated' | 'failed';
    error?: string;
  }>;
}

/**
 * 外部商品数据
 */
interface ExternalProduct {
  id: string;
  title: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  sku?: string;
  barcode?: string;
  inventoryQuantity?: number;
  status?: string;
  images?: string[];
  category?: string;
  tags?: string[];
  variants?: Array<{
    id: string;
    title: string;
    price: number;
    sku?: string;
    inventoryQuantity?: number;
  }>;
}

/**
 * 电商平台同步服务
 */
@Injectable()
export class EcommerceSyncService {
  private readonly logger = new Logger(EcommerceSyncService.name);

  constructor(
    @InjectRepository(EcommerceConnection)
    private readonly connectionRepository: Repository<EcommerceConnection>,
    @InjectRepository(ProductSyncMapping)
    private readonly mappingRepository: Repository<ProductSyncMapping>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  // ============ 连接管理 ============

  /**
   * 创建电商平台连接
   */
  async createConnection(merchantId: string, dto: CreateConnectionDto): Promise<EcommerceConnection> {
    // 检查是否已存在相同平台的连接
    const existing = await this.connectionRepository.findOne({
      where: { merchantId, platform: dto.platform, isActive: true },
    });

    if (existing) {
      throw new BadRequestException(`已存在 ${dto.platform} 平台的连接`);
    }

    const connection = this.connectionRepository.create({
      merchantId,
      platform: dto.platform,
      storeName: dto.storeName,
      storeUrl: dto.storeUrl,
      credentials: dto.credentials,
      syncConfig: {
        autoSync: false,
        syncInterval: 60,
        syncDirection: 'import',
        ...dto.syncConfig,
      },
      status: SyncStatus.DISCONNECTED,
      syncStats: {
        totalProducts: 0,
        importedProducts: 0,
        exportedProducts: 0,
      },
    });

    const saved = await this.connectionRepository.save(connection);
    this.logger.log(`创建 ${dto.platform} 连接: ${saved.id}`);

    return saved;
  }

  /**
   * 测试连接
   */
  async testConnection(connectionId: string, merchantId: string): Promise<{ success: boolean; message: string }> {
    const connection = await this.getConnection(connectionId, merchantId);

    try {
      switch (connection.platform) {
        case EcommercePlatform.SHOPIFY:
          await this.testShopifyConnection(connection);
          break;
        case EcommercePlatform.WOOCOMMERCE:
          await this.testWooCommerceConnection(connection);
          break;
        default:
          throw new BadRequestException(`暂不支持 ${connection.platform} 平台`);
      }

      await this.connectionRepository.update(connection.id, {
        status: SyncStatus.CONNECTED,
      });

      return { success: true, message: '连接测试成功' };
    } catch (error) {
      await this.connectionRepository.update(connection.id, {
        status: SyncStatus.ERROR,
      });
      return { success: false, message: `连接测试失败: ${error.message}` };
    }
  }

  /**
   * 获取商户的所有连接
   */
  async getConnections(merchantId: string) {
    return this.connectionRepository.find({
      where: { merchantId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取单个连接
   */
  async getConnection(connectionId: string, merchantId: string): Promise<EcommerceConnection> {
    const connection = await this.connectionRepository.findOne({
      where: { id: connectionId, merchantId },
    });

    if (!connection) {
      throw new NotFoundException('连接不存在');
    }

    return connection;
  }

  /**
   * 更新连接配置
   */
  async updateConnection(connectionId: string, merchantId: string, updates: Partial<CreateConnectionDto>) {
    const connection = await this.getConnection(connectionId, merchantId);

    // Allow toggling isActive from UI payloads (backward-compatible)
    if (typeof (updates as any).isActive === 'boolean') {
      connection.isActive = (updates as any).isActive;
    }

    if (updates.credentials) {
      connection.credentials = { ...connection.credentials, ...updates.credentials };
    }
    if (updates.syncConfig) {
      connection.syncConfig = { ...connection.syncConfig, ...updates.syncConfig };
    }
    if (updates.storeName) {
      connection.storeName = updates.storeName;
    }
    if (updates.storeUrl) {
      connection.storeUrl = updates.storeUrl;
    }

    return this.connectionRepository.save(connection);
  }

  /**
   * 删除连接
   */
  async deleteConnection(connectionId: string, merchantId: string) {
    const connection = await this.getConnection(connectionId, merchantId);
    await this.connectionRepository.update(connection.id, { isActive: false });
    return { success: true, message: '连接已删除' };
  }

  // ============ 商品同步 ============

  /**
   * 从电商平台导入商品
   */
  async importProducts(connectionId: string, merchantId: string): Promise<SyncResult> {
    const connection = await this.getConnection(connectionId, merchantId);

    await this.connectionRepository.update(connection.id, {
      status: SyncStatus.SYNCING,
    });

    const result: SyncResult = {
      success: true,
      imported: 0,
      updated: 0,
      failed: 0,
      errors: [],
      products: [],
    };

    try {
      let externalProducts: ExternalProduct[] = [];

      switch (connection.platform) {
        case EcommercePlatform.SHOPIFY:
          externalProducts = await this.fetchShopifyProducts(connection);
          break;
        case EcommercePlatform.WOOCOMMERCE:
          externalProducts = await this.fetchWooCommerceProducts(connection);
          break;
        default:
          throw new BadRequestException(`暂不支持 ${connection.platform} 平台`);
      }

      this.logger.log(`从 ${connection.platform} 获取到 ${externalProducts.length} 个商品`);

      // 处理每个商品
      for (const externalProduct of externalProducts) {
        try {
          const productResult = await this.processExternalProduct(
            connection,
            merchantId,
            externalProduct,
          );

          result.products.push(productResult);

          if (productResult.status === 'imported') {
            result.imported++;
          } else if (productResult.status === 'updated') {
            result.updated++;
          }
        } catch (error) {
          result.failed++;
          result.errors.push(`${externalProduct.title}: ${error.message}`);
          result.products.push({
            externalId: externalProduct.id,
            title: externalProduct.title,
            status: 'failed',
            error: error.message,
          });
        }
      }

      // 更新连接状态和统计
      await this.connectionRepository.update(connection.id, {
        status: SyncStatus.CONNECTED,
        lastSyncAt: new Date(),
        syncStats: {
          ...connection.syncStats,
          totalProducts: externalProducts.length,
          importedProducts: (connection.syncStats.importedProducts || 0) + result.imported,
          lastSyncResult: {
            success: true,
            imported: result.imported,
            updated: result.updated,
            failed: result.failed,
            errors: result.errors,
          },
        },
      });

      this.logger.log(`同步完成: 导入 ${result.imported}, 更新 ${result.updated}, 失败 ${result.failed}`);

    } catch (error) {
      result.success = false;
      result.errors.push(error.message);

      await this.connectionRepository.update(connection.id, {
        status: SyncStatus.ERROR,
        syncStats: {
          ...connection.syncStats,
          lastSyncResult: {
            success: false,
            imported: 0,
            updated: 0,
            failed: 0,
            errors: [error.message],
          },
        },
      });

      this.logger.error(`同步失败: ${error.message}`);
    }

    return result;
  }

  /**
   * 处理外部商品
   */
  private async processExternalProduct(
    connection: EcommerceConnection,
    merchantId: string,
    externalProduct: ExternalProduct,
  ) {
    // 检查是否已存在映射
    const existingMapping = await this.mappingRepository.findOne({
      where: {
        connectionId: connection.id,
        externalProductId: externalProduct.id,
      },
    });

    if (existingMapping) {
      // 更新现有商品
      await this.productRepository.update(existingMapping.productId, {
        name: externalProduct.title,
        description: externalProduct.description || '',
        price: externalProduct.price,
        stock: externalProduct.inventoryQuantity || 0,
        metadata: {
          images: externalProduct.images || [],
          sku: externalProduct.sku,
          source: connection.platform,
          externalId: externalProduct.id,
        } as any,
      });

      await this.mappingRepository.update(existingMapping.id, {
        lastSyncedAt: new Date(),
        syncVersion: existingMapping.syncVersion + 1,
        externalData: this.buildExternalData(externalProduct),
      });

      return {
        externalId: externalProduct.id,
        agentrixId: existingMapping.productId,
        title: externalProduct.title,
        status: 'updated' as const,
      };
    }

    // 创建新商品
    const newProduct = this.productRepository.create({
      merchantId,
      name: externalProduct.title,
      description: externalProduct.description || '',
      price: externalProduct.price,
      category: this.mapCategory(externalProduct.category, connection.syncConfig.categoryMapping),
      productType: ProductType.PHYSICAL,
      status: ProductStatus.PENDING_REVIEW, // 默认待审核
      stock: externalProduct.inventoryQuantity || 0,
      syncSource: connection.platform,
      externalId: externalProduct.id,
      metadata: {
        images: externalProduct.images || [],
        sku: externalProduct.sku,
        originalPrice: externalProduct.compareAtPrice,
        source: connection.platform,
        externalId: externalProduct.id,
        importedAt: new Date().toISOString(),
        tags: externalProduct.tags,
      },
    });

    const savedProduct = await this.productRepository.save(newProduct);

    // 创建映射
    const mapping = this.mappingRepository.create({
      connectionId: connection.id,
      productId: savedProduct.id,
      externalProductId: externalProduct.id,
      platform: connection.platform,
      externalData: this.buildExternalData(externalProduct),
      syncDirection: 'import',
      lastSyncedAt: new Date(),
    });

    await this.mappingRepository.save(mapping);

    return {
      externalId: externalProduct.id,
      agentrixId: savedProduct.id,
      title: externalProduct.title,
      status: 'imported' as const,
    };
  }

  private buildExternalData(product: ExternalProduct) {
    return {
      title: product.title,
      price: product.price,
      sku: product.sku,
      barcode: product.barcode,
      inventoryQuantity: product.inventoryQuantity,
      status: product.status,
      images: product.images,
      variants: product.variants,
    };
  }

  private mapCategory(externalCategory?: string, categoryMapping?: Record<string, string>): string {
    if (!externalCategory) return 'uncategorized';
    if (categoryMapping && categoryMapping[externalCategory]) {
      return categoryMapping[externalCategory];
    }
    return externalCategory.toLowerCase().replace(/\s+/g, '-');
  }

  /**
   * 获取同步映射列表
   */
  async getSyncMappings(connectionId: string, merchantId: string) {
    const connection = await this.getConnection(connectionId, merchantId);

    return this.mappingRepository.find({
      where: { connectionId: connection.id },
      relations: ['product'],
      order: { lastSyncedAt: 'DESC' },
    });
  }

  // ============ Shopify 集成 ============

  private async testShopifyConnection(connection: EcommerceConnection): Promise<void> {
    const { accessToken, shopDomain } = connection.credentials;

    if (!accessToken || !shopDomain) {
      throw new BadRequestException('Shopify 连接需要 accessToken 和 shopDomain');
    }

    // 实际调用 Shopify API 测试连接
    // 这里使用模拟实现
    const response = await this.makeShopifyRequest(connection, '/admin/api/2024-01/shop.json');

    if (!response.shop) {
      throw new Error('无法获取店铺信息');
    }

    this.logger.log(`Shopify 连接测试成功: ${response.shop.name}`);
  }

  private async fetchShopifyProducts(connection: EcommerceConnection): Promise<ExternalProduct[]> {
    const response = await this.makeShopifyRequest(
      connection,
      '/admin/api/2024-01/products.json?limit=250',
    );

    if (!response.products) {
      return [];
    }

    return response.products.map((p: any) => ({
      id: String(p.id),
      title: p.title,
      description: p.body_html,
      price: parseFloat(p.variants?.[0]?.price || '0'),
      compareAtPrice: p.variants?.[0]?.compare_at_price
        ? parseFloat(p.variants[0].compare_at_price)
        : undefined,
      sku: p.variants?.[0]?.sku,
      barcode: p.variants?.[0]?.barcode,
      inventoryQuantity: p.variants?.[0]?.inventory_quantity,
      status: p.status,
      images: p.images?.map((img: any) => img.src) || [],
      category: p.product_type,
      tags: p.tags?.split(', ') || [],
      variants: p.variants?.map((v: any) => ({
        id: String(v.id),
        title: v.title,
        price: parseFloat(v.price),
        sku: v.sku,
        inventoryQuantity: v.inventory_quantity,
      })),
    }));
  }

  private async makeShopifyRequest(connection: EcommerceConnection, endpoint: string): Promise<any> {
    const { accessToken, shopDomain } = connection.credentials;
    const url = `https://${shopDomain}${endpoint}`;

    try {
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken!,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Shopify API 错误: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      this.logger.error(`Shopify 请求失败: ${error.message}`);
      throw error;
    }
  }

  // ============ WooCommerce 集成 ============

  private async testWooCommerceConnection(connection: EcommerceConnection): Promise<void> {
    const { consumerKey, consumerSecret } = connection.credentials;

    if (!consumerKey || !consumerSecret || !connection.storeUrl) {
      throw new BadRequestException('WooCommerce 连接需要 consumerKey、consumerSecret 和 storeUrl');
    }

    const response = await this.makeWooCommerceRequest(connection, '/wp-json/wc/v3/system_status');

    if (!response.environment) {
      throw new Error('无法获取系统状态');
    }

    this.logger.log(`WooCommerce 连接测试成功`);
  }

  private async fetchWooCommerceProducts(connection: EcommerceConnection): Promise<ExternalProduct[]> {
    const response = await this.makeWooCommerceRequest(
      connection,
      '/wp-json/wc/v3/products?per_page=100',
    );

    if (!Array.isArray(response)) {
      return [];
    }

    return response.map((p: any) => ({
      id: String(p.id),
      title: p.name,
      description: p.description,
      price: parseFloat(p.price || '0'),
      compareAtPrice: p.regular_price ? parseFloat(p.regular_price) : undefined,
      sku: p.sku,
      barcode: p.meta_data?.find((m: any) => m.key === '_barcode')?.value,
      inventoryQuantity: p.stock_quantity,
      status: p.status,
      images: p.images?.map((img: any) => img.src) || [],
      category: p.categories?.[0]?.name,
      tags: p.tags?.map((t: any) => t.name) || [],
      variants: p.variations?.map((v: any) => ({
        id: String(v.id),
        title: v.name,
        price: parseFloat(v.price),
        sku: v.sku,
        inventoryQuantity: v.stock_quantity,
      })),
    }));
  }

  private async makeWooCommerceRequest(connection: EcommerceConnection, endpoint: string): Promise<any> {
    const { consumerKey, consumerSecret } = connection.credentials;
    const url = `${connection.storeUrl}${endpoint}`;

    try {
      const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`WooCommerce API 错误: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      this.logger.error(`WooCommerce 请求失败: ${error.message}`);
      throw error;
    }
  }
}
