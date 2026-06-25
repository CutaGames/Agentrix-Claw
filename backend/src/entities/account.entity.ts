import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * 账户所有者类型
 */
export enum AccountOwnerType {
  USER = 'user',           // 个人用户
  AGENT = 'agent',         // AI Agent
  MERCHANT = 'merchant',   // 商户
  PLATFORM = 'platform',   // 平台
}

/**
 * 钱包类型
 */
export enum AccountWalletType {
  CUSTODIAL = 'custodial',       // 托管式（MPC）
  NON_CUSTODIAL = 'non_custodial', // 非托管（外部钱包）
  VIRTUAL = 'virtual',           // 虚拟账户（仅记账）
}

/**
 * 账户状态
 */
export enum AccountStatus {
  ACTIVE = 'active',
  FROZEN = 'frozen',
  CLOSED = 'closed',
}

/**
 * 支持的链类型
 */
export enum AccountChainType {
  EVM = 'evm',
  SOLANA = 'solana',
  BITCOIN = 'bitcoin',
  MULTI = 'multi',  // 多链账户
}

/**
 * 统一资金账户实体
 * 
 * 设计目标：
 * - 统一管理所有类型的资金账户（用户/Agent/商户/平台）
 * - 支持托管和非托管两种模式
 * - 提供余额快照和交易统计
 * - 支持多链多币种
 */
@Entity('accounts')
@Index(['ownerId', 'ownerType'])
@Index(['walletAddress'])
@Index(['status'])
@Index(['isDefault'])
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 账户唯一标识
   * 格式：ACC-{ownerType}-{timestamp}-{random}
   */
  @Column({ unique: true, length: 50 })
  accountId: string;

  /**
   * 账户名称（用户自定义）
   */
  @Column({ length: 100, nullable: true })
  name?: string;

  // ========== 归属关系 ==========

  /**
   * 所有者 ID
   * 根据 ownerType 可能是 userId, agentId, merchantId
   */
  @Column()
  ownerId: string;

  /**
   * 所有者类型
   */
  @Column({ type: 'enum',
    enum: AccountOwnerType })
  ownerType: AccountOwnerType;

  /**
   * 关联用户（如果 ownerType 是 user）
   */
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn()
  user?: User;

  @Column({ nullable: true })
  userId?: string;

  // ========== 钱包信息 ==========

  /**
   * 钱包类型
   */
  @Column({ type: 'enum',
    enum: AccountWalletType })
  walletType: AccountWalletType;

  /**
   * 链类型
   */
  @Column({ type: 'enum',
    enum: AccountChainType,
    default: AccountChainType.EVM })
  chainType: AccountChainType;

  /**
   * 具体链 ID（如 1=Ethereum, 56=BSC）
   */
  @Column({ nullable: true })
  chainId?: string;

  /**
   * 钱包地址（非托管时必填）
   */
  @Column({ nullable: true, length: 100 })
  walletAddress?: string;

  /**
   * MPC 钱包 ID（托管时关联）
   */
  @Column({ nullable: true })
  mpcWalletId?: string;

  // ========== 余额信息 ==========

  /**
   * 主币种
   */
  @Column({ length: 10, default: 'USDC' })
  currency: string;

  /**
   * 可用余额
   */
  @Column('decimal', { name: 'available_balance', precision: 18, scale: 6, default: 0 })
  availableBalance: number;

  /**
   * 冻结余额
   */
  @Column('decimal', { name: 'frozen_balance', precision: 18, scale: 6, default: 0 })
  frozenBalance: number;

  /**
   * 待结算余额
   */
  @Column('decimal', { name: 'pending_balance', precision: 18, scale: 6, default: 0 })
  pendingBalance: number;

  /**
   * 余额快照时间
   */
  @Column({ nullable: true })
  balanceUpdatedAt?: Date;

  // ========== 多币种支持 ==========

  /**
   * 多币种余额
   * { "USDT": "100.00", "ETH": "0.5" }
   */
  @Column({ type: 'jsonb', nullable: true })
  multiCurrencyBalances?: Record<string, string>;

  // ========== 账户设置 ==========

  /**
   * 是否为默认账户
   */
  @Column({ default: false })
  isDefault: boolean;

  /**
   * 账户状态
   */
  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.ACTIVE,
  })
  status: AccountStatus;

  /**
   * 状态原因
   */
  @Column({ nullable: true, length: 500 })
  statusReason?: string;

  // ========== 限额配置 ==========

  /**
   * 单笔交易限额
   */
  @Column('decimal', { name: 'single_tx_limit', precision: 18, scale: 2, nullable: true })
  singleTxLimit?: number;

  /**
   * 日交易限额
   */
  @Column('decimal', { name: 'daily_limit', precision: 18, scale: 2, nullable: true })
  dailyLimit?: number;

  /**
   * 月交易限额
   */
  @Column('decimal', { name: 'monthly_limit', precision: 18, scale: 2, nullable: true })
  monthlyLimit?: number;

  // ========== 统计信息 ==========

  /**
   * 总入账金额
   */
  @Column('decimal', { name: 'total_deposit', precision: 18, scale: 2, default: 0 })
  totalDeposit: number;

  /**
   * 总出账金额
   */
  @Column('decimal', { name: 'total_withdraw', precision: 18, scale: 2, default: 0 })
  totalWithdraw: number;

  /**
   * 交易笔数
   */
  @Column({ default: 0 })
  transactionCount: number;

  // ========== 元数据 ==========

  /**
   * 扩展元数据
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
