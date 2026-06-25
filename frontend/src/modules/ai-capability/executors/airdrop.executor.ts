import { Injectable, Logger } from '@nestjs/common';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { AirdropService } from '../../auto-earn/airdrop.service';

/**
 * Airdrop能力执行器
 * 处理空投相关的所有能力调用
 */
@Injectable()
export class AirdropExecutor implements ICapabilityExecutor {
  readonly name = 'AirdropExecutor';
  private readonly logger = new Logger(AirdropExecutor.name);

  constructor(private readonly airdropService: AirdropService) {}

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
        case 'discover_airdrops':
          return await this.discoverAirdrops(params, userId, context.metadata?.agentId);

        case 'get_airdrops':
          return await this.getAirdrops(params, userId, context.metadata?.agentId);

        case 'check_airdrop_eligibility':
          return await this.checkEligibility(params, userId);

        case 'claim_airdrop':
          return await this.claimAirdrop(params, userId);

        default:
          // 如果没有指定能力ID，尝试从function name推断
          if (params.function_name) {
            return await this.executeByFunctionName(params.function_name, params, userId, context.metadata?.agentId);
          }
          
          return {
            success: false,
            error: 'UNKNOWN_CAPABILITY',
            message: `未知的Airdrop能力: ${capabilityId}`,
          };
      }
    } catch (error: any) {
      this.logger.error(`Airdrop执行失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: error.message || '执行失败',
      };
    }
  }

  /**
   * 发现空投
   */
  private async discoverAirdrops(
    params: Record<string, any>,
    userId: string,
    agentId?: string
  ): Promise<ExecutionResult> {
    const airdrops = await this.airdropService.discoverAirdrops(userId, agentId);

    return {
      success: true,
      data: {
        airdrops: airdrops.map(a => ({
          id: a.id,
          projectName: a.projectName,
          description: a.description,
          chain: a.chain,
          tokenSymbol: a.tokenSymbol,
          estimatedAmount: a.estimatedAmount,
          currency: a.currency,
          requirements: a.requirements,
          status: a.status,
          expiresAt: a.expiresAt,
        })),
        count: airdrops.length,
      },
      message: `发现了 ${airdrops.length} 个空投机会`,
    };
  }

  /**
   * 获取空投列表
   */
  private async getAirdrops(
    params: Record<string, any>,
    userId: string,
    agentId?: string
  ): Promise<ExecutionResult> {
    const status = params.status;
    const airdrops = await this.airdropService.getUserAirdrops(userId, status, agentId);

    return {
      success: true,
      data: {
        airdrops: airdrops.map(a => ({
          id: a.id,
          projectName: a.projectName,
          description: a.description,
          chain: a.chain,
          tokenSymbol: a.tokenSymbol,
          estimatedAmount: a.estimatedAmount,
          currency: a.currency,
          requirements: a.requirements,
          status: a.status,
          expiresAt: a.expiresAt,
        })),
        count: airdrops.length,
      },
      message: `获取到 ${airdrops.length} 个空投`,
    };
  }

  /**
   * 检查空投资格
   */
  private async checkEligibility(
    params: Record<string, any>,
    userId: string
  ): Promise<ExecutionResult> {
    const airdropId = params.airdrop_id;
    
    if (!airdropId) {
      return {
        success: false,
        error: 'MISSING_AIRDROP_ID',
        message: '缺少空投ID',
      };
    }

    const result = await this.airdropService.checkEligibility(airdropId, userId);

    return {
      success: true,
      data: result,
      message: result.eligible ? '符合领取条件' : '不符合领取条件',
    };
  }

  /**
   * 领取空投
   */
  private async claimAirdrop(
    params: Record<string, any>,
    userId: string
  ): Promise<ExecutionResult> {
    const airdropId = params.airdrop_id;
    
    if (!airdropId) {
      return {
        success: false,
        error: 'MISSING_AIRDROP_ID',
        message: '缺少空投ID',
      };
    }

    const result = await this.airdropService.claimAirdrop(airdropId, userId);

    if (result.success) {
      return {
        success: true,
        data: result,
        message: '空投领取成功',
      };
    } else {
      return {
        success: false,
        error: 'CLAIM_FAILED',
        message: result.error || '领取失败',
        data: result,
      };
    }
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
    if (functionName === 'discover_agentrix_airdrops') {
      return await this.discoverAirdrops(params, userId, agentId);
    } else if (functionName === 'get_agentrix_airdrops') {
      return await this.getAirdrops(params, userId, agentId);
    } else if (functionName === 'check_agentrix_airdrop_eligibility') {
      return await this.checkEligibility(params, userId);
    } else if (functionName === 'claim_agentrix_airdrop') {
      return await this.claimAirdrop(params, userId);
    }

    return {
      success: false,
      error: 'UNKNOWN_FUNCTION',
      message: `未知的Function: ${functionName}`,
    };
  }
}

