/**
 * Skill Onboarding Service
 * 
 * 统一的技能入驻服务 - 支持五大用户画像的极简入驻流程
 * 发布后立即上架 Marketplace，支持 MCP/UCP/X402 协议检索和交易
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  Skill,
  SkillCategory,
  SkillLayer,
  SkillResourceType,
  SkillSource,
  SkillStatus,
  SkillPricingType,
  SkillValueType,
  SkillInputSchema,
  SkillOutputSchema,
  SkillExecutor,
} from '../../entities/skill.entity';
import { Product } from '../../entities/product.entity';
import { SkillConverterService } from './skill-converter.service';
import { ProductSkillConverterService } from './product-skill-converter.service';
import { SkillService } from './skill.service';

// ========== 画像1: API厂商 ==========
export interface ApiVendorOnboardingDto {
  type: 'api_vendor';
  apiDocumentUrl?: string;          // OpenAPI/Swagger URL
  curlExample?: string;             // cURL 示例
  apiKey?: string;                  // API Key (加密存储)
  apiName: string;                  // API 名称
  description: string;              // 简短描述
  pricingType?: SkillPricingType;   // 计费模式
  pricePerCall?: number;            // 每次调用价格
}

// ========== 画像2: 实物与服务商 ==========
export interface PhysicalServiceOnboardingDto {
  type: 'physical_service';
  shopifyUrl?: string;              // Shopify 店铺
  amazonUrl?: string;               // Amazon 店铺
  products?: Array<{                // 或直接上传商品
    name: string;
    description: string;
    price: number;
    currency: string;
    imageUrl?: string;
    sku?: string;
  }>;
  fulfillmentType: 'physical' | 'service' | 'digital';
}

// ========== 画像3: 行业专家/顾问 ==========
export interface ExpertConsultantOnboardingDto {
  type: 'expert_consultant';
  expertise: string;                // 专业领域 (如: 法律、审计)
  problemSolving: string;           // 能解决什么问题
  requiredInputs: string[];         // 需要用户提供什么信息/文件
  slaResponseTime?: number;         // SLA 响应时间 (分钟)
  slaAccuracyRate?: number;         // SLA 准确率 (%)
  outputFormat?: string;            // 输出格式 (PDF报告、JSON等)
  pricePerSession?: number;         // 每次咨询价格
}

// ========== 画像4: 专有数据持有方 ==========
export interface DataProviderOnboardingDto {
  type: 'data_provider';
  dataSourceUrl?: string;           // 数据源 URL (ReadOnly DB/API)
  dataFormat: 'csv' | 'excel' | 'json' | 'api' | 'database';
  dataSample?: any;                 // 数据样本
  privacyLevel: 'public' | 'sensitive' | 'encrypted';
  sensitiveFields?: string[];       // 敏感字段 (需要脱敏)
  pricePerQuery?: number;           // 每次查询价格
  pricePerRecord?: number;          // 每条记录价格
}

// ========== 画像5: 全能AI开发者 ==========
export interface AiDeveloperOnboardingDto {
  type: 'ai_developer';
  skillName: string;
  skillDescription: string;
  codeLanguage: 'python' | 'nodejs' | 'typescript';
  codeRepository?: string;          // GitHub/GitLab URL
  inputSchema: any;                 // JSON Schema
  outputSchema: any;                // JSON Schema
  dependentSkills?: string[];       // 依赖的其他 Skill ID
  visibility: 'private' | 'team' | 'public';
  pricePerExecution?: number;       // 每次执行价格
}

export type OnboardingDto = 
  | ApiVendorOnboardingDto 
  | PhysicalServiceOnboardingDto 
  | ExpertConsultantOnboardingDto 
  | DataProviderOnboardingDto 
  | AiDeveloperOnboardingDto;

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    private skillConverterService: SkillConverterService,
    private productSkillConverter: ProductSkillConverterService,
    private skillService: SkillService,
    private configService: ConfigService,
  ) {}

  /**
   * 统一入驻入口 - 根据用户画像自动路由到对应的处理流程
   */
  async onboardSkill(userId: string, data: OnboardingDto): Promise<Skill> {
    this.logger.log(`Onboarding new skill for user ${userId}, type: ${data.type}`);

    let skill: Skill;

    switch (data.type) {
      case 'api_vendor':
        skill = await this.onboardApiVendor(userId, data);
        break;
      case 'physical_service':
        skill = await this.onboardPhysicalService(userId, data);
        break;
      case 'expert_consultant':
        skill = await this.onboardExpertConsultant(userId, data);
        break;
      case 'data_provider':
        skill = await this.onboardDataProvider(userId, data);
        break;
      case 'ai_developer':
        skill = await this.onboardAiDeveloper(userId, data);
        break;
      default:
        throw new BadRequestException('Invalid onboarding type');
    }

    // 自动发布并启用所有协议
    return this.publishAndEnableProtocols(skill.id);
  }

  /**
   * 画像1: API厂商入驻
   */
  private async onboardApiVendor(userId: string, data: ApiVendorOnboardingDto): Promise<Skill> {
    const baseUrl = this.configService.get('API_BASE_URL', 'http://localhost:3001');

    // AI 自动解析 API 文档 (简化实现，实际应调用 OpenAPI Importer)
    const inputSchema: SkillInputSchema = {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'API endpoint path' },
        method: { type: 'string', description: 'HTTP method', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
        params: { type: 'object', description: 'Request parameters' },
      },
      required: ['endpoint'],
    };

    const skill = this.skillRepository.create({
      name: this.sanitizeName(data.apiName),
      displayName: data.apiName,
      description: data.description,
      layer: SkillLayer.LOGIC,
      category: SkillCategory.INTEGRATION,
      source: SkillSource.IMPORTED,
      valueType: SkillValueType.ACTION,
      authorId: userId,
      status: SkillStatus.DRAFT,
      inputSchema,
      outputSchema: {
        type: 'object',
        properties: {
          result: { type: 'any', description: 'API response' },
        },
      } as SkillOutputSchema,
      executor: {
        type: 'http',
        endpoint: data.apiDocumentUrl || `${baseUrl}/api/proxy`,
        method: 'POST',
      } as SkillExecutor,
      pricing: {
        type: data.pricingType || SkillPricingType.PER_CALL,
        pricePerCall: data.pricePerCall || 0.01,
        currency: 'USDC',
      },
      aiPriority: 'medium',
      metadata: {
        apiKey: data.apiKey,
        onboardingType: 'api_vendor',
      },
    } as any);

    const savedSkill = (await this.skillRepository.save(skill)) as any as Skill;
    return savedSkill;
  }

  /**
   * 画像2: 实物与服务商入驻
   */
  private async onboardPhysicalService(
    userId: string,
    data: PhysicalServiceOnboardingDto,
  ): Promise<Skill> {
    // 如果提供了 Shopify/Amazon URL，使用爬虫同步商品
    // 如果直接上传商品，创建 Product 记录
    
    if (data.products && data.products.length > 0) {
      // 创建第一个商品并转换为 Skill
      const product = this.productRepository.create({
        name: data.products[0].name,
        description: data.products[0].description,
        price: data.products[0].price,
        imageUrl: data.products[0].imageUrl,
        sku: data.products[0].sku,
        merchantId: userId,
        stock: 100, // 默认库存
        status: 'active' as any,
      } as any);

      const savedProduct = (await this.productRepository.save(product)) as any as Product;
      const actualProduct = savedProduct;

      // 自动转换为 Skill
      return this.productSkillConverter.convertProductToSkill(actualProduct.id, {
        autoSync: true,
        useLLMDescription: true,
      });
    }

    // 如果提供了店铺链接，创建占位 Skill，稍后同步商品
    const resourceType = 
      data.fulfillmentType === 'physical' ? SkillResourceType.PHYSICAL :
      data.fulfillmentType === 'service' ? SkillResourceType.SERVICE :
      SkillResourceType.DIGITAL;

    const skill = this.skillRepository.create({
      name: 'commerce_integration',
      displayName: 'E-commerce Integration',
      description: 'Integrated products from external marketplace',
      layer: SkillLayer.RESOURCE,
      category: SkillCategory.COMMERCE,
      source: SkillSource.IMPORTED,
      valueType: SkillValueType.DELIVERABLE,
      resourceType,
      authorId: userId,
      status: SkillStatus.DRAFT,
      inputSchema: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'Product ID' },
          quantity: { type: 'number', description: 'Quantity', default: 1 },
        },
        required: ['productId'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: 'Order ID' },
          status: { type: 'string', description: 'Order status' },
        },
      } as SkillOutputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'commerce',
      } as SkillExecutor,
      pricing: {
        type: SkillPricingType.REVENUE_SHARE,
        commissionRate: 2.2, // ARN V4.0 标准分佣
        currency: 'USD',
      },
      metadata: {
        shopifyUrl: data.shopifyUrl,
        amazonUrl: data.amazonUrl,
        onboardingType: 'physical_service',
      },
    } as any);

    const savedSkill = (await this.skillRepository.save(skill)) as any as Skill;
    return savedSkill;
  }

  /**
   * 画像3: 行业专家/顾问入驻
   */
  private async onboardExpertConsultant(
    userId: string,
    data: ExpertConsultantOnboardingDto,
  ): Promise<Skill> {
    const inputSchema: SkillInputSchema = {
      type: 'object',
      properties: {},
      required: [],
    };

    // 动态生成输入字段 (如果 UI 没提供，设置一个通用的咨询输入)
    const inputs = data.requiredInputs || ['咨询问题内容'];
    inputs.forEach((input) => {
      const fieldName = this.sanitizeName(input);
      inputSchema.properties[fieldName] = {
        type: 'string',
        description: input,
      };
      inputSchema.required.push(fieldName);
    });

    const skill = this.skillRepository.create({
      name: this.sanitizeName(data.expertise),
      displayName: `${data.expertise} Consultation`,
      description: data.problemSolving,
      layer: SkillLayer.LOGIC,
      category: SkillCategory.ANALYSIS,
      source: SkillSource.NATIVE,
      valueType: SkillValueType.DECISION,
      authorId: userId,
      status: SkillStatus.DRAFT,
      inputSchema,
      outputSchema: {
        type: 'object',
        properties: {
          report: { type: 'string', description: 'Consultation report' },
          recommendation: { type: 'string', description: 'Expert recommendation' },
          deliveryFormat: { type: 'string', description: data.outputFormat || 'PDF' },
        },
      } as SkillOutputSchema,
      executor: {
        type: 'internal',
        internalHandler: 'expert_consultation',
      } as SkillExecutor,
      pricing: {
        type: SkillPricingType.PER_CALL,
        pricePerCall: data.pricePerSession || 50,
        currency: 'USDC',
      },
      metadata: {
        sla: {
          responseTime: data.slaResponseTime || 60,
          accuracyRate: data.slaAccuracyRate || 95,
        },
        outputFormat: data.outputFormat,
        onboardingType: 'expert_consultant',
      },
      aiPriority: 'high',
    } as any);

    const savedSkill = (await this.skillRepository.save(skill)) as any as Skill;
    return savedSkill;
  }

  /**
   * 画像4: 专有数据持有方入驻
   */
  private async onboardDataProvider(
    userId: string,
    data: DataProviderOnboardingDto,
  ): Promise<Skill> {
    const baseUrl = this.configService.get('API_BASE_URL', 'http://localhost:3001');
    const skill = this.skillRepository.create({
      name: 'data_access_skill',
      displayName: 'Data Access Service',
      description: 'Access to proprietary dataset',
      layer: SkillLayer.INFRA,
      category: SkillCategory.DATA,
      source: SkillSource.NATIVE,
      valueType: SkillValueType.DATA,
      resourceType: SkillResourceType.DATA,
      authorId: userId,
      status: SkillStatus.DRAFT,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Query string' },
          filters: { type: 'object', description: 'Filter conditions' },
          limit: { type: 'number', description: 'Max records', default: 10 },
        },
        required: ['query'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          data: { type: 'array', description: 'Query results' },
          total: { type: 'number', description: 'Total count' },
        },
      } as SkillOutputSchema,
      executor: {
        type: 'http',
        endpoint: data.dataSourceUrl || `${baseUrl}/api/data-proxy`,
        method: 'GET',
      } as SkillExecutor,
      pricing: {
        type: SkillPricingType.PER_CALL,
        pricePerCall: data.pricePerQuery || 0.001,
        currency: 'USDC',
      },
      metadata: {
        dataConfig: {
          privacyLevel: data.privacyLevel,
          sensitiveFields: data.sensitiveFields || [],
          dataSourceUrl: data.dataSourceUrl,
        },
        onboardingType: 'data_provider',
      },
      aiPriority: 'medium',
    } as any);

    const savedSkill = (await this.skillRepository.save(skill)) as any as Skill;
    return savedSkill;
  }

  /**
   * 画像5: 全能AI开发者入驻
   */
  private async onboardAiDeveloper(
    userId: string,
    data: AiDeveloperOnboardingDto,
  ): Promise<Skill> {
    const skill = this.skillRepository.create({
      name: this.sanitizeName(data.skillName),
      displayName: data.skillName,
      description: data.skillDescription,
      layer: SkillLayer.COMPOSITE,
      category: SkillCategory.WORKFLOW,
      source: SkillSource.NATIVE,
      valueType: SkillValueType.ACTION,
      authorId: userId,
      status: SkillStatus.DRAFT,
      inputSchema: data.inputSchema || {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Universal input' }
        }
      },
      outputSchema: data.outputSchema || {
        type: 'object',
        properties: {
          output: { type: 'string', description: 'Universal output' }
        }
      },
      executor: {
        type: 'internal',
        internalHandler: 'custom_workflow',
      } as SkillExecutor,
      pricing: {
        type: SkillPricingType.PER_CALL,
        pricePerCall: data.pricePerExecution || 0.1,
        currency: 'USDC',
      },
      metadata: {
        compositeSkills: data.dependentSkills || [],
        visibility: data.visibility || 'public',
        codeRepository: data.codeRepository,
        codeLanguage: data.codeLanguage,
        onboardingType: 'ai_developer',
      },
      aiPriority: 'high',
    } as any);

    const savedSkill = (await this.skillRepository.save(skill)) as any as Skill;
    return savedSkill;
  }

  /**
   * 发布并启用所有协议 (MCP/UCP/X402)
   */
  private async publishAndEnableProtocols(skillId: string): Promise<Skill> {
    // 使用 SkillService 的 publish 方法，会自动启用 UCP 和 X402
    const skill = await this.skillService.publish(skillId);
    
    this.logger.log(`Skill ${skillId} published and enabled for MCP/UCP/X402`);
    return skill;
  }

  /**
   * 辅助方法: 清理名称 (移除特殊字符)
   */
  private sanitizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }
}
