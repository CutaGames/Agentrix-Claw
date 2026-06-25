import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAgent } from '../../entities/user-agent.entity';
import { AutoEarnTask as AutoEarnTaskEntity, TaskStatus, TaskType } from '../../entities/auto-earn-task.entity';
import { Airdrop, AirdropStatus } from '../../entities/airdrop.entity';
import { TaskExecutorService } from './task-executor.service';
import { AirdropService } from './airdrop.service';

export interface AutoEarnTask {
  id: string;
  type: 'airdrop' | 'task' | 'strategy' | 'referral';
  title: string;
  description: string;
  status: 'available' | 'running' | 'completed' | 'failed';
  reward: {
    amount: number;
    currency: string;
    type: 'token' | 'fiat' | 'nft';
  };
  metadata?: any;
  createdAt: Date;
  completedAt?: Date;
}

export interface AutoEarnStats {
  totalEarnings: number;
  currency: string;
  tasksCompleted: number;
  tasksRunning: number;
  tasksAvailable: number;
  earningsByType: {
    airdrop: number;
    task: number;
    strategy: number;
    referral: number;
  };
  recentEarnings: Array<{
    date: string;
    amount: number;
    type: string;
  }>;
}

@Injectable()
export class AutoEarnService {
  private readonly logger = new Logger(AutoEarnService.name);

  constructor(
    @InjectRepository(UserAgent)
    private userAgentRepository: Repository<UserAgent>,
    @InjectRepository(AutoEarnTaskEntity)
    private taskRepository: Repository<AutoEarnTaskEntity>,
    @InjectRepository(Airdrop)
    private airdropRepository: Repository<Airdrop>,
    private taskExecutor: TaskExecutorService,
    private airdropService: AirdropService,
  ) {}

  /**
   * 获取用户的Auto-Earn任务列表
   * 从数据库获取真实任务数据，如果没有则自动发现
   */
  async getTasks(userId: string, agentId?: string): Promise<AutoEarnTask[]> {
    // 从数据库获取任务
    const dbTasks = await this.taskRepository.find({
      where: { userId, ...(agentId ? { agentId } : {}) },
      order: { createdAt: 'DESC' },
    });

    // 如果数据库中没有任务，自动发现空投并创建任务
    if (dbTasks.length === 0) {
      await this.airdropService.discoverAirdrops(userId, agentId);
      const airdrops = await this.airdropService.getUserAirdrops(userId, undefined, agentId);
      
      // 为空投创建任务
      for (const airdrop of airdrops) {
        const task = this.taskRepository.create({
          userId,
          agentId,
          type: TaskType.AIRDROP,
          title: `${airdrop.projectName} 空投`,
          description: airdrop.description,
          status: TaskStatus.AVAILABLE,
          rewardAmount: airdrop.estimatedAmount || 0,
          rewardCurrency: airdrop.currency,
          rewardType: 'token',
          metadata: {
            airdropId: airdrop.id,
            chain: airdrop.chain,
            tokenSymbol: airdrop.tokenSymbol,
          },
          requirements: airdrop.requirements,
        });
        await this.taskRepository.save(task);
      }
    }

    // 转换数据库实体为接口格式
    return dbTasks.map(task => ({
      id: task.id,
      type: task.type as any,
      title: task.title,
      description: task.description || '',
      status: task.status as any,
      reward: {
        amount: Number(task.rewardAmount),
        currency: task.rewardCurrency,
        type: task.rewardType as any,
      },
      metadata: task.metadata,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    }));
  }

