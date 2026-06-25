import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoEarnTask, TaskType, TaskStatus } from '../../entities/auto-earn-task.entity';
import { AirdropService } from './airdrop.service';

@Injectable()
export class TaskExecutorService {
  private readonly logger = new Logger(TaskExecutorService.name);

  constructor(
    @InjectRepository(AutoEarnTask)
    private taskRepository: Repository<AutoEarnTask>,
    private airdropService: AirdropService,
  ) {}

  /**
   * 执行任务
   */
  async executeTask(taskId: string, userId: string): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId, userId },
    });

    if (!task) {
      throw new Error('任务不存在');
    }

    if (task.status !== TaskStatus.AVAILABLE && task.status !== TaskStatus.RUNNING) {
      return {
        success: false,
        error: '任务状态不允许执行',
      };
    }

    try {
      task.status = TaskStatus.RUNNING;
      await this.taskRepository.save(task);

      let result: any;

      // 根据任务类型执行不同的逻辑
      switch (task.type) {
        case TaskType.AIRDROP:
          result = await this.executeAirdropTask(task, userId);
          break;
        case TaskType.TASK:
          result = await this.executeGeneralTask(task, userId);
          break;
        case TaskType.STRATEGY:
          result = await this.executeStrategyTask(task, userId);
          break;
        case TaskType.REFERRAL:
          result = await this.executeReferralTask(task, userId);
          break;
        default:
          throw new Error(`未知的任务类型: ${task.type}`);
      }

      task.status = TaskStatus.COMPLETED;
      task.completedAt = new Date();
      task.executionResult = result;
      await this.taskRepository.save(task);

      this.logger.log(`任务执行成功: ${taskId}`);

      return {
        success: true,
        result,
      };
    } catch (error: any) {
      task.status = TaskStatus.FAILED;
      task.executionResult = { error: error.message };
      await this.taskRepository.save(task);

      this.logger.error(`任务执行失败: ${taskId}`, error);

      return {
        success: false,
        error: error.message || '执行失败',
      };
    }
  }

  /**
   * 执行空投任务
   */
  private async executeAirdropTask(task: AutoEarnTask, userId: string): Promise<any> {
    this.logger.log(`执行空投任务: ${task.id}`);

    // 检查空投是否符合条件
    const airdropId = task.metadata?.airdropId;
    if (airdropId) {
      const eligibility = await this.airdropService.checkEligibility(airdropId, userId);
      if (!eligibility.eligible) {
        throw new Error(`不符合领取条件: ${eligibility.missingRequirements?.join(', ')}`);
      }

      // 自动领取
      const claimResult = await this.airdropService.claimAirdrop(airdropId, userId);
      if (!claimResult.success) {
        throw new Error(claimResult.error || '领取失败');
      }

      return {
        type: 'airdrop',
        transactionHash: claimResult.transactionHash,
        reward: {
          amount: task.rewardAmount,
          currency: task.rewardCurrency,
        },
      };
    }

    // 如果没有指定空投ID，尝试发现新空投
    const airdrops = await this.airdropService.discoverAirdrops(userId, task.agentId);
    return {
      type: 'airdrop',
      discovered: airdrops.length,
      airdrops: airdrops.map(a => ({
        id: a.id,
        projectName: a.projectName,
        estimatedAmount: a.estimatedAmount,
      })),
    };
  }

  /**
   * 执行通用任务
   */
  private async executeGeneralTask(task: AutoEarnTask, userId: string): Promise<any> {
    this.logger.log(`执行通用任务: ${task.id}`);

    // TODO: 根据任务要求执行相应操作
    // 例如：分享链接、完成验证、签到等

    // MOCK: 模拟执行
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      type: 'task',
      completed: true,
      reward: {
        amount: task.rewardAmount,
        currency: task.rewardCurrency,
      },
    };
  }

  /**
   * 执行策略任务
   */
  private async executeStrategyTask(task: AutoEarnTask, userId: string): Promise<any> {
    this.logger.log(`执行策略任务: ${task.id}`);

    // TODO: 执行交易策略
    // 例如：DCA定投、网格交易、套利等

    const strategyType = task.metadata?.strategyType;
    if (strategyType === 'dca') {
      // DCA定投策略
      // TODO: 调用DEX API执行交易
      return {
        type: 'strategy',
        strategyType: 'dca',
        executed: true,
        amount: task.metadata?.amount || 0,
      };
    }

    // MOCK: 模拟执行
    await new Promise(resolve => setTimeout(resolve, 1500));

    return {
      type: 'strategy',
      strategyType,
      executed: true,
    };
  }

  /**
   * 执行推广任务
   */
  private async executeReferralTask(task: AutoEarnTask, userId: string): Promise<any> {
    this.logger.log(`执行推广任务: ${task.id}`);

    // 推广任务通常是持续性的，不需要立即执行
    // 收益会通过推广分成系统自动计算

    return {
      type: 'referral',
      status: 'running',
      message: '推广任务持续进行中，收益将自动计算',
    };
  }

  /**
   * 批量执行任务
   */
  async batchExecuteTasks(userId: string, taskIds: string[]): Promise<{
    success: number;
    failed: number;
    results: Array<{ taskId: string; success: boolean; error?: string }>;
  }> {
    const results: Array<{ taskId: string; success: boolean; error?: string }> = [];
    let success = 0;
    let failed = 0;

    for (const taskId of taskIds) {
      try {
        const result = await this.executeTask(taskId, userId);
        results.push({
          taskId,
          success: result.success,
          error: result.error,
        });
        if (result.success) success++;
        else failed++;
      } catch (error: any) {
        results.push({
          taskId,
          success: false,
          error: error.message,
        });
        failed++;
      }
    }

    return { success, failed, results };
  }
}

