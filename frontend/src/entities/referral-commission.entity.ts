import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CommissionStatus {
  PENDING = 'pending',      // 待结算
  SETTLED = 'settled',      // 已结算
  CANCELLED = 'cancelled',  // 已取消
}

@Entity('referral_commissions')
@Index(['referralId', 'paymentId'], { unique: true })
@Index(['agentId', 'status'])
export class ReferralCommission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  referralId: string;  // 推广关系ID

  @Column()
  @Index()
  agentId: string;  // 推广Agent ID

  @Column()
  @Index()
  merchantId: string;  // 商户ID

  @Column()
  @Index()
  paymentId: string;  // 支付ID

  @Column('decimal', { precision: 15, scale: 2 })
  paymentAmount: number;  // 支付金额

  @Column({ length: 10 })
  currency: string;  // 币种

  @Column('decimal', { precision: 5, scale: 4 })
  commissionRate: number;  // 分成比例

  @Column('decimal', { precision: 15, scale: 2 })
  commissionAmount: number;  // 分成金额

  @Column({
    type: 'enum',
    enum: CommissionStatus,
    default: CommissionStatus.PENDING,
  })
  status: CommissionStatus;

  @Column({ nullable: true })
  settledAt?: Date;  // 结算时间

  @Column({ nullable: true })
  settlementPeriod?: string;  // 结算周期（如 "2025-W01"）

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;  // 额外信息

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

