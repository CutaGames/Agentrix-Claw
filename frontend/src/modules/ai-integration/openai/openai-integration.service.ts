import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import OpenAI from 'openai';
import { Product } from '../../../entities/product.entity';
import { Order } from '../../../entities/order.entity';
import { CapabilityRegistryService } from '../../ai-capability/services/capability-registry.service';
import { CapabilityExecutorService } from '../../ai-capability/services/capability-executor.service';
import { SearchService } from '../../search/search.service';
import { ProductService } from '../../product/product.service';
import { OrderService } from '../../order/order.service';
import { CartService } from '../../cart/cart.service';
import { LogisticsService } from '../../logistics/logistics.service';
import { PayIntentService } from '../../payment/pay-intent.service';
import { PayIntentType } from '../../../entities/pay-intent.entity';
import { OrderStatus } from '../../../entities/order.entity';

/**
 * OpenAI Function Calling 统一接口
 * 
 * 为 OpenAI (ChatGPT) 提供统一的 Function Schema，实现电商流程
 * 支持：
 * 1. 搜索商品 (search_agentrix_products)
 * 2. 加入购物车 (add_to_agentrix_cart)
 * 3. 查看购物车 (view_agentrix_cart)
 * 4. 结算购物车 (checkout_agentrix_cart)
 * 5. 购买商品 (buy_agentrix_product)
 * 6. 查询订单 (get_agentrix_order)
 * 7. 支付订单 (pay_agentrix_order)
 */
@Injectable()
export class OpenAIIntegrationService {
  private readonly logger = new Logger(OpenAIIntegrationService.name);
  private readonly openai: OpenAI | null;
  private readonly defaultModel = 'gpt-4o'; // 使用 GPT-4o 模型
  private readonly baseURL: string | undefined; // 自定义 API 基础 URL

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private capabilityRegistry: CapabilityRegistryService,
    private capabilityExecutor: CapabilityExecutorService,
    private searchService: SearchService,
    private productService: ProductService,
    @Inject(forwardRef(() => OrderService))
    private orderService: OrderService,
    @Inject(forwardRef(() => CartService))
    private cartService: CartService,
    @Inject(forwardRef(() => LogisticsService))
    private logisticsService: LogisticsService,
    @Inject(forwardRef(() => PayIntentService))
    private payIntentService: PayIntentService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.baseURL = this.configService.get<string>('OPENAI_BASE_URL');
    
