import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum MarketplaceAssetType {
  TOKEN = 'token',
  PAIR = 'pair',
  NFT = 'nft',
  RWA = 'rwa',
  LAUNCHPAD = 'launchpad',
}

export enum MarketplaceAssetStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  HIDDEN = 'hidden',
}

@Entity('marketplace_assets')
@Index(['type', 'chain', 'symbol'])
@Index(['type', 'chain', 'address'])
export class MarketplaceAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: MarketplaceAssetType,
  })
  type: MarketplaceAssetType;

  @Column()
  name: string;

  @Column({ nullable: true })
  symbol?: string;

  @Column({ nullable: true })
  chain?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  pair?: string;

  @Column({ nullable: true })
  source?: string;

  @Column({ nullable: true })
  externalId?: string;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ type: 'numeric', precision: 24, scale: 8, nullable: true })
  priceUsd?: string;

  @Column({ type: 'numeric', precision: 24, scale: 4, nullable: true })
  liquidityUsd?: string;

  @Column({ type: 'numeric', precision: 24, scale: 4, nullable: true })
  volume24hUsd?: string;

  @Column({ type: 'numeric', precision: 10, scale: 4, nullable: true })
  change24hPercent?: string;

  @Column({ type: 'enum', enum: MarketplaceAssetStatus, default: MarketplaceAssetStatus.ACTIVE })
  status: MarketplaceAssetStatus;

  @Column({ default: false })
  featured: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  lastIngestedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

