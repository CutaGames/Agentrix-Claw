import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoEarnTask, TaskType, TaskStatus } from '../../entities/auto-earn-task.entity';

export interface ArbitrageOpportunity {
  id: string;
  pair: string; // 交易对，如 'SOL/USDC'
  chain: string; // 链，如 'solana'
  dex1: string; // DEX1名称
  dex2: string; // DEX2名称
  price1: number; // DEX1价格
  price2: number; // DEX2价格
  priceDiff: number; // 价格差
  profitRate: number; // 利润率（百分比）
  estimatedProfit: number; // 预估利润
  minAmount: number; // 最小套利金额
  maxAmount: number; // 最大套利金额
  riskLevel: 'low' | 'medium' | 'high'; // 风险等级
  expiresAt: Date; // 机会过期时间
}

export interface ArbitrageExecution {
  id: string;
  opportunityId: string;
  userId: string;
  amount: number;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  buyTxHash?: string;
  sellTxHash?: string;
  actualProfit?: number;
  gasCost?: number;
  netProfit?: number;
  executedAt?: Date;
}

@Injectable()
export class ArbitrageService {
  private readonly logger = new Logger(ArbitrageService.name);

  constructor(
    @InjectRepository(AutoEarnTask)
    private taskRepository: Repository<AutoEarnTask>,
  ) {}

  /**
   * 扫描套利机会
   * 比较不同DEX的价格，发现套利机会
   */
  async scanArbitrageOpportunities(
    chains: string[] = ['solana', 'ethereum', 'bsc'],
    pairs: string[] = ['SOL/USDC', 'ETH/USDT', 'BNB/USDT'],
  ): Promise<ArbitrageOpportunity[]> {
    this.logger.log(`扫描套利机会: chains=${chains.join(',')}, pairs=${pairs.join(',')}`);

    const opportunities: ArbitrageOpportunity[] = [];

    // TODO: 集成真实DEX API
    // 1. 查询Jupiter (Solana)
    // 2. 查询Uniswap/1inch (Ethereum)
    // 3. 查询PancakeSwap (BSC)
    // 4. 比较价格，发现套利机会

    // MOCK: 模拟套利机会
    for (const pair of pairs) {
      const chain = pair.includes('SOL') ? 'solana' : pair.includes('ETH') ? 'ethereum' : 'bsc';
      
      // 模拟价格差异
      const price1 = 100 + Math.random() * 10;
      const price2 = 100 - Math.random() * 10;
      const priceDiff = Math.abs(price1 - price2);
      const profitRate = (priceDiff / Math.min(price1, price2)) * 100;

      // 只有利润率大于1%才认为是机会
      if (profitRate > 1) {
        opportunities.push({
          id: `arb_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          pair,
          chain,
          dex1: chain === 'solana' ? 'Jupiter' : chain === 'ethereum' ? 'Uniswap' : 'PancakeSwap',
          dex2: chain === 'solana' ? 'Raydium' : chain === 'ethereum' ? '1inch' : 'PancakeSwap',
          price1,
          price2,
          priceDiff,
          profitRate,
          estimatedProfit: priceDiff * 0.01, // 假设套利1%的金额
          minAmount: 10,
          maxAmount: 1000,
          riskLevel: profitRate > 5 ? 'high' : profitRate > 2 ? 'medium' : 'low',
          expiresAt: new Date(Date.now() + 60000), // 1分钟后过期
        });
      }
    }

    this.logger.log(`发现 ${opportunities.length} 个套利机会`);

    return opportunities;
  }

  /**
   * 执行套利交易
   */
  async executeArbitrage(
    userId: string,
    opportunityId: string,
    amount: number,
    agentId?: string,
  ): Promise<ArbitrageExecution> {
    this.logger.log(`执行套利: opportunityId=${opportunityId}, amount=${amount}`);

    // TODO: 执行真实套利交易
    // 1. 在低价DEX买入
    // 2. 在高价DEX卖出
    // 3. 计算实际利润
    // 4. 扣除Gas费用

    // MOCK: 模拟执行
    await new Promise(resolve => setTimeout(resolve, 2000));

    const execution: ArbitrageExecution = {
      id: `exec_${Date.now()}`,
      opportunityId,
      userId,
      amount,
      status: 'completed',
      buyTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      sellTxHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      actualProfit: amount * 0.01, // 假设1%利润
      gasCost: amount * 0.001, // 假设0.1% Gas费用
      netProfit: amount * 0.009, // 净利润
      executedAt: new Date(),
    };

    // 创建任务记录
    const task = this.taskRepository.create({
      userId,
      agentId,
      type: TaskType.STRATEGY,
      title: `套利交易: ${opportunityId}`,
      description: `自动套利交易，净利润 ${execution.netProfit?.toFixed(2)} USDC`,
      status: TaskStatus.COMPLETED,
      rewardAmount: execution.netProfit || 0,
      rewardCurrency: 'USDC',
      rewardType: 'fiat',
      metadata: {
        opportunityId,
        executionId: execution.id,
        buyTxHash: execution.buyTxHash,
        sellTxHash: execution.sellTxHash,
      },
      completedAt: new Date(),
    });

    await this.taskRepository.save(task);

    this.logger.log(`套利执行完成: ${execution.id}, 净利润: ${execution.netProfit}`);

    return execution;
  }

  /**
   * 自动套利策略（持续监控并执行）
   */
  async autoArbitrageStrategy(
    userId: string,
    config: {
      enabled: boolean;
      minProfitRate: number; // 最小利润率（%）
      maxAmount: number; // 最大单笔金额
      chains: string[];
      pairs: string[];
    },
    agentId?: string,
  ): Promise<{ success: boolean; executions: ArbitrageExecution[] }> {
    if (!config.enabled) {
      return { success: true, executions: [] };
    }

    this.logger.log(`自动套利策略: userId=${userId}, config=${JSON.stringify(config)}`);

    // 扫描套利机会
    const opportunities = await this.scanArbitrageOpportunities(config.chains, config.pairs);

    // 过滤符合条件的机会
    const eligibleOpportunities = opportunities.filter(
      opp => opp.profitRate >= config.minProfitRate && opp.estimatedProfit <= config.maxAmount,
    );

    const executions: ArbitrageExecution[] = [];

    // 执行符合条件的套利
    for (const opp of eligibleOpportunities) {
      try {
        const execution = await this.executeArbitrage(
          userId,
          opp.id,
          Math.min(opp.estimatedProfit, config.maxAmount),
          agentId,
        );
        executions.push(execution);
      } catch (error) {
        this.logger.error(`套利执行失败: ${opp.id}`, error);
      }
    }

    return { success: true, executions };
  }
}

