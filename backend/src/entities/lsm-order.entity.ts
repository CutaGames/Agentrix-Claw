import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * LSM — 杠杆滚球下单。
 * 资金口径：整数 AXP（numeric(38,0)，props 以 string 承载，边界处 Number 转换）。
 *
 * 杠杆固定赔率模型（沿用 KMarket 口径）：
 *   保证金 M = stake；名义敞口 N = M × leverage；成交赔率 entryOdds（已含 edge）。
 *   赢：用户得 M + N×(entryOdds−1)；庄家/金库付 N×(entryOdds−1)。
 *   输：用户得 0；庄家/金库收 M。
 *   reserve（庄家最坏赔付预留）= maxProfit = N×(entryOdds−1)。
 */
export enum LsmOrderStatus {
  OPEN = 'open', // 持仓中
  WON = 'won', // 已结算-用户赢
  LOST = 'lost', // 已结算-用户输
  REFUNDED = 'refunded', // 取消/作废/平局退保证金
  CASHED_OUT = 'cashed_out', // 提前平仓（P2+）
}

@Entity('lsm_orders')
@Index(['userId', 'createdAt'])
@Index(['marketId', 'status'])
export class LsmOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  @Index()
  marketId: string;

  /** 下注结果序号：0=home,1=away,2=draw */
  @Column({ type: 'int' })
  outcomeIdx: number;

  /** 保证金（用户出资本金，整数 AXP） */
  @Column({ type: 'numeric', precision: 38, scale: 0 })
  stake: string;

  /** 杠杆倍数（整数，如 1/2/5/10） */
  @Column({ type: 'int', default: 1 })
  leverage: number;

  /** 成交赔率（小数制，已含 edge，如 1.92） */
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  entryOdds: string;

  /** 名义敞口 N = stake × leverage（整数 AXP） */
  @Column({ type: 'numeric', precision: 38, scale: 0 })
  notional: string;

  /** 庄家/金库最坏赔付预留 = 用户最大盈利 = N×(entryOdds−1)（整数 AXP） */
  @Column({ type: 'numeric', precision: 38, scale: 0 })
  maxProfit: string;

  @Column({ type: 'enum', enum: LsmOrderStatus, default: LsmOrderStatus.OPEN })
  @Index()
  status: LsmOrderStatus;

  /** 结算派彩（含本金，仅 WON/REFUNDED 非零；整数 AXP） */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  payout: string;

  /** 用户已实现盈亏（payout − stake，可负；整数 AXP） */
  @Column({ type: 'numeric', precision: 38, scale: 0, default: 0 })
  closePnl: string;

  /** 幂等键（防重复提交），唯一 */
  @Column({ type: 'varchar', length: 128 })
  @Index({ unique: true })
  idemKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt: Date | null;
}
