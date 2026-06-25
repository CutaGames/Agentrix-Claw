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

@Entity('product_country_prices')
@Index(['productId', 'countryCode'], { unique: true })
@Index(['productId'])
@Index(['countryCode'])
export class ProductCountryPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Product, (product) => product.countryPrices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  productId: string;

  @Column({ length: 2 })
  countryCode: string;

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

