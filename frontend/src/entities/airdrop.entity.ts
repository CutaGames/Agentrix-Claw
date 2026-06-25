import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AirdropStatus {
  MONITORING = 'monitoring',    // 监控中
  ELIGIBLE = 'eligible',         // 符合条件
  CLAIMED = 'claimed',           // 已领取
  EXPIRED = 'expired',           // 已过期
  FAILED = 'failed',             // 领取失败
}

@Entity('airdrops')
@Index(['userId', 'status'])
@Index(['chain', 'status'])
export class Airdrop {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({ nullable: true })
  agentId?: string;

  @Column()
  projectName: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ length: 50 })
  chain: string; // 'solana' | 'ethereum' | 'bsc' | 'polygon'

  @Column({ length: 100, nullable: true })
  tokenAddress?: string;

  @Column({ length: 20, nullable: true })
  tokenSymbol?: string;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  estimatedAmount?: number;

  @Column({ length: 10, default: 'USDC' })
  currency: string;

  @Column({
    type: 'enum',
    enum: AirdropStatus,
    default: AirdropStatus.MONITORING,
  })
  status: AirdropStatus;

  @Column({ type: 'json', nullable: true })
  requirements?: string[]; // ['follow_twitter', 'join_discord', 'verify_wallet']

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ nullable: true })
  claimUrl?: string;

  @Column({ nullable: true })
  claimTransactionHash?: string;

  @Column({ nullable: true })
  claimedAt?: Date;

  @Column({ nullable: true })
  expiresAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

