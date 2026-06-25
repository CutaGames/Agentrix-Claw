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

@Entity('agent_memory')
@Index(['sessionId', 'key'])
@Index(['sessionId', 'type'])
@Index(['sessionId', 'createdAt'])
export class AgentMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AgentSession, { onDelete: 'CASCADE' })
  session: AgentSession;

  @Column()
  sessionId: string;

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

