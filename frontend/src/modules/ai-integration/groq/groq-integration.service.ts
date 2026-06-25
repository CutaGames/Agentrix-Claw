import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { CapabilityExecutorService } from '../../ai-capability/services/capability-executor.service';
import { CapabilityRegistryService } from '../../ai-capability/services/capability-registry.service';
import { GroqAdapter } from '../../ai-capability/adapters/groq.adapter';
import { Product, ProductStatus } from '../../../entities/product.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/**
 * Groq集成服务
 * 
 * 注意：Groq的主要定位是底座大模型（通过IFoundationLLM接口），为Foundation Models提供AI能力。
 * 
 * 此服务作为AI平台集成（可选），类似ChatGPT集成，提供Function Calling能力。
 * 如果不需要Groq作为AI平台，可以忽略此服务。
 * 
 * Groq API兼容OpenAI格式，支持Function Calling
 * 推荐模型：llama-3-groq-70b-tool-use, llama-3-groq-8b-tool-use
 */
@Injectable()
export class GroqIntegrationService {
  private readonly logger = new Logger(GroqIntegrationService.name);
  private readonly groq: Groq;
  private readonly defaultModel = 'llama-3-groq-70b-tool-use'; // 支持Function Calling的模型

  constructor(
    private readonly configService: ConfigService,
    private readonly capabilityExecutor: CapabilityExecutorService,
    private readonly capabilityRegistry: CapabilityRegistryService,
    private readonly groqAdapter: GroqAdapter,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      this.logger.warn('GROQ_API_KEY not configured, Groq integration will be disabled');
    } else {
      this.groq = new Groq({
        apiKey,
      });
      this.logger.log('Groq integration initialized');
    }
  }

  /**
   * 获取Function Schemas
   * 返回所有产品的Function定义和系统级能力，供Groq调用
   * 
   * 注意：此方法用于Groq作为AI平台集成时使用。
   * Groq的主要定位是底座大模型（通过IFoundationLLM接口）。
   */
  async getFunctionSchemas(): Promise<any[]> {
    try {
      // 1. 获取系统级能力（只返回外部暴露的能力）
      const systemSchemas = this.capabilityRegistry.getSystemCapabilitySchemas(['groq'], true);

      // 2. 获取所有激活的产品
      const products = await this.productRepository.find({
        where: { status: ProductStatus.ACTIVE },
        take: 100, // 限制数量，避免过多
      });

      // 3. 转换为Function Schemas
      const productFunctions = this.groqAdapter.convertProductsToFunctions(products, 'purchase');

      // 4. 添加基础Functions（向后兼容，如果CapabilityRegistry没有注册）
      const basicFunctions = [
        {
          type: 'function',
          function: {
            name: 'search_agentrix_products',
            description: '搜索Agentrix Marketplace中的商品。支持实物商品、服务、NFT、代币、插件等。',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: '搜索关键词或商品名称',
                },
                category: {
                  type: 'string',
                  enum: ['physical', 'service', 'nft', 'ft', 'plugin', 'subscription'],
                  description: '商品类别筛选',
                },
                priceMin: {
                  type: 'number',
                  description: '最低价格',
                },
                priceMax: {
                  type: 'number',
                  description: '最高价格',
                },
                currency: {
                  type: 'string',
                  description: '货币代码（ISO 4217）',
                },
                inStock: {
                  type: 'boolean',
                  description: '是否仅显示有库存的商品',
                },
              },
              required: ['query'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'buy_agentrix_product',
            description: '购买Agentrix Marketplace中的商品',
            parameters: {
              type: 'object',
              properties: {
                product_id: {
                  type: 'string',
                  description: '商品ID',
                },
                quantity: {
                  type: 'number',
                  description: '购买数量',
                  minimum: 1,
                },
                shipping_address: {
                  type: 'string',
                  description: '收货地址（实物商品需要）',
                },
                wallet_address: {
                  type: 'string',
                  description: '接收NFT/代币的钱包地址（链上资产需要）',
                },
                chain: {
                  type: 'string',
                  enum: ['ethereum', 'polygon', 'solana', 'bsc'],
                  description: '区块链网络（链上资产需要）',
                },
              },
              required: ['product_id'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'get_agentrix_order',
            description: '查询Agentrix订单状态',
            parameters: {
              type: 'object',
              properties: {
                order_id: {
                  type: 'string',
                  description: '订单ID',
                },
              },
              required: ['order_id'],
            },
          },
        },
      ];

      // 合并系统能力和基础功能
      return [...systemSchemas, ...basicFunctions];
    } catch (error: any) {
      this.logger.error(`获取Function Schemas失败: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 执行Function Call
   */
  async executeFunctionCall(
    functionName: string,
    parameters: Record<string, any>,
    context: {
      userId?: string;
      sessionId?: string;
    },
  ): Promise<any> {
    this.logger.log(`执行Groq Function: ${functionName}`, parameters);

    try {
      switch (functionName) {
        case 'search_agentrix_products':
          return await this.capabilityExecutor.execute(
            'executor_search',
            parameters as {
              query: string;
              category?: string;
              priceMin?: number;
              priceMax?: number;
              currency?: string;
              inStock?: boolean;
            },
            {
              userId: context.userId,
              sessionId: context.sessionId,
            },
          );

        case 'buy_agentrix_product':
          return await this.buyProduct(
            parameters as {
              product_id: string;
              quantity?: number;
              shipping_address?: string;
              wallet_address?: string;
              chain?: string;
            },
            context,
          );

        case 'get_agentrix_order':
          return await this.getOrder(
            parameters as { order_id: string },
            context,
          );

        default:
          // 处理产品特定的Function（如agentrix_purchase_physical_xxx）
          if (functionName.startsWith('agentrix_')) {
            return await this.handleProductFunction(functionName, parameters, context);
          }

          return {
            success: false,
            error: 'UNKNOWN_FUNCTION',
            message: `未知的Function: ${functionName}`,
          };
      }
    } catch (error: any) {
      this.logger.error(`执行Function失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * 购买商品
   */
  private async buyProduct(
    params: {
      product_id: string;
      quantity?: number;
      shipping_address?: string;
      wallet_address?: string;
      chain?: string;
    },
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    return await this.capabilityExecutor.execute(
      'executor_buy',
      params,
      {
        userId: context.userId,
        sessionId: context.sessionId,
      },
    );
  }

  /**
   * 查询订单
   */
  private async getOrder(
    params: { order_id: string },
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    // TODO: 实现订单查询逻辑
    return {
      success: true,
      message: '订单查询功能待实现',
      orderId: params.order_id,
    };
  }

  /**
   * 处理产品特定的Function
   */
  private async handleProductFunction(
    functionName: string,
    parameters: Record<string, any>,
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    // 解析Function名称：agentrix_{capability}_{type}_{id}
    const parts = functionName.split('_');
    if (parts.length < 3) {
      return {
        success: false,
        error: 'INVALID_FUNCTION_NAME',
        message: `无效的Function名称: ${functionName}`,
      };
    }

    const capabilityType = parts[1]; // purchase, book, mint等
    const productId = parameters.product_id;

    if (!productId) {
      return {
        success: false,
        error: 'MISSING_PRODUCT_ID',
        message: '缺少product_id参数',
      };
    }

    // 根据能力类型调用相应的执行器
    switch (capabilityType) {
      case 'purchase':
        return await this.capabilityExecutor.execute('executor_buy', parameters, context);
      case 'book':
        return await this.capabilityExecutor.execute('executor_book', parameters, context);
      case 'mint':
        return await this.capabilityExecutor.execute('executor_mint', parameters, context);
      default:
        return {
          success: false,
          error: 'UNSUPPORTED_CAPABILITY',
          message: `不支持的能力类型: ${capabilityType}`,
        };
    }
  }

  /**
   * 调用Groq API（带Function Calling）
   */
  async chatWithFunctions(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<any> {
    if (!this.groq) {
      throw new Error('Groq API未配置，请设置GROQ_API_KEY环境变量');
    }

    try {
      // 获取Function Schemas
      const functions = await this.getFunctionSchemas();

      // 调用Groq API
      const response = await this.groq.chat.completions.create({
        model: options?.model || this.defaultModel,
        messages: messages as any,
        tools: functions.length > 0 ? functions : undefined,
        tool_choice: functions.length > 0 ? 'auto' : undefined,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 1024,
      });

      return response;
    } catch (error: any) {
      this.logger.error(`Groq API调用失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}

