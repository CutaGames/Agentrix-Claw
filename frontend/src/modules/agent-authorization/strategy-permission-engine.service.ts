import { Injectable, Logger } from '@nestjs/common';
import { AgentAuthorizationService } from './agent-authorization.service';
import type { StrategyGraph } from '../trading/entities/strategy-graph.entity';
import type { StrategyNode } from '../trading/entities/strategy-node.entity';

/**
 * 策略权限引擎
 * 在Agent执行策略前检查权限
 */
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
  details?: {
    authorizationId?: string;
    strategyType?: string;
    violations?: string[];
  };
}

export interface ExecutionContext {
  amount?: number;
  tokenAddress?: string;
  dexName?: string;
  cexName?: string;
  riskScore?: number;
  currentPosition?: number;
}

@Injectable()
export class StrategyPermissionEngine {
  private readonly logger = new Logger(StrategyPermissionEngine.name);

  constructor(private readonly agentAuthorizationService: AgentAuthorizationService) {}

  /**
   * 检查策略权限（在Agent执行策略前调用）
   */
  async checkPermission(
    agentId: string,
    strategy: StrategyGraph,
    context: ExecutionContext = {},
  ): Promise<PermissionResult> {
    this.logger.log(`检查策略权限: agentId=${agentId}, strategyType=${strategy.strategyType}`);

    // 1. 获取Agent授权
    const authorization = await this.agentAuthorizationService.getActiveAuthorization(agentId);
    if (!authorization) {
      return {
        allowed: false,
        reason: 'Agent未授权或授权已过期',
        details: { strategyType: strategy.strategyType },
      };
    }

    // 2. 检查每个策略节点的权限
    const violations: string[] = [];
    for (const node of strategy.nodes || []) {
      const nodePermission = await this.checkNodePermission(
        authorization.id,
        agentId,
        node,
        context,
      );
      if (!nodePermission.allowed) {
        violations.push(nodePermission.reason || '节点权限检查失败');
      }
    }

    if (violations.length > 0) {
      return {
        allowed: false,
        reason: `策略节点权限检查失败: ${violations.join(', ')}`,
        details: {
          authorizationId: authorization.id,
          strategyType: strategy.strategyType,
          violations,
        },
      };
    }

    // 3. 检查策略级别的权限
    const strategyPermission = await this.agentAuthorizationService.checkStrategyPermission(
      agentId,
      strategy.strategyType,
      context.amount || 0,
      context.tokenAddress || '',
      context.dexName,
      context.cexName,
    );

    if (!strategyPermission.allowed) {
      return {
        allowed: false,
        reason: strategyPermission.reason,
        details: {
          authorizationId: authorization.id,
          strategyType: strategy.strategyType,
        },
      };
    }

    // 4. 检查风险限制
    const riskCheck = await this.checkRiskLimits(authorization.id, strategy, context);
    if (!riskCheck.allowed) {
      return {
        allowed: false,
        reason: riskCheck.reason,
        details: {
          authorizationId: authorization.id,
          strategyType: strategy.strategyType,
        },
      };
    }

    return {
      allowed: true,
      details: {
        authorizationId: authorization.id,
        strategyType: strategy.strategyType,
      },
    };
  }

  /**
   * 检查策略节点权限
   */
  private async checkNodePermission(
    authorizationId: string,
    agentId: string,
    node: StrategyNode,
    context: ExecutionContext,
  ): Promise<PermissionResult> {
    // 根据节点类型检查权限
    // 这里可以根据节点的具体类型（swap, transfer, etc.）进行更细粒度的检查
    // 当前简化实现，主要检查策略级别的权限

    return { allowed: true };
  }

  /**
   * 检查风险限制
   */
  private async checkRiskLimits(
    authorizationId: string,
    strategy: StrategyGraph,
    context: ExecutionContext,
  ): Promise<PermissionResult> {
    // 获取策略权限配置
    const authorization = await this.agentAuthorizationService.getAuthorizationById(authorizationId);
    const strategyPermission = authorization.strategyPermissions?.find(
      (p) => p.strategyType === strategy.strategyType,
    );

    if (!strategyPermission || !strategyPermission.riskLimits) {
      return { allowed: true }; // 没有风险限制，允许
    }

    const riskLimits = strategyPermission.riskLimits;
    const violations: string[] = [];

    // 检查最大回撤
    if (riskLimits.maxDrawdown && context.riskScore && context.riskScore > riskLimits.maxDrawdown) {
      violations.push(`风险评分超过最大回撤限制: ${context.riskScore} > ${riskLimits.maxDrawdown}`);
    }

    // 检查最大杠杆
    if (riskLimits.maxLeverage) {
      // 这里需要根据实际策略计算杠杆
      // 简化实现
    }

    // 检查最大持仓
    if (
      riskLimits.maxPositionSize &&
      context.currentPosition &&
      context.currentPosition > riskLimits.maxPositionSize
    ) {
      violations.push(
        `当前持仓超过最大持仓限制: ${context.currentPosition} > ${riskLimits.maxPositionSize}`,
      );
    }

    if (violations.length > 0) {
      return {
        allowed: false,
        reason: `风险限制检查失败: ${violations.join(', ')}`,
      };
    }

    return { allowed: true };
  }
}

