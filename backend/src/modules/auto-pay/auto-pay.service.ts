import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoPayGrant } from '../../entities/auto-pay-grant.entity';
import { Authorization, AuthorizationStatus } from '../../entities/authorization.entity';
import { CreateGrantDto, UpdateGrantDto } from './dto/auto-pay.dto';
import { AutoPayExecutorService, AutoPaymentRequest } from './auto-pay-executor.service';
import { AuthorizationService } from '../agent/authorization.service';

/**
 * 自动支付服务
 * 已迁移到使用 Authorization 实体
 * 保留对旧 AutoPayGrant 的兼容性支持
 */
@Injectable()
export class AutoPayService {
  constructor(
    @InjectRepository(AutoPayGrant)
    private grantRepository: Repository<AutoPayGrant>,
    @InjectRepository(Authorization)
    private authorizationRepository: Repository<Authorization>,
    private executorService: AutoPayExecutorService,
    @Inject(forwardRef(() => AuthorizationService))
    private authorizationService: AuthorizationService,
  ) {}

  /**
   * 创建自动支付授权（使用新的 Authorization 实体）
   */
  async createGrant(userId: string, dto: CreateGrantDto): Promise<Authorization> {
    return this.authorizationService.createAutoPayGrant(userId, {
      agentId: dto.agentId,
      singleLimit: dto.singleLimit,
      dailyLimit: dto.dailyLimit,
      duration: dto.duration,
    });
  }

  /**
   * 获取用户的自动支付授权列表
   */
  async getGrants(userId: string): Promise<Authorization[]> {
    return this.authorizationService.getAutoPayGrants(userId);
  }

  /**
   * 更新自动支付授权
   */
  async updateGrant(userId: string, id: string, dto: UpdateGrantDto): Promise<Authorization> {
    return this.authorizationService.updateAuthorization(id, userId, {
      singleTxLimit: dto.singleLimit,
      dailyLimit: dto.dailyLimit,
    });
  }

  /**
   * 撤销自动支付授权
   */
  async revokeGrant(userId: string, id: string): Promise<void> {
    await this.authorizationService.revokeAuthorization(id, userId);
  }

  /**
   * 执行自动支付
   */
  async executeAutoPayment(request: AutoPaymentRequest) {
    // 验证授权
    const validation = await this.authorizationService.validateAutoPayAuthorization(
      request.grantId,
      request.userId,
      request.agentId,
      request.amount,
    );

    if (!validation.valid) {
      throw new Error(validation.reason || '授权验证失败');
    }

    // 执行支付
    const result = await this.executorService.executeAutoPayment({
      ...request,
      userId: validation.auth.userId,
    });

    // 更新使用量
    await this.authorizationService.updateAuthorizationUsage(request.grantId, request.amount);

    return result;
  }

  // ============ 兼容旧 AutoPayGrant 的方法（已弃用，仅用于数据迁移） ============

  /**
   * @deprecated 使用 getGrants 替代
   */
  async getLegacyGrants(userId: string) {
    return this.grantRepository.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * @deprecated 用于数据迁移
   */
  async migrateGrantToAuthorization(grant: AutoPayGrant): Promise<Authorization> {
    const auth = await this.authorizationService.createAutoPayGrant(grant.userId, {
      agentId: grant.agentId,
      singleLimit: Number(grant.singleLimit),
      dailyLimit: Number(grant.dailyLimit),
      duration: Math.ceil((grant.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    });

    // 迁移使用量数据
    auth.usedToday = Number(grant.usedToday);
    auth.totalUsed = Number(grant.totalUsed);
    
    return this.authorizationRepository.save(auth);
  }
}

