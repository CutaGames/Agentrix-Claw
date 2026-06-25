import { Injectable, Logger } from '@nestjs/common';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { BestExecutionService } from '../../liquidity/best-execution.service';
import { LiquidityMeshService } from '../../liquidity/liquidity-mesh.service';

/**
 * 多DEX最优执行能力执行器
 * 处理多DEX聚合、最优路径查询、最优交换执行等操作
 */
@Injectable()
export class BestExecutionExecutor implements ICapabilityExecutor {
  readonly name = 'BestExecutionExecutor';
  private readonly logger = new Logger(BestExecutionExecutor.name);

  constructor(
    private readonly bestExecutionService: BestExecutionService,
    private readonly liquidityMeshService: LiquidityMeshService,
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
        case 'get_best_execution':
          return await this.getBestExecution(params, userId);
        case 'execute_best_swap':
          return await this.executeBestSwap(params, userId, context);
        default:
          return {
            success: false,
            error: 'UNKNOWN_CAPABILITY',
            message: `未知的最优执行能力: ${capabilityId}`,
          };
      }
    } catch (error: any) {
      this.logger.error(`最优执行失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: `执行失败: ${error.message}`,
      };
    }
  }

  /**
   * 获取最优执行路径
   */
  private async getBestExecution(
    params: Record<string, any>,
    userId: string,
  ): Promise<ExecutionResult> {
    const { fromToken, toToken, amount, chain, dexes } = params;

    if (!fromToken || !toToken || !amount) {
      return {
        success: false,
        error: 'MISSING_REQUIRED_PARAMS',
        message: '缺少必需参数：fromToken, toToken, amount',
      };
    }

    try {
      // 获取最优执行路径
      const bestExecution = await this.bestExecutionService.getBestExecution({
        fromToken,
        toToken,
        amount: amount.toString(),
        chain: chain || 'ethereum',
        slippage: 0.5, // 默认滑点
      });

      return {
        success: true,
        data: {
          fromToken,
          toToken,
          amount,
          bestQuote: {
            provider: bestExecution.bestQuote.provider,
            fromAmount: bestExecution.bestQuote.fromAmount,
            toAmount: bestExecution.bestQuote.toAmount,
            price: bestExecution.bestQuote.price,
            fee: bestExecution.bestQuote.fee,
            gasFee: bestExecution.bestQuote.feeBreakdown?.gasFee || 0,
          },
          alternatives: bestExecution.allQuotes
            .filter(q => q.provider !== bestExecution.bestQuote.provider)
            .map(q => ({
              provider: q.provider,
              toAmount: q.toAmount,
              price: q.price,
              fee: q.fee,
            })),
          executionStrategy: bestExecution.executionStrategy,
          message: `找到最优执行路径：${bestExecution.bestQuote.provider}`,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'QUOTE_ERROR',
        message: `获取报价失败: ${error.message}`,
      };
    }
  }

  /**
   * 执行最优交换
   */
  private async executeBestSwap(
    params: Record<string, any>,
    userId: string,
    context?: ExecutionContext,
  ): Promise<ExecutionResult> {
    const { fromToken, toToken, amount, chain, slippageTolerance } = params;

    if (!fromToken || !toToken || !amount || !chain) {
      return {
        success: false,
        error: 'MISSING_REQUIRED_PARAMS',
        message: '缺少必需参数：fromToken, toToken, amount, chain',
      };
    }

    try {
      // ⭐ 从context获取agentId（如果存在）
      const agentId = context?.metadata?.agentId || params.agentId;

      // 1. 获取最优路径并执行交换（传递agentId进行权限检查）
      const swapResult = await this.liquidityMeshService.executeSwap(
        {
          fromToken,
          toToken,
          amount: amount.toString(),
          chain,
          slippage: slippageTolerance || 0.5,
          walletAddress: context?.metadata?.walletAddress || '', // 从context获取用户钱包地址
        },
        agentId, // ⭐ 传递agentId进行权限检查
      );

      return {
        success: swapResult.success,
        data: {
          transactionHash: swapResult.transactionHash,
          fromToken,
          toToken,
          executedAmount: swapResult.executedAmount,
          executedPrice: swapResult.executedPrice,
          fee: swapResult.fee,
          gasCost: swapResult.gasCost,
          message: swapResult.success ? '最优交换执行成功' : `交换失败: ${swapResult.error}`,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'SWAP_ERROR',
        message: `交换执行失败: ${error.message}`,
      };
    }
  }
}

