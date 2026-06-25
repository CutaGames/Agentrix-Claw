import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TaskType {
  AIRDROP = 'airdrop',
  TASK = 'task',
  STRATEGY = 'strategy',
  REFERRAL = 'referral',
}

export enum TaskStatus {
  AVAILABLE = 'available',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
}

@Entity('auto_earn_tasks')
@Index(['userId', 'status'])
@Index(['agentId', 'status'])
export class AutoEarnTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({ nullable: true })
  @Index()
  agentId?: string;

  @Column({
    type: 'enum',
    enum: TaskType,
  })
  type: TaskType;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.AVAILABLE,
  })
  status: TaskStatus;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  rewardAmount: number;

  @Column({ length: 10, default: 'USDC' })
  rewardCurrency: string;

  @Column({ length: 20, default: 'token' })
  rewardType: string; // 'token' | 'fiat' | 'nft'

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  requirements?: string[];

  @Column({ nullable: true })
  completedAt?: Date;

  @Column({ type: 'json', nullable: true })
  executionResult?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

