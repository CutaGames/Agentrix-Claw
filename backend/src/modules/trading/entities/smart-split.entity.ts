import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SplitStrategy {
  TIME_WEIGHTED = 'time_weighted',
  LIQUIDITY_WEIGHTED = 'liquidity_weighted',
  PRICE_WEIGHTED = 'price_weighted',
  CUSTOM = 'custom',
}

export enum SplitStatus {
  PENDING = 'pending',
  SPLITTING = 'splitting',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIAL = 'partial',
}

@Entity('smart_splits')
@Index(['splitId'])
@Index(['userId'])
@Index(['status'])
@Index(['createdAt'])
export class SmartSplit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  splitId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  agentId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  originalOrderId?: string;

  @Column({ type: 'varchar', length: 255 })
  fromToken: string;

  @Column({ type: 'varchar', length: 255 })
  toToken: string;

  @Column({ type: 'varchar', length: 50 })
  chain: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  totalAmount: number;

  @Column({ type: 'varchar', length: 50 })
  splitStrategy: SplitStrategy;

  @Column({ type: 'jsonb' })
  splitConfig: any; // 拆分配置

  @Column({ type: 'jsonb' })
  subOrders: any[]; // 子订单列表

  @Column({ type: 'jsonb', nullable: true })
  executionOrder?: any[]; // 执行顺序

  @Column({ type: 'varchar', length: 50, default: SplitStatus.PENDING })
  status: SplitStatus;

  @Column({ type: 'integer', default: 0 })
  executedCount: number;

  @Column({ type: 'integer', default: 0 })
  successCount: number;

  @Column({ type: 'integer', default: 0 })
  failedCount: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  totalExecutedAmount: number;

  @Column({ type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

