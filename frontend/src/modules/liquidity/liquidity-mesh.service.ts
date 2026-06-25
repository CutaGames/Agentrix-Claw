import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ILiquidityProvider, PriceQuoteRequest, PriceQuote, SwapRequest, SwapResult } from './interfaces/liquidity-provider.interface';
import { BestExecutionService, BestExecutionResult } from './best-execution.service';
import { JupiterAdapter } from './dex-adapters/jupiter.adapter';
import { UniswapAdapter } from './dex-adapters/uniswap.adapter';
import { RaydiumAdapter } from './dex-adapters/raydium.adapter';
import { PancakeSwapAdapter } from './dex-adapters/pancakeswap.adapter';
import { OpenOceanAdapter } from './dex-adapters/openocean.adapter';
import { AgentAuthorizationService } from '../agent-authorization/agent-authorization.service';

/**
 * 流动性网格服务
 * 统一管理所有流动性提供者，提供最优执行流
 */
@Injectable()
export class LiquidityMeshService {
  private readonly logger = new Logger(LiquidityMeshService.name);
  private readonly providers: Map<string, ILiquidityProvider> = new Map();

  constructor(
    private readonly bestExecutionService: BestExecutionService,
    private readonly jupiterAdapter: JupiterAdapter,
    private readonly uniswapAdapter: UniswapAdapter,
    private readonly raydiumAdapter: RaydiumAdapter,
    private readonly pancakeSwapAdapter: PancakeSwapAdapter,
    private readonly openOceanAdapter: OpenOceanAdapter,
    private readonly agentAuthorizationService: AgentAuthorizationService,
  ) {
    // 注册所有流动性提供者
    this.registerProvider(jupiterAdapter);
    this.registerProvider(uniswapAdapter);
    this.registerProvider(raydiumAdapter);
    this.registerProvider(pancakeSwapAdapter);
    this.registerProvider(openOceanAdapter);
  }

  /**
   * 注册流动性提供者
   */
  registerProvider(provider: ILiquidityProvider): void {
    this.providers.set(provider.getName(), provider);
    this.logger.log(`Registered liquidity provider: ${provider.getName()}`);
  }

  /**
   * 获取最优执行流
   * 这是Liquidity Mesh的核心功能
   */
  async getBestExecution(
    request: PriceQuoteRequest,
  ): Promise<BestExecutionResult> {
    this.logger.log(`获取最优执行流: ${JSON.stringify(request)}`);

    // 更新BestExecutionService的提供者列表
    this.bestExecutionService.setProviders(Array.from(this.providers.values()));

    return await this.bestExecutionService.getBestExecution(request);
  }

  /**
   * 执行交换（使用最优执行流）
   * @param request 交换请求
   * @param agentId 可选的Agent ID，如果提供则进行权限检查
   */
  async executeSwap(request: SwapRequest, agentId?: string): Promise<SwapResult> {
    this.logger.log(`执行交换: ${JSON.stringify(request)}, agentId=${agentId}`);

    // 1. ⭐ 权限检查：如果提供了agentId，检查Agent是否有权限执行此交易
    if (agentId) {
      const amount = parseFloat(request.amount);
      const permission = await this.agentAuthorizationService.checkStrategyPermission(
        agentId,
        'swap', // 策略类型
        amount,
        request.fromToken,
        undefined, // dexName将在获取最优执行后确定
        undefined, // cexName
      );

      if (!permission.allowed) {
        this.logger.warn(
          `权限检查失败: agentId=${agentId}, reason=${permission.reason}`,
        );
        throw new ForbiddenException(`权限检查失败: ${permission.reason}`);
      }

      this.logger.log(`权限检查通过: agentId=${agentId}`);
    }

    // 2. 获取最优执行流
    const bestExecution = await this.getBestExecution({
      fromToken: request.fromToken,
      toToken: request.toToken,
      amount: request.amount,
      chain: request.chain,
      slippage: request.slippage,
    });

    // 3. 根据执行策略执行
    let result: SwapResult;
    if (bestExecution.executionStrategy.splitOrders) {
      // 拆单执行
      result = await this.executeSplitSwap(
        request,
        bestExecution.executionStrategy.splitOrders,
      );
    } else {
      // 单提供者执行
      const provider = this.providers.get(bestExecution.bestQuote.provider);
      if (!provider) {
        throw new Error(`Provider not found: ${bestExecution.bestQuote.provider}`);
      }

      result = await provider.executeSwap({
        ...request,
        quote: bestExecution.bestQuote,
      });
    }

    // 4. ⭐ 记录执行历史：如果提供了agentId，记录执行结果
    if (agentId) {
      try {
        const authorization = await this.agentAuthorizationService.getActiveAuthorization(agentId);
        if (authorization) {
          await this.agentAuthorizationService.recordExecution(agentId, {
            authorizationId: authorization.id,
            strategyType: 'swap',
            executionType: 'trading',
            amount: parseFloat(request.amount),
            tokenAddress: request.fromToken,
            dexName: bestExecution.bestQuote.provider,
            status: result.success ? 'success' : 'failed',
            errorMessage: result.error,
            transactionHash: result.transactionHash,
            metadata: {
              toToken: request.toToken,
              chain: request.chain,
              executedPrice: result.executedPrice,
              executedAmount: result.executedAmount,
            },
          });
          this.logger.log(`执行历史已记录: agentId=${agentId}`);
        }
      } catch (error: any) {
        // 记录执行历史失败不应该影响交易结果
        this.logger.error(
          `记录执行历史失败: ${error.message}`,
          error.stack,
        );
      }
    }

    return result;
  }

  /**
   * 拆单执行
   */
  private async executeSplitSwap(
    request: SwapRequest,
    splitOrders: Array<{ provider: string; amount: string; percentage: number }>,
  ): Promise<SwapResult> {
    this.logger.log(`执行拆单交换: ${splitOrders.length} 个订单`);

    // 并行执行所有拆单
    const swapPromises = splitOrders.map(async (order) => {
      const provider = this.providers.get(order.provider);
      if (!provider) {
        throw new Error(`Provider not found: ${order.provider}`);
      }

      return await provider.executeSwap({
        ...request,
        amount: order.amount,
      });
    });

    const results = await Promise.all(swapPromises);

    // 聚合结果
    const success = results.every(r => r.success);
    const totalExecutedAmount = results.reduce(
      (sum, r) => sum + parseFloat(r.executedAmount || '0'),
      0,
    );
    const totalFee = results.reduce((sum, r) => sum + (r.fee || 0), 0);
    const totalGasCost = results.reduce((sum, r) => sum + (r.gasCost || 0), 0);

    return {
      success,
      executedAmount: totalExecutedAmount.toString(),
      fee: totalFee,
      gasCost: totalGasCost,
      timestamp: new Date(),
    };
  }

  /**
   * 获取所有支持的链
   */
  getSupportedChains(): string[] {
    const chains = new Set<string>();
    this.providers.forEach(provider => {
      provider.getSupportedChains().forEach(chain => chains.add(chain));
    });
    return Array.from(chains);
  }

  /**
   * 获取所有流动性提供者
   */
  getProviders(): ILiquidityProvider[] {
    return Array.from(this.providers.values());
  }
}

