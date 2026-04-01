import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AgentAccount, AgentAccountStatus, AgentType, AgentRiskLevel } from '../../entities/agent-account.entity';
import { Account, AccountOwnerType, AccountWalletType, AccountChainType, AccountStatus } from '../../entities/account.entity';

/**
 * 创建 Agent 账户 DTO
 */
export interface CreateAgentAccountDto {
  name: string;
  description?: string;
  avatarUrl?: string;
  ownerId: string;
  agentType?: AgentType;
  capabilities?: string[];
  permissions?: Record<string, any>;
  spendingLimits?: {
    singleTxLimit: number;
    dailyLimit: number;
    monthlyLimit: number;
    currency: string;
  };
  callbacks?: {
    webhookUrl?: string;
    paymentSuccessUrl?: string;
    paymentFailureUrl?: string;
    authCallbackUrl?: string;
  };
  metadata?: Record<string, any>;
}

/**
 * 更新 Agent 账户 DTO
 */
export interface UpdateAgentAccountDto {
  name?: string;
  description?: string;
  avatarUrl?: string;
  capabilities?: string[];
  permissions?: Record<string, any>;
  preferredModel?: string;
  preferredProvider?: string;
  spendingLimits?: {
    singleTxLimit: number;
    dailyLimit: number;
    monthlyLimit: number;
    currency: string;
  };
  callbacks?: {
    webhookUrl?: string;
    paymentSuccessUrl?: string;
    paymentFailureUrl?: string;
    authCallbackUrl?: string;
  };
  metadata?: Record<string, any>;
}

/**
 * AI Agent 账户服务
 * 
 * 核心职责：
 * - 创建和管理 AI Agent 的独立账户
 * - 管理 Agent 的信用评分
 * - 管理 Agent 的资金账户关联
 * - 管理 Agent 的支出限额
 */
@Injectable()
export class AgentAccountService {
  constructor(
    @InjectRepository(AgentAccount)
    private agentAccountRepository: Repository<AgentAccount>,
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
  ) {}

