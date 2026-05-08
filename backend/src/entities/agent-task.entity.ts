import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * AgentTask — long-running, asynchronous agent work item.
 *
 * Distinct from `Plan` (which is a step-by-step approval-gated executor).
 * AgentTask is the *outer* unit a user submits ("write a report on X",
 * "monitor competitor's pricing daily") that may span minutes to days
 * and surfaces in the desktop "Work Log" panel.
 *
 * One row per submission. Append-only event log lives in
 * `agent_task_log` (see AgentTaskLog).
 */
export type AgentTaskStatus =
  | 'queued'
  | 'running'
  | 'awaiting_input'
  | 'succeeded'
  | 'failed'
  | 'canceled';

@Entity('agent_tasks')
@Index(['userId', 'createdAt'])
@Index(['status', 'createdAt'])
export class AgentTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64 })
  @Index()
  userId: string;

  @Column({ length: 64, nullable: true })
  agentId: string | null;

  @Column({ length: 64, nullable: true })
  instanceId: string | null;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ length: 16, default: 'queued' })
  status: AgentTaskStatus;

  /** 0-100, optional; -1 means unknown */
  @Column({ type: 'int', default: -1 })
  progress: number;

  @Column({ length: 16, nullable: true })
  tier: string | null;

  @Column({ type: 'double precision', default: 0 })
  costUsd: number;

  @Column({ type: 'text', nullable: true })
  resultSummary: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/** Append-only event log for an AgentTask. */
@Entity('agent_task_logs')
@Index(['taskId', 'createdAt'])
export class AgentTaskLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  taskId: string;

  /** info | tool_call | tool_result | error | status | output */
  @Column({ length: 32 })
  kind: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
