import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * LSM 订单资金腿（P3 多金库分摊）。
 * 单笔下注按承接比例拆分到各承接金库，各自独立预留/结算/盈亏。
 * 拆分余数归官方金库腿（兜底），保证 ΣstakeShare=stake、Σ预留=winPayout。
 */
@Entity('lsm_order_legs')
@Index(['orderId'])
@Index(['vaultId'])
export class LsmOrderLeg {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  orderId: string;

  @Column({ type: 'uuid' })
  vaultId: string;

  @Column({ type: 'int' })
  allocBps: number;

  /** 本腿承接的保证金份额（整数 AXP） */
  @Column({ type: 'numeric', precision: 38, scale: 0 })
  stakeShare: string;

  /** 本腿承接的最坏赔付预留（整数 AXP，= stakeShare + maxProfitShare） */
  @Column({ type: 'numeric', precision: 38, scale: 0 })
  reserveShare: string;

  /** 本腿已实现盈亏（结算后写入，整数 AXP，带符号） */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  pnlShare: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
