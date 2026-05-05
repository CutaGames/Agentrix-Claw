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

export interface PlanStepSnapshot {
  id: string;
  kind: string;
  description: string;
  args?: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'failed';
  result?: string;
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
