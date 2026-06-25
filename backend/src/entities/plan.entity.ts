import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Plan — 顿领 §5.4 Plan-Approval 闭环（v3 持久化版）
 *
 *   PlanRunnerService 的执行单元。每个 Plan 关联一个 ApprovalRequest，
 *   approval 通过后由 runner 顺序执行 steps 并把结果写回 jsonb。
 *
 *   - 每个 plan 属于一个 user（user_id）
 *   - approval_id 用于 reverse-lookup（onApprovalApproved）
 *   - steps 是 jsonb 数组：{ id, kind, description, args, status, result }
 */
export type PlanStatus =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'denied'
  | 'running'
  | 'done'
  | 'failed';

export interface PlanArtifact {
  /** Stable id for client de-dup */
  id: string;
  /** kind hint for UI rendering */
  kind: 'text' | 'json' | 'url' | 'image' | 'file' | 'table' | 'code';
  title: string;
  /** Inline content for text/json/code, omitted for url/image/file */
  content?: string;
  /** External URL for url/image/file */
  url?: string;
  /** Optional MIME type */
  mime?: string;
  /** Size hint in bytes */
  bytes?: number;
  createdAtMs: number;
}

export interface PlanStepSnapshot {
  id: string;
  /**
   * Step kind. Conventions:
   *  - `tool:<toolName>` → invoke registered AgentrixTool
   *  - `mock`            → legacy mock executor (for tests)
   *  - any other string  → treated as mock for backward compat
   */
  kind: string;
  description: string;
  args?: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  /** Short human-readable result summary */
  result?: string;
  /** Structured artifacts produced by this step (rendered as cards in UI) */
  artifacts?: PlanArtifact[];
  /** Error message when status=failed */
  error?: string;
  startedAtMs?: number;
  finishedAtMs?: number;
  durationMs?: number;
}

@Entity('plans')
@Index(['userId', 'status'])
@Index(['approvalId'])
export class Plan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Caller-supplied stable id (e.g. plan_1714900000_abcd12); kept distinct from PK so
   *  the runner can address the plan via its semantic id without changing existing API. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  externalId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  intent: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  steps: PlanStepSnapshot[];

  @Column({ type: 'uuid', nullable: true })
  approvalId: string | null;

  @Column({
    type: 'enum',
    enum: [
      'draft',
      'awaiting_approval',
      'approved',
      'denied',
      'running',
      'done',
      'failed',
    ],
    default: 'draft',
  })
  status: PlanStatus;

  @Column({ type: 'bigint' })
  createdAtMs: string;

  @Column({ type: 'bigint', nullable: true })
  startedAtMs: string | null;

  @Column({ type: 'bigint', nullable: true })
  finishedAtMs: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
