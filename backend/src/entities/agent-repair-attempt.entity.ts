import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
} from 'typeorm';
import { AgentRepairJob } from './agent-repair-job.entity';

export enum AgentRepairAttemptStatus {
  PASSED = 'passed',
  PATCHED = 'patched',
  FAILED = 'failed',
  NEEDS_PATCH_GENERATOR = 'needs_patch_generator',
  NEEDS_APPROVAL = 'needs_approval',
}

@Entity('agent_repair_attempts')
@Index(['jobId', 'attempt'])
@Index(['jobId', 'status'])
export class AgentRepairAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  jobId: string;

  @ManyToOne(() => AgentRepairJob, job => job.attempts, { onDelete: 'CASCADE' })
  job: AgentRepairJob;

  @Column()
  attempt: number;

  @Column({
    type: 'enum',
    enum: AgentRepairAttemptStatus,
  })
  status: AgentRepairAttemptStatus;

  @Column({ type: 'jsonb' })
  commandResult: Record<string, any>;

  @Column({ type: 'jsonb' })
  diagnostics: any[];

  @Column({ type: 'text', nullable: true })
  repairPrompt?: string;

  @Column({ type: 'jsonb', nullable: true })
  patchPlan?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}