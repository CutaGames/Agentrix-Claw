import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 任务复杂度级别
 */
export enum TaskComplexity {
  SIMPLE = 'simple',
  COMPLEX = 'complex',
}

/**
 * 模型类型
 */
export enum ModelType {
  GEMINI = 'gemini',
  CLAUDE = 'claude',
  GPT = 'gpt',
}

/**
 * 模型路由决策结果
 */
export interface ModelRoutingDecision {
  model: string;
  complexity: TaskComplexity;
  reason: string;
  fallbackModel?: string; // 降级模型
}

/**
 * 智能模型路由服务
 * 
 * 根据任务复杂度自动选择最合适的模型：
 * - 简单任务：使用快速、便宜的模型
 * - 复杂任务：使用高性能模型
 * 
 * 支持降级策略：如果初级模型失败，自动升级到高级模型
 */
@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger(ModelRouterService.name);

  // 前端 Gemini 模型配置
  private readonly frontendGeminiSimple: string;
  private readonly frontendGeminiComplex: string;

  // 后端 Claude 模型配置
  private readonly backendClaudeSimple: string;
  private readonly backendClaudeComplex: string;

  constructor(private readonly configService: ConfigService) {
    // 从环境变量读取配置，提供默认值
    this.frontendGeminiSimple =
      this.configService.get<string>('FRONTEND_GEMINI_SIMPLE_MODEL') ||
      'gemini-1.5-flash';
    this.frontendGeminiComplex =
      this.configService.get<string>('FRONTEND_GEMINI_COMPLEX_MODEL') ||
      'gemini-1.5-flash';

    this.backendClaudeSimple =
      this.configService.get<string>('BACKEND_CLAUDE_SIMPLE_MODEL') ||
      'claude-3.5-haiku';
    this.backendClaudeComplex =
      this.configService.get<string>('BACKEND_CLAUDE_COMPLEX_MODEL') ||
      'claude-3-opus';

    this.logger.log(
      `模型路由服务初始化完成 - 前端: ${this.frontendGeminiSimple}/${this.frontendGeminiComplex}, 后端: ${this.backendClaudeSimple}/${this.backendClaudeComplex}`,
    );
  }

  /**
   * 分析任务复杂度
   */
  analyzeComplexity(
    messages: Array<{ role: string; content: string }>,
    hasFunctionCalling: boolean = false,
    contextLength: number = 0,
  ): TaskComplexity {
    // 获取最后一条用户消息
    const lastUserMessage = messages
      .filter((msg) => msg.role === 'user')
      .pop();
    const messageContent = lastUserMessage?.content || '';
    const messageLength = messageContent.length;

    // 计算对话轮数
    const conversationTurns = messages.filter(
      (msg) => msg.role === 'user' || msg.role === 'assistant',
    ).length;

    // 复杂度评分
    let complexityScore = 0;

    // 1. 消息长度评分
    if (messageLength > 500) {
      complexityScore += 2;
    } else if (messageLength > 200) {
      complexityScore += 1;
    }

    // 2. Function Calling 评分
    if (hasFunctionCalling) {
      complexityScore += 3; // Function Calling 通常需要更强的推理能力
    }

    // 3. 对话轮数评分
    if (conversationTurns > 10) {
      complexityScore += 2;
    } else if (conversationTurns > 5) {
      complexityScore += 1;
    }

    // 4. 上下文长度评分
    if (contextLength > 10000) {
      complexityScore += 1;
    }

    // 5. 关键词检测（复杂任务特征）
    const complexKeywords = [
      '重构',
      '优化',
      '分析',
      '设计',
      '架构',
      '调试',
      'review',
      'refactor',
      'optimize',
      'analyze',
      'design',
      'architecture',
      'debug',
      'complex',
      'complicated',
    ];
    const hasComplexKeywords = complexKeywords.some((keyword) =>
      messageContent.toLowerCase().includes(keyword),
    );
    if (hasComplexKeywords) {
      complexityScore += 1;
    }

    // 6. 简单任务特征（降低复杂度）
    const simpleKeywords = [
      '查询',
      '搜索',
      '获取',
      '查看',
      '显示',
      'query',
      'search',
      'get',
      'fetch',
      'show',
      'display',
      'list',
    ];
    const hasSimpleKeywords = simpleKeywords.some((keyword) =>
      messageContent.toLowerCase().includes(keyword),
    );
    if (hasSimpleKeywords && complexityScore <= 2) {
      complexityScore = Math.max(0, complexityScore - 1);
    }

    // 判断复杂度
    // 阈值：>= 3 为复杂任务，< 3 为简单任务
    const isComplex = complexityScore >= 3;

    this.logger.debug(
      `任务复杂度分析: score=${complexityScore}, complexity=${isComplex ? 'COMPLEX' : 'SIMPLE'}, messageLength=${messageLength}, hasFunctionCalling=${hasFunctionCalling}, turns=${conversationTurns}`,
    );

    return isComplex ? TaskComplexity.COMPLEX : TaskComplexity.SIMPLE;
  }

  /**
   * 为 Gemini 选择模型
   */
  selectGeminiModel(
    complexity: TaskComplexity,
    overrideModel?: string,
  ): ModelRoutingDecision {
    if (overrideModel) {
      return {
        model: overrideModel,
        complexity,
        reason: '用户手动指定模型',
      };
    }

    const model =
      complexity === TaskComplexity.COMPLEX
        ? this.frontendGeminiComplex
        : this.frontendGeminiSimple;

    return {
      model,
      complexity,
      reason: `根据任务复杂度(${complexity})自动选择`,
      fallbackModel:
        complexity === TaskComplexity.SIMPLE
          ? this.frontendGeminiComplex
          : undefined, // 简单任务失败时可以升级到复杂模型
    };
  }

  /**
   * 为 Claude 选择模型
   */
  selectClaudeModel(
    complexity: TaskComplexity,
    overrideModel?: string,
  ): ModelRoutingDecision {
    if (overrideModel) {
      return {
        model: overrideModel,
        complexity,
        reason: '用户手动指定模型',
      };
    }

    const model =
      complexity === TaskComplexity.COMPLEX
        ? this.backendClaudeComplex
        : this.backendClaudeSimple;

    return {
      model,
      complexity,
      reason: `根据任务复杂度(${complexity})自动选择`,
      fallbackModel:
        complexity === TaskComplexity.SIMPLE
          ? this.backendClaudeComplex
          : undefined, // 简单任务失败时可以升级到复杂模型
    };
  }

  /**
   * 智能路由：根据模型类型和任务复杂度选择模型
   */
  routeModel(
    modelType: ModelType,
    messages: Array<{ role: string; content: string }>,
    options?: {
      hasFunctionCalling?: boolean;
      contextLength?: number;
      overrideModel?: string;
    },
  ): ModelRoutingDecision {
    const complexity = this.analyzeComplexity(
      messages,
      options?.hasFunctionCalling || false,
      options?.contextLength || 0,
    );

    switch (modelType) {
      case ModelType.GEMINI:
        return this.selectGeminiModel(complexity, options?.overrideModel);
      case ModelType.CLAUDE:
        return this.selectClaudeModel(complexity, options?.overrideModel);
      default:
        throw new Error(`不支持的模型类型: ${modelType}`);
    }
  }

  /**
   * 获取模型配置信息（用于调试和监控）
   */
  getModelConfig(): {
    frontend: { simple: string; complex: string };
    backend: { simple: string; complex: string };
  } {
    return {
      frontend: {
        simple: this.frontendGeminiSimple,
        complex: this.frontendGeminiComplex,
      },
      backend: {
        simple: this.backendClaudeSimple,
        complex: this.backendClaudeComplex,
      },
    };
  }
}