    this.logger.log(`OpenAI config - API Key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET'}, BaseURL: ${this.baseURL || 'NOT SET'}`);
    
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not configured, OpenAI integration will be disabled');
      this.openai = null;
    } else {
      const config: { apiKey: string; baseURL?: string } = { apiKey };
      if (this.baseURL) {
        config.baseURL = this.baseURL.trim();
        this.logger.log(`OpenAI integration initialized with custom baseURL: ${config.baseURL}`);
      } else {
        this.logger.log('OpenAI integration initialized (using default OpenAI API)');
      }
      this.openai = new OpenAI(config);
    }
  }

  /**
   * 获取 OpenAI Function Calling 的 Function Schemas
   * 返回统一的 Function 列表，包括系统级能力和电商流程
   */
  async getFunctionSchemas(): Promise<any[]> {
    // 1. 获取系统级能力（电商流程等），只返回外部暴露的能力
    // 注意：如果指定 provider 没有注册，尝试获取所有 provider 的能力
    let systemSchemas = this.capabilityRegistry.getSystemCapabilitySchemas(['openai'], true);
    
    // 如果 openai provider 没有注册，尝试获取所有 provider 的能力
    if (!systemSchemas || systemSchemas.length === 0) {
      this.logger.warn('No OpenAI-specific schemas found, trying all providers');
      systemSchemas = this.capabilityRegistry.getSystemCapabilitySchemas([], true);
    }
    
    // 2. 转换为 OpenAI 格式
    const openaiFunctions = systemSchemas.map((schema) => {
      // FunctionSchema 可能是 OpenAIFunctionSchema, ClaudeToolSchema 或 GeminiFunctionSchema
      // OpenAI 需要 function 格式
      if ('input_schema' in schema) {
        // ClaudeToolSchema - 转换为 OpenAI 格式
        return {
          type: 'function',
          function: {
            name: schema.name,
            description: schema.description,
            parameters: schema.input_schema,
          },
        };
      } else {
        // OpenAIFunctionSchema 或 GeminiFunctionSchema
        return {
          type: 'function',
          function: {
            name: schema.name,
            description: schema.description,
            parameters: schema.parameters,
          },
        };
      }
    });

    // 3. 添加基础功能（向后兼容）
    const basicFunctions = [
      {
        type: 'function',
        function: {
          name: 'search_agentrix_products',
          description: '搜索 Agentrix Marketplace 中的商品。支持语义搜索、价格筛选、分类筛选等。',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '搜索查询（必需）' },
              category: { type: 'string', description: '商品分类（可选）' },
              priceMin: { type: 'number', description: '最低价格（可选）' },
              priceMax: { type: 'number', description: '最高价格（可选）' },
              currency: { type: 'string', description: '货币类型（可选，如 USD、CNY）' },
              inStock: { type: 'boolean', description: '是否仅显示有库存商品（可选）' },
            },
            required: ['query'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_to_agentrix_cart',
          description: '将商品加入购物车',
          parameters: {
            type: 'object',
            properties: {
              product_id: { type: 'string', description: '商品ID（必需）' },
              quantity: { type: 'number', description: '数量（可选，默认：1）', minimum: 1 },
            },
            required: ['product_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'view_agentrix_cart',
          description: '查看当前购物车内容',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'checkout_agentrix_cart',
          description: '结算购物车，创建订单',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'buy_agentrix_product',
          description: '购买 Agentrix Marketplace 中的商品。支持实物商品、服务、NFT等。',
          parameters: {
            type: 'object',
            properties: {
              product_id: { type: 'string', description: '商品ID（从搜索结果中获取）' },
              quantity: { type: 'number', description: '购买数量（默认：1）', minimum: 1 },
              shipping_address: { type: 'string', description: '收货地址（实物商品需要）' },
              appointment_time: { type: 'string', description: '预约时间（服务类商品需要，ISO 8601格式）' },
              contact_info: { type: 'string', description: '联系方式（服务类商品需要）' },
              wallet_address: { type: 'string', description: '接收NFT的钱包地址（NFT类商品需要）' },
              chain: { type: 'string', enum: ['ethereum', 'polygon', 'solana', 'bsc'], description: '区块链网络（NFT类商品需要）' },
            },
            required: ['product_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_agentrix_order',
          description: '查询 Agentrix 订单状态和详情',
          parameters: {
            type: 'object',
            properties: {
              order_id: { type: 'string', description: '订单ID' },
            },
            required: ['order_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'pay_agentrix_order',
          description: '支付订单',
          parameters: {
            type: 'object',
            properties: {
              order_id: { type: 'string', description: '订单ID（必需）' },
              payment_method: { type: 'string', description: '支付方式（可选，如 USDC、SOL、Visa、Apple Pay）' },
            },
            required: ['order_id'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'compare_agentrix_prices',
          description: '比价服务，比较不同平台或商品的价格',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '要比较的商品查询（可选）' },
            },
            required: [],
          },
        },
      },
    ];

    // 调试日志
    this.logger.log(`OpenAI Functions: systemSchemas=${systemSchemas.length}, basicFunctions=${basicFunctions.length}, total=${openaiFunctions.length + basicFunctions.length}`);

    return [...openaiFunctions, ...basicFunctions];
  }

  /**
   * 执行 Function Call
   */
  async executeFunctionCall(
    functionName: string,
    parameters: Record<string, any>,
    context: {
      userId?: string;
      sessionId?: string;
    },
  ): Promise<any> {
    this.logger.log(`执行 OpenAI Function: ${functionName}`, parameters);

    try {
      switch (functionName) {
        case 'search_agentrix_products':
          // 使用统一执行器
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

        case 'add_to_agentrix_cart':
          return await this.addToCart(
            parameters as {
              product_id: string;
              quantity?: number;
            },
            context,
          );

        case 'view_agentrix_cart':
          return await this.viewCart(context);

        case 'checkout_agentrix_cart':
          return await this.checkoutCart(context);

        case 'buy_agentrix_product':
          return await this.buyProduct(
            parameters as {
              product_id: string;
              quantity?: number;
              shipping_address?: string;
              appointment_time?: string;
              contact_info?: string;
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

        case 'pay_agentrix_order':
          return await this.payOrder(
            parameters as {
              order_id: string;
              payment_method?: string;
            },
            context,
          );

        case 'compare_agentrix_prices':
          // 使用统一执行器
          return await this.capabilityExecutor.execute(
            'executor_compare',
            parameters as { query?: string },
            {
              userId: context.userId,
              sessionId: context.sessionId,
              metadata: {
                lastSearchQuery: parameters.query,
              },
            },
          );

        default:
          throw new Error(`未知的 Function: ${functionName}`);
      }
    } catch (error: any) {
      this.logger.error(`执行 Function 失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 加入购物车
   */
  private async addToCart(
    params: { product_id: string; quantity?: number },
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    const { product_id, quantity = 1 } = params;
    const cartIdentifier = context.userId || context.sessionId;
    const isSessionId = !context.userId;

    if (!cartIdentifier) {
      throw new Error('无法识别用户身份');
    }

    const product = await this.productService.getProduct(product_id);
    if (!product) {
      throw new Error('商品不存在');
    }

    const cart = await this.cartService.addToCart(
      cartIdentifier,
      product_id,
      quantity,
      isSessionId,
    );

    return {
      success: true,
      message: `已将 ${product.name} 加入购物车`,
      data: {
        cart,
        product: {
          id: product.id,
          name: product.name,
          price: product.price,
        },
      },
    };
  }

  /**
   * 查看购物车
   */
  private async viewCart(context: { userId?: string; sessionId?: string }): Promise<any> {
    const cartIdentifier = context.userId || context.sessionId;
    const isSessionId = !context.userId;

    if (!cartIdentifier) {
      throw new Error('无法识别用户身份');
    }

    const cart = await this.cartService.getCartWithProducts(cartIdentifier, isSessionId);

    return {
      success: true,
      data: {
        cart,
        itemCount: cart.items?.length || 0,
        totalAmount: cart.items?.reduce((sum, item) => sum + (item.product?.price || 0) * item.quantity, 0) || 0,
      },
    };
  }

  /**
   * 结算购物车
   */
  private async checkoutCart(context: { userId?: string; sessionId?: string }): Promise<any> {
    const cartIdentifier = context.userId || context.sessionId;
    const isSessionId = !context.userId;

    if (!cartIdentifier) {
      throw new Error('无法识别用户身份');
    }

    if (!context.userId) {
      throw new Error('结算需要登录');
    }

    const cart = await this.cartService.getCartWithProducts(cartIdentifier, isSessionId);
    if (!cart.items || cart.items.length === 0) {
      throw new Error('购物车为空');
    }

    // 从购物车创建订单
    const orderItems = cart.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.product?.price || 0,
    }));

    const totalAmount = cart.items.reduce((sum, item) => 
      sum + (item.product?.price || 0) * item.quantity, 0
    );

    const order = await this.orderService.createOrder(context.userId, {
      merchantId: cart.items[0]?.product?.merchantId || '',
      productId: cart.items[0]?.productId || '',
      amount: totalAmount,
      currency: 'CNY',
      metadata: {
        items: orderItems,
        fromCart: true,
      },
    });

    return {
      success: true,
      message: '订单创建成功',
      data: {
        order,
        orderId: order.id,
      },
    };
  }

  /**
   * 购买商品
   */
  private async buyProduct(
    params: {
      product_id: string;
      quantity?: number;
      shipping_address?: string;
      appointment_time?: string;
      contact_info?: string;
      wallet_address?: string;
      chain?: string;
    },
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    const { product_id, quantity = 1, shipping_address, appointment_time, contact_info, wallet_address, chain } = params;

    if (!context.userId) {
      throw new Error('购买需要登录');
    }

    const product = await this.productService.getProduct(product_id);
    if (!product) {
      throw new Error('商品不存在');
    }

    // 创建订单
    const order = await this.orderService.createOrder(context.userId, {
      merchantId: product.merchantId,
      productId: product_id,
      amount: Number(product.price) * quantity,
      currency: (product.metadata as any)?.currency || 'CNY',
      metadata: {
        quantity,
        shippingAddress: shipping_address,
        appointmentTime: appointment_time,
        contactInfo: contact_info,
        walletAddress: wallet_address,
        chain,
      },
    });

    return {
      success: true,
      message: '订单创建成功',
      data: {
        order,
        orderId: order.id,
        product: {
          id: product.id,
          name: product.name,
          price: product.price,
        },
      },
    };
  }

  /**
   * 查询订单
   */
  private async getOrder(
    params: { order_id: string },
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    const { order_id } = params;

    if (!context.userId) {
      throw new Error('查询订单需要登录');
    }

    const order = await this.orderService.getOrder(context.userId, order_id);
    if (!order) {
      throw new Error('订单不存在');
    }

    return {
      success: true,
      data: {
        order,
        status: order.status,
        items: order.items || [],
        totalAmount: order.amount,
      },
    };
  }

  /**
   * 支付订单
   */
  private async payOrder(
    params: { order_id: string; payment_method?: string },
    context: { userId?: string; sessionId?: string },
  ): Promise<any> {
    const { order_id, payment_method = 'crypto' } = params;

    if (!context.userId) {
      throw new Error('支付需要登录');
    }

    const order = await this.orderService.getOrder(context.userId, order_id);
    if (!order) {
      throw new Error('订单不存在');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new Error(`订单状态为 ${order.status}，无法支付`);
    }

    // 创建支付意图
    const payIntent = await this.payIntentService.createPayIntent(context.userId, {
      orderId: order_id,
      amount: order.amount,
      currency: order.currency || 'CNY',
      type: PayIntentType.ORDER_PAYMENT,
      paymentMethod: {
        type: payment_method || 'crypto',
      },
      metadata: {
        paymentMethod: payment_method,
      } as any,
    });

    return {
      success: true,
      message: '支付意图创建成功',
      data: {
        payIntent,
        paymentId: payIntent.id,
        order,
      },
    };
  }

  /**
   * 调用 OpenAI API（带 Function Calling）
   * 支持用户提供自己的 API Key（用于 OpenAI 官网用户）
   */
  async chatWithFunctions(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      context?: { userId?: string; sessionId?: string };
      userApiKey?: string; // 用户提供的 API Key（可选）
      userBaseURL?: string; // 用户提供的 baseURL（可选，如果不提供则使用系统配置的）
    },
  ): Promise<any> {
    // 如果用户提供了 API Key，使用用户的；否则使用系统配置的
    let openai = this.openai;
    if (options?.userApiKey) {
      const config: { apiKey: string; baseURL?: string } = { apiKey: options.userApiKey };
      // 如果用户指定了 baseURL，使用用户的；否则默认使用 OpenAI 官方 baseURL
      if (options.userBaseURL) {
        config.baseURL = options.userBaseURL.trim();
        this.logger.log(`使用用户指定的 baseURL: ${options.userBaseURL}`);
      } else {
        // 用户提供 API Key 时，默认使用 OpenAI 官方 baseURL
        // 如果用户想用 API2D，需要明确指定 baseURL
        config.baseURL = 'https://api.openai.com/v1';
        this.logger.log('使用 OpenAI 官方 baseURL（用户提供 API Key）');
      }
      openai = new OpenAI(config);
    }

    if (!openai) {
      throw new Error('OpenAI API未配置，请设置OPENAI_API_KEY环境变量或提供userApiKey');
    }

    try {
      // 获取 Function Schemas
      const tools = await this.getFunctionSchemas();

      // 调用 OpenAI API
      // 注意：新版本 OpenAI API 使用 tools，旧版本使用 functions
      // 为了兼容性，我们使用 tools（推荐）
      const completion = await openai.chat.completions.create({
        model: options?.model || this.defaultModel,
        messages: messages.map((msg) => ({
          role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user',
          content: msg.content,
        })),
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 2048,
      });

      const message = completion.choices[0].message;
      const responseText = message.content || '';

      // 检查是否有 Function Call
      const toolCalls = message.tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        // 处理 Function Calls
        const toolResults = await Promise.all(
          toolCalls.map(async (toolCall) => {
            // 类型检查：确保 toolCall 有 function 属性
            if (toolCall.type !== 'function' || !('function' in toolCall)) {
              this.logger.warn(`工具调用类型不正确: ${toolCall.type}`);
              return {
                role: 'tool' as const,
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: false,
                  error: '不支持的工具调用类型',
                }),
              };
            }

            const functionName = toolCall.function.name;
            let parameters: Record<string, any> = {};
            
            try {
              parameters = JSON.parse(toolCall.function.arguments);
            } catch (error) {
              this.logger.warn(`解析 Function 参数失败: ${toolCall.function.arguments}`);
              parameters = {};
            }

            try {
              const result = await this.executeFunctionCall(
                functionName,
                parameters,
                options?.context || {},
              );
              return {
                role: 'tool' as const,
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              };
            } catch (error: any) {
              this.logger.error(`Function 执行失败: ${functionName}`, error);
              return {
                role: 'tool' as const,
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  success: false,
                  error: error.message,
                }),
              };
            }
          }),
        );

        // 将 Function 结果添加到消息中，继续对话
        const allMessages = [
          ...messages,
          message,
          ...toolResults,
        ];

        // 再次调用 OpenAI，获取最终响应
        const finalCompletion = await openai.chat.completions.create({
          model: options?.model || this.defaultModel,
          messages: allMessages,
          tools: tools.length > 0 ? tools : undefined,
          temperature: options?.temperature || 0.7,
          max_tokens: options?.maxTokens || 2048,
        });

        return {
          text: finalCompletion.choices[0].message.content || '',
          functionCalls: toolCalls
            .filter((call) => call.type === 'function' && 'function' in call)
            .map((call) => ({
              id: call.id,
              name: (call as any).function.name,
              arguments: (call as any).function.arguments,
            })),
        };
      }

      return {
        text: responseText,
        functionCalls: null,
      };
    } catch (error: any) {
      this.logger.error(`OpenAI API调用失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}

