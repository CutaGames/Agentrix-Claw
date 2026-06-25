/**
 * Commerce Order Entity
 * 
 * P0 优化: 将内存 Map 存储替换为数据库持久化
 * 支持 Commerce Service 的订单生命周期管理
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum CommerceOrderStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PAID = 'paid',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum CommerceOrderType {
  PRODUCT = 'product',
  SERVICE = 'service',
  SUBSCRIPTION = 'subscription',
}

@Entity('commerce_orders')
@Index(['userId', 'status'])
@Index(['status', 'createdAt'])
export class CommerceOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: CommerceOrderType,
    default: CommerceOrderType.PRODUCT,
  })
  type: CommerceOrderType;

  @Column({
    type: 'enum',
    enum: CommerceOrderStatus,
    default: CommerceOrderStatus.DRAFT,
  })
  status: CommerceOrderStatus;

  @Column('decimal', { precision: 18, scale: 2 })
  amount: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'jsonb', default: '[]' })
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    metadata?: Record<string, any>;
  }>;

  @Column({ nullable: true })
  splitPlanId: string;

  @Column({ nullable: true })
  paymentIntentId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
