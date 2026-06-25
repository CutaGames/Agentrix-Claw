import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentRegistry, AgentRiskTier } from '../../entities/agent-registry.entity';

/**
 * Agent 资质状态
 */
export enum AgentQualification {
  VERIFIED = 'verified',       // 已验证
  PENDING = 'pending',         // 待验证
  SUSPENDED = 'suspended',     // 已暂停
  BLACKLISTED = 'blacklisted', // 已拉黑
}

/**
 * 黑名单条目
 */
export interface BlacklistEntry {
  agentId: string;
  walletAddress: string;
  reason: string;
  addedBy: string;
  addedAt: Date;
  expiresAt?: Date;
}

/**
 * 协议验证结果
 */
export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  agentStatuses: Record<string, AgentQualification>;
  riskScore: number;
}

/**
 * 分账校验结果
 */
export interface SplitValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  adjustedSplit?: {
    reason: string;
    originalTotal: number;
    adjustedTotal: number;
  };
}

/**
 * 策略校验器服务
 * 
 * 在分账前校验：
 * 1. Agent 的资质
 * 2. 黑名单状态
 * 3. 协作协议的合法性
 */
@Injectable()
export class PolicyValidatorService {
  private readonly logger = new Logger(PolicyValidatorService.name);

  // 黑名单存储（实际应使用数据库）
  private blacklist: Map<string, BlacklistEntry> = new Map();

  // 暂停列表
  private suspendedAgents: Set<string> = new Set();

  // 风险评分阈值
  private readonly RISK_THRESHOLD = 70;

  constructor(
    @InjectRepository(AgentRegistry)
    private agentRepository: Repository<AgentRegistry>,
  ) {}

  /**
   * 验证分账前的所有策略
   */
  async validateBeforeSplit(params: {
    merchantId: string;
    merchantWallet: string;
    amount: number;
    agents: {
      referrer?: string;
      executor?: string;
      promoter?: string;
    };
    collaborationAgreementIds?: string[];
    productType?: string;
    isX402?: boolean;
  }): Promise<PolicyValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const agentStatuses: Record<string, AgentQualification> = {};
    let riskScore = 0;

    // 1. 验证商户资质
    const merchantValidation = await this.validateMerchant(params.merchantId);
    if (!merchantValidation.valid) {
      errors.push(...merchantValidation.errors);
      riskScore += 30;
    }

    // 2. 验证所有相关 Agent
    const allAgents = [
      params.agents.referrer,
      params.agents.executor,
      params.agents.promoter,
    ].filter(Boolean) as string[];

    for (const agentId of allAgents) {
      const status = await this.checkAgentQualification(agentId);
      agentStatuses[agentId] = status;

      if (status === AgentQualification.BLACKLISTED) {
        errors.push(`Agent ${agentId} is blacklisted`);
        riskScore += 50;
      } else if (status === AgentQualification.SUSPENDED) {
        errors.push(`Agent ${agentId} is suspended`);
        riskScore += 30;
      } else if (status === AgentQualification.PENDING) {
        warnings.push(`Agent ${agentId} verification is pending`);
        riskScore += 10;
      }
    }

    // 3. 验证钱包地址
    const walletValidation = await this.validateWalletAddresses([
      params.merchantWallet,
      params.agents.referrer,
      params.agents.executor,
      params.agents.promoter,
    ].filter(Boolean) as string[]);

    if (!walletValidation.valid) {
      errors.push(...walletValidation.errors);
      warnings.push(...walletValidation.warnings);
      riskScore += walletValidation.riskIncrease;
    }

    // 4. 验证金额合理性
    if (params.amount <= 0) {
      errors.push('Amount must be positive');
      riskScore += 20;
    } else if (params.amount > 1000000) {
      warnings.push('Large transaction amount detected');
      riskScore += 15;
    }

    // 5. 验证协作协议
    if (params.collaborationAgreementIds?.length) {
      const agreementValidation = await this.validateCollaborationAgreements(
        params.collaborationAgreementIds,
        allAgents,
      );
      if (!agreementValidation.valid) {
        errors.push(...agreementValidation.errors);
        warnings.push(...agreementValidation.warnings);
        riskScore += 20;
      }
    }

    // 6. X402 特定检查
    if (params.isX402) {
      const x402Validation = await this.validateX402Requirements(params);
      if (!x402Validation.valid) {
        errors.push(...x402Validation.errors);
        riskScore += 15;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      agentStatuses,
      riskScore: Math.min(riskScore, 100),
    };
  }

  /**
   * 验证分账比例
   */
  async validateSplitRatios(params: {
    totalAmount: number;
    merchantAmount: number;
    platformFee: number;
    channelFee: number;
    agentFees: number;
  }): Promise<SplitValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const total = params.merchantAmount + params.platformFee + params.channelFee + params.agentFees;
    const tolerance = params.totalAmount * 0.001; // 0.1% 容差

    // 检查总和
    if (Math.abs(total - params.totalAmount) > tolerance) {
      errors.push(`Split sum (${total}) does not match total amount (${params.totalAmount})`);
    }

