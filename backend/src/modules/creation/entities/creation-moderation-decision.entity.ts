import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 审核决策审计阶段(world-creation-feed task 2.4)。
 *
 * - `report`:任意用户对已发布 Creation 提交举报(decision=pending,需求 3.4)。
 * - `takedown`:举报命中违规 → status=suspended、移出发现面(decision=rejected,需求 3.4)。
 * - `unpublish`:创作者主动下架(decision=unpublished,需求 3.4 的可逆下架路径)。
 *
 * 与 world-creation `plot_moderation_decisions` 的审计阶段语义对齐,但落 Creation 维度。
 */
export type CreationModerationStage = 'report' | 'takedown' | 'unpublish';

/** 审核决策结果(谁/何时/结论/原因 中的「结论」,需求 3.5)。 */
export type CreationModerationDecision =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'unpublished';

/**
 * CreationModerationDecisionEntity — 统一 Creation 的审核决策审计记录表
 * (world-creation-feed task 2.4)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 3.4:任意用户对已发布 Creation 提交举报;确认违规 → status=suspended、移出
 *               地图/创作流(发现面按 DISCOVERABLE_STATUSES={published,listed} 过滤,
 *               suspended 立即不可见)。
 *   - 需求 3.5:系统 SHALL 为每个 Creation 保留审核决策审计记录(**谁 / 何时 / 结论 /
 *               原因**),供合规追溯。本表即该审计落库。
 *
 * 复用 world-creation `PlotModerationService` / `PlotModerationDecision` 的审计约定:
 * stage + decision + reason + reviewerId + 时间戳,仅把审核对象从 WorldPlot 换成统一
 * Creation,并显式区分「举报者(reporterId)」与「裁决者(reviewerId)」。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`,
 * 列名由 camelCase 属性自动派生为 snake_case。
 */
@Entity('creation_moderation_decisions')
// 审计检索:按被审核创作 + 时间;举报检索:按举报者。
@Index(['creationId'])
@Index(['reporterId'])
export class CreationModerationDecisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 被审核的 Creation(FK → creations.id)。 */
  @Column({ type: 'uuid' })
  creationId: string;

  /** 审核管线阶段(report / takedown / unpublish)。 */
  @Column({ type: 'enum', enum: ['report', 'takedown', 'unpublish'] })
  stage: CreationModerationStage;

  /** 决策结果(需求 3.5「结论」)。 */
  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected', 'unpublished'],
  })
  decision: CreationModerationDecision;

  /** 人类可读的决策理由(含具体违规项;需求 3.3 的结构化拒绝原因载体)。 */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /**
   * 谁 —— 举报者账户 id(stage=report 时填);系统/审核发起的下架可为 null。
   * 需求 3.4:任意用户均可举报。
   */
  @Column({ type: 'uuid', nullable: true })
  reporterId: string | null;

  /**
   * 谁 —— 裁决者 id(stage=takedown/unpublish 时填:审核员或主动下架的创作者);
   * 自动决策为 null。需求 3.5「谁」。
   */
  @Column({ type: 'uuid', nullable: true })
  reviewerId: string | null;

  /** 何时 —— 决策时间(需求 3.5「何时」)。 */
  @CreateDateColumn()
  createdAt: Date;
}
