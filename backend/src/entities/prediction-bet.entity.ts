import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PredictionRound, PredictionOutcome } from './prediction-round.entity';

export enum PredictionBetSide {
  UP = 'up',
  DOWN = 'down',
}

export enum PredictionBetStatus {
  PLACED = 'placed',
  WON = 'won',
  LOST = 'lost',
  REFUNDED = 'refunded',
}

@Entity('prediction_bets')
@Index(['userId', 'createdAt'])
@Index(['roundId'])
export class PredictionBet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column()
  roundId: string;

  @ManyToOne(() => PredictionRound, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'round_id' })
  round?: PredictionRound;

  @Column({ type: 'enum', enum: PredictionBetSide })
  side: PredictionBetSide;

  /** 押注金额（USDC） */
  @Column({ type: 'decimal', precision: 18, scale: 4 })
  amount: string;

  @Column({ type: 'enum', enum: PredictionBetStatus, default: PredictionBetStatus.PLACED })
  @Index()
  status: PredictionBetStatus;

  /** 派彩金额（含本金，仅 WON / REFUNDED 非零） */
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  payout: string;

  @Column({ type: 'enum', enum: PredictionOutcome, default: PredictionOutcome.UNKNOWN })
  outcome: PredictionOutcome;

  /** demo 模式 = 虚拟余额；live = 真实 USDC（暂未启用） */
  @Column({ type: 'varchar', length: 10, default: 'demo' })
  mode: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt: Date | null;
}
