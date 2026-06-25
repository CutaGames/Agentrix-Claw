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
import { AgentAuthorization } from './agent-authorization.entity';

/**
 * Agent策略权限实体
 */
@Entity('agent_strategy_permissions')
@Index(['agentAuthorizationId'])
@Index(['strategyType'])
export class AgentStrategyPermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  agentAuthorizationId: string; // Agent授权ID

  @Column({ type: 'varchar', length: 50 })
  strategyType: 'dca' | 'grid' | 'arbitrage' | 'market_making' | 'rebalancing'; // 策略类型

  @Column({ type: 'boolean', default: true })
  allowed: boolean; // 是否允许

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  maxAmount?: number; // 该策略的最大金额

  @Column({ type: 'integer', nullable: true })
  maxFrequency?: number; // 最大执行频率（每小时/每天）

  @Column({ type: 'varchar', length: 20, default: 'hour' })
  frequencyPeriod: 'hour' | 'day'; // 频率周期

  @Column({ type: 'text', array: true, nullable: true })
  allowedTokens?: string[]; // 允许的代币列表

  @Column({ type: 'text', array: true, nullable: true })
  allowedDEXs?: string[]; // 允许的DEX列表

  @Column({ type: 'text', array: true, nullable: true })
  allowedCEXs?: string[]; // 允许的CEX列表

  @Column({ type: 'jsonb', nullable: true })
  riskLimits?: {
    maxDrawdown?: number; // 最大回撤
    maxLeverage?: number; // 最大杠杆
    stopLoss?: number; // 止损
    takeProfit?: number; // 止盈
    maxPositionSize?: number; // 最大持仓
  }; // 风险限制配置

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // 关联关系
  @ManyToOne(() => AgentAuthorization, (authorization) => authorization.strategyPermissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'agent_authorization_id' })
  authorization: AgentAuthorization;
}

