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
import { StrategyGraph } from './strategy-graph.entity';

@Entity('strategy_nodes')
@Index(['strategyGraphId'])
export class StrategyNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  strategyGraphId: string;

  @ManyToOne(() => StrategyGraph, (graph) => graph.nodes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'strategyGraphId' })
  strategyGraph: StrategyGraph;

  @Column({
    type: 'varchar',
    length: 50,
    comment: "节点类型: 'trigger' | 'monitor' | 'risk' | 'router' | 'executor'",
  })
  nodeType: 'trigger' | 'monitor' | 'risk' | 'router' | 'executor';

  @Column({ type: 'jsonb', comment: '节点配置' })
  nodeConfig: {
    // Trigger节点配置
    schedule?: string; // Cron表达式
    condition?: any; // 触发条件

    // Monitor节点配置
    tokenPair?: string;
    threshold?: {
      priceChange?: number; // 价格变化百分比
      volumeChange?: number; // 交易量变化
    };

    // Risk节点配置
    maxAmount?: number;
    maxDrawdown?: number;

    // Router节点配置
    allowedDEXs?: string[];
    allowedCEXs?: string[];

    // Executor节点配置
    action?: 'swap' | 'limit_order' | 'market_order';
    params?: any;

    [key: string]: any;
  };

  @Column({ type: 'integer', comment: '执行顺序' })
  executionOrder: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
    comment: "状态: 'pending' | 'running' | 'completed' | 'failed'",
  })
  status: 'pending' | 'running' | 'completed' | 'failed';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

