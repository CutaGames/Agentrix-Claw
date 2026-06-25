import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { AgentAuthorization } from './entities/agent-authorization.entity';
import { AgentStrategyPermission } from './entities/agent-strategy-permission.entity';
import { AgentExecutionHistory } from './entities/agent-execution-history.entity';
import { CreateAgentAuthorizationDto, StrategyPermissionConfig } from './dto/create-agent-authorization.dto';

/**
 * Agent授权服务
 * 注意：这是独立模块，不影响现有支付功能
 */
@Injectable()
export class AgentAuthorizationService {
  private readonly logger = new Logger(AgentAuthorizationService.name);

  constructor(
    @InjectRepository(AgentAuthorization)
    private readonly authorizationRepository: Repository<AgentAuthorization>,
    @InjectRepository(AgentStrategyPermission)
    private readonly strategyPermissionRepository: Repository<AgentStrategyPermission>,
    @InjectRepository(AgentExecutionHistory)
    private readonly executionHistoryRepository: Repository<AgentExecutionHistory>,
  ) {}

  /**
   * 为Agent创建授权
   */
  async createAgentAuthorization(
    dto: CreateAgentAuthorizationDto,
  ): Promise<AgentAuthorization> {
    this.logger.log(`创建Agent授权: agentId=${dto.agentId}, userId=${dto.userId}`);

    // 1. 创建授权记录
    const authorization = this.authorizationRepository.create({
      agentId: dto.agentId,
      userId: dto.userId,
      walletAddress: dto.walletAddress,
      authorizationType: dto.authorizationType,
      sessionId: dto.sessionId,
      mpcWalletId: dto.mpcWalletId,
      singleLimit: dto.singleLimit,
      dailyLimit: dto.dailyLimit,
      totalLimit: dto.totalLimit,
      expiry: dto.expiry,
      isActive: true,
      usedToday: 0,
      usedTotal: 0,
      lastResetDate: new Date(),
    });

    const savedAuthorization = await this.authorizationRepository.save(authorization);

    // 2. 创建策略权限
    if (dto.allowedStrategies && dto.allowedStrategies.length > 0) {
      const permissions = dto.allowedStrategies.map((strategy) =>
        this.strategyPermissionRepository.create({
          agentAuthorizationId: savedAuthorization.id,
          strategyType: strategy.strategyType,
          allowed: strategy.allowed,
          maxAmount: strategy.maxAmount,
          maxFrequency: strategy.maxFrequency,
          frequencyPeriod: strategy.frequencyPeriod || 'hour',
          allowedTokens: strategy.allowedTokens,
          allowedDEXs: strategy.allowedDEXs,
          allowedCEXs: strategy.allowedCEXs,
          riskLimits: strategy.riskLimits,
        }),
      );

      await this.strategyPermissionRepository.save(permissions);
    }

    // 3. 重新加载关联数据
    return await this.getAuthorizationById(savedAuthorization.id);
  }

  /**
   * 获取Agent的激活授权
   */
  async getActiveAuthorization(agentId: string): Promise<AgentAuthorization | null> {
    const authorization = await this.authorizationRepository.findOne({
      where: {
        agentId,
        isActive: true,
      },
      relations: ['strategyPermissions'],
    });

    if (!authorization) {
      return null;
    }

    // 检查是否过期
    if (authorization.expiry && authorization.expiry < new Date()) {
      this.logger.warn(`授权已过期: authorizationId=${authorization.id}`);
      return null;
    }

    // 检查每日限额重置
    await this.resetDailyLimitIfNeeded(authorization);

    return authorization;
  }

  /**
   * 根据ID获取授权
   */
  async getAuthorizationById(id: string): Promise<AgentAuthorization> {
    const authorization = await this.authorizationRepository.findOne({
      where: { id },
      relations: ['strategyPermissions', 'executionHistory'],
    });

    if (!authorization) {
      throw new NotFoundException(`授权不存在: id=${id}`);
    }

    return authorization;
  }

