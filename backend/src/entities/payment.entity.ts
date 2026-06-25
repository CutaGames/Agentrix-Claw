import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum PaymentMethod {
  STRIPE = 'stripe',
  WALLET = 'wallet',
  PASSKEY = 'passkey',
  X402 = 'x402',
  MULTISIG = 'multisig',
  TRANSAK = 'transak',
  STABLECOIN = 'stablecoin',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: true })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  @Column({ length: 10 })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
  })
  paymentMethod: PaymentMethod;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ nullable: true })
  transactionHash: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  merchantId: string;

  @Column({ nullable: true })
  agentId: string;

  @Column({ length: 2, nullable: true })
  countryCode: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  taxRate: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  channelFee: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  commissionRate: number;

  @Column({ type: 'uuid', nullable: true })
  sessionId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

