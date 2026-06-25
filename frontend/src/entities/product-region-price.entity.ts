import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_region_prices')
@Index(['productId', 'regionCode'], { unique: true })
@Index(['productId'])
@Index(['regionCode'])
export class ProductRegionPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, (product) => product.regionPrices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: string;

  @Column({ length: 10 })
  regionCode: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  price: number;

  @Column({ length: 3 })
  currency: string;

  @Column({ default: true })
  taxIncluded: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  taxRate: number;

  @Column({ type: 'text', nullable: true })
  reason: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

