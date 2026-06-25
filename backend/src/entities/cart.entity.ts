/**
 * Shopping Cart Entity
 * 
 * 购物车持久化存储，替代 unified-marketplace 中的内存 Map
 */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export interface CartItem {
  skillId: string;
  skillName: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  metadata?: Record<string, any>;
}

@Entity('carts')
@Index(['userId'])
export class Cart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'jsonb', default: '[]' })
  items: CartItem[];

  @Column('decimal', { precision: 18, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
