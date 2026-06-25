import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoEarnTask, TaskType, TaskStatus } from '../../entities/auto-earn-task.entity';
import { StrategyConfig, StrategyType } from '../../entities/strategy-config.entity';
import { ArbitrageService } from './arbitrage.service';
import { LaunchpadService } from './launchpad.service';

export interface StrategyExecution {
  id: string;
  strategyId: string;
  type: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  result?: any;
  executedAt: Date;
}

@Injectable()
export class StrategyService {
  private readonly logger = new Logger(StrategyService.name);

  constructor(
    @InjectRepository(AutoEarnTask)
    private taskRepository: Repository<AutoEarnTask>,
    @InjectRepository(StrategyConfig)
    private strategyConfigRepository: Repository<StrategyConfig>,
    private arbitrageService: ArbitrageService,
    private launchpadService: LaunchpadService,
  ) {}

  /**
   * 创建策略
   */
  async createStrategy(
    userId: string,
    type: StrategyType,
    config: Record<string, any>,
    agentId?: string,
  ): Promise<StrategyConfig> {
    const strategy = this.strategyConfigRepository.create({
      userId,
      agentId,
      type,
      enabled: false,
      config,
    });

    const saved = await this.strategyConfigRepository.save(strategy);

    this.logger.log(`创建策略: ${saved.id}, type=${type}`);

    return saved;
  }

  /**
   * 启动策略
   */
  async startStrategy(strategyId: string, userId: string): Promise<StrategyExecution> {
    const strategy = await this.strategyConfigRepository.findOne({
      where: { id: strategyId, userId },
    });

    if (!strategy) {
      throw new Error('策略不存在或无权限');
    }

    strategy.enabled = true;
    await this.strategyConfigRepository.save(strategy);

    this.logger.log(`启动策略: ${strategyId}, type=${strategy.type}`);

    // 根据策略类型执行
    let result: any;

    switch (strategy.type) {
      case 'arbitrage':
        result = await this.arbitrageService.autoArbitrageStrategy(
          userId,
          strategy.config as { enabled: boolean; minProfitRate: number; maxAmount: number; chains: string[]; pairs: string[]; },
          strategy.agentId,
        );
        break;
      case 'launchpad':
        result = await this.launchpadService.autoParticipateStrategy(
          userId,
          strategy.config as { enabled: boolean; platforms: string[]; minAmount: number; maxAmount: number; autoSniping: boolean; takeProfitRate?: number; },
          strategy.agentId,
        );
        break;
      case 'dca':
        result = await this.executeDCAStrategy(userId, strategy.config as { pair: string; amount: number; frequency: 'daily' | 'weekly' | 'monthly'; duration?: number; }, strategy.agentId);
        break;
      case 'grid':
        result = await this.executeGridStrategy(userId, strategy.config as { pair: string; lowerPrice: number; upperPrice: number; gridCount: number; investment: number; }, strategy.agentId);
        break;
      case 'copy_trading':
        result = await this.executeCopyTradingStrategy(userId, strategy.config as { traderAddress: string; copyRatio: number; maxAmount?: number; }, strategy.agentId);
        break;
      default:
        throw new Error(`未知的策略类型: ${strategy.type}`);
    }

    const execution: StrategyExecution = {
      id: `exec_${Date.now()}`,
      strategyId,
      type: strategy.type,
      status: result.success ? 'completed' : 'failed',
      result,
      executedAt: new Date(),
    };

    return execution;
  }

  /**
   * 停止策略
   */
  async stopStrategy(strategyId: string, userId: string): Promise<void> {
    const strategy = await this.strategyConfigRepository.findOne({
      where: { id: strategyId, userId },
    });

    if (!strategy) {
      throw new Error('策略不存在或无权限');
    }

    strategy.enabled = false;
    await this.strategyConfigRepository.save(strategy);

    this.logger.log(`停止策略: ${strategyId}`);
  }

