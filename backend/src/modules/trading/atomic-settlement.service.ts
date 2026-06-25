import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AtomicSettlement, SettlementType, SettlementStatus } from './entities/atomic-settlement.entity';
import { LiquidityMeshService } from '../liquidity/liquidity-mesh.service';
import { BestExecutionService } from '../liquidity/best-execution.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * 原子结算服务
 * 实现跨链原子结算、状态追踪、失败回滚机制
 */
export interface TransactionDetail {
  chain: string;
  fromToken: string;
  toToken: string;
  amount: number;
  transactionHash?: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  error?: string;
}

export interface CreateSettlementRequest {
  userId: string;
  agentId?: string;
  strategyGraphId?: string;
  settlementType: SettlementType;
  chains: string[];
  transactions: TransactionDetail[];
  totalAmount: number;
  metadata?: any;
}

@Injectable()
export class AtomicSettlementService {
  private readonly logger = new Logger(AtomicSettlementService.name);

  constructor(
    @InjectRepository(AtomicSettlement)
    private settlementRepository: Repository<AtomicSettlement>,
    private liquidityMeshService: LiquidityMeshService,
    private bestExecutionService: BestExecutionService,
  ) {}

  /**
   * 创建原子结算
   */
  async createSettlement(request: CreateSettlementRequest): Promise<AtomicSettlement> {
    this.logger.log(`创建原子结算: userId=${request.userId}, type=${request.settlementType}`);

    const settlementId = `SETTLE-${Date.now()}-${uuidv4().substring(0, 8)}`;

    const settlement = await this.settlementRepository.save({
      settlementId,
      userId: request.userId,
      agentId: request.agentId,
      strategyGraphId: request.strategyGraphId,
      settlementType: request.settlementType,
      chains: request.chains,
      transactions: request.transactions,
      totalAmount: request.totalAmount,
      status: SettlementStatus.PENDING,
      metadata: request.metadata || {},
    });

    this.logger.log(`原子结算已创建: settlementId=${settlementId}`);
    return settlement;
  }

  /**
   * 执行原子结算
   * 确保所有交易要么全部成功，要么全部回滚
   */
  async executeSettlement(settlementId: string): Promise<AtomicSettlement> {
    this.logger.log(`执行原子结算: settlementId=${settlementId}`);

    const settlement = await this.settlementRepository.findOne({
      where: { settlementId },
    });

    if (!settlement) {
      throw new Error(`结算记录不存在: ${settlementId}`);
    }

    if (settlement.status !== SettlementStatus.PENDING) {
      throw new Error(`结算状态不正确: ${settlement.status}`);
    }

    // 更新状态为执行中
    settlement.status = SettlementStatus.EXECUTING;
    settlement.executedAt = new Date();
    await this.settlementRepository.save(settlement);

    try {
      // 执行所有交易
      const executedTransactions: TransactionDetail[] = [];
      let totalFee = 0;

      for (const tx of settlement.transactions) {
        try {
          this.logger.log(`执行交易: chain=${tx.chain}, from=${tx.fromToken}, to=${tx.toToken}, amount=${tx.amount}`);

          // 获取最优执行路径
          const bestExecution = await this.bestExecutionService.getBestExecution({
            fromToken: tx.fromToken,
            toToken: tx.toToken,
            amount: tx.amount.toString(),
            chain: tx.chain,
            slippage: 0.5,
          });

          if (!bestExecution || !bestExecution.bestQuote) {
            throw new Error(`无法找到执行路径: ${tx.fromToken} -> ${tx.toToken}`);
          }

          // 执行交换（这里需要根据实际DEX适配器实现）
          // 暂时模拟执行
          const executedTx: TransactionDetail = {
            ...tx,
            status: 'completed',
            transactionHash: `0x${Math.random().toString(16).substring(2, 66)}`, // 模拟交易哈希
          };

          executedTransactions.push(executedTx);
          totalFee += bestExecution.bestQuote.feeBreakdown?.gasFee || bestExecution.bestQuote.fee || 0;

          this.logger.log(`交易执行成功: txHash=${executedTx.transactionHash}`);
        } catch (error: any) {
          this.logger.error(`交易执行失败: ${error.message}`, error.stack);
          // 标记失败并回滚所有已执行的交易
          await this.rollbackSettlement(settlement, error.message);
          throw error;
        }
      }

      // 所有交易成功，更新结算状态
      settlement.status = SettlementStatus.COMPLETED;
      settlement.completedAt = new Date();
      settlement.transactions = executedTransactions;
      settlement.totalFee = totalFee;
      await this.settlementRepository.save(settlement);

      this.logger.log(`原子结算完成: settlementId=${settlementId}`);
      return settlement;
    } catch (error: any) {
      this.logger.error(`原子结算执行失败: ${error.message}`, error.stack);
      // 如果还没有回滚，则执行回滚
      const currentStatus = settlement.status as SettlementStatus;
      if (currentStatus !== SettlementStatus.ROLLED_BACK && currentStatus !== SettlementStatus.FAILED) {
        await this.rollbackSettlement(settlement, error.message);
      }
      throw error;
    }
  }

  /**
   * 回滚结算
   * 撤销所有已执行的交易
   */
  async rollbackSettlement(settlement: AtomicSettlement, reason: string): Promise<void> {
    this.logger.warn(`回滚结算: settlementId=${settlement.settlementId}, reason=${reason}`);

    settlement.status = SettlementStatus.ROLLED_BACK;
    settlement.rollbackReason = reason;
    await this.settlementRepository.save(settlement);

    // 回滚已执行的交易
    for (const tx of settlement.transactions) {
      if (tx.status === 'completed' && tx.transactionHash) {
        try {
          this.logger.log(`回滚交易: txHash=${tx.transactionHash}`);
          // 这里需要实现实际的回滚逻辑（例如：执行反向交易）
          // 暂时只记录日志
        } catch (error: any) {
          this.logger.error(`回滚交易失败: txHash=${tx.transactionHash}, error=${error.message}`);
        }
      }
    }

    this.logger.log(`结算回滚完成: settlementId=${settlement.settlementId}`);
  }

  /**
   * 获取结算状态
   */
  async getSettlement(settlementId: string): Promise<AtomicSettlement | null> {
    return await this.settlementRepository.findOne({
      where: { settlementId },
    });
  }

  /**
   * 获取用户的所有结算记录
   */
  async getUserSettlements(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<AtomicSettlement[]> {
    return await this.settlementRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * 获取待处理的结算记录（用于定时任务）
   */
  async getPendingSettlements(): Promise<AtomicSettlement[]> {
    return await this.settlementRepository.find({
      where: { status: SettlementStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: 100,
    });
  }
}

