import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * ApprovalGrantEntity — 会话/任务级自动放行授权(分级审批预算窗口)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C3 / §Data Models — `approval_grant`。
 *   - 需求 3.4:用户可为某任务/会话设定自动放行范围与预算上限,超出即回落人确认。
 *   - Property 9「审批范围有界」:自动放行严格限定在 scope + budgetCap + expiresAt 内。
 *
 * 一条授权 = 在某 scope(session|task)+ scopeId 范围内、预算上限 budgetCap、过期时间
 * expiresAt 之前自动放行;`used` 累计已消耗预算,超出 / 过期即回落人工确认。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`。
 */
export type ApprovalGrantScope = 'session' | 'task';

@Entity('approval_grant')
@Index(['userId'])
@Index(['agentId'])
@Index(['scope', 'scopeId'])
export class ApprovalGrantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 授权发起人(被代表的用户)。 */
  @Column({ type: 'uuid' })
  userId: string;

  /** 被授权的 Agent(AgentAccount id)。 */
  @Column({ type: 'uuid' })
  agentId: string;

  /** 授权范围维度。 */
  @Column({ type: 'varchar', length: 16 })
  scope: ApprovalGrantScope;

  /** 范围标识(会话 id 或任务 id)。 */
  @Column({ type: 'uuid' })
  scopeId: string;

  /** 预算上限(USD;numeric 保精度)。 */
  @Column({ type: 'numeric', precision: 18, scale: 6, default: 0 })
  budgetCap: string;

  /** 已消耗预算(USD;numeric 保精度)。 */
  @Column({ type: 'numeric', precision: 18, scale: 6, default: 0 })
  used: string;

  /** 授权过期时间;到期后回落人确认。 */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
