import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * LSM 金库 LP 持仓（某用户在某金库的份额）。
 * shares 整数；locked_until 锁定期；is_leader 标识主理人 skin-in-game 持仓。
 */
@Entity('lsm_vault_positions')
@Index(['vaultId', 'userId'], { unique: true })
export class LsmVaultPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  vaultId: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  /** 持有份额（整数） */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  shares: string;

  /** 累计出资本金（成本基准，整数 AXP，用于展示收益） */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  costBasis: string;

  /** 最近一次存入的锁定到期时间（该用户全部份额按最近存入锁定，保守） */
  @Column({ type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'boolean', default: false })
  isLeader: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
