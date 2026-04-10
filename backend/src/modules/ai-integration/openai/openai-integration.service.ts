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
      const config: { apiKey: string; baseURL?: string; httpAgent?: any } = { apiKey };
      if (this.baseURL) {
        config.baseURL = this.baseURL.trim();
        this.logger.log(`OpenAI integration initialized with custom baseURL: ${config.baseURL}`);
      } else {
        this.logger.log('OpenAI integration initialized (using default OpenAI API)');
      }

      // Check and configure proxy
      const proxyUrl = this.configService.get<string>('HTTPS_PROXY') || this.configService.get<string>('HTTP_PROXY');
      if (proxyUrl) {
        this.logger.log(`OpenAI configuring with proxy: ${proxyUrl}`);
        try {
          const { HttpsProxyAgent } = require('https-proxy-agent');
          config.httpAgent = new HttpsProxyAgent(proxyUrl);
        } catch (e) {
          this.logger.warn('https-proxy-agent not found, OpenAI proxy configuration skipped');
        }
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
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: any }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      maxToolRounds?: number;
      context?: { userId?: string; sessionId?: string };
      userApiKey?: string; // 用户提供的 API Key（可选）
      userBaseURL?: string; // 用户提供的 baseURL（可选，如果不提供则使用系统配置的）
      additionalTools?: any[]; // 额外的工具定义 (OpenAI 格式: { type: 'function', function: { ... } })
      onToolCall?: (functionName: string, parameters: any) => Promise<any>; // 自定义工具执行回调
      onChunk?: (text: string) => void; // 流式输出回调
    },
  ): Promise<any> {
    // 如果用户提供了 API Key，使用用户的；否则使用系统配置的
    let openai = this.openai;
    if (options?.userApiKey) {
      const config: any = { apiKey: options.userApiKey };
      // 如果用户指定了 baseURL，使用用户的；否则默认使用 OpenAI 官方 baseURL
      if (options.userBaseURL) {
        config.baseURL = options.userBaseURL.trim();
        this.logger.log(`使用用户指定的 baseURL: ${options.userBaseURL}`);
        // GitHub Copilot API requires Editor-Version headers
        if (options.userBaseURL.includes('githubcopilot.com')) {
          config.defaultHeaders = {
            'Editor-Version': 'vscode/1.100.0',
            'Editor-Plugin-Version': 'copilot/1.300.0',
            'Copilot-Integration-Id': 'vscode-chat',
          };
        }
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
      // 获取基础 Function Schemas 并合并额外的工具
      const baseTools = await this.getFunctionSchemas();
      const tools = options?.additionalTools 
        ? [...baseTools, ...options.additionalTools]
        : baseTools;

      // 调用 OpenAI API
      // 注意：新版本 OpenAI API 使用 tools，旧版本使用 functions
      // 为了兼容性，我们使用 tools（推荐）
      // GPT-5.4 and GPT-5.4-mini require the /responses API endpoint
      const modelName = options?.model || this.defaultModel;
      const useResponsesApi = modelName.includes('gpt-5.4');

      if (useResponsesApi) {
        return await this.chatWithResponsesApi(openai, messages, tools, options);
      }

      let completion = await this.streamOrComplete(openai, {
        model: options?.model || this.defaultModel,
        messages: messages.map((msg) => ({
          role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user',
          content: msg.content,
        })),
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 2048,
      }, options?.onChunk);

      // Multi-turn agent loop: keep calling LLM while it returns tool calls
      const maxToolRounds = options?.maxToolRounds ?? 5;
      let allToolCalls: any[] = [];
      let currentMessages = [...messages.map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' as const : msg.role === 'system' ? 'system' as const : 'user' as const,
        content: msg.content,
      }))];
      let message = completion.choices[0].message;
      let responseText = message.content || '';
      let lastStopReason = completion.choices[0]?.finish_reason === 'length'
        ? 'max_tokens'
        : (message.tool_calls?.length ? 'tool_use' : 'end_turn');

      for (let round = 0; round <= maxToolRounds; round++) {
        const toolCalls = message.tool_calls;
        lastStopReason = completion.choices[0]?.finish_reason === 'length'
          ? 'max_tokens'
          : (toolCalls?.length ? 'tool_use' : 'end_turn');
        if (!toolCalls || toolCalls.length === 0) {
          return {
            text: responseText,
            functionCalls: allToolCalls.length > 0 ? allToolCalls : null,
            stopReason: lastStopReason,
          };
        }

        if (round === maxToolRounds) {
          this.logger.warn(`OpenAI agent loop: max ${maxToolRounds} tool rounds reached`);
          return { text: responseText, functionCalls: allToolCalls, stopReason: lastStopReason };
        }

        this.logger.log(`OpenAI round ${round + 1}: ${toolCalls.length} tool call(s): ${toolCalls.map(tc => tc.type === 'function' ? tc.function.name : tc.type).join(', ')}`);

        // Execute tool calls in parallel
        const toolResults = await Promise.all(
          toolCalls.map(async (toolCall) => {
            if (toolCall.type !== 'function' || !('function' in toolCall)) {
              return {
                role: 'tool' as const,
                tool_call_id: toolCall.id,
                content: JSON.stringify({ success: false, error: 'unsupported tool call type' }),
              };
            }

            const functionName = toolCall.function.name;
            let parameters: Record<string, any> = {};
            try {
              parameters = JSON.parse(toolCall.function.arguments);
            } catch {
              parameters = {};
            }

            try {
              let result: any;
              if (options?.onToolCall) {
                try {
                  const customResult = await options.onToolCall(functionName, parameters);
                  if (customResult !== undefined) result = customResult;
                } catch (e) {
                  this.logger.warn(`Custom tool execution failed for ${functionName}, falling back.`);
                }
              }
              if (result === undefined) {
                result = await this.executeFunctionCall(functionName, parameters, options?.context || {});
              }
              return { role: 'tool' as const, tool_call_id: toolCall.id, content: JSON.stringify(result) };
            } catch (error: any) {
              return { role: 'tool' as const, tool_call_id: toolCall.id, content: JSON.stringify({ success: false, error: error.message }) };
            }
          }),
        );

        allToolCalls.push(...toolCalls
          .filter((call) => call.type === 'function' && 'function' in call)
          .map((call) => ({
            id: call.id,
            name: (call as any).function.name,
            arguments: (call as any).function.arguments,
          })));

        // Build messages for next round
        currentMessages = [...currentMessages, message as any, ...toolResults];

        const nextCompletion = await this.streamOrComplete(openai, {
          model: options?.model || this.defaultModel,
          messages: currentMessages,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
          temperature: options?.temperature || 0.7,
          max_tokens: options?.maxTokens || 2048,
        }, options?.onChunk);

        message = nextCompletion.choices[0].message;
        responseText = message.content || '';
        completion = nextCompletion;
      }

      return {
        text: responseText,
        functionCalls: allToolCalls.length > 0 ? allToolCalls : null,
        stopReason: lastStopReason,
      };
    } catch (error: any) {
      this.logger.error(`OpenAI API调用失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Helper: stream or complete an OpenAI chat call.
   * When onChunk is provided, uses streaming and reassembles the response.
   * Returns a completion-shaped object with choices[0].message.
   */
  private async streamOrComplete(
    openai: any,
    params: Record<string, any>,
    onChunk?: (text: string) => void,
  ): Promise<any> {
    if (!onChunk) {
      return openai.chat.completions.create(params);
    }

    // Streaming mode
    const stream = await openai.chat.completions.create({ ...params, stream: true });
    let content = '';
    const toolCallsMap: Record<number, { id: string; type: string; function: { name: string; arguments: string } }> = {};

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      // Text content
      if (delta.content) {
        content += delta.content;
        onChunk(delta.content);
      }

      // Tool calls (streamed incrementally)
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCallsMap[tc.index]) {
            toolCallsMap[tc.index] = {
              id: tc.id || '',
              type: 'function',
              function: { name: '', arguments: '' },
            };
          }
          const entry = toolCallsMap[tc.index];
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.function.name += tc.function.name;
          if (tc.function?.arguments) entry.function.arguments += tc.function.arguments;
        }
      }
    }

    const toolCalls = Object.values(toolCallsMap);
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: content || null,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        },
      }],
    };
  }

  /**
   * GPT-5.4/5.4-mini use OpenAI's Responses API (/responses) instead of Chat Completions.
   * The Responses API has a different request/response format.
   */
  private async chatWithResponsesApi(
    openai: any,
    messages: Array<{ role: string; content: any }>,
    tools: any[],
    options?: any,
  ): Promise<any> {
    const model = options?.model || this.defaultModel;
    this.logger.log(`Using Responses API for model: ${model}`);

    // Convert tools from chat completions format to responses API format
    const responsesTools = tools
      .filter(t => t.type === 'function' && t.function)
      .map(t => ({
        type: 'function' as const,
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      }));

    // Build input: system message as instructions, rest as input items
    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // Convert messages to Responses API input format
    const input = nonSystemMessages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));

    const maxToolRounds = options?.maxToolRounds ?? 5;
    let allToolCalls: any[] = [];

    // Use raw fetch since openai SDK responses API may not be fully typed
    const baseURL = (openai as any)?.baseURL || 'https://api.openai.com/v1';
    const apiKey = (openai as any)?._options?.apiKey || (openai as any)?.apiKey;

    const doRequest = async (currentInput: any[]) => {
      const body: any = {
        model,
        input: currentInput,
        max_output_tokens: options?.maxTokens || 2048,
        temperature: options?.temperature || 0.7,
      };
      if (systemMsg) {
        body.instructions = typeof systemMsg.content === 'string' ? systemMsg.content : JSON.stringify(systemMsg.content);
      }
      if (responsesTools.length > 0) {
        body.tools = responsesTools;
      }

      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
      // GitHub Copilot API requires editor headers
      if (baseURL.includes('githubcopilot.com')) {
        reqHeaders['Editor-Version'] = 'vscode/1.100.0';
        reqHeaders['Editor-Plugin-Version'] = 'copilot/1.300.0';
        reqHeaders['Copilot-Integration-Id'] = 'vscode-chat';
      }

      const resp = await fetch(`${baseURL}/responses`, {
        method: 'POST',
        headers: reqHeaders,
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`Responses API HTTP ${resp.status}: ${errText.slice(0, 300)}`);
      }

      return await resp.json();
    };

    let currentInput: any[] = input;
    for (let round = 0; round <= maxToolRounds; round++) {
      const response = await doRequest(currentInput);

      // Extract text output
      let responseText = '';
      const outputItems = response.output || [];
      for (const item of outputItems) {
        if (item.type === 'message') {
          for (const c of (item.content || [])) {
            if (c.type === 'output_text' || c.type === 'text') {
              responseText += c.text || '';
            }
          }
        }
      }

      // Also check output_text shortcut
      if (!responseText && response.output_text) {
        responseText = response.output_text;
      }

      // Emit text via onChunk for streaming
      if (responseText && options?.onChunk) {
        options.onChunk(responseText);
      }

      // Check for function calls
      const functionCalls = outputItems.filter((item: any) => item.type === 'function_call');
      const lastStopReason = functionCalls.length > 0 ? 'tool_use' : 'end_turn';
      if (functionCalls.length === 0) {
        return {
          text: responseText,
          functionCalls: allToolCalls.length > 0 ? allToolCalls : null,
          stopReason: lastStopReason,
        };
      }

      if (round === maxToolRounds) {
        this.logger.warn(`Responses API agent loop: max ${maxToolRounds} tool rounds reached`);
        return { text: responseText, functionCalls: allToolCalls, stopReason: lastStopReason };
      }

      this.logger.log(`Responses API round ${round + 1}: ${functionCalls.length} tool call(s): ${functionCalls.map((fc: any) => fc.name).join(', ')}`);

      // Execute tool calls
      const toolResults = await Promise.all(
        functionCalls.map(async (fc: any) => {
          let parameters: Record<string, any> = {};
          try { parameters = JSON.parse(fc.arguments || '{}'); } catch { parameters = {}; }

          try {
            let result: any;
            if (options?.onToolCall) {
              try {
                const customResult = await options.onToolCall(fc.name, parameters);
                if (customResult !== undefined) result = customResult;
              } catch {
                this.logger.warn(`Custom tool execution failed for ${fc.name}, falling back.`);
              }
            }
            if (result === undefined) {
              result = await this.executeFunctionCall(fc.name, parameters, options?.context || {});
            }
            return { type: 'function_call_output', call_id: fc.call_id, output: JSON.stringify(result) };
          } catch (error: any) {
            return { type: 'function_call_output', call_id: fc.call_id, output: JSON.stringify({ success: false, error: error.message }) };
          }
        }),
      );

      allToolCalls.push(...functionCalls.map((fc: any) => ({
        id: fc.call_id,
        name: fc.name,
        arguments: fc.arguments,
      })));

      // Build input for next round: previous input + assistant output + tool results
      currentInput = [...currentInput, ...outputItems, ...toolResults];
    }

    return { text: '', functionCalls: allToolCalls.length > 0 ? allToolCalls : null, stopReason: 'end_turn' };
  }
}
