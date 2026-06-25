import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { ProductPrice } from './product-price.entity';
import { ProductCountryPrice } from './product-country-price.entity';
import { ProductRegionPrice } from './product-region-price.entity';

export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  OUT_OF_STOCK = 'out_of_stock',
  PENDING_REVIEW = 'pending_review',
  REJECTED = 'rejected',
}

export enum ProductType {
  PHYSICAL = 'physical',
  SERVICE = 'service',
  NFT = 'nft',
  FT = 'ft',
  GAME_ASSET = 'game_asset',
  RWA = 'rwa',
  // X402 原生技能类型
  X402_SKILL = 'x402_skill',       // 按次付费的功能性技能
  X402_METERED = 'x402_metered',   // 按量/按时长计费的资源
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  merchant: User;

  @Column()
  merchantId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column('decimal', { precision: 15, scale: 2 })
  price: number;

  @Column({ default: 0 })
  stock: number;

  @Column()
  category: string;

  @Column('decimal', { precision: 5, scale: 2, nullable: true })
  commissionRate: number;

  @Column({ type: 'varchar', length: 50, default: ProductType.PHYSICAL })
  productType: ProductType;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  fixedCommissionRate: number;

  @Column({ default: false })
  allowCommissionAdjustment: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  minCommissionRate: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  maxCommissionRate: number;

  @OneToMany(() => ProductPrice, (price) => price.product)
  prices: ProductPrice[];

  @OneToMany(() => ProductCountryPrice, (price) => price.product)
  countryPrices: ProductCountryPrice[];

  @OneToMany(() => ProductRegionPrice, (price) => price.product)
  regionPrices: ProductRegionPrice[];

  @Column({
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
  })
  status: ProductStatus;

  @Column({ type: 'varchar', length: 50, nullable: true })
  syncSource: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalId: string;

  @Column({ type: 'text', nullable: true })
  reviewNote: string;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any;

  // V2.1: UCP 兼容性标记
  @Column({ default: true })
  ucpEnabled: boolean;

  // V2.1: UCP 结账端点
  @Column({ nullable: true })
  ucpCheckoutEndpoint: string;

  // V2.1: X402 兼容性标记
  @Column({ default: false })
  x402Enabled: boolean;

  // V2.1: X402 服务端点
  @Column({ nullable: true })
  x402ServiceEndpoint: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

