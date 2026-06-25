import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DeveloperAccount,
  DeveloperAccountStatus,
  DeveloperTier,
  DeveloperType,
  DEVELOPER_TIER_CONFIGS,
} from '../../entities/developer-account.entity';
import { User } from '../../entities/user.entity';
import { Account, AccountOwnerType, AccountWalletType, AccountChainType } from '../../entities/account.entity';
import { ApiKey } from '../../entities/api-key.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DeveloperAccountService {
  constructor(
    @InjectRepository(DeveloperAccount)
    private readonly developerAccountRepository: Repository<DeveloperAccount>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  /**
   * 生成开发者唯一标识
   */
  private generateDeveloperUniqueId(): string {
    const timestamp = Date.now();
    const random = uuidv4().substring(0, 8);
    return `DEV-${timestamp}-${random}`;
  }

  /**
   * 创建开发者账户
   */
  async create(userId: string, data: {
    name: string;
    description?: string;
    website?: string;
    contactEmail?: string;
    type?: DeveloperType;
    metadata?: Record<string, any>;
  }): Promise<DeveloperAccount> {
    // 检查用户是否存在
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 检查是否已有开发者账户
    const existing = await this.developerAccountRepository.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException('该用户已有开发者账户');
    }

    // 获取入门级配置
    const tierConfig = DEVELOPER_TIER_CONFIGS[DeveloperTier.STARTER];

    // 创建开发者账户
    const developerAccount = this.developerAccountRepository.create({
      developerUniqueId: this.generateDeveloperUniqueId(),
      userId,
      name: data.name,
      description: data.description,
      website: data.website,
      contactEmail: data.contactEmail || user.email,
      type: data.type || DeveloperType.INDIVIDUAL,
      tier: DeveloperTier.STARTER,
      status: DeveloperAccountStatus.PENDING,
      maxApiKeys: tierConfig.maxApiKeys,
      globalRateLimit: tierConfig.globalRateLimit,
      dailyRequestLimit: tierConfig.dailyRequestLimit,
      monthlyRequestLimit: tierConfig.monthlyRequestLimit,
      revenueSharePercent: tierConfig.revenueSharePercent,
      allowedScopes: tierConfig.allowedScopes,
      allowedSdks: tierConfig.allowedSdks,
      metadata: data.metadata,
    });

    const saved = await this.developerAccountRepository.save(developerAccount);

    // 自动创建默认资金账户
    await this.createDefaultAccount(saved.id, userId);

    return saved;
  }

  /**
   * 创建默认资金账户
   */
  private async createDefaultAccount(developerAccountId: string, userId: string): Promise<void> {
    const account = this.accountRepository.create({
      accountId: `ACCT-DEV-${Date.now()}-${uuidv4().substring(0, 8)}`,
      ownerId: developerAccountId,
      ownerType: AccountOwnerType.MERCHANT, // 开发者收益账户使用 merchant 类型
      name: '开发者收益账户',
      walletType: AccountWalletType.VIRTUAL,
      chainType: AccountChainType.MULTI,
      currency: 'USDC',
      isDefault: true,
    });

    const savedAccount = await this.accountRepository.save(account);

    // 更新开发者账户的默认账户 ID
    await this.developerAccountRepository.update(developerAccountId, {
      defaultAccountId: (savedAccount as Account).id,
    });
  }

  /**
   * 获取开发者账户详情
   */
  async findById(id: string): Promise<DeveloperAccount> {
    const account = await this.developerAccountRepository.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!account) {
      throw new NotFoundException('开发者账户不存在');
    }
    return account;
  }

  /**
   * 通过用户 ID 获取开发者账户
   */
  async findByUserId(userId: string): Promise<DeveloperAccount | null> {
    return this.developerAccountRepository.findOne({
      where: { userId },
      relations: ['user'],
    });
  }

  /**
   * 获取开发者列表（管理员）
   */
  async findAll(query: {
    status?: DeveloperAccountStatus;
    tier?: DeveloperTier;
    type?: DeveloperType;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: DeveloperAccount[]; total: number; page: number; limit: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const qb = this.developerAccountRepository.createQueryBuilder('dev')
      .leftJoinAndSelect('dev.user', 'user');

    if (query.status) {
      qb.andWhere('dev.status = :status', { status: query.status });
    }
    if (query.tier) {
      qb.andWhere('dev.tier = :tier', { tier: query.tier });
    }
    if (query.type) {
      qb.andWhere('dev.type = :type', { type: query.type });
    }
    if (query.search) {
      qb.andWhere(
        '(dev.name ILIKE :search OR dev.developer_unique_id ILIKE :search OR user.email ILIKE :search)',
        { search: `%${query.search}%` }
      );
    }

    qb.orderBy('dev.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  /**
   * 更新开发者账户
   */
  async update(id: string, userId: string, data: {
    name?: string;
    description?: string;
    website?: string;
    contactEmail?: string;
    webhookUrl?: string;
    oauthCallbackUrls?: string[];
    metadata?: Record<string, any>;
  }): Promise<DeveloperAccount> {
    const account = await this.findById(id);
    
    // 验证所有权
    if (account.userId !== userId) {
      throw new ForbiddenException('无权修改此开发者账户');
    }

    Object.assign(account, data);
    return this.developerAccountRepository.save(account);
  }

  /**
   * 审核通过
   */
  async approve(id: string, adminId: string): Promise<DeveloperAccount> {
    const account = await this.findById(id);
    
    if (account.status !== DeveloperAccountStatus.PENDING) {
      throw new BadRequestException('只能审核待审核状态的账户');
    }

    account.status = DeveloperAccountStatus.ACTIVE;
    account.approvedAt = new Date();
    account.approvedBy = adminId;
    account.statusReason = null;

    return this.developerAccountRepository.save(account);
  }

  /**
   * 审核拒绝
   */
  async reject(id: string, adminId: string, reason: string): Promise<DeveloperAccount> {
    const account = await this.findById(id);
    
    if (account.status !== DeveloperAccountStatus.PENDING) {
      throw new BadRequestException('只能审核待审核状态的账户');
    }

    account.status = DeveloperAccountStatus.REVOKED;
    account.statusReason = reason;

    return this.developerAccountRepository.save(account);
  }

  /**
   * 暂停账户
   */
  async suspend(id: string, adminId: string, reason: string): Promise<DeveloperAccount> {
    const account = await this.findById(id);
    
    if (account.status !== DeveloperAccountStatus.ACTIVE) {
      throw new BadRequestException('只能暂停活跃状态的账户');
    }

    account.status = DeveloperAccountStatus.SUSPENDED;
    account.statusReason = reason;

    return this.developerAccountRepository.save(account);
  }

  /**
   * 恢复账户
   */
  async resume(id: string, adminId: string): Promise<DeveloperAccount> {
    const account = await this.findById(id);
    
    if (account.status !== DeveloperAccountStatus.SUSPENDED) {
      throw new BadRequestException('只能恢复暂停状态的账户');
    }

    account.status = DeveloperAccountStatus.ACTIVE;
    account.statusReason = null;

    return this.developerAccountRepository.save(account);
  }

  /**
   * 升级等级
   */
  async upgradeTier(id: string, newTier: DeveloperTier): Promise<DeveloperAccount> {
    const account = await this.findById(id);
    
    const tierOrder = [DeveloperTier.STARTER, DeveloperTier.PROFESSIONAL, DeveloperTier.ENTERPRISE, DeveloperTier.PARTNER];
    const currentIndex = tierOrder.indexOf(account.tier);
    const newIndex = tierOrder.indexOf(newTier);

    if (newIndex <= currentIndex) {
      throw new BadRequestException('只能升级到更高等级');
    }

    const tierConfig = DEVELOPER_TIER_CONFIGS[newTier];

    account.tier = newTier;
    account.maxApiKeys = tierConfig.maxApiKeys;
    account.globalRateLimit = tierConfig.globalRateLimit;
    account.dailyRequestLimit = tierConfig.dailyRequestLimit;
    account.monthlyRequestLimit = tierConfig.monthlyRequestLimit;
    account.revenueSharePercent = tierConfig.revenueSharePercent;
    account.allowedScopes = tierConfig.allowedScopes;
    account.allowedSdks = tierConfig.allowedSdks;

    return this.developerAccountRepository.save(account);
  }

  /**
   * 签署开发者协议
   */
  async signAgreement(id: string, userId: string): Promise<DeveloperAccount> {
    const account = await this.findById(id);
    
    if (account.userId !== userId) {
      throw new ForbiddenException('无权操作此账户');
    }

    account.hasSignedAgreement = true;
    account.agreementSignedAt = new Date();

    return this.developerAccountRepository.save(account);
  }

  /**
   * 检查 API Key 创建限额
   */
  async checkApiKeyLimit(developerAccountId: string): Promise<{ canCreate: boolean; remaining: number }> {
    const account = await this.findById(developerAccountId);
    const remaining = account.maxApiKeys - account.currentApiKeyCount;
    return {
      canCreate: remaining > 0,
      remaining: Math.max(0, remaining),
    };
  }

  /**
   * 增加 API Key 计数
   */
  async incrementApiKeyCount(developerAccountId: string): Promise<void> {
    await this.developerAccountRepository.increment(
      { id: developerAccountId },
      'currentApiKeyCount',
      1
    );
  }

  /**
   * 减少 API Key 计数
   */
  async decrementApiKeyCount(developerAccountId: string): Promise<void> {
    await this.developerAccountRepository.decrement(
      { id: developerAccountId },
      'currentApiKeyCount',
      1
    );
  }

  /**
   * 增加 API 调用计数
   */
  async incrementApiCalls(developerAccountId: string): Promise<void> {
    await this.developerAccountRepository.increment(
      { id: developerAccountId },
      'totalApiCalls',
      1
    );
    await this.developerAccountRepository.increment(
      { id: developerAccountId },
      'todayApiCalls',
      1
    );
    await this.developerAccountRepository.increment(
      { id: developerAccountId },
      'monthApiCalls',
      1
    );
    
    // 更新最后活跃时间
    await this.developerAccountRepository.update(developerAccountId, {
      lastActiveAt: new Date(),
    });
  }

  /**
   * 检查请求限额
   */
  async checkRateLimit(developerAccountId: string): Promise<{
    allowed: boolean;
    dailyRemaining: number;
    monthlyRemaining: number;
  }> {
    const account = await this.findById(developerAccountId);
    
    // -1 表示无限制
    const dailyRemaining = account.dailyRequestLimit === -1 
      ? -1 
      : account.dailyRequestLimit - account.todayApiCalls;
    const monthlyRemaining = account.monthlyRequestLimit === -1 
      ? -1 
      : account.monthlyRequestLimit - account.monthApiCalls;

    const allowed = (dailyRemaining === -1 || dailyRemaining > 0) && 
                   (monthlyRemaining === -1 || monthlyRemaining > 0);

    return { allowed, dailyRemaining, monthlyRemaining };
  }

  /**
   * 重置每日计数（定时任务调用）
   */
  async resetDailyCounts(): Promise<void> {
    // 检查是否有记录，防止 TypeORM 报错 Empty criteria
    const count = await this.developerAccountRepository.count();
    if (count > 0) {
      await this.developerAccountRepository.update({}, { todayApiCalls: 0 });
    }
  }

  /**
   * 重置每月计数（定时任务调用）
   */
  async resetMonthlyCounts(): Promise<void> {
    const count = await this.developerAccountRepository.count();
    if (count > 0) {
      await this.developerAccountRepository.update({}, { monthApiCalls: 0 });
    }
  }

  /**
   * 增加收益
   */
  async addRevenue(developerAccountId: string, amount: number): Promise<void> {
    await this.developerAccountRepository.increment(
      { id: developerAccountId },
      'totalRevenue',
      amount
    );
    await this.developerAccountRepository.increment(
      { id: developerAccountId },
      'pendingRevenue',
      amount
    );
  }

  /**
   * 结算收益
   */
  async settleRevenue(developerAccountId: string, amount: number): Promise<void> {
    const account = await this.findById(developerAccountId);
    
    if (Number(account.pendingRevenue) < amount) {
      throw new BadRequestException('待结算金额不足');
    }

    await this.developerAccountRepository.decrement(
      { id: developerAccountId },
      'pendingRevenue',
      amount
    );
    await this.developerAccountRepository.increment(
      { id: developerAccountId },
      'withdrawnRevenue',
      amount
    );
  }

  /**
   * 更新发布统计
   */
  async updatePublishStats(developerAccountId: string, type: 'skill' | 'agent', delta: number): Promise<void> {
    if (type === 'skill') {
      await this.developerAccountRepository.increment(
        { id: developerAccountId },
        'publishedSkillCount',
        delta
      );
    } else {
      await this.developerAccountRepository.increment(
        { id: developerAccountId },
        'publishedAgentCount',
        delta
      );
    }
  }

  /**
   * 更新评分
   */
  async updateRating(developerAccountId: string, newRating: number): Promise<void> {
    const account = await this.findById(developerAccountId);
    
    const totalRatingPoints = Number(account.rating) * account.ratingCount;
    const newRatingCount = account.ratingCount + 1;
    const newAverageRating = (totalRatingPoints + newRating) / newRatingCount;

    await this.developerAccountRepository.update(developerAccountId, {
      rating: newAverageRating,
      ratingCount: newRatingCount,
    });
  }

  /**
   * 获取开发者仪表盘数据
   */
  async getDashboard(userId: string): Promise<{
    account: DeveloperAccount;
    apiKeys: { total: number; active: number };
    recentActivity: any[];
  }> {
    const account = await this.findByUserId(userId);
    if (!account) {
      throw new NotFoundException('开发者账户不存在');
    }

    // 获取 API Key 统计
    const apiKeyStats = await this.apiKeyRepository
      .createQueryBuilder('key')
      .where('key.userId = :userId', { userId })
      .select([
        'COUNT(*) as total',
        "SUM(CASE WHEN key.status = 'active' THEN 1 ELSE 0 END) as active",
      ])
      .getRawOne();

    return {
      account,
      apiKeys: {
        total: parseInt(apiKeyStats?.total || '0'),
        active: parseInt(apiKeyStats?.active || '0'),
      },
      recentActivity: [], // 后续可扩展
    };
  }
}
