import { Injectable, Logger } from '@nestjs/common';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { AtomicSettlementService, CreateSettlementRequest, TransactionDetail } from '../../trading/atomic-settlement.service';
import { SettlementType } from '../../trading/entities/atomic-settlement.entity';

/**
 * 原子结算能力执行器
 * 处理原子结算的创建、执行、状态查询等操作
 */
@Injectable()
export class AtomicSettlementExecutor implements ICapabilityExecutor {
  readonly name = 'AtomicSettlementExecutor';
  private readonly logger = new Logger(AtomicSettlementExecutor.name);

  constructor(
    private readonly atomicSettlementService: AtomicSettlementService,
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
        case 'create_atomic_settlement':
          return await this.createSettlement(params, userId);
        case 'execute_atomic_settlement':
          return await this.executeSettlement(params, userId);
        case 'get_atomic_settlement_status':
          return await this.getSettlementStatus(params, userId);
        default:
          return {
            success: false,
            error: 'UNKNOWN_CAPABILITY',
            message: `未知的原子结算能力: ${capabilityId}`,
          };
      }
    } catch (error: any) {
      this.logger.error(`原子结算执行失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'EXECUTION_ERROR',
        message: `执行失败: ${error.message}`,
      };
    }
  }

  /**
   * 创建原子结算
   */
  private async createSettlement(
    params: Record<string, any>,
    userId: string,
  ): Promise<ExecutionResult> {
    const { transactions, condition } = params;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return {
        success: false,
        error: 'MISSING_TRANSACTIONS',
        message: '缺少必需参数：transactions（交易列表）',
      };
    }

    if (!condition) {
      return {
        success: false,
        error: 'MISSING_CONDITION',
        message: '缺少必需参数：condition（执行条件）',
      };
    }

    // 提取所有涉及的链
    const chains = [...new Set(transactions.map(tx => tx.chain))];
    
    // 计算总金额（如果有）
    const totalAmount = transactions.reduce((sum, tx) => {
      return sum + (parseFloat(tx.params?.amount || '0'));
    }, 0);

    // 转换为TransactionDetail格式
    const transactionDetails: TransactionDetail[] = transactions.map(tx => ({
      chain: tx.chain,
      fromToken: tx.params?.fromToken || '',
      toToken: tx.params?.toToken || '',
      amount: parseFloat(tx.params?.amount || '0'),
      status: 'pending' as const,
    }));

    // 根据条件确定结算类型
    let settlementType: SettlementType;
    if (chains.length > 1) {
      settlementType = SettlementType.CROSS_CHAIN;
    } else if (transactions.length > 1) {
      settlementType = SettlementType.MULTI_ASSET;
    } else {
      settlementType = SettlementType.CONDITIONAL;
    }

    const request: CreateSettlementRequest = {
      userId,
      settlementType,
      chains,
      transactions: transactionDetails,
      totalAmount,
      metadata: {
        condition,
        createdAt: new Date().toISOString(),
      },
    };

    const settlement = await this.atomicSettlementService.createSettlement(request);

    return {
      success: true,
      data: {
        settlementId: settlement.id,
        status: settlement.status,
        transactions: settlement.transactions,
        condition: settlement.metadata?.condition,
        message: '原子结算创建成功',
      },
    };
  }

  /**
   * 执行原子结算
   */
  private async executeSettlement(
    params: Record<string, any>,
    userId: string,
  ): Promise<ExecutionResult> {
    const { settlementId } = params;

    if (!settlementId) {
      return {
        success: false,
        error: 'MISSING_SETTLEMENT_ID',
        message: '缺少必需参数：settlementId',
      };
    }

    const settlement = await this.atomicSettlementService.executeSettlement(settlementId);

    return {
      success: settlement.status === 'completed',
      data: {
        settlementId: settlement.settlementId,
        status: settlement.status,
        transactions: settlement.transactions,
        executedAt: settlement.executedAt,
        completedAt: settlement.completedAt,
        message: settlement.status === 'completed' ? '原子结算执行成功' : '原子结算执行中或失败',
      },
    };
  }

  /**
   * 查询原子结算状态
   */
  private async getSettlementStatus(
    params: Record<string, any>,
    userId: string,
  ): Promise<ExecutionResult> {
    const { settlementId } = params;

    if (!settlementId) {
      return {
        success: false,
        error: 'MISSING_SETTLEMENT_ID',
        message: '缺少必需参数：settlementId',
      };
    }

    const settlement = await this.atomicSettlementService.getSettlement(settlementId);

    if (!settlement) {
      return {
        success: false,
        error: 'SETTLEMENT_NOT_FOUND',
        message: '未找到结算记录',
      };
    }

    return {
      success: true,
      data: {
        settlementId: settlement.settlementId,
        status: settlement.status,
        transactions: settlement.transactions,
        executedAt: settlement.executedAt,
        completedAt: settlement.completedAt,
        message: '获取结算状态成功',
      },
    };
  }
}

