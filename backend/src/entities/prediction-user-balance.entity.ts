import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 预测市场 - 用户虚拟余额
 *
 * MVP 阶段使用平台内虚拟 USDC，新用户初始 1000，下注扣减、赢得增加。
 * 后续可与 MPC 钱包/真实 USDC 打通（mode: live）。
 */
@Entity('prediction_user_balances')
export class PredictionUserBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index({ unique: true })
  userId: string;

  /** 可用余额（USDC） */
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 1000 })
  balance: string;

  /** 累计投入 */
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  totalWagered: string;

  /** 累计派彩 */
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  totalPayout: string;

  /** 净盈亏（payout - wagered） */
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  netPnl: string;

  @Column({ type: 'int', default: 0 })
  totalBets: number;

  @Column({ type: 'int', default: 0 })
  winsCount: number;

  @Column({ type: 'int', default: 0 })
  lossesCount: number;

  @Column({ type: 'int', default: 0 })
  currentStreak: number;

  @Column({ type: 'int', default: 0 })
  bestStreak: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
