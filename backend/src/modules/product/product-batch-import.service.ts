import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductType, ProductStatus } from '../../entities/product.entity';
import { 
  BatchImportDto, 
  BatchImportProductItem, 
  BatchImportResultDto,
  IMPORT_TEMPLATE_COLUMNS 
} from './dto/batch-import.dto';

/**
 * 商品批量导入服务
 * 支持 CSV/Excel 数据批量导入
 */
@Injectable()
export class ProductBatchImportService {
  private readonly logger = new Logger(ProductBatchImportService.name);

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  /**
   * 批量导入商品
   */
  async batchImport(
    merchantId: string,
    dto: BatchImportDto,
  ): Promise<BatchImportResultDto> {
    const result: BatchImportResultDto = {
      total: dto.products.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      createdIds: [],
    };

    this.logger.log(`开始批量导入 ${dto.products.length} 个商品，商户ID: ${merchantId}`);

    for (let i = 0; i < dto.products.length; i++) {
      const item = dto.products[i];
      const rowNum = i + 2; // Excel行号从2开始（1是表头）

      try {
        // 验证必填字段
        if (!item.name || item.name.trim() === '') {
          throw new Error('商品名称不能为空');
        }
        if (item.price === undefined || item.price === null || item.price < 0) {
          throw new Error('价格必须大于等于0');
        }
        if (!item.category || item.category.trim() === '') {
          throw new Error('分类不能为空');
        }

        // 检查是否重复（通过名称+商户ID）
        if (dto.mode !== 'upsert') {
          const existing = await this.productRepository.findOne({
            where: { name: item.name.trim(), merchantId },
          });
          if (existing) {
            result.skipped++;
            result.errors.push({
              row: rowNum,
              name: item.name,
              error: '商品已存在（跳过）',
            });
            continue;
          }
        }

        // 解析商品类型
        const productType = this.parseProductType(item.productType);

        // 解析标签
        const tags = item.tags 
          ? item.tags.split(',').map(t => t.trim()).filter(t => t)
          : [];

        // 构建商品数据
        const productData: Partial<Product> = {
          name: item.name.trim(),
          description: item.description?.trim() || item.name.trim(),
          price: item.price,
          stock: this.getStock(item, productType),
          category: item.category.trim(),
          productType,
          merchantId,
          status: ProductStatus.ACTIVE,
          commissionRate: item.commissionRate ?? 5,
          metadata: this.buildMetadata(item, productType, tags),
        };

        // 创建或更新
        let product: Product;
        if (dto.mode === 'upsert') {
          const existing = await this.productRepository.findOne({
            where: { name: item.name.trim(), merchantId },
          });
          if (existing) {
            await this.productRepository.update(existing.id, productData);
            product = { ...existing, ...productData } as Product;
            this.logger.debug(`更新商品: ${item.name}`);
          } else {
            product = this.productRepository.create(productData);
            await this.productRepository.save(product);
            this.logger.debug(`创建商品: ${item.name}`);
          }
        } else {
          product = this.productRepository.create(productData);
          await this.productRepository.save(product);
          this.logger.debug(`创建商品: ${item.name}`);
        }

        result.success++;
        result.createdIds.push(product.id);

      } catch (error: any) {
        result.failed++;
        result.errors.push({
          row: rowNum,
          name: item.name || `第${rowNum}行`,
          error: error.message,
        });

        if (!dto.skipErrors) {
          // 如果不跳过错误，直接抛出
          throw new BadRequestException(`第${rowNum}行导入失败: ${error.message}`);
        }
      }
    }

    this.logger.log(
      `批量导入完成: 成功${result.success}, 失败${result.failed}, 跳过${result.skipped}`
    );

    return result;
  }

  /**
   * 解析商品类型
   */
  private parseProductType(type?: string): ProductType {
    if (!type) return ProductType.PHYSICAL;
    
    const typeMap: Record<string, ProductType> = {
      'physical': ProductType.PHYSICAL,
      'service': ProductType.SERVICE,
      'nft': ProductType.NFT,
      'ft': ProductType.FT,
      'game_asset': ProductType.GAME_ASSET,
      'rwa': ProductType.RWA,
      // 兼容中文
      '实物': ProductType.PHYSICAL,
      '服务': ProductType.SERVICE,
      '游戏资产': ProductType.GAME_ASSET,
      '真实资产': ProductType.RWA,
    };

    return typeMap[type.toLowerCase()] || ProductType.PHYSICAL;
  }

