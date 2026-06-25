import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import type { CreationVerb } from '../../../../shared/types/creation';
import type { WorldCreationErrorCode } from '../../../../shared/types/world-creation';

/** Agent 调用结果状态(对齐 shared `InvokeOutcome`)。 */
export type AgentInvocationOutcome = 'ok' | 'rejected';

/**
 * AgentInvocationEntity — 「Agent 调用」审计 + 预设额度核销记录表(world-creation-feed task 1.3)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   (§Agent Invocation — 调用链与预设额度授权)
 *
 * 需求 13.5:系统 SHALL 对每一次 Agent 调用执行鉴权、限流与审计 ——
 *   **谁 / 代谁 / 调了哪个创作 / 动词 / 金额 / 结果**。本表是该审计 + 额度结算的落库。
 *
 * 由 Agent 网关(task 9.2)在调用链末端写入:鉴权(代谁)→ 预设额度核销 →
 * Economy_Bridge 权威结算 → 审计写本表 → 回流 metrics/世界动态。消费类动词失败保证
 * 幂等且余额不变(design §Error Handling);`message`/`query` 失败不产生副作用。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`。
 */
@Entity('agent_invocations')
// 审计检索:按被调创作 / 调用方 Agent / 被代表用户 / 时间。
@Index(['creationId'])
@Index(['agentId'])
@Index(['onBehalfOfAccountId'])
@Index(['createdAt'])
export class AgentInvocationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── 审计:谁 / 代谁 / 哪个创作(需求 13.5) ──

  /** 谁 —— 发起调用的 Agent id。 */
  @Column({ type: 'uuid' })
  agentId: string;

  /** 代谁 —— Agent 代表的用户账户 id(鉴权 + 预设额度核销主体,需求 13.4)。 */
  @Column({ type: 'uuid' })
  onBehalfOfAccountId: string;

  /** 哪个创作 —— 被调用的 Creation id(FK → creations.id)。 */
  @Column({ type: 'uuid' })
  creationId: string;

  // ── 审计:动词 / 工具 / 目标(需求 13.5) ──

  /** 动词 —— 标准化调用动词(query/order/book/message/subscribe/donate)。 */
  @Column({
    type: 'enum',
    enum: ['query', 'order', 'book', 'message', 'subscribe', 'donate'],
  })
  verb: CreationVerb;

  /** 调用的工具名(对应 manifest 中的 McpToolDescriptor.name)。 */
  @Column({ type: 'varchar', length: 128 })
  toolName: string;

  /** 目标 offering id(消费类动词必填;message/query 可空)。 */
  @Column({ type: 'varchar', length: 64, nullable: true })
  offeringId: string | null;

  /** 调用参数快照(其 schema 由 manifest 的 inputSchema 约束)。 */
  @Column({ type: 'jsonb', nullable: true })
  args: Record<string, unknown> | null;

  // ── 审计:结果 / 金额(需求 13.5) ──

  /** 结果 —— 调用结果状态(ok / rejected)。 */
  @Column({ type: 'enum', enum: ['ok', 'rejected'] })
  outcome: AgentInvocationOutcome;

  /**
   * 金额 —— 消费类动词成交后的权威金额(由 Economy_Bridge 计算,需求 7.1);
   * query/message 或被拒时为 null。numeric 保精度。
   */
  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
  authoritativeAmount: string | null;

  /** 平台抽成(成交时;numeric 保精度)。 */
  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
  platformCut: string | null;

  /** 成交计价币种(展示用,如 'AXP' / 'USD';权威金额仍由 Economy_Bridge 计算)。 */
  @Column({ type: 'varchar', length: 16, nullable: true })
  currency: string | null;

  /** 工具返回的业务数据(query 信息 / order 凭证 / book 预约号等;可空)。 */
  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  /**
   * 被拒原因码(outcome=rejected 时):CAP_DENIED(越权)/ QUOTA_EXCEEDED(超预设额度)/
   * ECONOMY_REJECTED(结算被拒,余额不变,需求 13.4);复用 v6 WorldCreationErrorCode。
   */
  @Column({ type: 'varchar', length: 32, nullable: true })
  errorCode: WorldCreationErrorCode | null;

  /** 被拒的人类可读详情(可空)。 */
  @Column({ type: 'text', nullable: true })
  errorDetail: string | null;

  /** 审计时间(调用发生时刻)。 */
  @CreateDateColumn()
  createdAt: Date;
}
