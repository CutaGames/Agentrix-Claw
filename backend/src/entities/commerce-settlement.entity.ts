/**
 * Commerce Settlement Entity
 * 
 * P0 优化: 将内存 Map 存储替换为数据库持久化
 * 记录订单结算及各方分润详情
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CommerceSettlementStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PAID = 'paid',
  FAILED = 'failed',
}

@Entity('commerce_settlements')
@Index(['orderId'])
@Index(['status', 'createdAt'])
@Index(['splitPlanId'])
export class CommerceSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  orderId: string;

  @Column({ nullable: true })
  splitPlanId: string;

  @Column('decimal', { precision: 18, scale: 2 })
  totalAmount: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column('decimal', { precision: 18, scale: 2, default: 0 })
  platformFee: number;

  @Column('decimal', { precision: 18, scale: 2, default: 0 })
  netAmount: number;

  @Column({ type: 'jsonb', default: '[]' })
  allocations: Array<{
    recipientId: string;
    role: string;
    amount: number;
    shareBps: number;
  }>;

  @Column({
    type: 'enum',
    enum: CommerceSettlementStatus,
    default: CommerceSettlementStatus.PENDING,
  })
  status: CommerceSettlementStatus;

  @Column({ nullable: true })
  paidBy: string;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
