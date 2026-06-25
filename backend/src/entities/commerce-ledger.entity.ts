/**
 * Commerce Ledger Entry Entity
 * 
 * P0 优化: 将内存数组存储替换为数据库持久化
 * 记录所有商业活动的台账条目
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum LedgerEntryType {
  ORDER_CREATED = 'order_created',
  PAYMENT_CAPTURED = 'payment_captured',
  REFUND = 'refund',
  PAYOUT = 'payout',
  COMMISSION = 'commission',
  ADJUSTMENT = 'adjustment',
}

@Entity('commerce_ledger')
@Index(['userId', 'type'])
@Index(['orderId'])
@Index(['type', 'createdAt'])
@Index(['createdAt'])
export class CommerceLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: LedgerEntryType,
  })
  type: LedgerEntryType;

  @Column({ nullable: true })
  @Index()
  userId: string;

  @Column({ nullable: true })
  orderId: string;

  @Column({ nullable: true })
  settlementId: string;

  @Column({ nullable: true })
  recipientId: string;

  @Column('decimal', { precision: 18, scale: 2 })
  amount: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ nullable: true })
  reason: string;

  @Column({ nullable: true })
  txHash: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
