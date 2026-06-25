import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

import type { AgentOpsRiskTier } from './agent-ops-task.entity';

/**
 * AgentOpsActionLogEntity — 每步浏览器/操作动作的可审计轨迹。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C2 / §Data Models — `agent_ops_action_log`。
 *   - 需求 2.4:记录每次浏览器操作的可审计轨迹。
 *   - 需求 6.5:为所有自动化动作保留可审计轨迹以便事后追责。
 *
 * 一条记录 = 任务执行循环中的一步(目标 → 动作 → 结果),附风险分级与人工审批者
 * (若涉及人确认),仅追加(append-only),用于审计与回溯。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`。
 */
@Entity('agent_ops_action_log')
@Index(['taskId'])
export class AgentOpsActionLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属任务 id。 */
  @Column({ type: 'uuid' })
  taskId: string;

  /** 步骤序号(任务内自增,从 1 起)。 */
  @Column({ type: 'int', default: 0 })
  step: number;

  /** 动作目标(URL / 选择器 / 合约地址等)。 */
  @Column({ type: 'text', nullable: true })
  target: string | null;

  /** 动作类型(navigate / eval / click_selector / sign / publish …)。 */
  @Column({ type: 'varchar', length: 64 })
  action: string;

  /** 结构化结果(成功数据 / 失败原因 selector_miss|timeout|dom_changed|blocked …)。 */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  result: Record<string, any>;

  /** 该动作的风险分级。 */
  @Column({ type: 'varchar', length: 16, default: 'read' })
  riskTier: AgentOpsRiskTier;

  /** 人工审批者(高风险动作人确认时记录,否则为空 = 自动放行)。 */
  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  /** 动作发生时间(审计轨迹的 `at`)。 */
  @CreateDateColumn()
  at: Date;
}
