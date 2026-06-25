/**
 * Refund Entity
 * 
 * P0 优化: 将内存 Map 存储替换为数据库持久化
 * 退款记录，支持 Stripe / Crypto / X402 多种退款方式
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RefundStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('refunds')
@Index(['paymentId'])
@Index(['status', 'createdAt'])
@Index(['requestedBy'])
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  paymentId: string;

  @Column('decimal', { precision: 18, scale: 2 })
  amount: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({
    type: 'enum',
    enum: RefundStatus,
    default: RefundStatus.PENDING,
  })
  status: RefundStatus;

  @Column({ type: 'text' })
  reason: string;

  @Column({ nullable: true })
  requestedBy: string;

  @Column({ nullable: true })
  transactionHash: string;

  @Column({ nullable: true })
  stripeRefundId: string;

  @Column({ nullable: true })
  failureReason: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
