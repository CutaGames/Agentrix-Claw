import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum QuickPayGrantStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

@Entity('quick_pay_grants')
export class QuickPayGrant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column()
  userId: string;

  @Column({
    type: 'enum',
    enum: QuickPayGrantStatus,
    default: QuickPayGrantStatus.ACTIVE,
  })
  status: QuickPayGrantStatus;

  @Column({ type: 'jsonb' })
  paymentMethod: {
    type: string; // 'stripe', 'wallet', 'x402'
    methodId?: string; // 支付方式ID（如卡ID、钱包地址）
    details?: any;
  };

  @Column({ type: 'jsonb' })
  permissions: {
    maxAmount?: number; // 单笔最大金额
    maxDailyAmount?: number; // 每日最大金额
    maxTransactions?: number; // 每日最大交易次数
    allowedMerchants?: string[]; // 允许的商户ID列表（空表示全部）
    allowedCategories?: string[]; // 允许的商品分类
  };

  @Column({ type: 'text', nullable: true })
  description: string; // 授权描述

  @Column({ nullable: true })
  expiresAt: Date; // 授权过期时间

  @Column({ type: 'jsonb', nullable: true })
  usage: {
    totalAmount: number; // 已使用总金额
    dailyAmount: number; // 今日已使用金额
    transactionCount: number; // 今日交易次数
    lastResetDate: Date; // 上次重置日期
  };

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    source?: string; // 'web', 'app', 'agent'
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  revokedAt: Date;
}

