import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('coupon_usages')
@Index(['couponId', 'orderId'], { unique: true })
export class CouponUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  couponId: string;  // 优惠券ID

  @Column()
  @Index()
  orderId: string;  // 订单ID

  @Column()
  @Index()
  userId: string;  // 用户ID

  @Column('decimal', { precision: 10, scale: 2 })
  discountAmount: number;  // 折扣金额

  @Column('decimal', { name: 'original_amount', precision: 10, scale: 2 })
  originalAmount: number;  // 原始金额

  @Column('decimal', { precision: 10, scale: 2 })
  finalAmount: number;  // 最终金额

  @CreateDateColumn()
  usedAt: Date;
}

