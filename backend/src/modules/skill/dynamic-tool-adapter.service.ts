import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductType, ProductStatus } from '../../entities/product.entity';

/**
 * 动态工具适配器 (Dynamic Tool Adapter)
 * 
 * 核心功能：
 * 1. 将商户上传的 SKU 自动转化为 MCP/OpenAPI Tool Schema
 * 2. 支持普通商品（通用网关）和功能性商品（专属 Skill）两种模式
 * 3. 根据上下文动态返回相关工具，避免 Token 浪费
 */

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  metadata?: {
    productId: string;
    productType: ProductType;
    price: number;
    currency: string;
    billingMode?: 'one_time' | 'per_use' | 'metered';
    isX402Native?: boolean;
  };
}

export interface SkillConfig {
  inputSchema?: Record<string, any>;
  executionEndpoint?: string;
  billingMode?: 'one_time' | 'per_use' | 'metered';
  pricingUnit?: 'request' | 'token' | 'minute';
  unitPrice?: number;
}

@Injectable()
export class DynamicToolAdapter {
  private readonly logger = new Logger(DynamicToolAdapter.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  /**
   * 获取所有可用的动态工具
   * 用于 MCP tools/list 请求
   */
  async getAllDynamicTools(): Promise<ToolSchema[]> {
    const products = await this.productRepository.find({
      where: { status: ProductStatus.ACTIVE },
    });

    const tools: ToolSchema[] = [];

    for (const product of products) {
      const tool = this.productToTool(product);
      if (tool) {
        tools.push(tool);
      }
    }

    this.logger.log(`Generated ${tools.length} dynamic tools from ${products.length} products`);
    return tools;
  }

  /**
   * 根据搜索查询获取相关工具
   * 用于语义路由，只返回相关的工具定义
   */
  async getRelevantTools(query: string, limit: number = 5): Promise<ToolSchema[]> {
    // 简单的关键词匹配（后续可升级为向量检索）
    const products = await this.productRepository
      .createQueryBuilder('product')
      .where('product.status = :status', { status: ProductStatus.ACTIVE })
      .andWhere(
        '(LOWER(product.name) LIKE LOWER(:query) OR LOWER(product.description) LIKE LOWER(:query) OR LOWER(product.category) LIKE LOWER(:query))',
        { query: `%${query}%` },
      )
      .take(limit)
      .getMany();

    return products.map(p => this.productToTool(p)).filter((t): t is ToolSchema => t !== null);
  }

  /**
   * 获取 X402 原生工具（功能性 SKU）
   */
  async getX402NativeTools(): Promise<ToolSchema[]> {
    const products = await this.productRepository.find({
      where: [
        { status: ProductStatus.ACTIVE, productType: ProductType.X402_SKILL },
        { status: ProductStatus.ACTIVE, productType: ProductType.X402_METERED },
      ],
    });

    return products.map(p => this.productToTool(p)).filter((t): t is ToolSchema => t !== null);
  }

  /**
   * 将 Product 转换为 Tool Schema
   */
  private productToTool(product: Product): ToolSchema | null {
    try {
      const metadata = product.metadata || {};
      const skillConfig: SkillConfig = metadata.skillConfig || {};
      const isX402Native = [ProductType.X402_SKILL, ProductType.X402_METERED].includes(product.productType);

      // 生成工具名称（规范化）
      const toolName = this.generateToolName(product);

      // 生成工具描述
      const description = this.generateToolDescription(product);

      // 生成输入参数 Schema
      const inputSchema = this.generateInputSchema(product, skillConfig);

      return {
        name: toolName,
        description,
        inputSchema,
        metadata: {
          productId: product.id,
          productType: product.productType,
          price: Number(product.price),
          currency: metadata.currency || 'CNY',
          billingMode: skillConfig.billingMode || 'one_time',
          isX402Native,
        },
      };
    } catch (error: any) {
      this.logger.error(`Failed to convert product ${product.id} to tool: ${error.message}`);
      return null;
    }
  }

  /**
   * 生成规范化的工具名称
   */
  private generateToolName(product: Product): string {
    const isX402Native = [ProductType.X402_SKILL, ProductType.X402_METERED].includes(product.productType);
    
    // X402 原生产品使用专属前缀
    const prefix = isX402Native ? 'skill_' : 'buy_';
    
    // 将产品名称转换为 snake_case
    const normalizedName = product.name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')  // 保留中文字符
      .replace(/^_+|_+$/g, '')
      .substring(0, 30);

    return `${prefix}${normalizedName}_${product.id.substring(0, 8)}`;
  }

  /**
   * 生成工具描述（LLM 友好）
   */
  private generateToolDescription(product: Product): string {
    const metadata = product.metadata || {};
    const currency = metadata.currency || 'CNY';
    const isX402Native = [ProductType.X402_SKILL, ProductType.X402_METERED].includes(product.productType);

    let description = '';

    if (isX402Native) {
      // 功能性 SKU：强调其能力
      description = `调用此工具可以使用「${product.name}」服务。`;
      if (product.description) {
        description += ` ${product.description}`;
      }
      description += ` 费用: ${product.price} ${currency}`;
      
      const skillConfig: SkillConfig = metadata.skillConfig || {};
      if (skillConfig.billingMode === 'per_use') {
        description += '/次';
      } else if (skillConfig.billingMode === 'metered') {
        description += `/${skillConfig.pricingUnit || 'unit'}`;
      }
    } else {
      // 普通商品：强调购买
      description = `购买「${product.name}」。`;
      if (product.description) {
        description += ` ${product.description}`;
      }
      description += ` 价格: ${product.price} ${currency}`;
      
      if (product.stock > 0) {
        description += `，库存: ${product.stock}`;
      }
    }

    return description;
  }

  /**
   * 生成输入参数 Schema
   */
  private generateInputSchema(product: Product, skillConfig: SkillConfig): ToolSchema['inputSchema'] {
    const metadata = product.metadata || {};
    const isX402Native = [ProductType.X402_SKILL, ProductType.X402_METERED].includes(product.productType);

    // 如果有自定义的 inputSchema，使用它
    if (skillConfig.inputSchema && Object.keys(skillConfig.inputSchema).length > 0) {
      return {
        type: 'object',
        properties: skillConfig.inputSchema,
        required: Object.keys(skillConfig.inputSchema).filter(
          key => skillConfig.inputSchema![key].required
        ),
      };
    }

    // 默认 Schema
    const properties: Record<string, any> = {};
    const required: string[] = [];

    if (isX402Native) {
      // 功能性 SKU 的默认参数
      properties.input = {
        type: 'string',
        description: '输入内容或参数',
      };
      
      if (skillConfig.billingMode === 'metered') {
        properties.quantity = {
          type: 'number',
          description: `使用量（${skillConfig.pricingUnit || 'units'}）`,
          default: 1,
        };
      }
    } else {
      // 普通商品的默认参数
      properties.quantity = {
        type: 'number',
        description: '购买数量',
        default: 1,
      };

      // 实物商品需要收货地址
      if (product.productType === ProductType.PHYSICAL) {
        properties.shippingAddress = {
          type: 'object',
          description: '收货地址（实物商品必填）',
          properties: {
            name: { type: 'string', description: '收件人姓名' },
            phone: { type: 'string', description: '联系电话' },
            address: { type: 'string', description: '详细地址' },
            city: { type: 'string', description: '城市' },
            country: { type: 'string', description: '国家', default: 'China' },
          },
        };
      }

      // 商品规格（如果有）
      if (metadata.variants && Array.isArray(metadata.variants)) {
        properties.variant = {
          type: 'string',
          description: '商品规格',
          enum: metadata.variants,
        };
      }
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }

  /**
   * 执行动态工具调用
   * 根据工具类型分发到不同的处理逻辑
   */
  async executeTool(
    toolName: string,
    args: Record<string, any>,
    context: { userId?: string; sessionId?: string },
  ): Promise<{ success: boolean; data?: any; message?: string; error?: string }> {
    // 从工具名中提取 productId
    const productIdMatch = toolName.match(/_([a-f0-9-]+)$/);
    if (!productIdMatch) {
      return { success: false, error: 'INVALID_TOOL', message: '无效的工具名称' };
    }

    const productIdPrefix = productIdMatch[1];
    
    // 查找对应的产品
    const product = await this.productRepository
      .createQueryBuilder('product')
      .where('product.id LIKE :prefix', { prefix: `${productIdPrefix}%` })
      .andWhere('product.status = :status', { status: ProductStatus.ACTIVE })
      .getOne();

    if (!product) {
      return { success: false, error: 'PRODUCT_NOT_FOUND', message: '商品不存在或已下架' };
    }

    const isX402Native = [ProductType.X402_SKILL, ProductType.X402_METERED].includes(product.productType);

    if (isX402Native) {
      // X402 功能性商品：直接执行并计费
      return this.executeX402Skill(product, args, context);
    } else {
      // 普通商品：创建订单
      return this.createProductOrder(product, args, context);
    }
  }

  /**
   * 执行 X402 功能性技能
   */
  private async executeX402Skill(
    product: Product,
    args: Record<string, any>,
    context: { userId?: string },
  ): Promise<{ success: boolean; data?: any; message?: string; error?: string }> {
    const metadata = product.metadata || {};
    const skillConfig: SkillConfig = metadata.skillConfig || {};

    // TODO: 实际实现需要：
    // 1. 检查用户授权和额度
    // 2. 调用外部执行端点（如果有）
    // 3. 扣费并记录使用量

    return {
      success: true,
      data: {
        productId: product.id,
        productName: product.name,
        executionStatus: 'pending',
        billingInfo: {
          price: product.price,
          currency: metadata.currency || 'CNY',
          billingMode: skillConfig.billingMode,
        },
      },
      message: `技能「${product.name}」调用已提交。请先完成支付授权。`,
    };
  }

  /**
   * 创建普通商品订单
   * 返回结构化数据，由 MCP 层处理游客支付流程
   */
  private async createProductOrder(
    product: Product,
    args: Record<string, any>,
    context: { userId?: string },
  ): Promise<{ success: boolean; data?: any; message?: string; error?: string; requiresPayment?: boolean }> {
    const quantity = args.quantity || 1;
    const totalPrice = Number(product.price) * quantity;
    const metadata = product.metadata || {};
    const currency = metadata.currency || 'CNY';
    const isPhysical = product.productType === ProductType.PHYSICAL;

    return {
      success: true,
      requiresPayment: true,
      data: {
        productId: product.id,
        productName: product.name,
        productType: product.productType,
        quantity,
        unitPrice: Number(product.price),
        totalPrice,
        currency,
        requiresShipping: isPhysical,
        // 由 MCP 层的 GuestCheckoutService 处理支付流程
        nextAction: 'guest_checkout',
      },
      message: `已找到「${product.name}」，单价 ${product.price} ${currency}，数量 ${quantity}，总价 ${totalPrice} ${currency}。${isPhysical ? '（需要收货地址）' : ''}`,
    };
  }

  /**
   * 根据商品 ID 直接获取商品信息
   * 用于 quick_purchase 等工具
   */
  async getProductById(productId: string): Promise<Product | null> {
    return this.productRepository.findOne({
      where: { id: productId, status: ProductStatus.ACTIVE },
    });
  }

  /**
   * 根据名称模糊搜索商品
   */
  async searchProductsByName(name: string, limit: number = 5): Promise<Product[]> {
    return this.productRepository
      .createQueryBuilder('product')
      .where('product.status = :status', { status: ProductStatus.ACTIVE })
      .andWhere('LOWER(product.name) LIKE LOWER(:name)', { name: `%${name}%` })
      .take(limit)
      .getMany();
  }
}
