import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { AgentStrategyPermission } from './agent-strategy-permission.entity';
import { AgentExecutionHistory } from './agent-execution-history.entity';

/**
 * Agent授权实体
 * 注意：这是独立模块，不影响现有支付功能
 */
@Entity('agent_authorizations')
@Index(['agentId'])
@Index(['userId'])
@Index(['walletAddress'])
export class AgentAuthorization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  agentId: string; // Agent ID

  @Column({ type: 'uuid' })
  userId: string; // 用户ID

  @Column({ type: 'varchar', length: 255 })
  walletAddress: string; // 钱包地址

  @Column({ type: 'varchar', length: 50 })
  authorizationType: 'erc8004' | 'mpc' | 'api_key'; // 授权类型

  @Column({ type: 'varchar', length: 255, nullable: true })
  sessionId?: string; // ERC8004 Session ID（如果使用ERC8004）

  @Column({ type: 'uuid', nullable: true })
  mpcWalletId?: string; // MPC钱包ID（如果使用MPC）

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  singleLimit?: number; // 单笔限额

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  dailyLimit?: number; // 每日限额

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  totalLimit?: number; // 总限额

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  usedToday: number; // 今日已用

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 0 })
  usedTotal: number; // 总已用

  @Column({ type: 'timestamp', nullable: true })
  expiry?: Date; // 过期时间

  @Column({ type: 'date', nullable: true })
  lastResetDate?: Date; // 上次重置日期（用于每日限额重置）

  @Column({ type: 'boolean', default: true })
  isActive: boolean; // 是否激活

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // 关联关系
  @OneToMany(() => AgentStrategyPermission, (permission) => permission.authorization, {
    cascade: true,
  })
  strategyPermissions: AgentStrategyPermission[];

  @OneToMany(() => AgentExecutionHistory, (history) => history.authorization)
  executionHistory: AgentExecutionHistory[];
}

