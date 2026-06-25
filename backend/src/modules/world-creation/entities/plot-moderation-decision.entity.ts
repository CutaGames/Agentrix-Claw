import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * PlotModerationDecision — UGC 体验审核决策审计 (design §10, R10.6)。
 *
 * 记录 Plot 体验在发布前/发布后审核管线各阶段的决策结果，cn-region 留存期。
 * 复用 v5 5 阶段审核 + cn-region 增量；Tier_C 额外的静态代码扫描阶段也落本表。
 *
 * 全局 SnakeNamingStrategy：列名自动派生，禁止手写 name。
 */
@Entity('plot_moderation_decisions')
@Index(['plotId'])
export class PlotModerationDecision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 被审核的 Plot (FK → world_plots.id)。 */
  @Column({ type: 'uuid' })
  plotId: string;

  /** 审核管线阶段 (复用 v5 5 阶段 + cn-region 增量 + C 级静态扫描)。 */
  @Column({
    type: 'enum',
    enum: [
      'pre_publish',
      'cn_region',
      'static_code_scan',
      'post_publish_report',
    ],
  })
  stage: string;

  /** 决策结果。 */
  @Column({ type: 'enum', enum: ['approved', 'rejected', 'pending'] })
  decision: string;

  /** 人类可读的决策理由 (含具体违规阶段/项)。 */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /** 人工审核者 id (自动决策为 null)。 */
  @Column({ type: 'uuid', nullable: true })
  reviewerId: string | null;

  /** 决策时间 (Unix epoch millis，bigint 以 string 表示)。 */
  @Column({ type: 'bigint' })
  ts: string;

  @CreateDateColumn()
  createdAt: Date;
}
