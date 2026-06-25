import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_profiles')
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User)
  @JoinColumn()
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'jsonb', nullable: true })
  preferences: {
    categories?: string[]; // 偏好分类
    priceRange?: {
      min?: number;
      max?: number;
      currency?: string;
    };
    preferredPaymentMethods?: string[];
    favoriteMerchants?: string[];
  };

  @Column({ type: 'jsonb', nullable: true })
  behavior: {
    totalOrders?: number;
    totalSpent?: number;
    averageOrderValue?: number;
    lastPurchaseDate?: Date;
    favoriteCategories?: string[];
    browsingHistory?: Array<{
      productId: string;
      timestamp: Date;
    }>;
    purchaseHistory?: Array<{
      productId: string;
      orderId: string;
      timestamp: Date;
    }>;
  };

  @Column({ type: 'jsonb', nullable: true })
  recommendations: {
    lastUpdated?: Date;
    recommendedProducts?: string[];
    recommendedServices?: string[];
    recommendedAssets?: string[];
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

