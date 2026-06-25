import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum HumanCommissionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  SETTLED = 'settled',
  CANCELLED = 'cancelled',
}

export enum HumanCommissionType {
  SKILL_PURCHASE = 'skill_purchase',
  PRODUCT_PURCHASE = 'product_purchase',
  USER_REFERRAL = 'user_referral',
}

@Entity('human_commissions')
@Index(['promoterId', 'status'])
@Index(['orderId'])
@Index(['createdAt'])
export class HumanCommission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  promoterId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'promoter_id' })
  promoter: User;

  @Column({ nullable: true })
  buyerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;

  @Column({ nullable: true })
  orderId: string;

  @Column({ nullable: true })
  skillId: string;

  @Column({ nullable: true })
  skillName: string;

  @Column({
    type: 'enum',
    enum: HumanCommissionType,
    default: HumanCommissionType.SKILL_PURCHASE,
  })
  type: HumanCommissionType;

  @Column('decimal', { precision: 15, scale: 4 })
  orderAmount: number;

  @Column('decimal', { precision: 15, scale: 4 })
  commissionAmount: number;

  @Column('decimal', { precision: 5, scale: 2 })
  commissionRate: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({
    type: 'enum',
    enum: HumanCommissionStatus,
    default: HumanCommissionStatus.PENDING,
  })
  status: HumanCommissionStatus;

  @Column({ nullable: true })
  referralLinkId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
