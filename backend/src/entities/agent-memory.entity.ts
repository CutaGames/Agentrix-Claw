import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { AgentSession } from './agent-session.entity';

export enum MemoryType {
  CONVERSATION = 'conversation',
  ENTITY = 'entity',
  STATE = 'state',
  WORKFLOW = 'workflow',
  INTENT = 'intent',
}

export enum MemoryScope {
  SESSION = 'session',   // 会话级记忆，会话结束后可归档
  AGENT = 'agent',       // Agent 级长期记忆
  USER = 'user',         // 用户级共享记忆（所有 Agent 可读）
  SHARED = 'shared',     // 定向共享记忆（按策略共享给特定 Agent）
}

@Entity('agent_memory')
@Index(['sessionId', 'key'])
@Index(['sessionId', 'type'])
@Index(['sessionId', 'createdAt'])
@Index(['agentId', 'type', 'createdAt'])
@Index(['agentId', 'scope'])
@Index(['userId', 'scope'])
@Index(['userId', 'agentId', 'type'])
export class AgentMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AgentSession, { onDelete: 'CASCADE', nullable: true })
  session: AgentSession;

  @Column({ nullable: true })
  sessionId: string;

  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  @Column({ type: 'uuid', nullable: true })
  agentId?: string;

  @Column({
    type: 'enum',
    enum: MemoryScope,
    default: MemoryScope.SESSION,
  })
  scope: MemoryScope;

  @Column({
    type: 'enum',
    enum: MemoryType,
  })
  type: MemoryType;

  @Column()
  key: string; // 记忆的键（如 'last_search_products', 'current_cart'）

  @Column({ type: 'jsonb' })
  value: any; // 记忆的值（JSON）

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    importance?: number; // 重要性（0-1）
    expiresAt?: Date; // 过期时间
    tags?: string[]; // 标签
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

