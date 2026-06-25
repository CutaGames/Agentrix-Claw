import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { GroqIntegrationService } from './groq-integration.service';

/**
 * Groq集成控制器
 * 提供Function Calling接口供Groq调用
 */
@Controller('groq')
export class GroqIntegrationController {
  constructor(private readonly groqService: GroqIntegrationService) {}

  /**
   * 获取Function Schemas
   * GET /api/groq/functions
   */
  @Get('functions')
  async getFunctions() {
    const functions = await this.groqService.getFunctionSchemas();
    return {
      functions,
      count: functions.length,
    };
  }

  /**
   * 执行Function Call
   * POST /api/groq/function-call
   * 
   * Groq调用Function时，会调用此接口
   */
  @Post('function-call')
  async executeFunctionCall(
    @Body()
    body: {
      function: {
        name: string;
        arguments: string; // JSON string
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
      parameters = JSON.parse(func.arguments);
    } catch (error) {
      return {
        success: false,
        error: 'INVALID_ARGUMENTS',
        message: '参数格式错误',
      };
    }

    // 执行Function
    const result = await this.groqService.executeFunctionCall(func.name, parameters, context);

    return result;
  }

  /**
   * 快速测试接口
   * GET /api/groq/test?query={query}
   */
  @Get('test')
  async test(@Query('query') query: string) {
    if (!query) {
      return {
        error: '请提供query参数',
      };
    }

    try {
      const response = await this.groqService.chatWithFunctions([
        {
          role: 'system',
          content: '你是一个购物助手，可以帮助用户搜索和购买Agentrix Marketplace的商品。',
        },
        {
          role: 'user',
          content: query,
        },
      ]);

      return {
        success: true,
        response: response.choices[0]?.message,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

