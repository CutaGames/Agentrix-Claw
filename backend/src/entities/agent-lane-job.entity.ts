import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { AgentLaneArtifact } from './agent-lane-artifact.entity';
import { AgentLaneEvent } from './agent-lane-event.entity';

export enum AgentLaneJobStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled',
}

export enum AgentLaneJobKind {
  COORDINATOR = 'coordinator',
  LANE = 'lane',
}

@Entity('agent_lane_jobs')
@Index(['userId', 'status', 'createdAt'])
@Index(['parentJobId', 'laneIndex'])
@Index(['leaseOwner', 'heartbeatAt'])
export class AgentLaneJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  parentJobId?: string;

  @Column({
    type: 'enum',
    enum: AgentLaneJobKind,
    default: AgentLaneJobKind.LANE,
  })
  kind: AgentLaneJobKind;

  @Column({ nullable: true })
  role?: string;

  @Column({ nullable: true })
  agentAccountId?: string;

  @Column({ nullable: true })
  handleId?: string;

  @Column({ default: 0 })
  laneIndex: number;

  @Column({ type: 'text' })
  task: string;

  @Column({ nullable: true })
  model?: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  budgetUsd?: number;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ default: 0 })
  maxRetries: number;

  @Column({ nullable: true })
  timeoutMs?: number;

  @Column({ nullable: true })
  leaseOwner?: string;

  @Column({ type: 'timestamptz', nullable: true })
  heartbeatAt?: Date;

  @Column({ nullable: true })
  cancelledBy?: string;

  @Column({ type: 'jsonb', nullable: true })
  toolPolicy?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  transcriptPointer?: string;

  @Column({
    type: 'enum',
    enum: AgentLaneJobStatus,
    default: AgentLaneJobStatus.QUEUED,
  })
  status: AgentLaneJobStatus;

  @Column({ type: 'text', nullable: true })
  result?: string;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ type: 'jsonb', nullable: true })
  usage?: Record<string, any>;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => AgentLaneEvent, event => event.job)
  events?: AgentLaneEvent[];

  @OneToMany(() => AgentLaneArtifact, artifact => artifact.job)
  artifacts?: AgentLaneArtifact[];
}