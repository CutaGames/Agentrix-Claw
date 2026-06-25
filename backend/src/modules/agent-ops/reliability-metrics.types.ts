import type { AgentOpsTaskType } from './entities/agent-ops-task.entity';

/**
 * 可靠性度量 · 公共类型(crypto-native-agent-ops 任务 15)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C4「指标采集」:记录 自主完成率 / 质量合格率(抽检)/ 时延,供需求 18 北极星。
 *   - 需求 18.2:
 *       · 自主完成率(全程无人工救场即交付合格 / 总尝试)≥ 80%(核心生死线);
 *       · 质量合格率(交付物经人工抽检判为合格 / 已交付)≥ 90%;
 *   - 需求 18.4:记录冷启动漏斗(创建 Agent → 跑首个任务 → 拿到合格交付 → 付费/分享)。
 *
 * 口径说明(单测断言据此):
 *   - 「无人工救场」= 任务全程自主:`task.approvalState === 'auto'` 且该任务的
 *     `agent_ops_action_log` 中不存在 `approvedBy != null` 的人工审批步。
 *   - 「交付合格」= 该任务存在至少一个 `qualified === true`(自动校验器口径)的交付物。
 *   - 「人工抽检合格」= 交付物 `humanReviewState === 'qualified'`(与自动口径分离)。
 */

/** 北极星门槛(需求 18.2)。 */
export const AUTONOMOUS_COMPLETION_THRESHOLD = 0.8;
export const QUALITY_PASS_THRESHOLD = 0.9;

/** 统计窗口与范围。 */
export interface MetricsWindow {
  /** 起始时间(含);缺省不限。 */
  since?: Date;
  /** 结束时间(含);缺省不限。 */
  until?: Date;
  /** 限定某 Agent;缺省统计全部。 */
  agentId?: string;
  /**
   * 度量针对的垂直活儿任务类型(需求 18.2 默认首个垂直 = 尽调)。
   * 缺省 `'due_diligence'`。
   */
  taskType?: AgentOpsTaskType;
}

/** 自主完成率结果(需求 18.2 核心生死线指标)。 */
export interface AutonomousCompletionMetric {
  /** 总尝试数(窗口内、达终态的目标类型任务)。 */
  attempts: number;
  /** 全程无人工救场且交付合格的任务数。 */
  autonomousQualified: number;
  /** 全程无人工救场(无论是否合格)的任务数(诊断用)。 */
  autonomous: number;
  /** 自主完成率 = autonomousQualified / attempts(attempts=0 时为 null)。 */
  rate: number | null;
  /** 门槛(0.8)。 */
  threshold: number;
  /** 是否达标(rate >= threshold);attempts=0 时为 false。 */
  meetsThreshold: boolean;
}

/** 质量合格率结果(需求 18.2,人工抽检防「跑完了但报告是垃圾」)。 */
export interface QualityPassMetric {
  /** 已交付的交付物数(窗口内)。 */
  delivered: number;
  /** 经人工抽检的交付物数。 */
  spotChecked: number;
  /** 人工抽检判为合格的交付物数。 */
  spotCheckQualified: number;
  /**
   * 质量合格率(门槛口径)= 抽检合格 / 抽检数。
   * 抽检为「已交付」的样本;未抽检不计入分母,避免人为压低。
   * spotChecked=0 时为 null。
   */
  rate: number | null;
  /** 抽检覆盖率 = 抽检数 / 已交付(诊断用)。 */
  spotCheckCoverage: number | null;
  /** 门槛(0.9)。 */
  threshold: number;
  /** 是否达标。 */
  meetsThreshold: boolean;
}

/** 时延统计(毫秒;来自交付物报告 latencyMs)。 */
export interface LatencyMetric {
  /** 参与统计的样本数(含有效 latencyMs 的交付物)。 */
  count: number;
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  /** 中位数 p50。 */
  p50Ms: number | null;
  /** p95。 */
  p95Ms: number | null;
}

/** 冷启动漏斗单段。 */
export interface FunnelStage {
  /** 段标识。 */
  stage: 'created_agent' | 'ran_first_task' | 'got_qualified_delivery' | 'paid_or_shared';
  /** 该段去重 Agent 数。 */
  count: number;
  /** 相对上一段的转化率(首段为 null)。 */
  conversionFromPrev: number | null;
}

/** 冷启动漏斗(需求 18.4)。 */
export interface ColdStartFunnel {
  stages: FunnelStage[];
}

/** 可靠性度量总览快照。 */
export interface ReliabilitySnapshot {
  window: {
    since: string | null;
    until: string | null;
    agentId: string | null;
    taskType: AgentOpsTaskType;
  };
  autonomousCompletion: AutonomousCompletionMetric;
  qualityPass: QualityPassMetric;
  latency: LatencyMetric;
  funnel: ColdStartFunnel;
  generatedAt: string;
}

/** 人工抽检入参。 */
export interface RecordHumanSpotCheckParams {
  deliverableId: string;
  /** 抽检者(用户 id)。 */
  reviewerId: string;
  /** 人工判定是否合格。 */
  qualified: boolean;
  /** 备注(可选)。 */
  notes?: string;
}