  /**
   * 检查策略权限
   */
  async checkStrategyPermission(
    agentId: string,
    strategyType: string,
    amount: number,
    tokenAddress: string,
    dexName?: string,
    cexName?: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // 1. 获取Agent的授权
    const authorization = await this.getActiveAuthorization(agentId);
    if (!authorization) {
      return { allowed: false, reason: 'Agent未授权或授权已过期' };
    }

    // 2. 检查策略权限
    const strategyPermission = await this.strategyPermissionRepository.findOne({
      where: {
        agentAuthorizationId: authorization.id,
        strategyType: strategyType as any,
      },
    });

    if (!strategyPermission || !strategyPermission.allowed) {
      return { allowed: false, reason: `策略 ${strategyType} 未授权` };
    }

    // 3. 检查金额限制
    if (strategyPermission.maxAmount && amount > strategyPermission.maxAmount) {
      return {
        allowed: false,
        reason: `金额超过策略限额 ${strategyPermission.maxAmount}`,
      };
    }

    // 4. 检查总限额
    if (authorization.totalLimit && authorization.usedTotal + amount > authorization.totalLimit) {
      return {
        allowed: false,
        reason: `总限额不足，已用 ${authorization.usedTotal}，限额 ${authorization.totalLimit}`,
      };
    }

    // 5. 检查单笔限额
    if (authorization.singleLimit && amount > authorization.singleLimit) {
      return {
        allowed: false,
        reason: `单笔限额不足，限额 ${authorization.singleLimit}`,
      };
    }

    // 6. 检查每日限额
    if (authorization.dailyLimit && authorization.usedToday + amount > authorization.dailyLimit) {
      return {
        allowed: false,
        reason: `每日限额不足，今日已用 ${authorization.usedToday}，限额 ${authorization.dailyLimit}`,
      };
    }

    // 7. 检查代币权限
    if (
      strategyPermission.allowedTokens &&
      strategyPermission.allowedTokens.length > 0 &&
      !strategyPermission.allowedTokens.includes(tokenAddress)
    ) {
      return { allowed: false, reason: `代币 ${tokenAddress} 未授权` };
    }

    // 8. 检查DEX权限
    if (
      dexName &&
      strategyPermission.allowedDEXs &&
      strategyPermission.allowedDEXs.length > 0 &&
      !strategyPermission.allowedDEXs.includes(dexName)
    ) {
      return { allowed: false, reason: `DEX ${dexName} 未授权` };
    }

    // 9. 检查CEX权限
    if (
      cexName &&
      strategyPermission.allowedCEXs &&
      strategyPermission.allowedCEXs.length > 0 &&
      !strategyPermission.allowedCEXs.includes(cexName)
    ) {
      return { allowed: false, reason: `CEX ${cexName} 未授权` };
    }

    // 10. 检查频率限制
    const recentExecutions = await this.getRecentExecutions(agentId, strategyType, strategyPermission.frequencyPeriod || 'hour');
    if (
      strategyPermission.maxFrequency &&
      recentExecutions.length >= strategyPermission.maxFrequency
    ) {
      return { allowed: false, reason: `执行频率超过限制` };
    }

    return { allowed: true };
  }

  /**
   * 记录执行历史
   */
  async recordExecution(
    agentId: string,
    execution: {
      authorizationId: string;
      strategyType?: string;
      executionType: 'payment' | 'trading' | 'market_making' | 'arbitrage';
      amount?: number;
      tokenAddress?: string;
      dexName?: string;
      cexName?: string;
      status: 'success' | 'failed' | 'rejected' | 'pending';
      errorMessage?: string;
      transactionHash?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<AgentExecutionHistory> {
    const history = this.executionHistoryRepository.create({
      agentId,
      ...execution,
    });

    const saved = await this.executionHistoryRepository.save(history);

    // 如果执行成功，更新授权使用量
    if (execution.status === 'success' && execution.amount) {
      await this.updateUsage(execution.authorizationId, execution.amount);
    }

    return saved;
  }

  /**
   * 更新使用量
   */
  private async updateUsage(authorizationId: string, amount: number): Promise<void> {
    const authorization = await this.authorizationRepository.findOne({
      where: { id: authorizationId },
    });

    if (!authorization) {
      return;
    }

    authorization.usedToday += amount;
    authorization.usedTotal += amount;

    await this.authorizationRepository.save(authorization);
  }

  /**
   * 获取最近的执行记录
   */
  private async getRecentExecutions(
    agentId: string,
    strategyType: string,
    period: 'hour' | 'day',
  ): Promise<AgentExecutionHistory[]> {
    const now = new Date();
    const cutoffTime = new Date(now);
    if (period === 'hour') {
      cutoffTime.setHours(cutoffTime.getHours() - 1);
    } else {
      cutoffTime.setDate(cutoffTime.getDate() - 1);
    }

    return await this.executionHistoryRepository.find({
      where: {
        agentId,
        strategyType,
        executedAt: LessThan(now) as any,
      },
      order: {
        executedAt: 'DESC',
      },
      take: 100, // 限制查询数量
    });
  }

  /**
   * 重置每日限额（如果需要）
   */
  private async resetDailyLimitIfNeeded(authorization: AgentAuthorization): Promise<void> {
    if (!authorization.lastResetDate) {
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastReset = new Date(authorization.lastResetDate);
    lastReset.setHours(0, 0, 0, 0);

    if (today > lastReset) {
      authorization.usedToday = 0;
      authorization.lastResetDate = today;
      await this.authorizationRepository.save(authorization);
      this.logger.log(`重置每日限额: authorizationId=${authorization.id}`);
    }
  }

  /**
   * 撤销授权
   */
  async revokeAuthorization(authorizationId: string): Promise<void> {
    const authorization = await this.getAuthorizationById(authorizationId);
    authorization.isActive = false;
    await this.authorizationRepository.save(authorization);
    this.logger.log(`撤销授权: authorizationId=${authorizationId}`);
  }

  /**
   * 获取Agent的所有授权
   */
  async getAuthorizationsByAgentId(agentId: string): Promise<AgentAuthorization[]> {
    return await this.authorizationRepository.find({
      where: { agentId },
      relations: ['strategyPermissions'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取用户的Agent授权列表
   */
  async getAuthorizationsByUserId(userId: string): Promise<AgentAuthorization[]> {
    return await this.authorizationRepository.find({
      where: { userId },
      relations: ['strategyPermissions'],
      order: { createdAt: 'DESC' },
    });
  }
}

