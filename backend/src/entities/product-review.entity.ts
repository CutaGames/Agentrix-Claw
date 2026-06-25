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
import { Product } from './product.entity';
import { User } from './user.entity';

/**
 * 商品审核状态
 */
export enum ProductReviewStatus {
  PENDING = 'pending',       // 待审核
  APPROVED = 'approved',     // 已通过
  REJECTED = 'rejected',     // 已拒绝
  NEEDS_REVISION = 'needs_revision', // 需要修改
}

/**
 * 审核类型
 */
export enum ReviewType {
  NEW_PRODUCT = 'new_product',       // 新商品上架
  PRODUCT_UPDATE = 'product_update', // 商品更新
  RESUBMISSION = 'resubmission',     // 重新提交
}

/**
 * 商品审核记录实体
 */
@Entity('product_reviews')
@Index(['productId', 'status'])
@Index(['merchantId', 'status'])
export class ProductReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 关联的商品ID
   */
  @Column()
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn()
  product: Product;

  /**
   * 商户ID
   */
  @Column()
  merchantId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  merchant: User;

  /**
   * 审核类型
   */
  @Column({
    type: 'enum',
    enum: ReviewType,
    default: ReviewType.NEW_PRODUCT,
  })
  type: ReviewType;

  /**
   * 审核状态
   */
  @Column({
    type: 'enum',
    enum: ProductReviewStatus,
    default: ProductReviewStatus.PENDING,
  })
  status: ProductReviewStatus;

  /**
   * 商品快照（提交时的商品数据）
   */
  @Column({ type: 'jsonb', nullable: true })
  productSnapshot: {
    name: string;
    description: string;
    price: number;
    category: string;
    productType: string;
    images?: string[];
    metadata?: Record<string, any>;
  };

  /**
   * 审核人ID
   */
  @Column({ nullable: true })
  reviewerId: string;

  @ManyToOne(() => User)
  @JoinColumn()
  reviewer: User;

  /**
   * 审核意见
   */
  @Column({ type: 'text', nullable: true })
  reviewComment: string;

  /**
   * 拒绝原因（如果被拒绝）
   */
  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  /**
   * 需要修改的字段
   */
  @Column({ type: 'jsonb', nullable: true })
  revisionFields: string[];

  /**
   * 自动审核结果
   */
  @Column({ type: 'jsonb', nullable: true })
  autoReviewResult: {
    passed: boolean;
    score: number;
    issues: Array<{
      field: string;
      issue: string;
      severity: 'low' | 'medium' | 'high';
    }>;
    recommendations: string[];
  };

  /**
   * 审核提交时间
   */
  @CreateDateColumn()
  submittedAt: Date;

  /**
   * 审核完成时间
   */
  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
