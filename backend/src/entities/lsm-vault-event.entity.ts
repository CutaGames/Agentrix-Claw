import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * LSM 金库事件流（审计 + 对账）。append-only。
 * idemKey 唯一，保证存赎/结算/分成幂等。
 */
export enum LsmVaultEventType {
  DEPOSIT = 'deposit',
  REDEEM = 'redeem',
  PNL = 'pnl', // 订单结算导致的金库权益变动
  PROFIT_FEE = 'profit_fee', // 主理人高水位分成计提
  CLOSE = 'close', // 关闭金库清算
}

@Entity('lsm_vault_events')
@Index(['vaultId', 'createdAt'])
export class LsmVaultEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  vaultId: string;

  @Column({ type: 'enum', enum: LsmVaultEventType })
  type: LsmVaultEventType;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /** 金额变动（整数 AXP，带符号语义由 type 决定） */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  amount: string;

  /** 份额变动（整数，铸为正、销为负） */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  sharesDelta: string;

  /** 事件时 NAV（定点 1e9），便于对账 */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  navAt: string;

  @Column({ type: 'varchar', length: 160 })
  @Index({ unique: true })
  idemKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
