/**
 * Escrow Entity
 * 
 * P0 优化: 将内存 Map 存储替换为数据库持久化
 * 托管交易记录，管理资金的锁定、确认、释放和退款流程
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum EscrowStatus {
  PENDING = 'pending',
  FUNDED = 'funded',
  CONFIRMED = 'confirmed',
  DISPUTED = 'disputed',
  RELEASED = 'released',
  REFUNDED = 'refunded',
}

@Entity('escrows')
@Index(['status', 'createdAt'])
@Index(['userId'])
@Index(['merchantId'])
@Index(['paymentId'])
export class Escrow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  paymentId: string;

  @Column()
  @Index()
  merchantId: string;

  @Column()
  userId: string;

  @Column('decimal', { precision: 18, scale: 2 })
  amount: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column('decimal', { precision: 5, scale: 4, nullable: true })
  commissionRate: number;

  @Column({ default: 7 })
  autoReleaseDays: number;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  orderType: string; // 'nft' | 'virtual' | 'service' | 'product' | 'physical'

  @Column({ nullable: true })
  settlementType: string; // 'instant' | 'service_started' | 'delivery_confirmed'

  @Column({ type: 'jsonb', nullable: true })
  commission: {
    merchant: number;
    agent: number;
    paymind: number;
  };

  @Column({
    type: 'enum',
    enum: EscrowStatus,
    default: EscrowStatus.PENDING,
  })
  status: EscrowStatus;

  @Column({ nullable: true })
  transactionHash: string;

  @Column({ nullable: true })
  contractAddress: string;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt: Date;

  @Column({ nullable: true })
  disputeReason: string;

  @Column({ type: 'jsonb', nullable: true })
  releaseDetails: {
    merchantAmount: number;
    agentAmount: number;
    paymindAmount: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