  /**
   * 执行Auto-Earn任务
   * 使用任务执行引擎执行
   */
  async executeTask(userId: string, taskId: string, agentId?: string): Promise<{
    success: boolean;
    task: AutoEarnTask;
    reward?: any;
  }> {
    this.logger.log(`执行Auto-Earn任务: ${taskId} for user ${userId}`);

    // 使用任务执行引擎执行
    const result = await this.taskExecutor.executeTask(taskId, userId);

    if (!result.success) {
      throw new Error(result.error || '任务执行失败');
    }

    // 获取更新后的任务
    const taskEntity = await this.taskRepository.findOne({
      where: { id: taskId, userId },
    });

    if (!taskEntity) {
      throw new Error('任务不存在');
    }

    const task: AutoEarnTask = {
      id: taskEntity.id,
      type: taskEntity.type as any,
      title: taskEntity.title,
      description: taskEntity.description || '',
      status: taskEntity.status as any,
      reward: {
        amount: Number(taskEntity.rewardAmount),
        currency: taskEntity.rewardCurrency,
        type: taskEntity.rewardType as any,
      },
      metadata: taskEntity.metadata,
      createdAt: taskEntity.createdAt,
      completedAt: taskEntity.completedAt,
    };

    return {
      success: true,
      task,
      reward: result.result?.reward || task.reward,
    };
  }

  /**
   * 获取Auto-Earn统计数据
   * 从数据库聚合真实数据
   */
  /**
   * 获取用户的 Auto-Earn 统计（真实数据）
   */
  async getStats(userId: string, agentId?: string): Promise<AutoEarnStats> {
    const query: any = { userId };
    if (agentId) query.agentId = agentId;

    // 获取所有任务
    const allTasks = await this.taskRepository.find({ where: query });

    // 计算统计数据
    const tasksCompleted = allTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
    const tasksRunning = allTasks.filter(t => t.status === TaskStatus.RUNNING).length;
    const tasksAvailable = allTasks.filter(t => t.status === TaskStatus.AVAILABLE).length;

    // 计算总收益（已完成任务的奖励总和）
    const completedTasks = allTasks.filter(t => t.status === TaskStatus.COMPLETED);
    const totalEarnings = completedTasks.reduce(
      (sum, task) => sum + Number(task.rewardAmount),
      0,
    );

    // 按类型统计收益
    const earningsByType = {
      airdrop: completedTasks
        .filter(t => t.type === TaskType.AIRDROP)
        .reduce((sum, t) => sum + Number(t.rewardAmount), 0),
      task: completedTasks
        .filter(t => t.type === TaskType.TASK)
        .reduce((sum, t) => sum + Number(t.rewardAmount), 0),
      strategy: completedTasks
        .filter(t => t.type === TaskType.STRATEGY)
        .reduce((sum, t) => sum + Number(t.rewardAmount), 0),
      referral: completedTasks
        .filter(t => t.type === TaskType.REFERRAL)
        .reduce((sum, t) => sum + Number(t.rewardAmount), 0),
    };

    // 获取最近收益（最近7天）
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCompleted = completedTasks.filter(
      t => t.completedAt && t.completedAt >= sevenDaysAgo,
    );

    const recentEarnings = recentCompleted.map(task => ({
      date: task.completedAt!.toISOString().split('T')[0],
      amount: Number(task.rewardAmount),
      type: task.type,
    }));

    return {
      totalEarnings,
      currency: 'USDC',
      tasksCompleted,
      tasksRunning,
      tasksAvailable,
      earningsByType,
      recentEarnings,
    };
  }

  /**
   * 启动/停止策略
   * MOCK: 当前模拟操作，后续需要连接真实策略引擎
   */
  async toggleStrategy(
    userId: string,
    strategyId: string,
    enabled: boolean,
    agentId?: string,
  ): Promise<{ success: boolean; strategy: any }> {
    this.logger.log(`切换策略状态: ${strategyId} -> ${enabled ? 'enabled' : 'disabled'}`);

    // TODO: 连接真实策略引擎
    // MOCK: 模拟操作
    await new Promise(resolve => setTimeout(resolve, 500));

    return {
      success: true,
      strategy: {
        id: strategyId,
        enabled,
        updatedAt: new Date(),
      },
    };
  }
}

