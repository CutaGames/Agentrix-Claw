import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { OpenAIIntegrationService } from './openai-integration.service';

@Controller('openai')
export class OpenAIIntegrationController {
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
   */
  @Get('openapi.json')
  getOpenAPISpec() {
    // 优先使用 API_URL（包含 /api），否则使用 API_BASE_URL，最后回退到默认值
    const baseUrl = process.env.API_URL || 
                    (process.env.API_BASE_URL ? `${process.env.API_BASE_URL}/api` : null) ||
                    'https://api.agentrix.top/api';
    
    return {
      openapi: '3.1.0',
      info: {
        title: 'Agentrix Marketplace API for OpenAI',
        description: 'Agentrix Marketplace API for OpenAI Custom GPTs Actions. 允许 OpenAI 用户搜索和交易 Agentrix Marketplace 的商品。支持商品搜索、购物车管理、订单处理等功能。',
        version: '1.0.0',
        contact: {
          name: 'Agentrix Support',
          email: 'support@agentrix.com',
          url: 'https://www.agentrix.top',
        },
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
            description: 'API Key 认证（可选，用于 Custom GPTs Actions）',
          },
        },
      },
      security: [
        {
          ApiKeyAuth: [],
        },
      ],
      paths: {
        '/openai/functions': {
          get: {
            summary: '获取 OpenAI Function Schemas',
            description: '返回所有可用的 Function 定义，用于 OpenAI Function Calling',
            operationId: 'getOpenAIFunctions',
            responses: {
              '200': {
                description: '成功',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        functions: {
                          type: 'array',
                          items: { type: 'object' },
                        },
                        count: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/openai/function-call': {
          post: {
            summary: '执行 OpenAI Function Call',
            description: '执行 OpenAI 调用的 Function，返回执行结果',
            operationId: 'executeOpenAIFunctionCall',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['function'],
                    properties: {
                      function: {
                        type: 'object',
                        required: ['name', 'arguments'],
                        properties: {
                          name: { type: 'string', description: 'Function 名称' },
                          arguments: { 
                            type: 'object', 
                            description: 'Function 参数（JSON 对象）' 
                          },
                        },
                      },
                      context: {
                        type: 'object',
                        properties: {
                          userId: { type: 'string' },
                          sessionId: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: '成功',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        data: { type: 'object' },
                        error: { type: 'string' },
                        message: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '/openai/chat': {
          post: {
            summary: 'OpenAI 对话接口（带 Function Calling）',
            description: '完整的对话接口，自动处理 Function Calling。支持用户提供自己的 OpenAI API Key。',
            operationId: 'openaiChat',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['messages'],
                    properties: {
                      messages: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                            content: { type: 'string' },
                          },
                        },
                      },
                      openaiApiKey: { 
                        type: 'string', 
                        description: '用户提供的 OpenAI API Key（可选）' 
                      },
                      context: {
                        type: 'object',
                        properties: {
                          userId: { type: 'string' },
                          sessionId: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: '成功',
                content: {
                  'application/json': {
                    schema: { type: 'object' },
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

