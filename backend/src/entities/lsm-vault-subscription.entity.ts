import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * LSM 用户金库承接订阅（P3）。
 * 用户金库订阅联赛或单盘，声明承接容量 + 费率竞价；承接路由按 (费率竞价 + 容量) 选入。
 */
export enum LsmSubscriptionScopeType {
  LEAGUE = 'league',
  MARKET = 'market',
}

@Entity('lsm_vault_subscriptions')
@Index(['scopeType', 'scopeValue', 'enabled'])
export class LsmVaultSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  vaultId: string;

  @Column({ type: 'enum', enum: LsmSubscriptionScopeType })
  scopeType: LsmSubscriptionScopeType;

  /** league 名称 或 marketId */
  @Column({ type: 'varchar', length: 128 })
  scopeValue: string;

  /** 该订阅愿承接的最大敞口容量（整数 AXP，受金库 bankroll/敞口上限约束） */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  capacity: string;

  /** 费率竞价（bps）：用户金库愿以多低 edge 承接（越激进越优先），用于路由排序 */
  @Column({ type: 'int', default: 0 })
  feeBidBps: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
