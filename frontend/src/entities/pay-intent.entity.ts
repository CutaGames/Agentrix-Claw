import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum PayIntentStatus {
  CREATED = 'created',
  AUTHORIZED = 'authorized',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export enum PayIntentType {
  ORDER_PAYMENT = 'order_payment',
  SERVICE_PAYMENT = 'service_payment',
  ASSET_PAYMENT = 'asset_payment',
  TASK_PAYMENT = 'task_payment',
  SUBSCRIPTION = 'subscription',
}

@Entity('pay_intents')
export class PayIntent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: PayIntentType,
  })
  type: PayIntentType;

  @Column({
    type: 'enum',
    enum: PayIntentStatus,
    default: PayIntentStatus.CREATED,
  })
  status: PayIntentStatus;

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  @Column({ length: 10 })
  currency: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  orderId: string;

  @Column({ nullable: true })
  paymentId: string; // 关联的实际支付记录

  @Column({ nullable: true })
  merchantId: string;

  @Column({ nullable: true })
  agentId: string;

  @Column({ type: 'jsonb', nullable: true })
  paymentMethod: {
    type: string; // 'stripe', 'wallet', 'x402', etc.
    details?: any;
  };

  @Column({ type: 'jsonb', nullable: true })
  authorization: {
    authorized: boolean;
    authorizedAt?: Date;
    authorizedBy?: string; // 'user', 'agent', 'quickpay'
    quickPayGrantId?: string;
    expiresAt?: Date;
  };

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    returnUrl?: string;
    cancelUrl?: string;
    successUrl?: string;
    qrCode?: string;
    deepLink?: string;
    transactionHash?: string;
    errorMessage?: string;
    payUrl?: string; // 支付链接
  };

  @Column({ nullable: true })
  expiresAt: Date; // PayIntent过期时间

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;
}

