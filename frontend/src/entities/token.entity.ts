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
import { User } from './user.entity';

export enum TokenStatus {
  DRAFT = 'draft',
  DEPLOYING = 'deploying',
  DEPLOYED = 'deployed',
  FAILED = 'failed',
}

export enum TokenChain {
  ETHEREUM = 'ethereum',
  SOLANA = 'solana',
  BSC = 'bsc',
  POLYGON = 'polygon',
  BASE = 'base',
}

@Entity('tokens')
@Index(['userId', 'status'])
@Index(['contractAddress', 'chain'])
export class Token {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  symbol: string;

  @Column('decimal', { precision: 36, scale: 18 })
  totalSupply: string;

  @Column({ default: 18 })
  decimals: number;

  @Column({
    type: 'enum',
    enum: TokenChain,
  })
  chain: TokenChain;

  @Column({
    type: 'enum',
    enum: TokenStatus,
    default: TokenStatus.DRAFT,
  })
  status: TokenStatus;

  @Column({ nullable: true })
  contractAddress: string;

  @Column({ nullable: true })
  transactionHash: string;

  @Column({ nullable: true })
  productId: string; // 关联到 Product 表

  @Column('uuid', { nullable: true })
  userId: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User;

  // 代币分配配置
  @Column('jsonb', { nullable: true })
  distribution: {
    team?: number;
    investors?: number;
    public?: number;
    reserve?: number;
  };

  // 锁仓配置
  @Column('jsonb', { nullable: true })
  lockup: {
    team?: {
      amount: number;
      releaseSchedule: Array<{
        date: string;
        amount: number;
      }>;
    };
    investors?: {
      amount: number;
      releaseSchedule: Array<{
        date: string;
        amount: number;
      }>;
    };
  };

  // 预售配置
  @Column('jsonb', { nullable: true })
  presale: {
    price: number;
    amount: number;
    startDate: string;
    endDate: string;
    whitelist?: string[];
    minPurchase?: number;
    maxPurchase?: number;
    contractAddress?: string;
  };

  // 公募配置
  @Column('jsonb', { nullable: true })
  publicSale: {
    price: number;
    startDate: string;
  };

  // 统计数据
  @Column('jsonb', { nullable: true })
  stats: {
    totalSupply: string;
    sold: string;
    remaining: string;
    totalRaised: string;
    holders: number;
  };

  // 元数据
  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

