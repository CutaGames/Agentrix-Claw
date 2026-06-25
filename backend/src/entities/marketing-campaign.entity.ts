import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CampaignType {
  ABANDONED_CART = 'abandoned_cart',
  NEW_CUSTOMER = 'new_customer',
  REPEAT_CUSTOMER = 'repeat_customer',
  LOW_STOCK = 'low_stock',
  PRICE_DROP = 'price_drop',
}

export enum CampaignStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('marketing_campaigns')
@Index(['merchantId', 'status'])
@Index(['type', 'status'])
export class MarketingCampaign {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  merchantId: string;

  @Column({
    type: 'enum',
    enum: CampaignType,
  })
  type: CampaignType;

  @Column({ type: 'json' })
  targetUsers: string[];

  @Column({ type: 'text' })
  message: string;

  @Column({ nullable: true })
  couponId?: string;

  @Column({ nullable: true })
  scheduledAt?: Date;

  @Column({ nullable: true })
  sentAt?: Date;

  @Column({
    type: 'enum',
    enum: CampaignStatus,
    default: CampaignStatus.PENDING,
  })
  status: CampaignStatus;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

