import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export enum ShareType {
  MEMORY = 'memory',
  KNOWLEDGE = 'knowledge',
  SKILLS = 'skills',
  CONTACTS = 'contacts',
  CONTEXT = 'context',
}

export enum ShareMode {
  FULL = 'full',
  SUMMARY_ONLY = 'summary_only',
  ON_DEMAND = 'on_demand',
  BLOCKED = 'blocked',
}

@Entity('agent_share_policies')
@Unique(['userId', 'sourceAgentId', 'targetAgentId', 'shareType'])
@Index(['userId'])
@Index(['sourceAgentId'])
export class AgentSharePolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  sourceAgentId: string;

  @Column({ type: 'uuid' })
  targetAgentId: string;

  @Column({ length: 30 })
  shareType: string;

  @Column({ length: 20 })
  shareMode: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
