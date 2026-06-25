import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { IntentEngineService } from '../../trading/intent-engine.service';
import { StrategyGraphService } from '../../trading/strategy-graph.service';
import { StrategyGraph } from '../../trading/entities/strategy-graph.entity';

/**
 * 意图交易能力执行器
 * 处理自然语言意图识别、策略创建、策略状态查询等操作
 */
@Injectable()
export class IntentStrategyExecutor implements ICapabilityExecutor {
  readonly name = 'IntentStrategyExecutor';
  private readonly logger = new Logger(IntentStrategyExecutor.name);

  constructor(
    private readonly intentEngineService: IntentEngineService,
    private readonly strategyGraphService: StrategyGraphService,
    @InjectRepository(StrategyGraph)
    private readonly strategyGraphRepository: Repository<StrategyGraph>,
  ) {}

  async execute(
    params: Record<string, any>,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const userId = context.userId;
    if (!userId) {
      return {
        success: false,
        error: 'MISSING_USER_ID',
        message: '用户ID不能为空',
      };
    }

    const capabilityId = context.capabilityId || params.capabilityId;
    if (!capabilityId) {
      return {
        success: false,
        error: 'MISSING_CAPABILITY_ID',
        message: '能力ID不能为空',
      };
    }

    try {
      switch (capabilityId) {
        case 'create_intent_strategy':
          return await this.createStrategy(params, userId, context);
        case 'get_strategy_status':
          return await this.getStrategyStatus(params, userId);
        default:
          return {
            success: false,
            error: 'UNKNOWN_CAPABILITY',
            message: `未知的意图交易能力: ${capabilityId}`,
          };
      }
    } catch (error: any) {
      this.logger.error(`意图交易执行失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: `执行失败: ${error.message}`,
      };
    }
  }

  /**
   * 创建交易策略
   */
  private async createStrategy(
    params: Record<string, any>,
    userId: string,
    context?: ExecutionContext,
  ): Promise<ExecutionResult> {
    const { intentText } = params;

    if (!intentText) {
      return {
        success: false,
        error: 'MISSING_INTENT_TEXT',
        message: '缺少必需参数：intentText',
      };
    }

    try {
      // ⭐ 从context获取agentId（如果存在）
      const agentId = context?.metadata?.agentId || params.agentId;

      // 1. 识别意图
      const intentResult = await this.intentEngineService.recognizeIntent(
        intentText,
        userId,
        agentId,
      );

      // 2. 创建策略图（传递agentId进行权限检查）
      const strategyGraph = await this.strategyGraphService.createStrategyGraph(
        intentResult,
        userId,
        agentId, // ⭐ 传递agentId进行权限检查
      );

      return {
        success: true,
        data: {
          strategyId: strategyGraph.id,
          intent: intentResult.intent,
          entities: intentResult.entities,
          confidence: intentResult.confidence,
          status: strategyGraph.status,
          nodes: strategyGraph.nodes,
          message: '交易策略创建成功',
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'STRATEGY_CREATION_ERROR',
        message: `策略创建失败: ${error.message}`,
      };
    }
  }

  /**
   * 查询策略状态
   */
  private async getStrategyStatus(
    params: Record<string, any>,
    userId: string,
  ): Promise<ExecutionResult> {
    const { strategyId } = params;

    if (!strategyId) {
      return {
        success: false,
        error: 'MISSING_STRATEGY_ID',
        message: '缺少必需参数：strategyId',
      };
    }

    try {
      // 使用Repository查询策略图
      const strategyGraph = await this.strategyGraphRepository.findOne({
        where: { id: strategyId },
        relations: ['nodes'],
      });

      if (!strategyGraph) {
        return {
          success: false,
          error: 'STRATEGY_NOT_FOUND',
          message: '未找到策略',
        };
      }

      return {
        success: true,
        data: {
          strategyId: strategyGraph.id,
          status: strategyGraph.status,
          strategyType: strategyGraph.strategyType,
          nodes: strategyGraph.nodes || [],
          config: strategyGraph.config,
          createdAt: strategyGraph.createdAt,
          updatedAt: strategyGraph.updatedAt,
          message: '获取策略状态成功',
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'STRATEGY_QUERY_ERROR',
        message: `查询策略失败: ${error.message}`,
      };
    }
  }
}

