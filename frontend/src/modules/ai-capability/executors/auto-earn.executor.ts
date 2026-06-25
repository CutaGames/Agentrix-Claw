import { Injectable, Logger } from '@nestjs/common';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { AutoEarnService } from '../../auto-earn/auto-earn.service';

/**
 * AutoEarn能力执行器
 * 处理自动收益相关的所有能力调用
 */
@Injectable()
export class AutoEarnExecutor implements ICapabilityExecutor {
  readonly name = 'AutoEarnExecutor';
  private readonly logger = new Logger(AutoEarnExecutor.name);

  constructor(private readonly autoEarnService: AutoEarnService) {}

  async execute(params: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const { userId } = context;
    
    if (!userId) {
      return {
        success: false,
        error: 'MISSING_USER_ID',
        message: '缺少用户ID',
      };
    }

    // 从metadata中获取能力ID，或者从params中推断
    const capabilityId = context.metadata?.capabilityId || params.capability_id;

    try {
      switch (capabilityId) {
        case 'get_auto_earn_tasks':
          return await this.getTasks(params, userId, context.metadata?.agentId);

        case 'execute_auto_earn_task':
          return await this.executeTask(params, userId, context.metadata?.agentId);

        case 'get_auto_earn_stats':
          return await this.getStats(userId, context.metadata?.agentId);

        case 'toggle_auto_earn_strategy':
          return await this.toggleStrategy(params, userId, context.metadata?.agentId);

        default:
          // 如果没有指定能力ID，尝试从function name推断
          if (params.function_name) {
            return await this.executeByFunctionName(params.function_name, params, userId, context.metadata?.agentId);
          }
          
          return {
            success: false,
            error: 'UNKNOWN_CAPABILITY',
            message: `未知的AutoEarn能力: ${capabilityId}`,
          };
      }
    } catch (error: any) {
      this.logger.error(`AutoEarn执行失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: error.message || '执行失败',
      };
    }
  }

  /**
   * 获取任务列表
   */
  private async getTasks(
    params: Record<string, any>,
    userId: string,
    agentId?: string
  ): Promise<ExecutionResult> {
    const tasks = await this.autoEarnService.getTasks(userId, agentId);

    // 如果指定了类型筛选
    if (params.type) {
      const filtered = tasks.filter(t => t.type === params.type);
      return {
        success: true,
        data: {
          tasks: filtered,
          count: filtered.length,
        },
        message: `获取到 ${filtered.length} 个${params.type}类型任务`,
      };
    }

    return {
      success: true,
      data: {
        tasks,
        count: tasks.length,
      },
      message: `获取到 ${tasks.length} 个任务`,
    };
  }

  /**
   * 执行任务
   */
  private async executeTask(
    params: Record<string, any>,
    userId: string,
    agentId?: string
  ): Promise<ExecutionResult> {
    const taskId = params.task_id;
    
    if (!taskId) {
      return {
        success: false,
        error: 'MISSING_TASK_ID',
        message: '缺少任务ID',
      };
    }

    const result = await this.autoEarnService.executeTask(userId, taskId, agentId);

    if (result.success) {
      return {
        success: true,
        data: result,
        message: '任务执行成功',
      };
    } else {
      return {
        success: false,
        error: 'TASK_EXECUTION_FAILED',
        message: '任务执行失败',
        data: result,
      };
    }
  }

  /**
   * 获取统计数据
   */
  private async getStats(
    userId: string,
    agentId?: string
  ): Promise<ExecutionResult> {
    const stats = await this.autoEarnService.getStats(userId, agentId);

    return {
      success: true,
      data: stats,
      message: `总收益: ${stats.totalEarnings} ${stats.currency}`,
    };
  }

  /**
   * 切换策略
   */
  private async toggleStrategy(
    params: Record<string, any>,
    userId: string,
    agentId?: string
  ): Promise<ExecutionResult> {
    const strategyId = params.strategy_id;
    const enabled = params.enabled;
    
    if (!strategyId || enabled === undefined) {
      return {
        success: false,
        error: 'MISSING_PARAMETERS',
        message: '缺少策略ID或启用状态',
      };
    }

    const result = await this.autoEarnService.toggleStrategy(userId, strategyId, enabled, agentId);

    return {
      success: result.success,
      data: result,
      message: result.success ? `策略已${enabled ? '启用' : '停用'}` : '策略切换失败',
    };
  }

  /**
   * 根据function name执行（兼容Function Calling）
   */
  private async executeByFunctionName(
    functionName: string,
    params: Record<string, any>,
    userId: string,
    agentId?: string
  ): Promise<ExecutionResult> {
    if (functionName === 'get_agentrix_auto_earn_tasks') {
      return await this.getTasks(params, userId, agentId);
    } else if (functionName === 'execute_agentrix_auto_earn_task') {
      return await this.executeTask(params, userId, agentId);
    } else if (functionName === 'get_agentrix_auto_earn_stats') {
      return await this.getStats(userId, agentId);
    } else if (functionName === 'toggle_agentrix_auto_earn_strategy') {
      return await this.toggleStrategy(params, userId, agentId);
    }

    return {
      success: false,
      error: 'UNKNOWN_FUNCTION',
      message: `未知的Function: ${functionName}`,
    };
  }
}

