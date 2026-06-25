import { Controller, Get, Post, Body, Query, Logger } from '@nestjs/common';
import { OpenAIIntegrationService } from './openai-integration.service';

@Controller('openai')
export class OpenAIIntegrationController {
  private readonly logger = new Logger(OpenAIIntegrationController.name);

  constructor(private openaiService: OpenAIIntegrationService) {}

  /**
   * 获取 OpenAI Function Schemas
   * GET /api/openai/functions
   * 
   * OpenAI 可以调用此接口获取所有可用的 Function
   */
  @Get('functions')
  async getFunctions() {
    const functions = await this.openaiService.getFunctionSchemas();
    return {
      functions,
      count: functions.length,
    };
  }

  /**
   * 执行 Function Call
   * POST /api/openai/function-call
   * 
   * OpenAI 调用 Function 时，会调用此接口
   */
  @Post('function-call')
  async executeFunctionCall(
    @Body()
    body: {
      function: {
        name: string;
        arguments: string | Record<string, any>; // JSON string or object
      };
      context?: {
        userId?: string;
        sessionId?: string;
      };
    },
  ) {
    const { function: func, context = {} } = body;

    // 解析参数
    let parameters: Record<string, any> = {};
    try {
      if (typeof func.arguments === 'string') {
        parameters = JSON.parse(func.arguments);
      } else {
        parameters = func.arguments;
      }
    } catch (error) {
      return {
        success: false,
        error: 'INVALID_ARGUMENTS',
        message: '参数格式错误',
      };
    }

    // 执行 Function
    const result = await this.openaiService.executeFunctionCall(func.name, parameters, context);

    return result;
  }

  /**
   * 快速测试接口
   * GET /api/openai/test?query={query}
   */
  @Get('test')
  async testSearch(@Query('query') query: string) {
    if (!query) {
      return { error: 'Query parameter is required' };
    }

    const result = await this.openaiService.executeFunctionCall(
      'search_agentrix_products',
      { query },
      {},
    );

    return result;
  }

  /**
   * 对话接口（带 Function Calling）
   * POST /api/openai/chat
   * 
   * 支持用户提供自己的 OpenAI API Key（用于 OpenAI 官网用户）
   */
  @Post('chat')
  async chat(
    @Body()
    body: {
      messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
      openaiApiKey?: string; // 用户提供的 API Key（可选，如果提供则默认使用 OpenAI 官方 baseURL）
      openaiBaseURL?: string; // 用户提供的 baseURL（可选，如果不提供则默认使用 OpenAI 官方 baseURL）
      context?: {
        userId?: string;
        sessionId?: string;
      };
      options?: {
        model?: string;
        temperature?: number;
        maxTokens?: number;
      };
    },
  ) {
    const { messages, openaiApiKey, openaiBaseURL, context = {}, options } = body;

    // 将 context 注入到消息中（如果需要）
    const systemMessage = {
      role: 'system' as const,
      content: `你是 Agentrix 购物助手，可以帮助用户搜索和购买商品。当用户想要搜索或购买商品时，使用 Agentrix 的 Functions。${context.userId ? `用户ID: ${context.userId}` : ''}${context.sessionId ? `会话ID: ${context.sessionId}` : ''}`,
    };

    const allMessages = [systemMessage, ...messages];

    // 如果用户提供了 API Key，传递给 service
    // 如果用户提供了 baseURL，使用用户的；否则使用系统配置的（通常是 API2D）
    const result = await this.openaiService.chatWithFunctions(allMessages, {
      ...options,
      context,
      userApiKey: openaiApiKey, // 传递用户 API Key
      userBaseURL: openaiBaseURL, // 传递用户 baseURL（可选）
    });

    return result;
  }

