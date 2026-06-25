import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SettlementType {
  CROSS_CHAIN = 'cross_chain',
  MULTI_ASSET = 'multi_asset',
  CONDITIONAL = 'conditional',
}

export enum SettlementStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
}

@Entity('atomic_settlements')
@Index(['settlementId'])
@Index(['userId'])
@Index(['status'])
@Index(['createdAt'])
export class AtomicSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  settlementId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  agentId?: string;

  @Column({ type: 'uuid', nullable: true })
  strategyGraphId?: string;

  @Column({ type: 'varchar', length: 50 })
  settlementType: SettlementType;

  @Column({ type: 'varchar', length: 50, default: SettlementStatus.PENDING })
  status: SettlementStatus;

  @Column({ type: 'text', array: true })
  chains: string[];

  @Column({ type: 'jsonb' })
  transactions: any[]; // 交易详情数组

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  totalAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  totalFee?: number;

  @Column({ type: 'timestamp', nullable: true })
  executedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ type: 'text', nullable: true })
  rollbackReason?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

