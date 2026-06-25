import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import * as crypto from 'crypto';
import { Authorization, AuthorizationStatus, AuthorizationType } from '../../entities/authorization.entity';
import { AuditProof } from '../../entities/audit-proof.entity';

@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger(AuthorizationService.name);

  constructor(
    @InjectRepository(Authorization)
    private authorizationRepository: Repository<Authorization>,
    @InjectRepository(AuditProof)
    private auditProofRepository: Repository<AuditProof>,
  ) {}

  /**
   * 创建授权
   */
  async createAuthorization(userId: string, data: {
    agentId?: string;
    merchantScope?: string[];
    categoryScope?: string[];
    singleTxLimit?: number;
    dailyLimit?: number;
    monthlyLimit?: number;
    expiresInDays?: number;
    isAutoPay?: boolean;
    description?: string;
  }): Promise<Authorization> {
    const expiresAt = data.expiresInDays 
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const auth = this.authorizationRepository.create({
      userId,
      agentId: data.agentId,
      merchantScope: data.merchantScope,
      categoryScope: data.categoryScope,
      singleTxLimit: data.singleTxLimit,
      dailyLimit: data.dailyLimit,
      monthlyLimit: data.monthlyLimit,
      status: AuthorizationStatus.ACTIVE,
      expiresAt,
      isAutoPay: data.isAutoPay || false,
      authorizationType: data.isAutoPay ? AuthorizationType.AUTO_PAY : AuthorizationType.MANUAL,
      description: data.description,
      usedToday: 0,
      usedThisMonth: 0,
      totalUsed: 0,
    });

    return this.authorizationRepository.save(auth);
  }

  /**
   * 创建自动支付授权（兼容原 AutoPayGrant 创建接口）
   */
  async createAutoPayGrant(userId: string, data: {
    agentId: string;
    singleLimit: number;
    dailyLimit: number;
    duration: number; // 天数
    description?: string;
  }): Promise<Authorization> {
    return this.createAuthorization(userId, {
      agentId: data.agentId,
      singleTxLimit: data.singleLimit,
      dailyLimit: data.dailyLimit,
      expiresInDays: data.duration,
      isAutoPay: true,
      description: data.description,
    });
  }

  /**
   * 获取用户的所有授权
   */
  async getUserAuthorizations(userId: string, options?: {
    isAutoPay?: boolean;
    status?: AuthorizationStatus;
    agentId?: string;
  }): Promise<Authorization[]> {
    const where: any = { userId };
    if (options?.isAutoPay !== undefined) {
      where.isAutoPay = options.isAutoPay;
    }
    if (options?.status) {
      where.status = options.status;
    }
    if (options?.agentId) {
      where.agentId = options.agentId;
    }
    return this.authorizationRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取用户的自动支付授权列表（兼容原 AutoPayService.getGrants）
   */
  async getAutoPayGrants(userId: string): Promise<Authorization[]> {
    return this.getUserAuthorizations(userId, {
      isAutoPay: true,
      status: AuthorizationStatus.ACTIVE,
    });
  }

  /**
   * 撤销授权
   */
  async revokeAuthorization(authId: string, userId: string): Promise<void> {
    const auth = await this.authorizationRepository.findOne({ where: { id: authId, userId } });
    if (!auth) {
      throw new NotFoundException('授权不存在');
    }
    auth.status = AuthorizationStatus.REVOKED;
    await this.authorizationRepository.save(auth);
  }

  /**
   * 验证授权并评估策略
   */
  async evaluateAuthorization(
    userId: string,
    agentId: string,
    amount: number,
    merchantId: string,
    category?: string,
  ): Promise<{ authorized: boolean; reason?: string; authId?: string }> {
    // 查找有效授权
    const auths = await this.authorizationRepository.find({
      where: {
        userId,
        agentId,
        status: AuthorizationStatus.ACTIVE,
      },
    });

    for (const auth of auths) {
      // 检查过期
      if (auth.expiresAt && auth.expiresAt < new Date()) {
        continue;
      }

      // 检查商户范围
      if (auth.merchantScope && auth.merchantScope.length > 0 && !auth.merchantScope.includes(merchantId)) {
        continue;
      }

      // 检查类目范围
      if (auth.categoryScope && auth.categoryScope.length > 0 && category && !auth.categoryScope.includes(category)) {
        continue;
      }

      // 检查单笔限额
      if (auth.singleTxLimit && amount > auth.singleTxLimit) {
        continue;
      }

      // TODO: 检查日限额和月限额（需要查询历史交易）

      return { authorized: true, authId: auth.id };
    }

    return { authorized: false, reason: '未找到匹配的有效授权或超出限额' };
  }

  /**
   * 验证自动支付授权并检查限额
   * 用于自动支付场景，会检查每日/每月使用量
   */
  async validateAutoPayAuthorization(
    authId: string,
    userId: string,
    agentId: string,
    amount: number,
  ): Promise<{ valid: boolean; auth?: Authorization; reason?: string }> {
    const auth = await this.authorizationRepository.findOne({
      where: { id: authId, userId, agentId },
    });

    if (!auth) {
      return { valid: false, reason: '授权不存在' };
    }

    if (!auth.isAutoPay) {
      return { valid: false, reason: '该授权不支持自动支付' };
    }

    if (auth.status !== AuthorizationStatus.ACTIVE) {
      return { valid: false, reason: '授权已失效' };
    }

    if (auth.expiresAt && new Date() > auth.expiresAt) {
      auth.status = AuthorizationStatus.EXPIRED;
      await this.authorizationRepository.save(auth);
      return { valid: false, reason: '授权已过期' };
    }

    // 检查并重置每日限额
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!auth.lastDailyResetDate || new Date(auth.lastDailyResetDate) < today) {
      auth.usedToday = 0;
      auth.lastDailyResetDate = today;
    }

    // 检查并重置每月限额
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    if (!auth.lastMonthlyResetDate || new Date(auth.lastMonthlyResetDate) < firstDayOfMonth) {
      auth.usedThisMonth = 0;
      auth.lastMonthlyResetDate = firstDayOfMonth;
    }

    // 检查单次限额
    if (auth.singleTxLimit && amount > Number(auth.singleTxLimit)) {
      return { valid: false, reason: `支付金额超过单次限额 ${auth.singleTxLimit}` };
    }

    // 检查每日限额
    if (auth.dailyLimit && Number(auth.usedToday) + amount > Number(auth.dailyLimit)) {
      return { 
        valid: false, 
        reason: `支付金额超过每日限额 ${auth.dailyLimit}，今日已用 ${auth.usedToday}` 
      };
    }

    // 检查每月限额
    if (auth.monthlyLimit && Number(auth.usedThisMonth) + amount > Number(auth.monthlyLimit)) {
      return { 
        valid: false, 
        reason: `支付金额超过每月限额 ${auth.monthlyLimit}，本月已用 ${auth.usedThisMonth}` 
      };
    }

    return { valid: true, auth };
  }

  /**
   * 更新授权使用量
   */
  async updateAuthorizationUsage(authId: string, amount: number): Promise<void> {
    const auth = await this.authorizationRepository.findOne({ where: { id: authId } });
    if (!auth) {
      throw new NotFoundException('授权不存在');
    }

    auth.usedToday = Number(auth.usedToday) + amount;
    auth.usedThisMonth = Number(auth.usedThisMonth) + amount;
    auth.totalUsed = Number(auth.totalUsed) + amount;
    
    await this.authorizationRepository.save(auth);
    this.logger.log(`更新授权使用量: authId=${authId}, amount=${amount}, totalUsed=${auth.totalUsed}`);
  }

  /**
   * 获取授权详情
   */
  async getAuthorizationById(authId: string, userId?: string): Promise<Authorization> {
    const where: any = { id: authId };
    if (userId) {
      where.userId = userId;
    }
    const auth = await this.authorizationRepository.findOne({ where });
    if (!auth) {
      throw new NotFoundException('授权不存在');
    }
    return auth;
  }

  /**
   * 更新授权
   */
  async updateAuthorization(authId: string, userId: string, data: Partial<{
    singleTxLimit: number;
    dailyLimit: number;
    monthlyLimit: number;
    merchantScope: string[];
    categoryScope: string[];
    description: string;
  }>): Promise<Authorization> {
    const auth = await this.getAuthorizationById(authId, userId);
    Object.assign(auth, data);
    return this.authorizationRepository.save(auth);
  }

  /**
   * 记录审计证据（实现链式结构与不可抵赖性）
   */
  async recordAuditProof(data: {
    payIntentId: string;
    authorizationId?: string;
    agentId?: string;
    action: string;
    reason?: string;
    policyResults?: any;
    agentSignature?: string; // Agent 提供的原始签名
  }): Promise<AuditProof> {
    // 1. 获取该 Agent 或该支付意图的上一个证据，用于构建哈希链
    const lastProof = await this.auditProofRepository.findOne({
      where: data.agentId ? { agentId: data.agentId } : { payIntentId: data.payIntentId },
      order: { createdAt: 'DESC' },
    });

    const proof = this.auditProofRepository.create({
      payIntentId: data.payIntentId,
      authorizationId: data.authorizationId,
      agentId: data.agentId,
      decisionLog: {
        timestamp: new Date(),
        action: data.action,
        reason: data.reason,
        policyResults: data.policyResults,
      },
      previousProofHash: lastProof?.proofHash || '0'.repeat(64),
      signature: data.agentSignature || null,
    });

    // 2. 计算当前证据的哈希值 (SHA-256)
    // 包含：payIntentId, decisionLog, previousProofHash, signature
    const hashContent = JSON.stringify({
      p: proof.payIntentId,
      d: proof.decisionLog,
      prev: proof.previousProofHash,
      sig: proof.signature,
    });

    proof.proofHash = crypto
      .createHash('sha256')
      .update(hashContent)
      .digest('hex');

    this.logger.log(`记录审计证据: id=${proof.payIntentId}, action=${data.action}, hash=${proof.proofHash.substring(0, 8)}`);

    return this.auditProofRepository.save(proof);
  }
}