  /**
   * 执行DCA（定投）策略
   */
  private async executeDCAStrategy(
    userId: string,
    config: {
      pair: string; // 交易对
      amount: number; // 每次投入金额
      frequency: 'daily' | 'weekly' | 'monthly'; // 频率
      duration?: number; // 持续时间（天）
    },
    agentId?: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`执行DCA策略: pair=${config.pair}, amount=${config.amount}`);

    // TODO: 执行真实DCA交易
    // 1. 计算下次执行时间
    // 2. 调用DEX API执行交易
    // 3. 记录交易结果

    // MOCK: 模拟执行
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 创建任务记录
    const task = this.taskRepository.create({
      userId,
      agentId,
      type: TaskType.STRATEGY,
      title: `DCA定投: ${config.pair}`,
      description: `定期投入 ${config.amount} USDC 购买 ${config.pair}`,
      status: TaskStatus.RUNNING,
      rewardAmount: 0,
      rewardCurrency: 'USDC',
      rewardType: 'token',
      metadata: {
        strategyType: 'dca',
        ...config,
      },
    });

    await this.taskRepository.save(task);

    return {
      success: true,
      message: 'DCA策略已启动',
    };
  }

  /**
   * 执行网格交易策略
   */
  private async executeGridStrategy(
    userId: string,
    config: {
      pair: string;
      lowerPrice: number; // 网格下限
      upperPrice: number; // 网格上限
      gridCount: number; // 网格数量
      investment: number; // 总投资金额
    },
    agentId?: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`执行网格策略: pair=${config.pair}`);

    // TODO: 执行真实网格交易
    // 1. 计算网格价格区间
    // 2. 在网格价格点设置买卖订单
    // 3. 监控价格变化，自动执行交易

    // MOCK: 模拟执行
    await new Promise(resolve => setTimeout(resolve, 1000));

    const task = this.taskRepository.create({
      userId,
      agentId,
      type: TaskType.STRATEGY,
      title: `网格交易: ${config.pair}`,
      description: `网格交易策略，${config.gridCount} 个网格`,
      status: TaskStatus.RUNNING,
      rewardAmount: 0,
      rewardCurrency: 'USDC',
      rewardType: 'token',
      metadata: {
        strategyType: 'grid',
        ...config,
      },
    });

    await this.taskRepository.save(task);

    return {
      success: true,
      message: '网格策略已启动',
    };
  }

  /**
   * 执行跟单策略
   */
  private async executeCopyTradingStrategy(
    userId: string,
    config: {
      traderAddress: string; // 跟单的交易员地址
      copyRatio: number; // 跟单比例（0-1）
      maxAmount?: number; // 最大跟单金额
    },
    agentId?: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`执行跟单策略: trader=${config.traderAddress}`);

    // TODO: 执行真实跟单
    // 1. 监控交易员地址的交易
    // 2. 按比例复制交易
    // 3. 记录跟单结果

    // MOCK: 模拟执行
    await new Promise(resolve => setTimeout(resolve, 1000));

    const task = this.taskRepository.create({
      userId,
      agentId,
      type: TaskType.STRATEGY,
      title: `跟单交易: ${config.traderAddress.slice(0, 8)}...`,
      description: `跟随交易员交易，跟单比例 ${(config.copyRatio * 100).toFixed(0)}%`,
      status: TaskStatus.RUNNING,
      rewardAmount: 0,
      rewardCurrency: 'USDC',
      rewardType: 'token',
      metadata: {
        strategyType: 'copy_trading',
        ...config,
      },
    });

    await this.taskRepository.save(task);

    return {
      success: true,
      message: '跟单策略已启动',
    };
  }

  /**
   * 获取用户的策略列表
   */
  async getUserStrategies(userId: string, agentId?: string): Promise<StrategyConfig[]> {
    const where: any = { userId };
    if (agentId) {
      where.agentId = agentId;
    }

    return this.strategyConfigRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取策略详情
   */
  async getStrategy(strategyId: string, userId: string): Promise<StrategyConfig | null> {
    return this.strategyConfigRepository.findOne({
      where: { id: strategyId, userId },
    });
  }
}