  /**
   * OpenAPI 规范（用于 OpenAI Custom GPTs Actions 集成）
   * GET /api/openai/openapi.json
   * 
   * 返回优化后的 REST API 格式的 OpenAPI Schema，更适合 GPTs Actions
   */
  @Get('openapi.json')
  getOpenAPISpec() {
    // 优先使用 API_URL，否则使用 API_BASE_URL，最后回退到默认值
    // 注意：如果 API_BASE_URL 已经包含了 /api，不要再加一次
    let baseUrl = process.env.API_URL || process.env.API_BASE_URL || 'https://api.agentrix.top/api';
    
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    
    // 如果 baseUrl 不以 /api 结尾，且不是根路径，则尝试添加 /api
    // 但在当前配置中，API_BASE_URL 已经是 https://api.agentrix.top/api
    // 所以我们直接使用它即可。
    
    // 读取优化后的 OpenAPI Schema
    let schema: any = null;
    
    // 方案1: 从编译后的 dist 目录读取
    try {
      schema = require('./gpts-openapi-schema.json');
    } catch (e) {
      // 方案2: 从源码目录读取（开发环境）
      try {
        const path = require('path');
        const fs = require('fs');
        const srcPath = path.join(process.cwd(), 'backend/src/modules/ai-integration/openai/gpts-openapi-schema.json');
        if (fs.existsSync(srcPath)) {
          schema = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
        }
      } catch (e2) {
        this.logger.warn('Failed to load OpenAPI schema from file, using embedded schema.');
      }
    }
    
    // 如果成功导入，更新 servers URL 并返回
    if (schema) {
      schema.servers[0].url = baseUrl;
      this.logger.log(`成功加载 OpenAPI Schema v${schema.info.version} for GPTs`);
      return schema;
    }
    
    // 如果导入失败，使用内嵌的 Schema（1.0.2 版本）- 直接从 JSON 文件复制
    // 注意：这里使用完整的 Schema，不包含旧的 /openai/* 路径
    this.logger.warn('Using embedded OpenAPI schema v1.0.2');
    return {
      openapi: '3.1.0',
      info: {
        title: 'Agentrix Marketplace API',
        version: '1.0.2',
        description: 'Agentrix Marketplace API for GPTs. Supports product search, product details, order creation, and payment initiation.',
      },
      servers: [
        {
          url: baseUrl,
          description: 'Agentrix API Server',
        },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API Key for identifying the GPT user session.',
          },
        },
        schemas: {
          SearchResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              data: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Product' } as any,
                  },
                  total: { type: 'integer' },
                  query: { type: 'string' },
                },
                required: ['items'],
              },
            },
            required: ['success', 'data'],
          },
          ProductResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              data: { $ref: '#/components/schemas/Product' } as any,
            },
            required: ['success', 'data'],
          },
          Product: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Product ID' },
              title: { type: 'string', description: 'Product title' },
              description: { type: 'string' },
              price: { type: 'number' },
              currency: { type: 'string', default: 'CNY' },
              priceDisplay: { type: 'string' },
              image: { type: 'string', format: 'uri' },
              images: {
                type: 'array',
                items: { type: 'string', format: 'uri' },
              },
              category: { type: 'string' },
              productType: {
                type: 'string',
                enum: ['physical', 'service', 'crypto', 'nft'],
              },
              stock: { type: 'integer' },
              inStock: { type: 'boolean' },
            },
            required: ['id', 'title', 'price'],
          },
          ShippingAddress: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              phone: { type: 'string' },
              addressLine: { type: 'string' },
              city: { type: 'string' },
              postalCode: { type: 'string' },
              country: { type: 'string' },
            },
            required: ['name', 'phone', 'addressLine'],
          },
          CreateOrderInput: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              quantity: { type: 'integer', default: 1, minimum: 1 },
              shippingAddress: { $ref: '#/components/schemas/ShippingAddress' } as any,
              appointmentTime: {
                type: 'string',
                format: 'date-time',
                description: 'For service-type products.',
              },
              contactInfo: { type: 'string' },
              walletAddress: { type: 'string' },
              chain: {
                type: 'string',
                enum: ['ethereum', 'polygon', 'solana', 'bsc'],
              },
            },
            required: ['productId'],
          },
          OrderResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              data: { $ref: '#/components/schemas/Order' } as any,
            },
            required: ['success', 'data'],
          },
          Order: {
            type: 'object',
            properties: {
              orderId: { type: 'string' },
              status: {
                type: 'string',
                enum: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'],
              },
              amount: { type: 'number' },
              currency: { type: 'string' },
              productId: { type: 'string' },
              quantity: { type: 'integer' },
              createdAt: { type: 'string', format: 'date-time' },
            },
            required: ['orderId', 'status', 'amount', 'currency'],
          },
          PaymentInput: {
            type: 'object',
            properties: {
              orderId: { type: 'string' },
              method: {
                type: 'string',
                enum: ['crypto', 'fiat', 'usdc'],
              },
            },
            required: ['orderId'],
          },
          PaymentResponse: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              data: { $ref: '#/components/schemas/Payment' } as any,
            },
            required: ['success', 'data'],
          },
          Payment: {
            type: 'object',
            properties: {
              paymentId: { type: 'string' },
              paymentUrl: { type: 'string', format: 'uri' },
              status: {
                type: 'string',
                enum: ['pending', 'processing', 'completed', 'failed'],
              },
              orderId: { type: 'string' },
            },
            required: ['paymentId', 'status'],
          },
          Error: {
            type: 'object',
            properties: {
              success: { type: 'boolean', default: false },
              error: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['success'],
          },
        },
      },
      security: [{ ApiKeyAuth: [] }],
      paths: {
        '/marketplace/search': {
          get: {
            summary: 'Search products',
            operationId: 'searchProducts',
            tags: ['Marketplace'],
            parameters: [
              { name: 'query', in: 'query', required: true, schema: { type: 'string' } },
              { name: 'category', in: 'query', schema: { type: 'string' } },
              { name: 'priceMin', in: 'query', schema: { type: 'number' } },
              { name: 'priceMax', in: 'query', schema: { type: 'number' } },
              { name: 'currency', in: 'query', schema: { type: 'string', default: 'CNY' } },
              { name: 'inStock', in: 'query', schema: { type: 'boolean' } },
              { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, minimum: 1, maximum: 100 } },
            ],
            responses: {
              '200': {
                description: 'Search results',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/SearchResponse' } as any,
                  },
                },
              },
              '400': {
                description: 'Bad Request',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Error' } as any,
                  },
                },
              },
            },
          },
        },
        '/marketplace/products/{id}': {
          get: {
            summary: 'Get product details',
            operationId: 'getProduct',
            tags: ['Marketplace'],
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: {
              '200': {
                description: 'Product details',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ProductResponse' } as any,
                  },
                },
              },
              '404': {
                description: 'Product not found',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Error' } as any,
                  },
                },
              },
            },
          },
        },
        '/marketplace/orders': {
          post: {
            summary: 'Create an order',
            operationId: 'createOrder',
            tags: ['Orders'],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CreateOrderInput' } as any,
                },
              },
            },
            responses: {
              '200': {
                description: 'Order created',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/OrderResponse' } as any,
                  },
                },
              },
              '400': {
                description: 'Bad Request',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Error' } as any,
                  },
                },
              },
            },
          },
        },
        '/marketplace/payments': {
          post: {
            summary: 'Initiate a payment',
            operationId: 'initiatePayment',
            tags: ['Payments'],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/PaymentInput' } as any,
                },
              },
            },
            responses: {
              '200': {
                description: 'Payment created',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/PaymentResponse' } as any,
                  },
                },
              },
              '400': {
                description: 'Bad Request',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/Error' } as any,
                  },
                },
              },
            },
          },
        },
      },
    };
  }
}

