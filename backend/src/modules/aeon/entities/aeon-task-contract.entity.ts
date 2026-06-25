import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * AeonTaskContract — 统一任务/契约(Task 3.6 / 3.8 / R7 / R9)。
 *
 * 用 `kind` 区分三种任务,状态机共用(design §任务统一状态机):
 *   - plaza  : 任务广场日常任务(无 escrow)
 *   - bounty : 悬赏(escrow 托管 + 竞标 + 里程碑)
 *   - kpi    : 公司内 KPI(发起方=公司,承接方=agent 员工)
 *
 * 状态: open → in_progress → awaiting_verify → completed
 *        open → cancelled;in_progress → expired;awaiting_verify → in_progress(驳回)/ disputed
 *
 * 遵循 SnakeNamingStrategy:`@Column()` 不写 `name:`。
 */
@Entity('aeon_task_contracts')
@Index(['orgId'])
@Index(['initiatorUserId'])
@Index(['state'])
export class AeonTaskContract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 关联组织(kpi 必有;plaza/bounty 可空)。 */
  @Column({ type: 'uuid', nullable: true })
  orgId: string | null;

  /** 发起方用户。 */
  @Column({ type: 'uuid' })
  initiatorUserId: string;

  /** 承接方(user 或 agent owner);未接单为 null。 */
  @Column({ type: 'uuid', nullable: true })
  acceptorUserId: string | null;

  /** 承接的 agent 实例(若由 agent 接);真人接为 null。 */
  @Column({ type: 'uuid', nullable: true })
  acceptorAgentInstanceId: string | null;

  /** plaza / bounty / kpi。 */
  @Column({ type: 'varchar', length: 16, default: 'plaza' })
  kind: string;

  /** 状态机当前态。 */
  @Column({ type: 'varchar', length: 24, default: 'open' })
  state: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** 验收标准(结构化)。 */
  @Column({ type: 'jsonb', nullable: true })
  acceptanceCriteria: Record<string, unknown> | null;

  /** 报酬金额(最小单位)。 */
  @Column({ type: 'int', default: 0 })
  rewardAmount: number;

  /** 报酬币种(AXP / USDC / ...)。 */
  @Column({ type: 'varchar', length: 16, default: 'AXP' })
  rewardCurrency: string;

  /** 截止时间(ms epoch)。 */
  @Column({ type: 'bigint', nullable: true })
  deadlineAt: string | null;

  /** 是否已托管(bounty)。 */
  @Column({ type: 'boolean', default: false })
  escrowed: boolean;

  /** 里程碑(bounty 分期):[{ title, amount, verified }]。 */
  @Column({ type: 'jsonb', nullable: true })
  milestones: Record<string, unknown>[] | null;

  /** 驳回原因(最近一次)。 */
  @Column({ type: 'varchar', length: 280, nullable: true })
  rejectionReason: string | null;

  /** 交付物引用(URL/文本/资产 id)。 */
  @Column({ type: 'jsonb', nullable: true })
  deliverable: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
