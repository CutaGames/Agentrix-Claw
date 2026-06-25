import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * AgentBudgetEntity — Agent 代付「预设额度(preset budget)」+ 周期用量
 * (world-creation-feed task 9.2 / 9.4)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - 需求 13.4:Agent 代用户发起消费类动词(order/book/subscribe/donate)时,
 *     SHALL 受该用户**预设额度**门控:额度内免逐次确认、超额/越权拒绝并要求重新授权。
 *   - design §Agent Invocation — 预设额度模型:单/周期上限 + 可选创作白名单。
 *
 * 一个用户账户一条记录(onBehalfOfAccountId 唯一)。周期为滚动一周:`periodStart`
 * 起算,`periodSpentAxp` 累计;跨周自动重置(由 AgentBudgetService 在核销时判定)。
 * `whitelistCreationIds` 为可选免确认白名单(本模型内额度内本就免确认,白名单用于
 * 未来"超额仍放行"等放宽策略的承载位)。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`。
 */
@Entity('agent_budgets')
@Index(['onBehalfOfAccountId'], { unique: true })
export class AgentBudgetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 被代表的用户账户 id(额度归属主体,需求 13.4)。唯一。 */
  @Column({ type: 'uuid' })
  onBehalfOfAccountId: string;

  /** 预设额度(每周期上限,AXP;numeric 保精度)。默认 0 = 未授权,任何代付被拒。 */
  @Column({ type: 'numeric', precision: 18, scale: 6, default: 0 })
  presetBudgetAxp: string;

  /** 当前周期起算时间(滚动一周)。 */
  @Column({ type: 'timestamptz' })
  periodStart: Date;

  /** 当前周期已花费(AXP;numeric 保精度)。 */
  @Column({ type: 'numeric', precision: 18, scale: 6, default: 0 })
  periodSpentAxp: string;

  /** 免确认白名单创作 id 列表(可选,需求 13.4)。 */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  whitelistCreationIds: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
