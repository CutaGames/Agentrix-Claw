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

export enum WorkflowStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

@Entity('agent_workflow')
@Index(['sessionId', 'status'])
@Index(['sessionId', 'workflowId'])
export class AgentWorkflow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => AgentSession, { onDelete: 'CASCADE' })
  session: AgentSession;

  @Column()
  sessionId: string;

  @Column()
  workflowId: string; // WorkflowDefinition.id

  @Column({ default: 0 })
  currentStepIndex: number; // 当前步骤索引

  @Column({
    type: 'enum',
    enum: WorkflowStatus,
    default: WorkflowStatus.ACTIVE,
  })
  status: WorkflowStatus;

  @Column({ type: 'jsonb', default: {} })
  context: Record<string, any>; // 流程上下文（存储步骤之间的数据）

  @Column({ type: 'jsonb', nullable: true })
  error?: {
    step: string;
    message: string;
    stack?: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

