import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CouponType {
  PERCENTAGE = 'percentage',  // 百分比折扣
  FIXED = 'fixed',            // 固定金额折扣
  FREE_SHIPPING = 'free_shipping',  // 免运费
}

export enum CouponStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  EXPIRED = 'expired',
}

@Entity('coupons')
@Index(['merchantId', 'code'], { unique: true })
export class Coupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  merchantId: string;  // 商户ID

  @Column({ length: 50 })
  @Index()
  code: string;  // 优惠券代码

  @Column()
  name: string;  // 优惠券名称

  @Column({ type: 'text', nullable: true })
  description?: string;  // 描述

  @Column({
    type: 'enum',
    enum: CouponType,
    default: CouponType.PERCENTAGE,
  })
  type: CouponType;

  @Column('decimal', { precision: 10, scale: 2 })
  value: number;  // 折扣值（百分比或固定金额）

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  minPurchaseAmount?: number;  // 最低购买金额

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  maxDiscountAmount?: number;  // 最大折扣金额（仅百分比折扣）

  @Column({ type: 'date', nullable: true })
  validFrom?: Date;  // 有效期开始

  @Column({ type: 'date', nullable: true })
  validUntil?: Date;  // 有效期结束

  @Column({ default: 0 })
  usageLimit?: number;  // 使用次数限制（0表示无限制）

  @Column({ default: 0 })
  usedCount: number;  // 已使用次数

  @Column({
    type: 'enum',
    enum: CouponStatus,
    default: CouponStatus.ACTIVE,
  })
  status: CouponStatus;

  @Column({ type: 'json', nullable: true })
  applicableProducts?: string[];  // 适用商品ID列表（空表示全部商品）

  @Column({ type: 'json', nullable: true })
  applicableCategories?: string[];  // 适用分类列表

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;  // 额外信息

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

