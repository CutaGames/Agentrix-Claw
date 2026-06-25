import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
} from 'typeorm';
import { AgentRepairJob } from './agent-repair-job.entity';

export enum AgentRepairPatchStatus {
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  APPLIED = 'applied',
  ROLLED_BACK = 'rolled_back',
}

@Entity('agent_repair_patches')
@Index(['jobId', 'status'])
@Index(['attemptId', 'createdAt'])
export class AgentRepairPatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  jobId: string;

  @ManyToOne(() => AgentRepairJob, job => job.patches, { onDelete: 'CASCADE' })
  job: AgentRepairJob;

  @Column({ type: 'uuid', nullable: true })
  attemptId?: string;

  @Column()
  attempt: number;

  @Column({
    type: 'enum',
    enum: AgentRepairPatchStatus,
    default: AgentRepairPatchStatus.PENDING_APPROVAL,
  })
  status: AgentRepairPatchStatus;

  @Column({ type: 'jsonb' })
  patchPlan: Record<string, any>;

  @Column({ type: 'jsonb' })
  affectedFiles: string[];

  @Column({ type: 'text', nullable: true })
  unifiedDiff?: string;

  @Column({ type: 'text', nullable: true })
  reverseDiff?: string;

  @Column({ type: 'text', nullable: true })
  approvalReason?: string;

  @Column({ nullable: true })
  requestedBy?: string;

  @Column({ nullable: true })
  approvedBy?: string;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}