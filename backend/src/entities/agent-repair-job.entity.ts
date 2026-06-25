import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { AgentRepairAttempt } from './agent-repair-attempt.entity';
import { AgentRepairPatch } from './agent-repair-patch.entity';

export enum AgentRepairJobStatus {
  CREATED = 'created',
  RUNNING = 'running',
  NEEDS_APPROVAL = 'needs_approval',
  PATCHED = 'patched',
  PASSED = 'passed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('agent_repair_jobs')
@Index(['userId', 'status', 'createdAt'])
@Index(['sessionId', 'createdAt'])
export class AgentRepairJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  @Column({ type: 'uuid', nullable: true })
  agentId?: string;

  @Column({ nullable: true })
  sessionId?: string;

  @Column({ type: 'text' })
  command: string;

  @Column({ type: 'text', nullable: true })
  workspaceRoot?: string;

  @Column({ default: true })
  approvalRequired: boolean;

  @Column({
    type: 'enum',
    enum: AgentRepairJobStatus,
    default: AgentRepairJobStatus.CREATED,
  })
  status: AgentRepairJobStatus;

  @Column({ default: 0 })
  attemptsCount: number;

  @Column({ type: 'jsonb', nullable: true })
  finalDiagnostics?: any[];

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ nullable: true })
  createdBy?: string;

  @Column({ nullable: true })
  cancelledBy?: string;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => AgentRepairAttempt, attempt => attempt.job)
  attempts?: AgentRepairAttempt[];

  @OneToMany(() => AgentRepairPatch, patch => patch.job)
  patches?: AgentRepairPatch[];
}