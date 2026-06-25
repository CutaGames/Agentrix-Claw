import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('market_monitors')
@Index(['tokenPair', 'chain'])
export class MarketMonitor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  strategyGraphId: string;

  @Column({ type: 'varchar', length: 100, comment: '监控的交易对，如 BTC/USDC' })
  tokenPair: string;

  @Column({ type: 'varchar', length: 50 })
  chain: string;

  @Column({
    type: 'varchar',
    length: 50,
    comment: "监控类型: 'price' | 'arbitrage' | 'liquidity' | 'volume'",
  })
  monitorType: 'price' | 'arbitrage' | 'liquidity' | 'volume';

  @Column({ type: 'jsonb', comment: '触发阈值配置' })
  threshold: {
    priceChange?: number; // 价格变化百分比
    arbitrageOpportunity?: number; // 套利机会阈值
    liquidityChange?: number; // 流动性变化
    volumeChange?: number; // 交易量变化
    [key: string]: any;
  };

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  lastPrice: number;

  @Column({ type: 'timestamp', nullable: true })
  lastCheckedAt: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

