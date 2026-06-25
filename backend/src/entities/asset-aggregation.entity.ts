import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AssetType {
  NFT = 'nft',
  FT = 'ft',
  GAME_ASSET = 'game_asset',
  RWA = 'rwa',
}

export enum SourceType {
  PLATFORM_AGGREGATED = 'platform_aggregated',
  USER_GENERATED = 'user_generated',
}

export enum IncomeMode {
  PLATFORM_COMMISSION = 'platform_commission',
  USER_PAID = 'user_paid',
}

@Entity('asset_aggregations')
@Index(['assetId', 'sourcePlatform', 'chain'], { unique: true })
@Index(['assetId'])
@Index(['assetType'])
@Index(['sourcePlatform'])
@Index(['sourceType'])
export class AssetAggregation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  assetId: string;

  @Column({ type: 'enum', enum: AssetType })
  assetType: AssetType;

  @Column({ length: 100 })
  sourcePlatform: string; // 'opensea', 'magic_eden', 'user_generated'

  @Column({ type: 'enum', enum: SourceType })
  sourceType: SourceType;

  @Column({ length: 50 })
  chain: string;

  @Column({ length: 255, nullable: true })
  contractAddress: string;

  @Column({ length: 255, nullable: true })
  tokenId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  price: number;

  @Column({ length: 3, nullable: true })
  currency: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  commissionRate: number;

  @Column({ type: 'enum', enum: IncomeMode, nullable: true })
  incomeMode: IncomeMode;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

