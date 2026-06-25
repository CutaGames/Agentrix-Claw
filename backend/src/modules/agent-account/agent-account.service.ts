import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger, Inject, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import * as crypto from 'crypto';
import { AgentAccount, AgentAccountStatus, AgentType, AgentRiskLevel } from '../../entities/agent-account.entity';
import { evaluateToolCall, isToolDeclared } from './capability-gate';
import { deriveEconomicIdentityStatus, AgentEconomicIdentityStatus } from './agent-economic-status';
import { AgentSpendingRecord } from '../../entities/agent-spending-record.entity';
import { Account, AccountOwnerType, AccountWalletType, AccountChainType, AccountStatus } from '../../entities/account.entity';
import { EasService } from '../agent/eas.service';
import { MPCWalletService } from '../mpc-wallet/mpc-wallet.service';
import { PayMindRelayerService } from '../relayer/relayer.service';

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
  private readonly logger = new Logger(AgentAccountService.name);

  constructor(
    @InjectRepository(AgentAccount)
    private agentAccountRepository: Repository<AgentAccount>,
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
    @InjectRepository(AgentSpendingRecord)
    private spendingRecordRepository: Repository<AgentSpendingRecord>,
    @Optional() @Inject(EasService)
    private easService: EasService,
    @Optional() @Inject(MPCWalletService)
    private mpcWalletService: MPCWalletService,
    @Optional() @Inject(PayMindRelayerService)
    private relayerService: PayMindRelayerService,
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

    // 自动创建 MPC 钱包（可选，失败不阻塞）
    if (this.mpcWalletService) {
      try {
        const derivedPassword = crypto.randomBytes(16).toString('hex');
        const walletResult = await this.mpcWalletService.generateMPCWalletForUser(
          dto.ownerId,
          derivedPassword,
          'BSC',
        );
        if (walletResult.walletAddress) {
          savedAgent.mpcWalletId = walletResult.walletAddress;
          await this.agentAccountRepository.save(savedAgent);
          this.logger.log(`Agent ${savedAgent.agentUniqueId} MPC 钱包自动创建: ${walletResult.walletAddress}`);
        }
      } catch (err) {
        this.logger.warn(`Agent ${savedAgent.agentUniqueId} MPC 钱包自动创建失败（不影响 Agent 使用）: ${err.message}`);
      }
    }

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
   * creditScore 取值边界(需求 7.10:限制在 0–1000)。
   */
  static readonly CREDIT_SCORE_MIN = 0;
  static readonly CREDIT_SCORE_MAX = 1000;

  /**
   * creditScore → riskLevel 映射阈值(需求 7.11 · design §C1 C 组)。
   *
   * 默认:low ≥700 / medium 500–699 / high 300–499 / critical <300。
   * 阈值可配:通过环境变量覆盖(留空则用默认值),便于按运营调参。
   *   - AGENT_CREDIT_RISK_LOW_MIN     (默认 700)
   *   - AGENT_CREDIT_RISK_MEDIUM_MIN  (默认 500)
   *   - AGENT_CREDIT_RISK_HIGH_MIN    (默认 300)
   */
  static readonly RISK_LEVEL_THRESHOLDS = {
    low: Number(process.env.AGENT_CREDIT_RISK_LOW_MIN ?? 700),
    medium: Number(process.env.AGENT_CREDIT_RISK_MEDIUM_MIN ?? 500),
    high: Number(process.env.AGENT_CREDIT_RISK_HIGH_MIN ?? 300),
  };

  /**
   * 据 creditScore 映射 riskLevel(需求 7.11)。
   *
   * 分段:score ≥ low → LOW;≥ medium → MEDIUM;≥ high → HIGH;否则 CRITICAL。
   */
  static mapCreditScoreToRiskLevel(score: number): AgentRiskLevel {
    const t = AgentAccountService.RISK_LEVEL_THRESHOLDS;
    if (score >= t.low) return AgentRiskLevel.LOW;
    if (score >= t.medium) return AgentRiskLevel.MEDIUM;
    if (score >= t.high) return AgentRiskLevel.HIGH;
    return AgentRiskLevel.CRITICAL;
  }

  /**
   * 更新信用评分(需求 7.8/7.9/7.10/7.11 · design §C1 C 组)。
   *
   * - 成交/履约成功 → 正 delta 加分;任务失败/被争议/被退款 → 负 delta 减分。
   * - `creditScore` 钳制在 0–1000(7.10),`creditScoreUpdatedAt` 同步更新。
   * - `riskLevel` 据钳制后的 creditScore 映射(7.11,阈值可配)。
   * - 记录评分变更原因(reason)至 metadata.creditHistory 以备审计。
   *
   * @param id Agent 账户 id
   * @param delta 评分增量(正加 / 负减)
   * @param reason 变更原因(如 escrow-release-success / dispute-upheld / task-failed)
   */
  async updateCreditScore(id: string, delta: number, reason?: string): Promise<AgentAccount> {
    const agent = await this.findById(id);

    // 计算新评分（钳制在 0-1000 之间,需求 7.10）
    const newScore = Math.max(
      AgentAccountService.CREDIT_SCORE_MIN,
      Math.min(AgentAccountService.CREDIT_SCORE_MAX, Number(agent.creditScore) + delta),
    );
    agent.creditScore = newScore;
    // creditScoreUpdatedAt 同步更新(需求 7.10)
    agent.creditScoreUpdatedAt = new Date();

    // 根据评分映射风险等级(需求 7.11,阈值可配)
    agent.riskLevel = AgentAccountService.mapCreditScoreToRiskLevel(newScore);

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
   * 记录支出(幂等)
   *
   * spec: crypto-native-agent-ops 需求 7.1/7.2/7.4 · design §C1 · Correctness Property 1。
   *
   * - 只对**真实成交**记账(被拒动作不应调用本方法,见需求 7.3 —— 由调用方在
   *   `checkSpendingLimit` / PermissionEngine 拒绝时直接跳过 recordSpending)。
   * - `idempotencyKey`(建议为结算事件 id)做幂等去重:同一结算事件重复调用只记一次。
   * - 去重账本(`agent_spending_records`)与统计累计在**同一事务**内写入,
   *   保证账实一致(失败整体回滚,不部分写)。
   *
   * @param id Agent 账户 id
   * @param amount 成交金额
   * @param success 成交是否成功
   * @param idempotencyKey 幂等键(结算事件 id);省略时退化为非幂等写入(向后兼容)
   */
  async recordSpending(
    id: string,
    amount: number,
    success: boolean,
    idempotencyKey?: string,
  ): Promise<void> {
    // 快速短路:幂等键已记账 → 直接跳过(不增计数)
    if (idempotencyKey) {
      const existing = await this.spendingRecordRepository.findOne({
        where: { idempotencyKey },
      });
      if (existing) {
        this.logger.debug(
          `recordSpending 幂等命中 agent=${id} key=${idempotencyKey} → 跳过(不重复计数)`,
        );
        return;
      }
    }

    // 去重账本 + 统计累计在同一事务内写入,保证账实一致(Property 1)
    await this.agentAccountRepository.manager.transaction(async (manager) => {
      // 先落去重账本;唯一索引兜底并发重试(23505 → 幂等跳过)
      if (idempotencyKey) {
        try {
          await manager.insert(AgentSpendingRecord, {
            agentId: id,
            idempotencyKey,
            amount,
            success,
          });
        } catch (err: any) {
          if (err?.code === '23505') {
            this.logger.debug(
              `recordSpending 幂等竞态 agent=${id} key=${idempotencyKey} → 跳过(不重复计数)`,
            );
            return;
          }
          throw err;
        }
      }

      const agentRepo = manager.getRepository(AgentAccount);
      const agent = await agentRepo.findOne({ where: { id } });
      if (!agent) {
        throw new NotFoundException('Agent 账户不存在');
      }

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

      await agentRepo.save(agent);
    });
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
   * UTC 当日零点（仅日期,丢弃时分秒）。
   */
  private static startOfUtcDay(now: Date): Date {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  /**
   * UTC 当月 1 日零点。
   */
  private static startOfUtcMonth(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  /**
   * UTC 日期 → 'YYYY-MM-DD' 字符串（用于 `date` 列查询比较）。
   */
  private static toUtcDateString(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /**
   * 按 `limitResetDate` + UTC 重置额度（漏跑补偿）。
   *
   * spec: crypto-native-agent-ops 需求 7.5/7.6/7.7 · design §C1 B 组 · Correctness Property 2。
   *
   * 语义:
   * - `limitResetDate` 记录「上次重置所对应的 UTC 日期」(date-only)。
   * - **跨日重置**:`limitResetDate < 今日(UTC)` 或为空 → `usedTodayAmount` 归零。
   * - **跨月重置**:`limitResetDate` 早于本月 1 日(UTC)或为空 → `usedMonthAmount` 归零。
   * - **漏跑补偿(7.7)**:判定基于「上次重置日期 vs 当前日期」的比较,与 cron 是否准点无关;
   *   即使漏跑多日/跨月,下次运行仍会基于 `limitResetDate` 一次性补偿到位。
   * - 仅处理**确需重置**的活跃 agent(`limitResetDate` 为空或早于今日),
   *   而非全表无差别即时归零(7.6)。
   *
   * 时区统一为 **UTC**:日/月边界以 UTC 零点为准,避免随服务器本地时区漂移。
   *
   * @param now 注入「当前时间」以便测试跨日/跨月/时区边界(默认 `new Date()`)。
   * @returns 本次实际发生的日重置数 / 月重置数。
   */
  async resetLimitsByResetDate(
    now: Date = new Date(),
  ): Promise<{ dailyReset: number; monthlyReset: number }> {
    const startOfToday = AgentAccountService.startOfUtcDay(now);
    const startOfMonth = AgentAccountService.startOfUtcMonth(now);
    const todayStr = AgentAccountService.toUtcDateString(startOfToday);

    // 只取确需重置的活跃 agent:limitResetDate 为空,或早于今日(UTC)。
    // 注:limitResetDate == 今日 的 agent 必然处于当月,无需日/月重置,故安全排除。
    const candidates = await this.agentAccountRepository.find({
      where: [
        { status: AgentAccountStatus.ACTIVE, limitResetDate: IsNull() },
        { status: AgentAccountStatus.ACTIVE, limitResetDate: LessThan(todayStr as any) },
      ],
    });

    let dailyReset = 0;
    let monthlyReset = 0;

    for (const agent of candidates) {
      const last = agent.limitResetDate ? new Date(agent.limitResetDate) : null;
      const lastUtcDay = last
        ? new Date(
            Date.UTC(
              last.getUTCFullYear(),
              last.getUTCMonth(),
              last.getUTCDate(),
            ),
          )
        : null;

      const needsDaily =
        !lastUtcDay || lastUtcDay.getTime() < startOfToday.getTime();
      const needsMonthly =
        !lastUtcDay || lastUtcDay.getTime() < startOfMonth.getTime();

      // 已是最新(同一 UTC 日)→ 跳过,保证幂等(同日重复运行不二次归零)。
      if (!needsDaily && !needsMonthly) continue;

      if (needsDaily) {
        agent.usedTodayAmount = 0;
        dailyReset += 1;
      }
      if (needsMonthly) {
        agent.usedMonthAmount = 0;
        monthlyReset += 1;
      }
      agent.limitResetDate = startOfToday;

      await this.agentAccountRepository.save(agent);
    }

    return { dailyReset, monthlyReset };
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

  // ========== Phase 4: 链上身份 ==========

  /**
   * 链上注册（ERC-8004 Identity Session + EAS Attestation）
   * - 可选操作，非强制
   * - 平台 Relayer 代付 Gas（用户无需持有 BNB/ETH）
   */
  async onchainRegister(id: string, chain: string = 'bsc-testnet'): Promise<{
    erc8004SessionId?: string;
    easAttestationUid?: string;
    txHash?: string;
    chain: string;
    gasSponsored: boolean;
  }> {
    const agent = await this.findById(id);

    if (agent.status !== AgentAccountStatus.ACTIVE) {
      throw new BadRequestException('只有活跃的 Agent 可以进行链上注册');
    }

    if (agent.easAttestationUid || agent.onchainRegistrationTxHash || agent.registrationChain) {
      throw new ConflictException('Agent 已完成链上注册，不可重复注册');
    }

    const result: any = {
      chain,
      gasSponsored: true, // 平台代付 Gas
    };

    // Step 1: 尝试 EAS 注册（链上存证）
    if (this.easService) {
      try {
        const riskTierMap = {
          [AgentRiskLevel.LOW]: 'low',
          [AgentRiskLevel.MEDIUM]: 'medium',
          [AgentRiskLevel.HIGH]: 'high',
          [AgentRiskLevel.CRITICAL]: 'critical',
        };
        const uid = await this.easService.attestAgentRegistration({
          agentId: agent.agentUniqueId,
          name: agent.name,
          riskTier: riskTierMap[agent.riskLevel] || 'medium',
          ownerId: agent.ownerId || '',
        });

        if (uid) {
          agent.easAttestationUid = uid;
          result.easAttestationUid = uid;
          this.logger.log(`Agent ${agent.agentUniqueId} EAS 注册成功: ${uid}`);
        }
      } catch (err) {
        this.logger.warn(`EAS 注册失败（继续尝试其他步骤）: ${err.message}`);
      }
    } else {
      this.logger.warn('EAS 服务不可用，跳过 EAS 注册');
    }

    // Step 2: 尝试 ERC-8004 Session 创建
    // 注意: 实际 ERC-8004 Session 需要链上交互，当前通过 Relayer 代理
    // 如果 Relayer 不可用或链上合约未配置，记录意向等待后续处理
    if (this.relayerService) {
      try {
        // 记录 Session 意向（实际创建需要 MPC 钱包地址作为 signer）
        const signerAddress = agent.mpcWalletId || agent.externalWalletAddress;
        if (signerAddress) {
          // 这里记录 Session 配置,实际链上创建由 Relayer 异步执行
          const sessionId = `pending-${crypto.randomBytes(16).toString('hex')}`;
          agent.erc8004SessionId = sessionId;
          agent.sessionExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1年
          result.erc8004SessionId = sessionId;
          this.logger.log(`Agent ${agent.agentUniqueId} ERC-8004 Session 意向记录: ${sessionId}`);
        } else {
          this.logger.warn(`Agent ${agent.agentUniqueId} 没有钱包地址，跳过 ERC-8004 Session 创建`);
        }
      } catch (err) {
        this.logger.warn(`ERC-8004 Session 创建失败: ${err.message}`);
      }
    }

    // 保存链上注册信息
    agent.registrationChain = chain;
    agent.onchainRegistrationTxHash = result.easAttestationUid || result.erc8004SessionId || 'pending';
    await this.agentAccountRepository.save(agent);

    return result;
  }

  /**
   * 查询 Agent 余额（平台余额 + 链上余额统一视图）
   */
  async getBalance(id: string): Promise<{
    platformBalance: { amount: string; currency: string };
    mpcWallet: { address: string; chain: string } | null;
    externalWallet: { address: string } | null;
    gasAvailable: boolean;
  }> {
    const agent = await this.findById(id);

    // 查询关联的资金账户
    const accounts = await this.accountRepository.find({
      where: { ownerId: id, ownerType: AccountOwnerType.AGENT },
    });

    const defaultAccount = accounts.find(a => a.isDefault);
    const platformBalance = {
      amount: defaultAccount?.availableBalance?.toString() || '0',
      currency: agent.spendingLimits?.currency || 'USDC',
    };

    // MPC 钱包信息
    let mpcWallet = null;
    if (agent.mpcWalletId) {
      mpcWallet = {
        address: agent.mpcWalletId,
        chain: agent.registrationChain || 'BSC',
      };
    }

    // 外部钱包信息
    let externalWallet = null;
    if (agent.externalWalletAddress) {
      externalWallet = { address: agent.externalWalletAddress };
    }

    return {
      platformBalance,
      mpcWallet,
      externalWallet,
      gasAvailable: false, // 新钱包默认无 Gas，需要平台 sponsor
    };
  }

  /**
   * 查询 Agent 链上能力档案
   */
  async getCapabilities(id: string): Promise<{
    identity: {
      registered: boolean;
      erc8004SessionId?: string;
      sessionActive: boolean;
      sessionExpiry?: string;
      chain?: string;
    };
    registration: {
      easUid?: string;
      verified: boolean;
      registeredAt?: string;
    };
    skills: string[];
    creditLevel: string;
    gasSponsored: boolean;
  }> {
    const agent = await this.findById(id);

    const registered = !!(agent.easAttestationUid || agent.erc8004SessionId);
    const sessionActive = registered && agent.sessionExpiry ? agent.sessionExpiry > new Date() : false;

    // 信用等级
    const score = Number(agent.creditScore);
    let creditLevel = 'Bronze';
    if (score >= 950) creditLevel = 'Platinum';
    else if (score >= 800) creditLevel = 'Gold';
    else if (score >= 500) creditLevel = 'Silver';
    else if (score >= 300) creditLevel = 'Bronze';
    else creditLevel = 'None';

    return {
      identity: {
        registered,
        erc8004SessionId: agent.erc8004SessionId || undefined,
        sessionActive,
        sessionExpiry: agent.sessionExpiry?.toISOString(),
        chain: agent.registrationChain || undefined,
      },
      registration: {
        easUid: agent.easAttestationUid || undefined,
        verified: !!agent.easAttestationUid,
        registeredAt: agent.onchainRegistrationTxHash ? agent.updatedAt?.toISOString() : undefined,
      },
      skills: agent.capabilities || [],
      creditLevel,
      gasSponsored: true, // 平台始终代付 Gas
    };
  }

  /**
   * 能力门控(G 组)— 查询某 agent 的权威能力声明(MCP tools)。
   *
   * `AgentAccount.capabilities` 是单一权威来源:执行层(skill-executor /
   * desktop tool gating)与 openclaw_instance/skill 侧门控均从此派生。
   *
   * @param agentId Agent 账户 id
   * @returns 已声明的工具名数组(未配置时为空数组 → deny-by-default)
   */
  async getDeclaredCapabilities(agentId: string): Promise<string[]> {
    const agent = await this.findById(agentId);
    return Array.isArray(agent.capabilities) ? agent.capabilities : [];
  }

  /**
   * 能力门控(G 组)— 判断某工具是否被 agent 声明(不抛异常)。
   *
   * 直接以 `AgentAccount.capabilities` 为权威集合做 deny-by-default 判定。
   */
  async isToolAllowed(agentId: string, toolName: string): Promise<boolean> {
    const capabilities = await this.getDeclaredCapabilities(agentId);
    return isToolDeclared(capabilities, toolName);
  }

  /**
   * 能力门控(G 组)— 断言某工具被 agent 声明,未声明则拒绝(7.22「声明即门控」)。
   *
   * 由执行层在真正调用工具前调用:未在权威 `capabilities` 中声明的工具
   * SHALL 被拒绝(抛 `ForbiddenException`),消除 instance/skill 侧的双源冲突。
   *
   * @throws ForbiddenException 当工具未被声明
   */
  async assertToolDeclared(agentId: string, toolName: string): Promise<void> {
    const capabilities = await this.getDeclaredCapabilities(agentId);
    const result = evaluateToolCall(capabilities, toolName);
    if (result.allowed) {
      return;
    }
    this.logger.warn(
      `Capability gate denied: agent=${agentId} tool=${result.denial?.tool} (not in capabilities)`,
    );
    throw new ForbiddenException(result.denial?.message);
  }

  /**
   * 前台可信展示(H 组)— Agent 经济身份各维度「真实状态」。
   *
   * 返回钱包/限额/信用/链上身份/能力的真实状态枚举(enabled/not_enabled/failed),
   * 全部从 `AgentAccount` 已持久化字段派生,与后端字段严格一致、无空占位(7.25)。
   */
  async getEconomicIdentityStatus(id: string): Promise<AgentEconomicIdentityStatus> {
    const agent = await this.findById(id);
    return deriveEconomicIdentityStatus(agent);
  }

  /**
   * 查询链上注册状态
   */
  async getOnchainStatus(id: string): Promise<{
    registered: boolean;
    easAttestationUid?: string;
    erc8004SessionId?: string;
    chain?: string;
    registeredAt?: string;
    txHash?: string;
    gasSponsored: boolean;
    registrationFee: string;
  }> {
    const agent = await this.findById(id);

    return {
      registered: !!(agent.easAttestationUid || agent.erc8004SessionId),
      easAttestationUid: agent.easAttestationUid || undefined,
      erc8004SessionId: agent.erc8004SessionId || undefined,
      chain: agent.registrationChain || undefined,
      registeredAt: agent.onchainRegistrationTxHash ? agent.updatedAt?.toISOString() : undefined,
      txHash: agent.onchainRegistrationTxHash || undefined,
      gasSponsored: true,
      registrationFee: '0', // 平台承担 Gas，用户免费
    };
  }
}
