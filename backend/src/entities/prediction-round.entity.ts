import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 预测市场 - 短周期 BTC 涨跌轮次（5 分钟）
 *
 * 生命周期：
 *   OPEN     -> 投注期（前 4 分钟）
 *   LOCKED   -> 锁定期（最后 1 分钟），不可投注
 *   SETTLED  -> 已结算（公布结果，分账）
 *   VOIDED   -> 异常作废（价格源失败等），全额退款
 */
export enum PredictionAsset {
  BTC = 'BTC',
  ETH = 'ETH',
  SOL = 'SOL',
}

export enum PredictionRoundStatus {
  OPEN = 'open',
  LOCKED = 'locked',
  SETTLED = 'settled',
  VOIDED = 'voided',
}

export enum PredictionOutcome {
  UP = 'up',
  DOWN = 'down',
  TIE = 'tie',
  UNKNOWN = 'unknown',
}

@Entity('prediction_rounds')
@Index(['asset', 'status'])
@Index(['lockTime'])
@Index(['expiryTime'])
export class PredictionRound {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: PredictionAsset, default: PredictionAsset.BTC })
  asset: PredictionAsset;

  /** 周期长度（秒），默认 300 = 5min */
  @Column({ type: 'int', default: 300 })
  intervalSeconds: number;

  @Column({ type: 'enum', enum: PredictionRoundStatus, default: PredictionRoundStatus.OPEN })
  @Index()
  status: PredictionRoundStatus;

  /** 投注开放时间 */
  @Column({ type: 'timestamptz' })
  openTime: Date;

  /** 锁定时间（停止投注） */
  @Column({ type: 'timestamptz' })
  lockTime: Date;

  /** 到期时间（采集结算价） */
  @Column({ type: 'timestamptz' })
  expiryTime: Date;

  /** 锁定时记录的起始价 */
  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  lockPrice: string | null;

  /** 到期时记录的结算价 */
  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  closePrice: string | null;

  @Column({ type: 'enum', enum: PredictionOutcome, default: PredictionOutcome.UNKNOWN })
  outcome: PredictionOutcome;

  /** 池子总额（USDC） */
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  totalPool: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  upPool: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  downPool: string;

  @Column({ type: 'int', default: 0 })
  upCount: number;

  @Column({ type: 'int', default: 0 })
  downCount: number;

  /** 平台抽佣率，例如 0.05 */
  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.05 })
  feeRate: string;

  /** 实际抽取的手续费（USDC） */
  @Column({ type: 'decimal', precision: 18, scale: 4, default: 0 })
  feeCollected: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
