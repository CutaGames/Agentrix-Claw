import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type {
  CreationTaskTarget,
  CreationTaskStatus,
  SubstrateTier,
} from '../../../../shared/types/world-creation';

/**
 * CreationTask — 跨端创作任务队列条目 (design §8 Creation_Task_Queue, R8)。
 *
 * 可在 Mobile 发起，派发到 self / desktop / Agent_Builder 执行；Agent 可在用户
 * 离线时自治执行。状态机：queued → running → completed | failed (failed 可 retry，
 * 保留 inputJson)。Mobile 发起的 Tier_C 任务强制路由到 desktop / agent (R8.7)。
 *
 * 全局 SnakeNamingStrategy：列名自动派生，禁止手写 name。
 */
@Entity('creation_tasks')
@Index(['userId'])
@Index(['status'])
@Index(['plotId'])
export class CreationTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 发起任务的用户 (FK → users.id)。 */
  @Column({ type: 'uuid' })
  userId: string;

  /** 任务作用的 Plot (FK → world_plots.id)，可为空 (尚未绑定 Plot 的草稿生成)。 */
  @Column({ type: 'uuid', nullable: true })
  plotId: string | null;

  /** 派发目标。 */
  @Column({ type: 'enum', enum: ['self', 'desktop', 'agent'] })
  target: CreationTaskTarget;

  /** 任务针对的 Substrate_Tier (用于 Tier_C 强制路由判定)。 */
  @Column({ type: 'enum', enum: ['A', 'B', 'C'], nullable: true })
  substrateTier: SubstrateTier | null;

  /** 任务生命周期状态。 */
  @Column({
    type: 'enum',
    enum: ['queued', 'running', 'completed', 'failed'],
    default: 'queued',
  })
  status: CreationTaskStatus;

  /** 任务输入 (prompt / 编辑意图 / 参数)，失败时保留以支持 retry (R8.6)。 */
  @Column({ type: 'jsonb' })
  inputJson: Record<string, unknown>;

  /** 完成时产出的 ECS_World 工件引用 (如 versionId / diffId)。 */
  @Column({ type: 'varchar', nullable: true })
  resultRef: string | null;

  /** 失败原因 (R8.6)。 */
  @Column({ type: 'text', nullable: true })
  failReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
