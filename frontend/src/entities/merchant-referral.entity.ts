import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ReferralStatus {
  PENDING = 'pending',      // 待审核
  APPROVED = 'approved',    // 已通过
  REJECTED = 'rejected',    // 已拒绝
  ACTIVE = 'active',        // 活跃（商户已接入并产生交易）
}

@Entity('merchant_referrals')
@Index(['agentId', 'merchantId'], { unique: true })
export class MerchantReferral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  agentId: string;  // 推广Agent ID

  @Column()
  @Index()
  merchantId: string;  // 被推广的商户ID

  @Column({ nullable: true })
  merchantName?: string;  // 商户名称

  @Column({ nullable: true })
  merchantEmail?: string;  // 商户邮箱

  @Column({
    type: 'enum',
    enum: ReferralStatus,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  oneTimeReward?: number;  // 一次性奖励金额（USD）

  @Column({ nullable: true })
  oneTimeRewardPaidAt?: Date;  // 一次性奖励支付时间

  @Column('decimal', { precision: 5, scale: 4, default: 0.005 })
  commissionRate: number;  // 长期分成比例（0.5% = 0.005）

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  totalCommissionEarned: number;  // 累计获得的分成（USD）

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  totalMerchantGMV: number;  // 商户累计GMV（USD）

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;  // 额外信息（推广链接、推广方式等）

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