  /**
   * 获取库存（服务类商品默认无限）
   */
  private getStock(item: BatchImportProductItem, productType: ProductType): number {
    if (item.stock !== undefined && item.stock !== null) {
      return item.stock;
    }

    // 服务类商品默认无限库存
    if ([ProductType.SERVICE, ProductType.FT].includes(productType)) {
      return 999999;
    }

    return 100; // 默认库存
  }

  /**
   * 构建商品元数据
   */
  private buildMetadata(
    item: BatchImportProductItem, 
    productType: ProductType,
    tags: string[]
  ): Record<string, any> {
    const metadata: Record<string, any> = {
      currency: item.currency || 'CNY',
      importedAt: new Date().toISOString(),
      importSource: 'batch_import',
    };

    // 图片
    if (item.image) {
      metadata.core = {
        media: {
          images: [{ url: item.image, type: 'thumbnail' }],
        },
      };
    }

    // 标签
    if (tags.length > 0) {
      metadata.tags = tags;
    }

    // SKU
    if (item.sku) {
      metadata.sku = item.sku;
    }

    // 类型特定元数据
    switch (productType) {
      case ProductType.NFT:
        metadata.typeSpecific = {
          chain: item.chain || 'ethereum',
          contractAddress: item.contractAddress,
          tokenId: item.tokenId,
          tokenStandard: 'ERC-721',
        };
        break;

      case ProductType.FT:
        metadata.typeSpecific = {
          chain: item.chain || 'ethereum',
          contractAddress: item.contractAddress,
          tokenStandard: 'ERC-20',
          decimals: 18,
        };
        break;

      case ProductType.GAME_ASSET:
        metadata.typeSpecific = {
          gameName: item.gameName,
          rarity: item.rarity || 'common',
          tradeable: true,
        };
        break;

      case ProductType.SERVICE:
        metadata.typeSpecific = {
          duration: item.duration || 60,
          deliverables: item.deliverables ? item.deliverables.split(',').map(d => d.trim()) : [],
          serviceType: 'online',
        };
        break;

      case ProductType.RWA:
        metadata.typeSpecific = {
          assetType: 'tokenized',
          chain: item.chain || 'ethereum',
          contractAddress: item.contractAddress,
        };
        break;
    }

    return metadata;
  }

  /**
   * 生成 CSV 模板
   */
  generateCsvTemplate(): string {
    // 表头
    const headers = IMPORT_TEMPLATE_COLUMNS.map(col => col.label);
    
    // 示例行
    const exampleRow = IMPORT_TEMPLATE_COLUMNS.map(col => col.example || '');
    
    // 说明行
    const noteRow = IMPORT_TEMPLATE_COLUMNS.map(col => {
      const notes: string[] = [];
      if (col.required) notes.push('必填');
      if (col.default) notes.push(`默认:${col.default}`);
      if (col.note) notes.push(col.note);
      return notes.join(';') || '';
    });

    const rows = [
      headers.join(','),
      exampleRow.join(','),
      `# 说明: ${noteRow.join(',')}`,
    ];

    return rows.join('\n');
  }

  /**
   * 解析 CSV 数据
   */
  parseCsvData(csvContent: string): BatchImportProductItem[] {
    const lines = csvContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    if (lines.length < 2) {
      throw new BadRequestException('CSV 文件格式错误：至少需要表头和一行数据');
    }

    // 解析表头
    const headers = this.parseCsvLine(lines[0]);
    const headerMap = this.mapHeadersToKeys(headers);

    // 解析数据行
    const products: BatchImportProductItem[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      if (values.every(v => !v.trim())) continue; // 跳过空行

      const item: any = {};
      headers.forEach((header, index) => {
        const key = headerMap[header.trim()];
        if (key && values[index] !== undefined) {
          const value = values[index].trim();
          // 数字字段转换
          if (['price', 'stock', 'commissionRate', 'duration'].includes(key)) {
            item[key] = value ? parseFloat(value) : undefined;
          } else {
            item[key] = value || undefined;
          }
        }
      });

      if (item.name) {
        products.push(item as BatchImportProductItem);
      }
    }

    return products;
  }

  /**
   * 解析 CSV 行（处理逗号和引号）
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());

    return result;
  }

  /**
   * 映射表头到字段名
   */
  private mapHeadersToKeys(headers: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    
    for (const col of IMPORT_TEMPLATE_COLUMNS) {
      map[col.label] = col.key;
      map[col.key] = col.key; // 也支持英文表头
    }

    return map;
  }

  /**
   * 获取模板列定义（前端使用）
   */
  getTemplateColumns() {
    return IMPORT_TEMPLATE_COLUMNS;
  }
}
