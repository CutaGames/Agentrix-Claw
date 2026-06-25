import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * AgentOpsDeliverableEntity — agent-ops 任务产出的可交付物。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §Data Models — `agent_ops_deliverable`。
 *   - 需求 8.4:报告作为可保存 / 可分享 / 可复用交付物落库(归属该 Agent)。
 *   - 需求 8.6:依据「合格交付物验收清单」判定合格(`qualified`)。
 *
 * `content` 为结构化内容(报告 / 告警摘要 / 名单 …),`sourceLinks` 保存每条关键
 * 数据的可核来源(对应 Property 7「不编造数据」)。`collectedAt` 标注数据采集时间。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`。
 */
export type AgentOpsDeliverableType =
  | 'due_diligence_report'
  | 'monitor_digest'
  | 'security_report'
  | 'content_calendar'
  // ── 任务 19.1:S1 社媒增长运营交付包(需求 14.1–14.6)──
  | 'growth_weekly_report'
  | 'kol_list'
  | 'quest_verification'
  | 'sentiment_digest'
  | 'whitelist'
  // ── 任务 18:项目方 S0 建设期交付包(需求 13)──
  | 'litepaper_draft'
  | 'tokenomics_draft'
  | 'track_positioning_report'
  | 'social_matrix_config'
  | 'audit_vendor_checklist'
  // ── 任务 20:项目方贯穿层(监控/sybil 只读检测/FUD/报告,需求 15)──
  | 'sybil_detection_report'
  | 'fud_response_draft'
  | 'kpi_dashboard_report'
  // ── 任务 23:项目方 S2/S3 辅助(上所/做市监控/BD/IR/治理,需求 16;agent 辅助非交付)──
  | 'listing_prep_dossier' // CEX/Launchpad 上所备料 + 提交辅助 + 状态跟踪(需求 16.1)
  | 'market_making_monitor' // DEX 上线 + 流动性/做市监控看板(需求 16.2;不代执行 wash trading)
  | 'bd_ir_leads' // 合作/集成 BD + 对外融资(IR)线索 + 外联草稿 + CRM 跟踪(需求 16.3)
  | 'governance_assist' // 治理提案起草/摘要 + 投票动员辅助(需求 16.4)
  | 'other';

@Entity('agent_ops_deliverable')
@Index(['taskId'])
@Index(['agentId'])
export class AgentOpsDeliverableEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 产出该交付物的任务 id。 */
  @Column({ type: 'uuid' })
  taskId: string;

  /** 归属 Agent(AgentAccount id)。 */
  @Column({ type: 'uuid' })
  agentId: string;

  /** 交付物类型。 */
  @Column({ type: 'varchar', length: 64 })
  type: AgentOpsDeliverableType;

  /** 结构化内容(报告 / 摘要 / 名单 …)。 */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  content: Record<string, any>;

  /** 每条关键数据的可核来源链接(需求 8.7 / Property 7)。 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  sourceLinks: any[];

  /** 数据采集时间(需求 8.2 / 8.8)。 */
  @Column({ type: 'timestamptz', nullable: true })
  collectedAt: Date | null;

  /** 是否通过验收清单判定为合格(需求 8.6)。 */
  @Column({ type: 'boolean', nullable: true })
  qualified: boolean | null;

  /** 质量抽检方(人工 / 自动校验器标识,需求 18.2 质量合格率)。 */
  @Column({ type: 'varchar', length: 128, nullable: true })
  qualityCheckedBy: string | null;

  /**
   * 人工抽检判定(需求 18.2 质量合格率埋点)。
   * 与 {@link qualified}(自动校验器口径)分离:`qualified` 在交付时由
   * `DeliverableValidator` 写定且不被人工覆盖(保住自主完成率口径),
   * 人工抽检结果独立记录在此,供「质量合格率 = 人工抽检合格 / 已交付」统计。
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  humanReviewState: 'qualified' | 'unqualified' | null;

  /** 人工抽检者(用户 id)。 */
  @Column({ type: 'uuid', nullable: true })
  humanReviewedBy: string | null;

  /** 人工抽检时间。 */
  @Column({ type: 'timestamptz', nullable: true })
  humanReviewedAt: Date | null;

  /** 人工抽检备注(可选)。 */
  @Column({ type: 'text', nullable: true })
  humanReviewNotes: string | null;

  /**
   * 分享信号时间(冷启动漏斗末段「付费/分享」之分享侧,需求 18.4)。
   * 交付物「可保存/分享/复用」(需求 8.4),被分享即写入此戳。
   */
  @Column({ type: 'timestamptz', nullable: true })
  sharedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
