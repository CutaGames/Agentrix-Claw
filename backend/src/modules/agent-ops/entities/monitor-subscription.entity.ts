import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * MonitorSubscriptionEntity — 散户监控/告警订阅(周期只读检查)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C5 / §Data Models — `monitor_subscription`。
 *   - 需求 9.1:设定监控目标与触发条件 → 周期性只读检查 → 命中即推送告警。
 *   - 需求 9.4:监控任务可暂停 / 修改 / 删除,并展示上次检查时间与结果。
 *
 * 一条订阅 = 某 Agent 为某用户对某监控类型(价格/清算/脱锚、治理提案、代币解锁、
 * 空投窗口、授权与安全异常等)按 `interval` 周期执行只读检查;`lastCheckedAt` /
 * `lastResult` 记录最近一次检查时间与结果,`status` 控制启停。
 *
 * 仓库硬规则(AGENTS.md):全局 SnakeNamingStrategy —— `@Column()` 禁止手写 `name:`。
 */
export type MonitorType =
  | 'price'
  | 'liquidation'
  | 'depeg'
  | 'governance'
  | 'token_unlock'
  | 'airdrop_window'
  | 'approval_security'
  | 'protocol_metric'
  | 'treasury'
  | 'other';

export type MonitorSubscriptionStatus = 'active' | 'paused' | 'deleted';

@Entity('monitor_subscription')
@Index(['ownerId'])
@Index(['agentId'])
@Index(['status'])
export class MonitorSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 订阅归属用户(告警送达对象)。 */
  @Column({ type: 'uuid' })
  ownerId: string;

  /** 执行监控的 Agent(AgentAccount id)。 */
  @Column({ type: 'uuid' })
  agentId: string;

  /** 监控类型(需求 9.2)。 */
  @Column({ type: 'varchar', length: 32 })
  monitorType: MonitorType;

  /** 触发条件(阈值 / 目标地址 / 表达式等结构化定义)。 */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  condition: Record<string, any>;

  /** 检查周期(秒)。 */
  @Column({ type: 'int', default: 3600 })
  interval: number;

  /** 上次检查时间(需求 9.4)。 */
  @Column({ type: 'timestamptz', nullable: true })
  lastCheckedAt: Date | null;

  /** 上次检查结果(结构化,需求 9.4)。 */
  @Column({ type: 'jsonb', nullable: true })
  lastResult: Record<string, any> | null;

  /** 订阅状态:可暂停 / 删除(需求 9.4)。 */
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: MonitorSubscriptionStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
