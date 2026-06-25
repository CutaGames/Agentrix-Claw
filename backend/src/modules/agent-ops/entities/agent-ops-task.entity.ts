import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * AgentOpsTaskEntity — crypto-native agent-ops 任务记录。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §Data Models — `agent_ops_task`。
 *   - 需求 2.4 / 8.4 / 9.4:浏览器操作 / 尽调 / 监控任务均需可审计、可落库。
 *
 * 一条记录代表一个由某 Agent 为某用户执行的运维任务(尽调 / 监控 / 安全 / 增长 …),
 * 携带结构化输入、风险分级与审批状态,贯穿编排 → 交付 → 审计全链路。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`。
 */
export type AgentOpsTaskType =
  | 'due_diligence'
  | 'monitor'
  | 'security'
  | 'growth_social'
  | 'growth_content'
  | 'growth_kol'
  | 'growth_quest'
  | 'growth_moderation'
  | 'growth_whitelist'
  | 'sybil_detection'
  | 'other';

export type AgentOpsTaskStatus =
  | 'pending'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** 风险分级(对应需求 3:只读 / 中风险 / 高风险 / 红线)。 */
export type AgentOpsRiskTier = 'read' | 'medium' | 'high' | 'redline';

/** 审批状态(对应分级审批 needs/auto/approved/rejected)。 */
export type AgentOpsApprovalState =
  | 'auto'
  | 'pending'
  | 'approved'
  | 'rejected';

@Entity('agent_ops_task')
@Index(['agentId'])
@Index(['ownerId'])
@Index(['status'])
export class AgentOpsTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 执行该任务的 Agent(AgentAccount id)。 */
  @Column({ type: 'uuid' })
  agentId: string;

  /** 任务归属用户。 */
  @Column({ type: 'uuid' })
  ownerId: string;

  /** 任务类型(尽调 / 监控 / 安全 / 增长 …)。 */
  @Column({ type: 'varchar', length: 64 })
  type: AgentOpsTaskType;

  /** 结构化任务输入(目标 + 步骤计划等)。 */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  input: Record<string, any>;

  /** 任务状态。 */
  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status: AgentOpsTaskStatus;

  /** 风险分级(需求 3)。 */
  @Column({ type: 'varchar', length: 16, default: 'read' })
  riskTier: AgentOpsRiskTier;

  /** 审批状态。 */
  @Column({ type: 'varchar', length: 16, default: 'auto' })
  approvalState: AgentOpsApprovalState;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