    // 检查商户分成比例
    const merchantRatio = params.merchantAmount / params.totalAmount;
    if (merchantRatio < 0.9) {
      warnings.push(`Merchant ratio (${(merchantRatio * 100).toFixed(1)}%) is below 90%`);
    }
    if (merchantRatio < 0.8) {
      errors.push(`Merchant ratio (${(merchantRatio * 100).toFixed(1)}%) is below minimum 80%`);
    }

    // 检查平台费用
    const platformRatio = params.platformFee / params.totalAmount;
    if (platformRatio > 0.05) {
      errors.push(`Platform fee ratio (${(platformRatio * 100).toFixed(2)}%) exceeds maximum 5%`);
    }

    // 检查 Agent 费用
    const agentRatio = params.agentFees / params.totalAmount;
    if (agentRatio > 0.1) {
      warnings.push(`Agent fees ratio (${(agentRatio * 100).toFixed(2)}%) is high`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 检查 Agent 资质
   */
  async checkAgentQualification(agentId: string): Promise<AgentQualification> {
    // 检查黑名单
    if (this.blacklist.has(agentId)) {
      const entry = this.blacklist.get(agentId)!;
      if (!entry.expiresAt || entry.expiresAt > new Date()) {
        return AgentQualification.BLACKLISTED;
      }
      // 已过期，从黑名单移除
      this.blacklist.delete(agentId);
    }

    // 检查暂停列表
    if (this.suspendedAgents.has(agentId)) {
      return AgentQualification.SUSPENDED;
    }

    // 从数据库查询 Agent 状态
    try {
      const agent = await this.agentRepository.findOne({ where: { agentId: agentId } });
      if (!agent) {
        return AgentQualification.PENDING;
      }

      // 使用 riskTier 来判断资质状态
      switch (agent.riskTier) {
        case AgentRiskTier.LOW:
        case AgentRiskTier.MEDIUM:
          return AgentQualification.VERIFIED;
        case AgentRiskTier.HIGH:
          return AgentQualification.SUSPENDED;
        default:
          return AgentQualification.PENDING;
      }
    } catch (error) {
      this.logger.warn(`Failed to check agent qualification: ${error}`);
      return AgentQualification.PENDING;
    }
  }

  /**
   * 添加到黑名单
   */
  addToBlacklist(entry: BlacklistEntry): void {
    this.blacklist.set(entry.agentId, entry);
    if (entry.walletAddress) {
      this.blacklist.set(entry.walletAddress.toLowerCase(), entry);
    }
    this.logger.warn(`Added to blacklist: ${entry.agentId} - ${entry.reason}`);
  }

  /**
   * 从黑名单移除
   */
  removeFromBlacklist(agentIdOrWallet: string): boolean {
    const deleted = this.blacklist.delete(agentIdOrWallet);
    this.blacklist.delete(agentIdOrWallet.toLowerCase());
    return deleted;
  }

  /**
   * 暂停 Agent
   */
  suspendAgent(agentId: string, reason: string): void {
    this.suspendedAgents.add(agentId);
    this.logger.warn(`Suspended agent: ${agentId} - ${reason}`);
  }

  /**
   * 恢复 Agent
   */
  unsuspendAgent(agentId: string): void {
    this.suspendedAgents.delete(agentId);
    this.logger.log(`Unsuspended agent: ${agentId}`);
  }

  /**
   * 批量验证 Agent
   */
  async batchValidateAgents(agentIds: string[]): Promise<Record<string, AgentQualification>> {
    const results: Record<string, AgentQualification> = {};
    
    for (const agentId of agentIds) {
      results[agentId] = await this.checkAgentQualification(agentId);
    }
    
    return results;
  }

  // ========== 私有方法 ==========

  private async validateMerchant(merchantId: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // 检查黑名单
    if (this.blacklist.has(merchantId)) {
      errors.push('Merchant is blacklisted');
    }

    // 检查暂停状态
    if (this.suspendedAgents.has(merchantId)) {
      errors.push('Merchant is suspended');
    }

    return { valid: errors.length === 0, errors };
  }

  private async validateWalletAddresses(addresses: string[]): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    riskIncrease: number;
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let riskIncrease = 0;

    for (const address of addresses) {
      // 验证地址格式
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        errors.push(`Invalid wallet address format: ${address}`);
        riskIncrease += 20;
        continue;
      }

      // 检查黑名单
      if (this.blacklist.has(address.toLowerCase())) {
        errors.push(`Wallet address is blacklisted: ${address}`);
        riskIncrease += 30;
      }

      // 检查零地址
      if (address === '0x0000000000000000000000000000000000000000') {
        warnings.push(`Zero address detected: ${address}`);
        riskIncrease += 5;
      }
    }

    return { valid: errors.length === 0, errors, warnings, riskIncrease };
  }

  private async validateCollaborationAgreements(
    agreementIds: string[],
    involvedAgents: string[],
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // TODO: 从数据库加载协议并验证
    // 1. 协议是否存在
    // 2. 协议是否过期
    // 3. 涉及的 Agent 是否在协议中
    // 4. 分成比例是否合理

    if (agreementIds.length === 0) {
      warnings.push('No collaboration agreements specified');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private async validateX402Requirements(params: any): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // X402 特定验证
    // 1. 检查渠道费用是否正确
    // 2. 检查 metadata 是否完整
    // 3. 检查签名是否有效

    return { valid: errors.length === 0, errors };
  }
}
