/**
 * Product to Skill Converter Service
 * 
 * V2.0: 将传统商品自动转换为 Skill，支持 LLM 描述生成和多平台 Schema 生成
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { 
  Skill, 
  SkillCategory, 
  SkillLayer, 
  SkillResourceType, 
  SkillSource, 
  SkillStatus,
  SkillPricingType,
  SkillInputSchema,
  SkillOutputSchema,
  SkillAuthor,
} from '../../entities/skill.entity';
import { Product } from '../../entities/product.entity';
import { 
  ProductSkillConversion, 
  ConversionStatus, 
  ConversionConfig 
} from '../../entities/product-skill-conversion.entity';
import { SkillConverterService } from './skill-converter.service';

// 商品类型到资源类型的映射
import { ProductType } from '../../entities/product.entity';

const PRODUCT_TYPE_TO_RESOURCE_TYPE: Record<string, SkillResourceType> = {
  [ProductType.PHYSICAL]: SkillResourceType.PHYSICAL,
  [ProductType.SERVICE]: SkillResourceType.SERVICE,
  [ProductType.NFT]: SkillResourceType.DIGITAL,
  [ProductType.FT]: SkillResourceType.DIGITAL,
  [ProductType.GAME_ASSET]: SkillResourceType.DIGITAL,
  [ProductType.RWA]: SkillResourceType.PHYSICAL,
  [ProductType.X402_SKILL]: SkillResourceType.DIGITAL,
  [ProductType.X402_METERED]: SkillResourceType.DIGITAL,
};

// 资源类型到分佣比例的映射 (基于 ARN V4.0)
const RESOURCE_TYPE_COMMISSION_RATES: Record<SkillResourceType, number> = {
  [SkillResourceType.PHYSICAL]: 2.2,
  [SkillResourceType.SERVICE]: 3.7,
  [SkillResourceType.DIGITAL]: 2.2,
  [SkillResourceType.DATA]: 2.2,
  [SkillResourceType.LOGIC]: 20,
};

@Injectable()
export class ProductSkillConverterService {
  private readonly logger = new Logger(ProductSkillConverterService.name);

  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(ProductSkillConversion)
    private conversionRepository: Repository<ProductSkillConversion>,
    private skillConverterService: SkillConverterService,
  ) {}

  /**
   * 将商品转换为 Skill
   */
  async convertProductToSkill(
    productId: string, 
    config?: Partial<ConversionConfig>
  ): Promise<Skill> {
    const product = await this.productRepository.findOne({ 
      where: { id: productId },
      relations: ['merchant'],
    });
    
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    // 检查是否已有转换记录
    let conversion = await this.conversionRepository.findOne({
      where: { productId },
      relations: ['skill'],
    });

    const conversionConfig: ConversionConfig = {
      autoSync: true,
      useLLMDescription: true,
      ...config,
    };

    try {
      // 生成 Skill 数据
      const skillData = await this.generateSkillFromProduct(product, conversionConfig);

      let skill: Skill;

      if (conversion?.skill) {
        // 更新现有 Skill
        await this.skillRepository.update(conversion.skill.id, skillData);
        skill = await this.skillRepository.findOne({ where: { id: conversion.skill.id } });
      } else {
        // 创建新 Skill
        skill = this.skillRepository.create(skillData);
        skill = await this.skillRepository.save(skill);
      }

      // 更新或创建转换记录
      if (conversion) {
        conversion.skillId = skill.id;
        conversion.status = ConversionStatus.COMPLETED;
        conversion.conversionConfig = conversionConfig;
        conversion.generatedDescription = skillData.description;
        conversion.generatedInputSchema = skillData.inputSchema;
        conversion.generatedOutputSchema = skillData.outputSchema;
        conversion.lastConvertedAt = new Date();
        conversion.productLastUpdatedAt = product.updatedAt;
        conversion.conversionError = null;
      } else {
        conversion = this.conversionRepository.create({
          productId,
          skillId: skill.id,
          status: ConversionStatus.COMPLETED,
          conversionConfig,
          generatedDescription: skillData.description,
          generatedInputSchema: skillData.inputSchema,
          generatedOutputSchema: skillData.outputSchema,
          lastConvertedAt: new Date(),
          productLastUpdatedAt: product.updatedAt,
        });
      }

      await this.conversionRepository.save(conversion);

      this.logger.log(`Successfully converted product ${productId} to skill ${skill.id}`);
      return skill;

    } catch (error) {
      // 记录转换错误
      if (conversion) {
        conversion.status = ConversionStatus.FAILED;
        conversion.conversionError = error.message;
        await this.conversionRepository.save(conversion);
      } else {
        await this.conversionRepository.save({
          productId,
          status: ConversionStatus.FAILED,
          conversionConfig,
          conversionError: error.message,
        });
      }

      this.logger.error(`Failed to convert product ${productId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * 从商品生成 Skill 数据
   */
  private async generateSkillFromProduct(
    product: Product, 
    config: ConversionConfig
  ): Promise<Partial<Skill>> {
    const resourceType = this.getResourceType(product);
    const description = config.useLLMDescription 
      ? await this.generateLLMDescription(product)
      : this.generateBasicDescription(product);

    const inputSchema = this.generateInputSchema(product, config);
    const outputSchema = this.generateOutputSchema(product);

    const authorInfo: SkillAuthor = {
      id: product.merchantId || 'unknown',
      name: (product as any).merchant?.name || 'Unknown Merchant',
      type: 'merchant',
    };

    const skillData: Partial<Skill> = {
      name: this.generateSkillName(product),
      displayName: product.name,
      description,
      version: '1.0.0',
      category: SkillCategory.COMMERCE,
      layer: SkillLayer.RESOURCE,
      resourceType,
      source: SkillSource.CONVERTED,
      status: config.autoPublish ? SkillStatus.PUBLISHED : SkillStatus.DRAFT,
      inputSchema,
      outputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'unified_product_purchase',
      },
      pricing: {
        type: SkillPricingType.REVENUE_SHARE,
        pricePerCall: product.price || 0,
        commissionRate: config.commissionRateOverride || RESOURCE_TYPE_COMMISSION_RATES[resourceType],
        currency: 'USD',
      },
      tags: this.generateTags(product),
      humanAccessible: true,
      compatibleAgents: ['all'],
      permissions: ['read', 'payment'],
      authorInfo,
      productId: product.id,
      // 从产品元数据中获取图片
      imageUrl: this.extractImageUrl(product),
      thumbnailUrl: this.extractImageUrl(product),
      metadata: {
        originalProduct: {
          id: product.id,
          productType: product.productType,
          price: product.price,
          currency: 'USD',
        },
        // 将产品图片复制到 skill metadata
        image: this.extractImageUrl(product),
        images: this.extractImages(product),
      },
    };

    // 生成多平台 Schema
    const tempSkill = { ...skillData } as Skill;
    skillData.platformSchemas = {
      openai: this.skillConverterService.convertToOpenAI(tempSkill),
      claude: this.skillConverterService.convertToClaude(tempSkill),
      gemini: this.skillConverterService.convertToGemini(tempSkill),
    };

    return skillData;
  }

  /**
   * 生成 Skill 名称 (snake_case)
   */
  private generateSkillName(product: Product): string {
    const baseName = product.name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 50);
    
    return `purchase_${baseName}`;
  }

  /**
   * 获取资源类型
   */
  private getResourceType(product: Product): SkillResourceType {
    return PRODUCT_TYPE_TO_RESOURCE_TYPE[product.productType] || SkillResourceType.PHYSICAL;
  }

  /**
   * 生成基础描述
   */
  private generateBasicDescription(product: Product): string {
    const priceStr = product.price ? `${product.price} USD` : '价格面议';
    return `购买 ${product.name}。价格: ${priceStr}。${product.description || ''}`.trim();
  }

  /**
   * 使用 LLM 生成描述 (简化版，实际应调用 LLM API)
   */
  private async generateLLMDescription(product: Product): Promise<string> {
    // TODO: 集成实际的 LLM API (如 OpenAI, Claude)
    // 当前使用模板生成
    const specs = product.metadata?.specs 
      ? Object.entries(product.metadata.specs)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')
      : '';

    const priceStr = product.price ? `${product.price} USD` : '价格面议';
    
    let description = `购买 ${product.name}`;
    
    if (specs) {
      description += `，规格: ${specs}`;
    }
    
    description += `。价格: ${priceStr}`;
    
    if (product.description) {
      description += `。${product.description}`;
    }

    return description.substring(0, 500);
  }

  /**
   * 生成输入 Schema
   */
  private generateInputSchema(product: Product, config: ConversionConfig): SkillInputSchema {
    const properties: SkillInputSchema['properties'] = {
      quantity: {
        type: 'number',
        description: '购买数量',
        default: 1,
        minimum: 1,
      },
    };

    // 实物商品需要收货地址
    if (product.productType === ProductType.PHYSICAL || product.productType === ProductType.RWA) {
      properties.shippingAddress = {
        type: 'string',
        description: '收货地址',
      };
      properties.recipientName = {
        type: 'string',
        description: '收件人姓名',
      };
      properties.recipientPhone = {
        type: 'string',
        description: '收件人电话',
      };
    }

    // 服务类商品可能需要预约时间
    if (product.productType === ProductType.SERVICE) {
      properties.appointmentTime = {
        type: 'string',
        description: '预约时间 (ISO 8601 格式)',
      };
      properties.serviceNotes = {
        type: 'string',
        description: '服务备注',
      };
    }

    // 添加自定义字段
    if (config.customInputFields) {
      for (const field of config.customInputFields) {
        properties[field.name] = {
          type: field.type,
          description: field.description,
        };
      }
    }

    const required: string[] = ['quantity'];
    
    if (product.productType === ProductType.PHYSICAL || product.productType === ProductType.RWA) {
      required.push('shippingAddress', 'recipientName', 'recipientPhone');
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  /**
   * 生成输出 Schema
   */
  private generateOutputSchema(product: Product): SkillOutputSchema {
    return {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: '是否成功' },
        orderId: { type: 'string', description: '订单 ID' },
        totalPrice: { type: 'number', description: '总价' },
        currency: { type: 'string', description: '货币' },
        paymentUrl: { type: 'string', description: '支付链接' },
        estimatedDelivery: { type: 'string', description: '预计送达时间' },
        message: { type: 'string', description: '提示信息' },
      },
    };
  }

  /**
   * 生成标签
   */
  private generateTags(product: Product): string[] {
    const tags: string[] = [product.productType, 'commerce', 'purchase'];
    
    if (product.category) {
      tags.push(product.category);
    }
    
    if (product.metadata?.tags) {
      tags.push(...product.metadata.tags);
    }

    return [...new Set(tags)];
  }

  /**
   * 批量转换商品
   */
  async batchConvertProducts(
    productIds: string[], 
    config?: Partial<ConversionConfig>
  ): Promise<{ success: string[]; failed: Array<{ id: string; error: string }> }> {
    const success: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const productId of productIds) {
      try {
        await this.convertProductToSkill(productId, config);
        success.push(productId);
      } catch (error) {
        failed.push({ id: productId, error: error.message });
      }
    }

    return { success, failed };
  }

  /**
   * 同步所有需要更新的转换
   */
  async syncOutdatedConversions(): Promise<number> {
    // 找出商品更新时间晚于转换时间的记录
    const outdated = await this.conversionRepository
      .createQueryBuilder('conversion')
      .innerJoin('products', 'product', 'product.id = conversion.product_id')
      .where('product.updated_at > conversion.product_last_updated_at')
      .andWhere('conversion.conversion_config->>\'autoSync\' = \'true\'')
      .getMany();

    let count = 0;
    for (const conversion of outdated) {
      try {
        await this.convertProductToSkill(conversion.productId, conversion.conversionConfig);
        count++;
      } catch (error) {
        this.logger.error(`Failed to sync conversion for product ${conversion.productId}: ${error.message}`);
      }
    }

    return count;
  }

  /**
   * 获取商品的 Skill
   */
  async getSkillByProductId(productId: string): Promise<Skill | null> {
    const conversion = await this.conversionRepository.findOne({
      where: { productId, status: ConversionStatus.COMPLETED },
      relations: ['skill'],
    });

    return conversion?.skill || null;
  }

  /**
   * 删除商品的 Skill 转换
   */
  async removeConversion(productId: string): Promise<void> {
    const conversion = await this.conversionRepository.findOne({
      where: { productId },
    });

    if (conversion) {
      if (conversion.skillId) {
        await this.skillRepository.delete(conversion.skillId);
      }
      await this.conversionRepository.delete(conversion.id);
    }
  }

  /**
   * 从产品中提取主图片 URL
   */
  private extractImageUrl(product: Product): string | undefined {
    // 优先从 metadata.image 获取
    if (product.metadata?.image) {
      return product.metadata.image as string;
    }
    // 其次从 metadata.images 数组获取第一张
    if (product.metadata?.images && Array.isArray(product.metadata.images) && product.metadata.images.length > 0) {
      return product.metadata.images[0] as string;
    }
    // 从 metadata.core.media.images 获取（电商同步的产品）
    if (product.metadata?.core?.media?.images && Array.isArray(product.metadata.core.media.images) && product.metadata.core.media.images.length > 0) {
      return product.metadata.core.media.images[0] as string;
    }
    return undefined;
  }

  /**
   * 从产品中提取所有图片 URLs
   */
  private extractImages(product: Product): string[] {
    const images: string[] = [];
    
    // 从 metadata.images 获取
    if (product.metadata?.images && Array.isArray(product.metadata.images)) {
      images.push(...(product.metadata.images as string[]));
    }
    // 从 metadata.core.media.images 获取
    if (product.metadata?.core?.media?.images && Array.isArray(product.metadata.core.media.images)) {
      images.push(...(product.metadata.core.media.images as string[]));
    }
    // 如果只有单个 image
    if (product.metadata?.image && !images.includes(product.metadata.image as string)) {
      images.unshift(product.metadata.image as string);
    }
    
    return images;
  }
}
