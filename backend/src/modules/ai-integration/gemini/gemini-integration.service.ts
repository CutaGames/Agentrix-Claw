import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Product } from '../../../entities/product.entity';
import { Order } from '../../../entities/order.entity';
import { Skill, SkillStatus, SkillValueType } from '../../../entities/skill.entity';
import { CapabilityRegistryService } from '../../ai-capability/services/capability-registry.service';
import { CapabilityExecutorService } from '../../ai-capability/services/capability-executor.service';
import { SearchService } from '../../search/search.service';
import { ProductService } from '../../product/product.service';
import { OrderService } from '../../order/order.service';
import { CartService } from '../../cart/cart.service';
import { LogisticsService } from '../../logistics/logistics.service';
import { PayIntentService } from '../../payment/pay-intent.service';
import { SkillConverterService } from '../../skill/skill-converter.service';
import { SkillExecutorService } from '../../skill/skill-executor.service';
import { PayIntentType } from '../../../entities/pay-intent.entity';
import { OrderStatus } from '../../../entities/order.entity';
import { ModelRouterService, ModelType } from '../model-router/model-router.service';

/**
 * Gemini Function Calling 统一接口
 * 
 * 为 Gemini 提供统一的 Function Schema，实现电商流程
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
export class GeminiIntegrationService {
  private readonly logger = new Logger(GeminiIntegrationService.name);
  private readonly genAI: GoogleGenerativeAI | null;
  private readonly defaultModel: string; // 可通过环境变量 GEMINI_MODEL 配置，默认为 gemini-3-pro
  private requestOptions: any = { apiVersion: 'v1beta' };

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    private skillConverter: SkillConverterService,
    private skillExecutor: SkillExecutorService,
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
    private modelRouter: ModelRouterService,
  ) {
    // 从环境变量读取模型名称，默认为 gemini-1.5-flash (更稳定，兼容性更广)
    this.defaultModel = this.configService.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not configured, Gemini integration will be disabled');
      this.genAI = null;
    } else {
      // 检查并配置代理
      const proxyUrl = this.configService.get<string>('HTTPS_PROXY') || this.configService.get<string>('HTTP_PROXY');
      
      if (proxyUrl) {
        this.logger.log(`Gemini configuring with proxy: ${proxyUrl}`);
        try {
          // 在 Node v18+ (用户为 v22) 中，使用 undici 的 ProxyAgent 是最稳定的选择
          const { ProxyAgent, fetch: undiciFetch } = require('undici');
          const dispatcher = new ProxyAgent({ uri: proxyUrl });
          
          this.requestOptions.fetch = (url: string, init: any) => {
            return undiciFetch(url, {
              ...init,
              dispatcher,
              // 保持 SDK 标识
              headers: {
                ...init.headers,
                'x-goog-api-client': 'genai-js/0.24.1',
              }
            });
          };
        } catch (e) {
          this.logger.warn('Failed to configure Gemini proxy with undici:', e.message);
        }
      }

      // 强制使用 Stable 版本 v1 以避免 v1beta 的模型 404 问题
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.logger.log(`Gemini integration initialized (Default Model: ${this.defaultModel})`);
    }
  }

  /**
   * 获取 Gemini Function Calling 的 Function Schemas
   * 返回统一的 Function 列表，包括系统级能力和电商流程
   */
  async getFunctionSchemas(): Promise<any[]> {
    // 1. 获取系统级能力（电商流程等），只返回外部暴露的能力
    const systemSchemas = this.capabilityRegistry.getSystemCapabilitySchemas(['gemini'], true);
    
    // 2. 转换为 Gemini 格式
    const geminiFunctions = systemSchemas.map((schema) => {
      // FunctionSchema 可能是 OpenAIFunctionSchema, ClaudeToolSchema 或 GeminiFunctionSchema
      // 它们都有 name, description, parameters 属性（Claude 使用 input_schema）
      if ('input_schema' in schema) {
        // ClaudeToolSchema
        return {
          name: schema.name,
          description: schema.description,
          parameters: schema.input_schema,
        };
      } else {
        // OpenAIFunctionSchema 或 GeminiFunctionSchema
        return {
          name: schema.name,
          description: schema.description,
          parameters: schema.parameters,
        };
      }
    });

    // V2.0: 获取用户自定义 Skill 并根据 valueType 设置优先级
    const customSkills = await this.skillRepository.find({
      where: { status: SkillStatus.PUBLISHED },
    });

    const customFunctions = customSkills.map((skill) => {
      // V2.0: ACTION 类型的 Skill 标记为 high_priority
      const isHighPriority = skill.valueType === SkillValueType.ACTION || skill.aiPriority === 'high';
      
      return {
        name: skill.name.replace(/[^a-zA-Z0-9_]/g, '_'),
        description: isHighPriority 
          ? `[HIGH PRIORITY] ${skill.description}` 
          : skill.description,
        parameters: skill.inputSchema || { type: 'object', properties: {}, required: [] },
        // V2.0: 元数据，用于排序和优先级控制
        _metadata: {
          skillId: skill.id,
          priority: isHighPriority ? 'high' : (skill.aiPriority || 'normal'),
          valueType: skill.valueType,
          layer: skill.layer,
        },
      };
    });

    // V2.0: 按优先级排序（high_priority 的 Skill 排在前面）
    customFunctions.sort((a, b) => {
      if (a._metadata.priority === 'high' && b._metadata.priority !== 'high') return -1;
      if (a._metadata.priority !== 'high' && b._metadata.priority === 'high') return 1;
      return 0;
    });

    // 3. 添加基础功能（向后兼容）
        const basicFunctions = [
      {
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
      {
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
      {
        name: 'view_agentrix_cart',
        description: '查看当前购物车内容',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'checkout_agentrix_cart',
        description: '结算购物车，创建订单',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
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
      {
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
      {
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
      {
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
      {
        name: 'create_agentrix_mpc_wallet',
        description: '为用户创建一个安全且受保护的 MPC 托管钱包。',
        parameters: {
          type: 'object',
          properties: {
            chain: { type: 'string', enum: ['ethereum', 'solana', 'bsc'], description: '首选区块链网络（可选）' },
          },
        },
      },
    ];

    // V2.0: 返回顺序：高优先级自定义 Skill > 系统功能 > 基础功能
    // 移除 _metadata 字段（仅用于排序）
    const cleanedCustomFunctions = customFunctions.map(({ _metadata, ...fn }) => fn);
    
    return [...cleanedCustomFunctions, ...geminiFunctions, ...basicFunctions];
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
    this.logger.log(`执行 Gemini Function: ${functionName}`, parameters);

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

        case 'create_agentrix_mpc_wallet':
          return await this.capabilityExecutor.execute(
            'WalletOnboardingExecutor',
            {
              capabilityId: 'wallet_onboarding',
              chain: parameters.chain,
            },
            {
              userId: context.userId,
              sessionId: context.sessionId,
            },
          );

        default:
          // 查找是否是自定义 Skill
          const skills = await this.skillRepository.find({
            where: { status: SkillStatus.PUBLISHED },
          });
          
          const customSkill = skills.find(s => s.name.replace(/[^a-zA-Z0-9_]/g, '_') === functionName);
          
          if (customSkill) {
            this.logger.log(`执行自定义 Skill: ${customSkill.name} (${customSkill.id})`);
            const executionResult = await this.skillExecutor.execute(customSkill.id, parameters, {
              userId: context.userId,
              sessionId: context.sessionId,
            });
            return executionResult.success ? executionResult.data : executionResult;
          }

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

    // 从购物车创建订单 - 需要将购物车项转换为订单项
    // 注意：OrderService 没有 createOrderFromCart 方法，需要手动创建订单
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
   * 调用 Gemini API（带 Function Calling）
   * 支持用户提供自己的 API Key（用于 Gemini 官网用户）
   */
  async chatWithFunctions(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      context?: { userId?: string; sessionId?: string };
      userApiKey?: string; // 用户提供的 API Key（可选）
      enableModelRouting?: boolean; // 是否启用模型路由（默认启用）
      additionalTools?: any[]; // 额外的工具定义
      onToolCall?: (functionName: string, parameters: any) => Promise<any>; // 自定义工具执行回调
    },
  ): Promise<any> {
    // 如果用户提供了 API Key，使用用户的；否则使用系统配置的
    let genAI = this.genAI;
    if (options?.userApiKey) {
      genAI = new GoogleGenerativeAI(options.userApiKey);
    }

    if (!genAI) {
      throw new Error('Gemini API未配置，请设置GEMINI_API_KEY环境变量或提供userApiKey');
    }

    try {
      // 获取 Function Schemas
      const baseFunctions = await this.getFunctionSchemas();
      const functions = options?.additionalTools 
        ? [...options.additionalTools, ...baseFunctions]
        : baseFunctions;
        
      const hasFunctionCalling = functions.length > 0;

      // 智能模型路由：根据任务复杂度选择模型
      let selectedModel: string;
      let routingDecision;
      
      const enableRouting = options?.enableModelRouting !== false; // 默认启用
      
      if (enableRouting && !options?.model) {
        // 使用模型路由服务选择最合适的模型
        routingDecision = this.modelRouter.routeModel(
          ModelType.GEMINI,
          messages,
          {
            hasFunctionCalling,
            contextLength: messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0),
            overrideModel: options?.model,
          },
        );
        selectedModel = routingDecision.model;
        this.logger.log(
          `模型路由决策: ${routingDecision.model} (${routingDecision.complexity}) - ${routingDecision.reason}`,
        );
      } else {
        // 使用用户指定的模型或默认模型
        selectedModel = options?.model || this.defaultModel;
        this.logger.log(`使用指定模型: ${selectedModel}`);
      }

      // --- FAILOVER 机制：如果首选模型失败，尝试备选模型 ---
      // 策略：Flash 家族内优先级排序 (2.0 -> 1.5)，避开 Pro 模型以节省额度
      const fallbackModels = [
        'gemini-1.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash-8b',
        'gemini-1.5-flash',
      ];
      // 过滤掉所有 pro 模型，确保使用 Flash 家族
      const uniqueFallbackModels = [...new Set([selectedModel, ...fallbackModels])]
        .filter(m => !m.includes('pro') && !m.includes('latest'));
      
      let lastError: any;
      
      for (const modelName of uniqueFallbackModels) {
        try {
          if (modelName !== selectedModel) {
            this.logger.log(`尝试备选 Gemini 模型: ${modelName}`);
          }
          
          this.logger.log(`Gemini Call: model=${modelName}`);
          
          const modelOptions = {
            model: modelName,
            generationConfig: {
              temperature: options?.temperature || 0.7,
              maxOutputTokens: options?.maxTokens || 2048,
            }
          };

          const model = hasFunctionCalling 
            ? genAI.getGenerativeModel({ ...modelOptions, tools: [{ functionDeclarations: functions }] }, this.requestOptions)
            : genAI.getGenerativeModel(modelOptions, this.requestOptions);

          // 转换消息格式（Gemini 使用 parts 格式）
          const filteredMessages = messages.filter((msg) => msg.role !== 'system');
          const systemMessages = messages.filter((msg) => msg.role === 'system');
          const systemPrompt = systemMessages.map((msg) => msg.content).join('\n');

          let processedMessages = [...filteredMessages];
          if (systemPrompt && systemPrompt.trim().length > 0 && processedMessages.length > 0) {
            const firstMessage = processedMessages[0];
            if (firstMessage.role === 'user') {
              processedMessages[0] = {
                ...firstMessage,
                content: `${systemPrompt}\n\n${firstMessage.content}`,
              };
            }
          }

          const history = processedMessages.slice(0, -1).map((msg) => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
          }));

          const chat = model.startChat({ history });
          const lastMessage = filteredMessages[filteredMessages.length - 1];
          const result = await chat.sendMessage(lastMessage.content);
          const response = result.response;
          const text = response.text();

          // 检查是否有 Function Call
          const functionCalls = response.functionCalls();
          if (functionCalls && functionCalls.length > 0) {
            const functionResults = await Promise.all(
              functionCalls.map(async (call: any) => {
                const functionName = call.name;
                const parameters = call.args || {};
                try {
                  if (options?.onToolCall) {
                    try {
                      const customResult = await options.onToolCall(functionName, parameters);
                      if (customResult !== undefined) {
                        return { functionResponse: { name: functionName, response: customResult } };
                      }
                    } catch (e) {
                       this.logger.warn(`Custom tool execution failed for ${functionName}`);
                    }
                  }
                  const result = await this.executeFunctionCall(functionName, parameters, options?.context || {});
                  return { functionResponse: { name: functionName, response: result } };
                } catch (error: any) {
                  return { functionResponse: { name: functionName, response: { success: false, error: error.message } } };
                }
              }),
            );

            const finalResult = await chat.sendMessage(functionResults);
            return {
              text: await finalResult.response.text(),
              model: modelName,
              functionCalls: functionCalls.map((call: any) => ({ name: call.name, args: call.args })),
            };
          }

          return { text, model: modelName, functionCalls: null };
        } catch (err: any) {
          lastError = err;
          this.logger.warn(`Gemini 模型 ${modelName} 调用失败: ${err.message}`);
          // 如果不是最后一个模型，则尝试下一个
          if (modelName !== uniqueFallbackModels[uniqueFallbackModels.length - 1]) {
            this.logger.log(`尝试切换到下一个备选模型...`);
            continue;
          }
          throw err;
        }
      }
      throw lastError || new Error('所有 Gemini 备选模型均不可用');
    } catch (error: any) {
      this.logger.error(`Gemini API故障: ${error.message}`);
      throw error;
    }
  }
}

