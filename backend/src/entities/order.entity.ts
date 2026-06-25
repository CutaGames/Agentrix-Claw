import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Product } from './product.entity';

export enum OrderStatus {
  CREATED = 'created',
  PAID = 'paid',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  // 兼容旧状态
  PENDING = 'pending',
  PROCESSING = 'processing',
  PENDING_SHIPMENT = 'pending_shipment',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  SETTLED = 'settled',
  FROZEN = 'frozen',
  DISPUTED = 'disputed',
  COMPLETED = 'completed',
}

export enum AssetType {
  PHYSICAL = 'physical',
  SERVICE = 'service',
  VIRTUAL = 'virtual',
  NFT_RWA = 'nft_rwa',
  DEV_TOOL = 'dev_tool',
  SUBSCRIPTION = 'subscription',
  OTHER = 'other',
  AGGREGATED_WEB2 = 'aggregated_web2',
  AGGREGATED_WEB3 = 'aggregated_web3',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: true })
  user: User;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => User)
  merchant: User;

  @Column()
  merchantId: string;

  @ManyToOne(() => Product, { nullable: true })
  product: Product;

  @Column({ nullable: true })
  productId: string;

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  @Column({ length: 10 })
  currency: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({
    type: 'enum',
    enum: AssetType,
    default: AssetType.PHYSICAL,
  })
  assetType: AssetType;

  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  netRevenue: number;

  @Column('decimal', { precision: 5, scale: 4, nullable: true })
  platformTaxRate: number;

  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  platformTax: number;

  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  merchantNetAmount: number;

  @Column({ type: 'timestamptz', nullable: true })
  settlementTriggerTime: Date;

  @Column({ type: 'timestamptz', nullable: true })
  settlementDueTime: Date;

  @Column({ type: 'timestamptz', nullable: true })
  autoConfirmedAt: Date;

  @Column({ default: false })
  isDisputed: boolean;

  @Column({ default: true })
  executorHasWallet: boolean;

  @Column({ nullable: true })
  paymentId: string;

  @Column({ nullable: true })
  agentId: string;

  @Column({ nullable: true })
  execAgentId: string;

  @Column({ nullable: true })
  refAgentId: string;

  @Column({ nullable: true })
  promoterId: string;

  @Column({ type: 'jsonb', nullable: true })
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
    name?: string;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  settlementTimeline: {
    triggerDescription?: string;
    lockupDays?: number | string;
    payoutDescription?: string;
    autoConfirm?: string;
    autoFallbackDays?: number;
    autoFallbackDescription?: string;
    rawConfig?: any;
  };

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  // UCP (Unified Checkout Protocol) 支持
  @Column({ default: false })
  ucpEnabled: boolean;

  @Column({ nullable: true })
  ucpSessionId: string;

  // X402 (HTTP Payment Protocol) 支持
  @Column({ default: false })
  x402Enabled: boolean;

  @Column({ nullable: true })
  x402PaymentId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

