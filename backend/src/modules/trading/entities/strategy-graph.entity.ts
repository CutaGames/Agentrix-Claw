import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { StrategyNode } from './strategy-node.entity';

@Entity('strategy_graphs')
@Index(['userId'])
@Index(['status'])
export class StrategyGraph {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  agentId: string;

  @Column({ type: 'text', comment: '用户原始意图文本' })
  intentText: string;

  @Column({
    type: 'varchar',
    length: 50,
    comment: "策略类型: 'dca' | 'grid' | 'arbitrage' | 'rebalancing' | 'market_making'",
  })
  strategyType: 'dca' | 'grid' | 'arbitrage' | 'rebalancing' | 'market_making';

  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
    comment: "状态: 'active' | 'paused' | 'completed' | 'cancelled' | 'rejected'",
  })
  status: 'active' | 'paused' | 'completed' | 'cancelled' | 'rejected';

  @Column({
    type: 'jsonb',
    comment: '策略配置（时间触发器、风险上下限、流动性路由等）',
  })
  config: {
    timeTrigger?: {
      type: 'daily' | 'weekly' | 'monthly' | 'custom';
      schedule: string; // Cron表达式或ISO时间
    };
    riskLimits?: {
      maxAmount: number;
      maxDrawdown: number;
      stopLoss?: number;
    };
    liquidityRouting?: {
      allowedDEXs: string[];
      allowedCEXs: string[];
      preferDEX?: boolean;
    };
    executionParams?: {
      slippage: number;
      gasLimit?: number;
    };
    [key: string]: any;
  };

  @OneToMany(() => StrategyNode, (node) => node.strategyGraph, { cascade: true })
  nodes: StrategyNode[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

