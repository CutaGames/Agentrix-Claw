import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * AgentSpendingRecord — recordSpending 的幂等去重账本(单条结算事件一行)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 7.1/7.2/7.4(A 组 额度联动 · 自动记账):真实成交时记账并累计统计;
 *     同一结算事件(idempotencyKey)不重复计数,结算与记账保持账实一致。
 *   - design §C1 额度联动:`recordSpending(agentId, amount, success, idempotencyKey)`
 *     「引入幂等键(结算事件 id)防重复计数」。
 *   - Correctness Property 1(账实一致)。
 *
 * 每次真实成交记一行;`idempotencyKey` 上的唯一索引保证「同一结算事件至多一行」,
 * 即使并发重试也只记一次(配合服务层的「存在性检查 + 23505 兜底」实现 exactly-once)。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`,
 * camelCase 属性自动映射为 snake_case 列(agentId → agent_id 等)。
 */
@Entity('agent_spending_records')
@Index(['agentId'])
@Index(['idempotencyKey'], { unique: true, where: '"idempotency_key" IS NOT NULL' })
export class AgentSpendingRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 记账归属的 Agent(AgentAccount id)。 */
  @Column({ type: 'uuid' })
  agentId: string;

  /**
   * 幂等键(建议为结算事件 id)。唯一,空值不参与去重。
   * 同一 idempotencyKey 重复调用 recordSpending 只记一次。
   */
  @Column({ type: 'text', nullable: true })
  idempotencyKey?: string | null;

  /** 本次成交金额。 */
  @Column('decimal', { precision: 18, scale: 2, default: 0 })
  amount: number;

  /** 成交是否成功(决定累计到 successful 还是 failed)。 */
  @Column({ type: 'boolean', default: true })
  success: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
