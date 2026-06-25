import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('asset_aggregations')
@Index(['userId'])
@Index(['chain', 'tokenAddress'])
export class AssetAggregation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  chain: string;

  @Column({ type: 'varchar', length: 255 })
  tokenAddress: string;

  @Column({ type: 'varchar', length: 50 })
  tokenSymbol: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  balance: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  usdValue: number;

  @Column({ type: 'timestamp', nullable: true })
  lastSyncedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

