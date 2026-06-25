import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MarketMonitor } from './entities/market-monitor.entity';
import { LiquidityMeshService } from '../liquidity/liquidity-mesh.service';

/**
 * 市场监控器服务
 * 监控价格、套利机会、流动性等
 */
@Injectable()
export class MarketMonitorService {
  private readonly logger = new Logger(MarketMonitorService.name);

  constructor(
    @InjectRepository(MarketMonitor)
    private marketMonitorRepository: Repository<MarketMonitor>,
    private liquidityMeshService: LiquidityMeshService,
  ) {}

  /**
   * 创建市场监控
   */
  async createMonitor(
    tokenPair: string,
    chain: string,
    monitorType: 'price' | 'arbitrage' | 'liquidity' | 'volume',
    threshold: MarketMonitor['threshold'],
    strategyGraphId?: string,
  ): Promise<MarketMonitor> {
    this.logger.log(`创建市场监控: ${tokenPair} on ${chain}`);

    return await this.marketMonitorRepository.save({
      tokenPair,
      chain,
      monitorType,
      threshold,
      strategyGraphId,
      isActive: true,
    });
  }

  /**
   * 定时检查所有活跃的监控器
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAllMonitors(): Promise<void> {
    this.logger.log('开始检查所有市场监控器');

    const monitors = await this.marketMonitorRepository.find({
      where: { isActive: true },
    });

    for (const monitor of monitors) {
      try {
        await this.checkMonitor(monitor);
      } catch (error: any) {
        this.logger.error(
          `监控器检查失败: ${monitor.id} - ${error.message}`,
          error.stack,
        );
      }
    }
  }

  /**
   * 检查单个监控器
   */
  private async checkMonitor(monitor: MarketMonitor): Promise<void> {
    const [fromToken, toToken] = monitor.tokenPair.split('/');

    // 1. 获取当前价格
    const currentPrice = await this.getCurrentPrice(
      fromToken,
      toToken,
      monitor.chain,
    );

    // 2. 更新最后价格
    await this.marketMonitorRepository.update(monitor.id, {
      lastPrice: currentPrice,
      lastCheckedAt: new Date(),
    });

    // 3. 根据监控类型检查触发条件
    switch (monitor.monitorType) {
      case 'price':
        await this.checkPriceTrigger(monitor, currentPrice);
        break;

      case 'arbitrage':
        await this.checkArbitrageOpportunity(monitor, fromToken, toToken);
        break;

      case 'liquidity':
        await this.checkLiquidityChange(monitor, fromToken, toToken);
        break;

      case 'volume':
        await this.checkVolumeChange(monitor, fromToken, toToken);
        break;
    }
  }

  /**
   * 检查价格触发
   */
  private async checkPriceTrigger(
    monitor: MarketMonitor,
    currentPrice: number,
  ): Promise<void> {
    if (!monitor.lastPrice) {
      return; // 首次检查，不触发
    }

    const priceChange = ((currentPrice - monitor.lastPrice) / monitor.lastPrice) * 100;
    const threshold = monitor.threshold.priceChange || 1;

    if (Math.abs(priceChange) >= threshold) {
      this.logger.log(
        `价格触发: ${monitor.tokenPair} 价格变化 ${priceChange.toFixed(2)}%`,
      );

      // TODO: 触发策略图执行
      if (monitor.strategyGraphId) {
        // await this.strategyGraphService.executeStrategyGraph(monitor.strategyGraphId);
      }
    }
  }

  /**
   * 检查套利机会
   */
  private async checkArbitrageOpportunity(
    monitor: MarketMonitor,
    fromToken: string,
    toToken: string,
  ): Promise<void> {
    // 1. 获取多个DEX的价格
    const quotes = await this.liquidityMeshService.getBestExecution({
      fromToken,
      toToken,
      amount: '1000000', // 1 USDC（6 decimals）
      chain: monitor.chain,
    });

    // 2. 计算价差
    if (quotes.allQuotes.length >= 2) {
      const prices = quotes.allQuotes.map(q => parseFloat(q.toAmount));
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const priceDiff = ((maxPrice - minPrice) / minPrice) * 100;

      const threshold = monitor.threshold.arbitrageOpportunity || 0.5;

      if (priceDiff >= threshold) {
        this.logger.log(
          `套利机会: ${monitor.tokenPair} 价差 ${priceDiff.toFixed(2)}%`,
        );

        // TODO: 触发套利策略
      }
    }
  }

  /**
   * 检查流动性变化
   */
  private async checkLiquidityChange(
    monitor: MarketMonitor,
    fromToken: string,
    toToken: string,
  ): Promise<void> {
    // TODO: 实现流动性变化监控
    this.logger.warn('Liquidity change monitoring not implemented');
  }

  /**
   * 检查交易量变化
   */
  private async checkVolumeChange(
    monitor: MarketMonitor,
    fromToken: string,
    toToken: string,
  ): Promise<void> {
    // TODO: 实现交易量变化监控
    this.logger.warn('Volume change monitoring not implemented');
  }

  /**
   * 获取当前价格
   */
  private async getCurrentPrice(
    fromToken: string,
    toToken: string,
    chain: string,
  ): Promise<number> {
    try {
      const bestExecution = await this.liquidityMeshService.getBestExecution({
        fromToken,
        toToken,
        amount: '1000000', // 1 USDC (6 decimals)
        chain,
      });

      return bestExecution.bestQuote.price;
    } catch (error: any) {
      this.logger.error(`获取价格失败: ${error.message}`);
      return 0;
    }
  }
}

