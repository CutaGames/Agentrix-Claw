import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type AgentMemoryNodeKind = 'user' | 'entity' | 'project' | 'task' | 'tool' | 'symbol' | 'skill' | 'agent' | 'session';

@Entity('agent_memory_edges')
@Index(['userId', 'sourceKind', 'sourceId'])
@Index(['userId', 'targetKind', 'targetId'])
@Index(['sessionId', 'createdAt'])
export class AgentMemoryEdge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  agentId?: string;

  @Column({ nullable: true })
  sessionId?: string;

  @Column({ length: 30 })
  sourceKind: AgentMemoryNodeKind;

  @Column({ length: 255 })
  sourceId: string;

  @Column({ length: 30 })
  targetKind: AgentMemoryNodeKind;

  @Column({ length: 255 })
  targetId: string;

  @Column({ length: 80 })
  relationship: string;

  @Column({ type: 'float', default: 1 })
  weight: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}