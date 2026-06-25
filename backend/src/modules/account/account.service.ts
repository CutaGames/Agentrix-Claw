import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Account, AccountOwnerType, AccountWalletType, AccountChainType, AccountStatus } from '../../entities/account.entity';

/**
 * 创建账户 DTO
 */
export interface CreateAccountDto {
  name: string;
  ownerId: string;
  ownerType: AccountOwnerType;
  walletType: AccountWalletType;
  chainType?: AccountChainType;
  currency?: string;
  walletAddress?: string;
  mpcWalletId?: string;
  isDefault?: boolean;
  metadata?: Record<string, any>;
}

/**
 * 资金操作 DTO
 */
export interface FundOperationDto {
  amount: number;
  currency?: string;
  reference?: string;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * 转账 DTO
 */
export interface TransferDto {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency?: string;
  reference?: string;
  description?: string;
}

/**
 * 统一资金账户服务
 * 
 * 核心职责：
 * - 管理所有实体类型（用户/Agent/商户/平台）的资金账户
 * - 处理余额查询、充值、提现、转账
 * - 支持多币种、多链
 * - 账户状态管理
 */
@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
    private dataSource: DataSource,
  ) {}

  /**
   * 生成账户 ID
   */
  private generateAccountId(ownerType: AccountOwnerType): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const prefix = ownerType.toUpperCase().slice(0, 3);
    return `ACC-${prefix}-${timestamp}-${random}`;
  }

  /**
   * 创建资金账户
   */
  async create(dto: CreateAccountDto): Promise<Account> {
    // 检查是否已有同类型的默认账户
    if (dto.isDefault) {
      const existing = await this.accountRepository.findOne({
        where: {
          ownerId: dto.ownerId,
          ownerType: dto.ownerType,
          isDefault: true,
        },
      });

      if (existing) {
        // 取消原有默认账户的默认状态
        existing.isDefault = false;
        await this.accountRepository.save(existing);
      }
    }

    // 检查钱包地址是否重复
    if (dto.walletAddress) {
      const existingWallet = await this.accountRepository.findOne({
        where: { walletAddress: dto.walletAddress },
      });
      if (existingWallet) {
        throw new ConflictException('该钱包地址已被使用');
      }
    }

    const account = this.accountRepository.create({
      accountId: this.generateAccountId(dto.ownerType),
      name: dto.name,
      ownerId: dto.ownerId,
      ownerType: dto.ownerType,
      walletType: dto.walletType,
      chainType: dto.chainType || AccountChainType.MULTI,
      currency: dto.currency || 'USDC',
      walletAddress: dto.walletAddress,
      mpcWalletId: dto.mpcWalletId,
      isDefault: dto.isDefault ?? false,
      status: AccountStatus.ACTIVE,
      metadata: dto.metadata,
    });

    return this.accountRepository.save(account);
  }

  /**
   * 根据 ID 查找账户
   */
  async findById(id: string): Promise<Account> {
    const account = await this.accountRepository.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException('账户不存在');
    }
    return account;
  }

  /**
   * 根据账户 ID 查找
   */
  async findByAccountId(accountId: string): Promise<Account> {
    const account = await this.accountRepository.findOne({ where: { accountId } });
    if (!account) {
      throw new NotFoundException('账户不存在');
    }
    return account;
  }

  /**
   * 获取所有者的账户列表
   */
  async findByOwner(ownerId: string, ownerType: AccountOwnerType): Promise<Account[]> {
    return this.accountRepository.find({
      where: { ownerId, ownerType },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  /**
   * 获取默认账户
   */
  async getDefaultAccount(ownerId: string, ownerType: AccountOwnerType): Promise<Account | null> {
    return this.accountRepository.findOne({
      where: { ownerId, ownerType, isDefault: true },
    });
  }

  /**
   * 设置默认账户
   */
  async setDefaultAccount(id: string, ownerId: string, ownerType: AccountOwnerType): Promise<Account> {
    const account = await this.findById(id);

    if (account.ownerId !== ownerId || account.ownerType !== ownerType) {
      throw new BadRequestException('账户不属于该所有者');
    }

    // 取消原有默认账户
    await this.accountRepository.update(
      { ownerId, ownerType, isDefault: true },
      { isDefault: false },
    );

    // 设置新的默认账户
    account.isDefault = true;
    return this.accountRepository.save(account);
  }

  /**
   * 查询余额
   */
  async getBalance(id: string): Promise<{
    availableBalance: number;
    frozenBalance: number;
    pendingBalance: number;
    totalBalance: number;
    currency: string;
  }> {
    const account = await this.findById(id);
    const totalBalance = Number(account.availableBalance) + Number(account.frozenBalance) + Number(account.pendingBalance);

    return {
      availableBalance: Number(account.availableBalance),
      frozenBalance: Number(account.frozenBalance),
      pendingBalance: Number(account.pendingBalance),
      totalBalance,
      currency: account.currency,
    };
  }

  /**
   * 查询多币种余额
   */
  async getMultiCurrencyBalances(id: string): Promise<Record<string, number>> {
    const account = await this.findById(id);
    const balances: Record<string, number> = {};

    // 主币种余额
    balances[account.currency] = Number(account.availableBalance);

    // 其他币种余额
    if (account.multiCurrencyBalances) {
      for (const [currency, balance] of Object.entries(account.multiCurrencyBalances)) {
        balances[currency] = Number(balance);
      }
    }

    return balances;
  }

  /**
   * 充值（增加余额）
   */
  async deposit(id: string, dto: FundOperationDto): Promise<Account> {
    return this.dataSource.transaction(async (manager) => {
      const account = await manager.findOne(Account, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!account) {
        throw new NotFoundException('账户不存在');
      }

      if (account.status !== AccountStatus.ACTIVE) {
        throw new BadRequestException('账户状态异常，无法充值');
      }

      const currency = dto.currency || account.currency;

      if (currency === account.currency) {
        // 主币种
        account.availableBalance = Number(account.availableBalance) + dto.amount;
      } else {
        // 其他币种
        if (!account.multiCurrencyBalances) account.multiCurrencyBalances = {};
        const currentBalance = Number(account.multiCurrencyBalances[currency] || 0);
        account.multiCurrencyBalances[currency] = String(currentBalance + dto.amount);
      }

      account.totalDeposit = Number(account.totalDeposit) + dto.amount;
      account.transactionCount += 1;
      account.balanceUpdatedAt = new Date();

      // 记录交易历史
      if (!account.metadata) account.metadata = {};
      if (!account.metadata.transactions) account.metadata.transactions = [];
      account.metadata.transactions.push({
        type: 'deposit',
        amount: dto.amount,
        currency,
        reference: dto.reference,
        description: dto.description,
        timestamp: new Date(),
      });

      return manager.save(account);
    });
  }

  /**
   * 提现（减少余额）
   */
  async withdraw(id: string, dto: FundOperationDto): Promise<Account> {
    return this.dataSource.transaction(async (manager) => {
      const account = await manager.findOne(Account, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!account) {
        throw new NotFoundException('账户不存在');
      }

      if (account.status !== AccountStatus.ACTIVE) {
        throw new BadRequestException('账户状态异常，无法提现');
      }

      const currency = dto.currency || account.currency;
      let currentBalance: number;

      if (currency === account.currency) {
        currentBalance = Number(account.availableBalance);
      } else {
        currentBalance = Number(account.multiCurrencyBalances?.[currency] || 0);
      }

      if (currentBalance < dto.amount) {
        throw new BadRequestException('余额不足');
      }

      if (currency === account.currency) {
        account.availableBalance = Number(account.availableBalance) - dto.amount;
      } else {
        account.multiCurrencyBalances[currency] = String(Number(account.multiCurrencyBalances[currency]) - dto.amount);
      }

      account.totalWithdraw = Number(account.totalWithdraw) + dto.amount;
      account.transactionCount += 1;
      account.balanceUpdatedAt = new Date();

      // 记录交易历史
      if (!account.metadata) account.metadata = {};
      if (!account.metadata.transactions) account.metadata.transactions = [];
      account.metadata.transactions.push({
        type: 'withdrawal',
        amount: dto.amount,
        currency,
        reference: dto.reference,
        description: dto.description,
        timestamp: new Date(),
      });

      return manager.save(account);
    });
  }

  /**
   * 转账
   */
  async transfer(dto: TransferDto): Promise<{ from: Account; to: Account }> {
    return this.dataSource.transaction(async (manager) => {
      // 锁定两个账户（按 ID 排序避免死锁）
      const [firstId, secondId] = [dto.fromAccountId, dto.toAccountId].sort();

      const accounts = await manager.find(Account, {
        where: [{ id: firstId }, { id: secondId }],
        lock: { mode: 'pessimistic_write' },
      });

      const fromAccount = accounts.find((a) => a.id === dto.fromAccountId);
      const toAccount = accounts.find((a) => a.id === dto.toAccountId);

      if (!fromAccount) {
        throw new NotFoundException('转出账户不存在');
      }
      if (!toAccount) {
        throw new NotFoundException('转入账户不存在');
      }

      if (fromAccount.status !== AccountStatus.ACTIVE) {
        throw new BadRequestException('转出账户状态异常');
      }
      if (toAccount.status !== AccountStatus.ACTIVE) {
        throw new BadRequestException('转入账户状态异常');
      }

      const currency = dto.currency || fromAccount.currency;
      const availableBalance = Number(fromAccount.availableBalance);

      if (availableBalance < dto.amount) {
        throw new BadRequestException('余额不足');
      }

      // 扣款
      fromAccount.availableBalance = Number(fromAccount.availableBalance) - dto.amount;
      fromAccount.totalWithdraw = Number(fromAccount.totalWithdraw) + dto.amount;
      fromAccount.transactionCount += 1;
      fromAccount.balanceUpdatedAt = new Date();

      // 入账
      if (currency === toAccount.currency) {
        toAccount.availableBalance = Number(toAccount.availableBalance) + dto.amount;
      } else {
        if (!toAccount.multiCurrencyBalances) toAccount.multiCurrencyBalances = {};
        const currentBalance = Number(toAccount.multiCurrencyBalances[currency] || 0);
        toAccount.multiCurrencyBalances[currency] = String(currentBalance + dto.amount);
      }
      toAccount.totalDeposit = Number(toAccount.totalDeposit) + dto.amount;
      toAccount.transactionCount += 1;
      toAccount.balanceUpdatedAt = new Date();

      // 记录交易历史
      const transactionRecord = {
        type: 'transfer',
        amount: dto.amount,
        currency,
        reference: dto.reference,
        description: dto.description,
        timestamp: new Date(),
      };

      if (!fromAccount.metadata) fromAccount.metadata = {};
      if (!fromAccount.metadata.transactions) fromAccount.metadata.transactions = [];
      fromAccount.metadata.transactions.push({
        ...transactionRecord,
        direction: 'out',
        counterpartyAccountId: toAccount.id,
      });

      if (!toAccount.metadata) toAccount.metadata = {};
      if (!toAccount.metadata.transactions) toAccount.metadata.transactions = [];
      toAccount.metadata.transactions.push({
        ...transactionRecord,
        direction: 'in',
        counterpartyAccountId: fromAccount.id,
      });

      await manager.save([fromAccount, toAccount]);

      return { from: fromAccount, to: toAccount };
    });
  }

  /**
   * 冻结部分余额
   */
  async freezeBalance(id: string, amount: number, reason?: string): Promise<Account> {
    return this.dataSource.transaction(async (manager) => {
      const account = await manager.findOne(Account, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!account) {
        throw new NotFoundException('账户不存在');
      }

      const availableBalance = Number(account.availableBalance);
      if (availableBalance < amount) {
        throw new BadRequestException('可用余额不足');
      }

      account.availableBalance = Number(account.availableBalance) - amount;
      account.frozenBalance = Number(account.frozenBalance) + amount;
      account.balanceUpdatedAt = new Date();

      // 记录冻结历史
      if (!account.metadata) account.metadata = {};
      if (!account.metadata.freezeHistory) account.metadata.freezeHistory = [];
      account.metadata.freezeHistory.push({
        type: 'freeze',
        amount,
        reason,
        timestamp: new Date(),
      });

      return manager.save(account);
    });
  }

  /**
   * 解冻部分余额
   */
  async unfreezeBalance(id: string, amount: number, reason?: string): Promise<Account> {
    return this.dataSource.transaction(async (manager) => {
      const account = await manager.findOne(Account, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!account) {
        throw new NotFoundException('账户不存在');
      }

      if (Number(account.frozenBalance) < amount) {
        throw new BadRequestException('冻结金额不足');
      }

      account.frozenBalance = Number(account.frozenBalance) - amount;
      account.availableBalance = Number(account.availableBalance) + amount;
      account.balanceUpdatedAt = new Date();

      // 记录解冻历史
      if (!account.metadata) account.metadata = {};
      if (!account.metadata.freezeHistory) account.metadata.freezeHistory = [];
      account.metadata.freezeHistory.push({
        type: 'unfreeze',
        amount,
        reason,
        timestamp: new Date(),
      });

      return manager.save(account);
    });
  }

  /**
   * 冻结账户
   */
  async freezeAccount(id: string, reason?: string): Promise<Account> {
    const account = await this.findById(id);

    if (account.status === AccountStatus.FROZEN) {
      throw new BadRequestException('账户已被冻结');
    }

    account.status = AccountStatus.FROZEN;
    account.statusReason = reason;

    return this.accountRepository.save(account);
  }

  /**
   * 解冻账户
   */
  async unfreezeAccount(id: string): Promise<Account> {
    const account = await this.findById(id);

    if (account.status !== AccountStatus.FROZEN) {
      throw new BadRequestException('账户未被冻结');
    }

    account.status = AccountStatus.ACTIVE;
    account.statusReason = null;

    return this.accountRepository.save(account);
  }

  /**
   * 关闭账户
   */
  async closeAccount(id: string, reason?: string): Promise<Account> {
    const account = await this.findById(id);

    // 检查余额是否为零
    const totalBalance = Number(account.availableBalance) + Number(account.frozenBalance) + Number(account.pendingBalance);
    if (totalBalance > 0) {
      throw new BadRequestException('账户仍有余额，无法关闭');
    }

    account.status = AccountStatus.CLOSED;
    account.statusReason = reason;

    return this.accountRepository.save(account);
  }

  /**
   * 获取交易统计
   */
  async getAccountStats(id: string): Promise<{
    totalDeposit: number;
    totalWithdraw: number;
    transactionCount: number;
    netFlow: number;
  }> {
    const account = await this.findById(id);

    return {
      totalDeposit: Number(account.totalDeposit),
      totalWithdraw: Number(account.totalWithdraw),
      transactionCount: account.transactionCount,
      netFlow: Number(account.totalDeposit) - Number(account.totalWithdraw),
    };
  }

  /**
   * 批量查询账户
   */
  async findByIds(ids: string[]): Promise<Account[]> {
    return this.accountRepository.findByIds(ids);
  }

  /**
   * 为用户创建默认账户
   */
  async createUserDefaultAccount(userId: string, userName?: string): Promise<Account> {
    return this.create({
      name: userName ? `${userName} 的主账户` : '主账户',
      ownerId: userId,
      ownerType: AccountOwnerType.USER,
      walletType: AccountWalletType.VIRTUAL,
      chainType: AccountChainType.MULTI,
      currency: 'USDC',
      isDefault: true,
    });
  }

  /**
   * 为商户创建默认账户
   */
  async createMerchantDefaultAccount(merchantId: string, merchantName?: string): Promise<Account> {
    return this.create({
      name: merchantName ? `${merchantName} 结算账户` : '商户结算账户',
      ownerId: merchantId,
      ownerType: AccountOwnerType.MERCHANT,
      walletType: AccountWalletType.VIRTUAL,
      chainType: AccountChainType.MULTI,
      currency: 'USDC',
      isDefault: true,
    });
  }

  /**
   * 获取账户交易历史
   */
  async getTransactions(
    id: string,
    options?: { limit?: number; offset?: number; type?: string },
  ): Promise<{ transactions: any[]; total: number }> {
    const account = await this.findById(id);
    
    // 从 metadata.transactions 获取交易历史
    const allTransactions = account.metadata?.transactions || [];
    
    // 按类型筛选
    let filtered = allTransactions;
    if (options?.type) {
      filtered = allTransactions.filter((tx: any) => tx.type === options.type);
    }
    
    // 按时间倒序排序
    filtered.sort((a: any, b: any) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    // 分页
    const offset = options?.offset || 0;
    const limit = options?.limit || 20;
    const paginated = filtered.slice(offset, offset + limit);
    
    // 转换为前端期望的格式
    const transactions = paginated.map((tx: any, index: number) => ({
      id: `tx-${account.id}-${index}-${Date.now()}`,
      accountId: account.id,
      type: tx.type,
      amount: String(tx.amount),
      currency: tx.currency || account.currency,
      status: 'completed',
      txHash: tx.reference || null,
      memo: tx.description || null,
      metadata: tx.metadata || {},
      createdAt: tx.timestamp,
    }));
    
    return {
      transactions,
      total: filtered.length,
    };
  }
}