  /**
   * 生成 Agent 唯一 ID
   */
  private generateAgentUniqueId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `AGT-${timestamp}-${random}`;
  }

  /**
   * 生成账户 ID
   */
  private generateAccountId(ownerType: AccountOwnerType): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `ACC-${ownerType.toUpperCase()}-${timestamp}-${random}`;
  }

  /**
   * 创建 Agent 账户
   */
  async create(dto: CreateAgentAccountDto): Promise<AgentAccount> {
    // 生成唯一 ID
    const agentUniqueId = this.generateAgentUniqueId();

    // 创建 Agent 账户
    const agentAccount = this.agentAccountRepository.create({
      agentUniqueId,
      name: dto.name,
      description: dto.description,
      avatarUrl: dto.avatarUrl,
      ownerId: dto.ownerId,
      agentType: dto.agentType || AgentType.PERSONAL,
      capabilities: dto.capabilities,
      permissions: dto.permissions,
      spendingLimits: dto.spendingLimits,
      callbacks: dto.callbacks,
      metadata: dto.metadata,
      status: AgentAccountStatus.ACTIVE,
      activatedAt: new Date(),
      creditScore: 500, // 初始信用评分
      riskLevel: AgentRiskLevel.MEDIUM,
    });

    const savedAgent = await this.agentAccountRepository.save(agentAccount);

    // 自动创建关联的虚拟资金账户
    const account = this.accountRepository.create({
      accountId: this.generateAccountId(AccountOwnerType.AGENT),
      name: `${dto.name} 主账户`,
      ownerId: savedAgent.id,
      ownerType: AccountOwnerType.AGENT,
      walletType: AccountWalletType.VIRTUAL,
      chainType: AccountChainType.MULTI,
      currency: dto.spendingLimits?.currency || 'USDC',
      isDefault: true,
      status: AccountStatus.ACTIVE,
    });

    const savedAccount = await this.accountRepository.save(account);

    // 更新 Agent 的默认账户
    savedAgent.defaultAccountId = savedAccount.id;
    await this.agentAccountRepository.save(savedAgent);

    return savedAgent;
  }

  /**
   * 根据 ID 查找 Agent 账户
   */
  async findById(id: string): Promise<AgentAccount> {
    const agent = await this.agentAccountRepository.findOne({ where: { id } });
    if (!agent) {
      throw new NotFoundException('Agent 账户不存在');
    }
    return agent;
  }

  /**
   * 根据唯一 ID 查找 Agent 账户
   */
  async findByUniqueId(agentUniqueId: string): Promise<AgentAccount> {
    const agent = await this.agentAccountRepository.findOne({ where: { agentUniqueId } });
    if (!agent) {
      throw new NotFoundException('Agent 账户不存在');
    }
    return agent;
  }

  /**
   * 根据所有者查找 Agent 账户列表
   */
  async findByOwner(ownerId: string, page = 1, limit = 20): Promise<{ items: AgentAccount[]; total: number }> {
    const [items, total] = await this.agentAccountRepository.findAndCount({
      where: { ownerId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { items, total };
  }

  /**
   * 更新 Agent 账户
   */
  async update(id: string, dto: UpdateAgentAccountDto): Promise<AgentAccount> {
    const agent = await this.findById(id);

    if (dto.name !== undefined) agent.name = dto.name;
    if (dto.description !== undefined) agent.description = dto.description;
    if (dto.avatarUrl !== undefined) agent.avatarUrl = dto.avatarUrl;
    if (dto.capabilities !== undefined) agent.capabilities = dto.capabilities;
    if (dto.permissions !== undefined) agent.permissions = dto.permissions;
    if (dto.preferredModel !== undefined) agent.preferredModel = dto.preferredModel || undefined;
    if (dto.preferredProvider !== undefined) agent.preferredProvider = dto.preferredProvider || undefined;
    if (dto.spendingLimits !== undefined) agent.spendingLimits = dto.spendingLimits;
    if (dto.callbacks !== undefined) agent.callbacks = dto.callbacks;
    if (dto.metadata !== undefined) agent.metadata = { ...agent.metadata, ...dto.metadata };

    return this.agentAccountRepository.save(agent);
  }

  /**
   * 激活 Agent 账户
   */
  async activate(id: string): Promise<AgentAccount> {
    const agent = await this.findById(id);

    if (agent.status === AgentAccountStatus.ACTIVE) {
      throw new BadRequestException('Agent 账户已激活');
    }

    if (agent.status === AgentAccountStatus.REVOKED) {
      throw new BadRequestException('已撤销的 Agent 账户无法激活');
    }

    agent.status = AgentAccountStatus.ACTIVE;
    agent.activatedAt = new Date();

    return this.agentAccountRepository.save(agent);
  }

  /**
   * 暂停 Agent 账户
   */
  async suspend(id: string, reason?: string): Promise<AgentAccount> {
    const agent = await this.findById(id);

    if (agent.status !== AgentAccountStatus.ACTIVE) {
      throw new BadRequestException('只有活跃的 Agent 账户可以暂停');
    }

    agent.status = AgentAccountStatus.SUSPENDED;
    agent.statusReason = reason;

    return this.agentAccountRepository.save(agent);
  }

  /**
   * 恢复 Agent 账户
   */
  async resume(id: string): Promise<AgentAccount> {
    const agent = await this.findById(id);

    if (agent.status !== AgentAccountStatus.SUSPENDED) {
      throw new BadRequestException('只有暂停的 Agent 账户可以恢复');
    }

    agent.status = AgentAccountStatus.ACTIVE;
    agent.statusReason = null;

    return this.agentAccountRepository.save(agent);
  }

  /**
   * 撤销 Agent 账户
   */
  async revoke(id: string, reason?: string): Promise<AgentAccount> {
    const agent = await this.findById(id);

    agent.status = AgentAccountStatus.REVOKED;
    agent.statusReason = reason;

    // 冻结关联的资金账户
    if (agent.defaultAccountId) {
      await this.accountRepository.update(agent.defaultAccountId, {
        status: AccountStatus.FROZEN,
        statusReason: `Agent 账户已撤销: ${reason || '无原因'}`,
      });
    }

    return this.agentAccountRepository.save(agent);
  }

  /**
   * 更新信用评分
   */
  async updateCreditScore(id: string, delta: number, reason?: string): Promise<AgentAccount> {
    const agent = await this.findById(id);

    // 计算新评分（限制在 0-1000 之间）
    const newScore = Math.max(0, Math.min(1000, Number(agent.creditScore) + delta));
    agent.creditScore = newScore;
    agent.creditScoreUpdatedAt = new Date();

    // 根据评分更新风险等级
    if (newScore >= 800) {
      agent.riskLevel = AgentRiskLevel.LOW;
    } else if (newScore >= 500) {
      agent.riskLevel = AgentRiskLevel.MEDIUM;
    } else if (newScore >= 200) {
      agent.riskLevel = AgentRiskLevel.HIGH;
    } else {
      agent.riskLevel = AgentRiskLevel.CRITICAL;
    }

    // 记录评分变更
    if (!agent.metadata) agent.metadata = {};
    if (!agent.metadata.creditHistory) agent.metadata.creditHistory = [];
    agent.metadata.creditHistory.push({
      delta,
      newScore,
      reason,
      timestamp: new Date(),
    });

    return this.agentAccountRepository.save(agent);
  }

  /**
   * 检查支出限额
   */
  async checkSpendingLimit(id: string, amount: number): Promise<{ allowed: boolean; reason?: string }> {
    const agent = await this.findById(id);

    if (agent.status !== AgentAccountStatus.ACTIVE) {
      return { allowed: false, reason: 'Agent 账户未激活' };
    }

    if (!agent.spendingLimits) {
      return { allowed: true }; // 无限额限制
    }

    const { singleTxLimit, dailyLimit, monthlyLimit } = agent.spendingLimits;

    // 检查单笔限额
    if (singleTxLimit && amount > singleTxLimit) {
      return { allowed: false, reason: `超出单笔限额 ${singleTxLimit}` };
    }

    // 检查日限额
    if (dailyLimit && Number(agent.usedTodayAmount) + amount > dailyLimit) {
      return { allowed: false, reason: `超出日限额 ${dailyLimit}` };
    }

    // 检查月限额
    if (monthlyLimit && Number(agent.usedMonthAmount) + amount > monthlyLimit) {
      return { allowed: false, reason: `超出月限额 ${monthlyLimit}` };
    }

    return { allowed: true };
  }

  /**
   * 记录支出
   */
  async recordSpending(id: string, amount: number, success: boolean): Promise<void> {
    const agent = await this.findById(id);

    // 更新已用额度
    agent.usedTodayAmount = Number(agent.usedTodayAmount) + amount;
    agent.usedMonthAmount = Number(agent.usedMonthAmount) + amount;

    // 更新统计
    agent.totalTransactions += 1;
    agent.totalTransactionAmount = Number(agent.totalTransactionAmount) + amount;
    if (success) {
      agent.successfulTransactions += 1;
    } else {
      agent.failedTransactions += 1;
    }

    agent.lastActiveAt = new Date();

    await this.agentAccountRepository.save(agent);
  }

  /**
   * 重置日限额（定时任务调用）
   */
  async resetDailyLimits(): Promise<number> {
    const result = await this.agentAccountRepository.update(
      { status: AgentAccountStatus.ACTIVE },
      { usedTodayAmount: 0 },
    );
    return result.affected || 0;
  }

  /**
   * 重置月限额（定时任务调用）
   */
  async resetMonthlyLimits(): Promise<number> {
    const result = await this.agentAccountRepository.update(
      { status: AgentAccountStatus.ACTIVE },
      { usedMonthAmount: 0 },
    );
    return result.affected || 0;
  }

  /**
   * 获取 Agent 的资金账户列表
   */
  async getAgentAccounts(agentId: string): Promise<Account[]> {
    return this.accountRepository.find({
      where: { ownerId: agentId, ownerType: AccountOwnerType.AGENT },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * 关联外部钱包
   */
  async linkExternalWallet(id: string, walletAddress: string, chainType: AccountChainType): Promise<Account> {
    const agent = await this.findById(id);

    // 检查地址是否已被使用
    const existing = await this.accountRepository.findOne({
      where: { walletAddress },
    });

    if (existing) {
      throw new ConflictException('该钱包地址已被关联');
    }

    // 创建非托管账户
    const account = this.accountRepository.create({
      accountId: this.generateAccountId(AccountOwnerType.AGENT),
      name: `外部钱包 ${walletAddress.slice(0, 8)}...`,
      ownerId: agent.id,
      ownerType: AccountOwnerType.AGENT,
      walletType: AccountWalletType.NON_CUSTODIAL,
      chainType,
      walletAddress,
      isDefault: false,
      status: AccountStatus.ACTIVE,
    });

    const savedAccount = await this.accountRepository.save(account);

    // 更新 Agent 的外部钱包地址
    agent.externalWalletAddress = walletAddress;
    await this.agentAccountRepository.save(agent);

    return savedAccount;
  }

  /**
   * 生成 API Key
   * 生成 ak_ 前缀的 API Key，哈希存储，只返回完整 key 一次
   */
  async generateApiKey(id: string): Promise<{ apiKey: string; prefix: string }> {
    const agent = await this.findById(id);

    // 生成随机 key: ak_<32位随机十六进制>
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const apiKey = `ak_${rawSecret}`;

    // 取前缀（前10个字符用于展示）
    const prefix = `ak_${rawSecret.slice(0, 6)}`;

    // SHA-256 哈希存储
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

    agent.apiSecretHash = hash;
    agent.apiKeyPrefix = prefix;
    await this.agentAccountRepository.save(agent);

    // 返回完整 key（仅此一次）
    return { apiKey, prefix };
  }
}
