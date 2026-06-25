import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AgentAccountService } from '../../agent-account/agent-account.service';
import { KYCService } from '../../kyc/kyc.service';
import { KYCRecordLevel } from '../../../entities/kyc-record.entity';

/**
 * 支出限额检查装饰器元数据键
 */
export const SPENDING_CHECK_KEY = 'spendingCheck';
export const KYC_LEVEL_KEY = 'kycLevel';

/**
 * 支出检查配置
 */
export interface SpendingCheckConfig {
  amountField?: string; // 请求体中金额字段的路径，默认 'amount'
  agentIdField?: string; // 请求体或参数中 Agent ID 的路径
}

/**
 * 支出限额检查装饰器
 * 用于需要检查 Agent 支出限额的操作
 */
import { SetMetadata } from '@nestjs/common';
export const CheckSpendingLimit = (config?: SpendingCheckConfig) =>
  SetMetadata(SPENDING_CHECK_KEY, config || {});

/**
 * KYC 级别检查装饰器
 * 用于需要特定 KYC 级别的敏感操作
 */
export const RequireKYCLevel = (level: KYCRecordLevel) =>
  SetMetadata(KYC_LEVEL_KEY, level);

/**
 * 交易前置检查守卫
 * 集成支出限额检查和 KYC 级别检查
 */
@Injectable()
export class TransactionGuard implements CanActivate {
  private readonly logger = new Logger(TransactionGuard.name);

  constructor(
    private reflector: Reflector,
    private agentAccountService: AgentAccountService,
    private kycService: KYCService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('用户未认证');
    }

    // 1. 检查 KYC 级别
    const requiredKYCLevel = this.reflector.get<KYCRecordLevel>(
      KYC_LEVEL_KEY,
      context.getHandler(),
    );

    if (requiredKYCLevel) {
      const hasRequiredLevel = await this.kycService.checkKYCLevel(user.id, requiredKYCLevel);
      if (!hasRequiredLevel) {
        this.logger.warn(`用户 ${user.id} KYC 级别不足，需要 ${requiredKYCLevel}`);
        throw new ForbiddenException(`此操作需要 ${requiredKYCLevel} 级别 KYC 认证`);
      }
    }

    // 2. 检查支出限额
    const spendingConfig = this.reflector.get<SpendingCheckConfig>(
      SPENDING_CHECK_KEY,
      context.getHandler(),
    );

    if (spendingConfig) {
      await this.checkSpendingLimit(request, spendingConfig);
    }

    return true;
  }

  /**
   * 检查支出限额
   */
  private async checkSpendingLimit(
    request: any,
    config: SpendingCheckConfig,
  ): Promise<void> {
    const amountField = config.amountField || 'amount';
    const agentIdField = config.agentIdField || 'agentId';

    // 获取金额
    const amount = this.getNestedValue(request.body, amountField) ||
                   this.getNestedValue(request.query, amountField);

    if (!amount || isNaN(Number(amount))) {
      throw new BadRequestException('缺少有效的金额参数');
    }

    // 获取 Agent ID
    const agentId = this.getNestedValue(request.body, agentIdField) ||
                    this.getNestedValue(request.params, agentIdField) ||
                    this.getNestedValue(request.query, agentIdField);

    if (!agentId) {
      // 如果没有 Agent ID，可能是用户直接操作，跳过 Agent 限额检查
      this.logger.debug('未找到 Agent ID，跳过支出限额检查');
      return;
    }

    // 执行限额检查
    const result = await this.agentAccountService.checkSpendingLimit(agentId, Number(amount));
    
    if (!result.allowed) {
      this.logger.warn(`Agent ${agentId} 支出限额检查失败: ${result.reason}`);
      throw new ForbiddenException(result.reason || '超出支出限额');
    }

    // 将检查结果附加到请求中，供后续使用
    request.spendingCheckResult = {
      agentId,
      amount: Number(amount),
      allowed: true,
    };
  }

  /**
   * 获取嵌套对象的值
   */
  private getNestedValue(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}
