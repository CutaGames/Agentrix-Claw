import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { AgentAuthorization } from './agent-authorization.entity';

/**
 * Agent执行历史实体
 */
@Entity('agent_execution_history')
@Index(['agentId'])
@Index(['authorizationId'])
@Index(['executedAt'])
@Index(['status'])
export class AgentExecutionHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  agentId: string; // Agent ID

  @Column({ type: 'uuid' })
  authorizationId: string; // 授权ID

  @Column({ type: 'varchar', length: 50, nullable: true })
  strategyType?: string; // 策略类型

  @Column({ type: 'varchar', length: 50 })
  executionType: 'payment' | 'trading' | 'market_making' | 'arbitrage'; // 执行类型

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  amount?: number; // 执行金额

  @Column({ type: 'varchar', length: 255, nullable: true })
  tokenAddress?: string; // 代币地址

  @Column({ type: 'varchar', length: 50, nullable: true })
  dexName?: string; // DEX名称

  @Column({ type: 'varchar', length: 50, nullable: true })
  cexName?: string; // CEX名称

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status: 'success' | 'failed' | 'rejected' | 'pending'; // 状态

  @Column({ type: 'text', nullable: true })
  errorMessage?: string; // 错误信息

  @Column({ type: 'varchar', length: 255, nullable: true })
  transactionHash?: string; // 交易哈希

  @CreateDateColumn({ name: 'executed_at' })
  executedAt: Date; // 执行时间

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>; // 元数据

  // 关联关系
  @ManyToOne(() => AgentAuthorization, (authorization) => authorization.executionHistory)
  @JoinColumn({ name: 'authorization_id' })
  authorization: AgentAuthorization;
}

