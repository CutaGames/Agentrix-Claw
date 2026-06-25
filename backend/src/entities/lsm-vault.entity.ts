import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * LSM LP 金库（Hyperliquid 式）。统一建模，kind 区分官方/用户金库。
 *
 * 净权益 E = bankroll − reserved（保守计量，未结风险全额预留）。
 * NAV = E / totalShares（高精度有理数计算，展示取整，余数归金库防套利）。
 * 偿付硬不变量：reserved ≤ bankroll（任意时刻），等价 E ≥ 0。
 *
 * 记账口径（整数 AXP，单一 bankroll 含已收保证金）：
 *  - 开仓：bankroll += stake；reserved += winPayout(=stake+maxProfit)。E 减少 maxProfit。
 *  - 用户赢：bankroll −= winPayout；reserved −= winPayout。E 不变（已保守计入）。
 *  - 用户输：reserved −= winPayout。E 增加 winPayout−... = 释放后净增 maxProfit+stake 的预留 → bankroll 留存 stake。
 *  - 退款：bankroll −= stake；reserved −= winPayout。
 */
export enum LsmVaultKind {
  PROTOCOL = 'protocol', // 官方金库（类 HLP），单例
  USER = 'user', // 用户自建金库
}

export enum LsmVaultStatus {
  ACTIVE = 'active',
  CLOSING = 'closing', // 停止承接新单，结清未结
  CLOSED = 'closed',
}

@Entity('lsm_vault')
@Index(['kind', 'status'])
export class LsmVault {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: LsmVaultKind, default: LsmVaultKind.USER })
  @Index()
  kind: LsmVaultKind;

  /** 官方金库单例锚点（kind=protocol 时固定 'protocol'，唯一）；用户金库为 null */
  @Column({ type: 'varchar', length: 32, nullable: true })
  @Index({ unique: true })
  singletonKey: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  name: string | null;

  /** 用户金库主理人 userId；官方金库为 null */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  leaderUserId: string | null;

  @Column({ type: 'enum', enum: LsmVaultStatus, default: LsmVaultStatus.ACTIVE })
  status: LsmVaultStatus;

  /** 主理人最低自有份额占比（bps，默认 500=5%） */
  @Column({ type: 'int', default: 500 })
  minLeaderShareBps: number;

  /** 利润分成（bps，默认 1000=10%，官方金库=0） */
  @Column({ type: 'int', default: 0 })
  profitShareBps: number;

  /** 存款锁定期（秒，默认 86400=24h） */
  @Column({ type: 'int', default: 86400 })
  depositLockSecs: number;

  /** 利润分成高水位：迄今 NAV(以 1e9 定点表示) 的历史最高，仅创新高才计提 */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  highWaterNav: string;

  @Column({ type: 'varchar', length: 10, default: 'AXP' })
  assetUnit: string;

  /** 可用本金（含已收保证金），整数 AXP */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  bankroll: string;

  /** 未结订单最坏赔付之和（预留负债），整数 AXP */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  reserved: string;

  /** 总份额（整数） */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  totalShares: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
