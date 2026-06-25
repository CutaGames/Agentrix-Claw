import type { AgentOpsDeliverableType } from './entities/agent-ops-deliverable.entity';

/**
 * 交付包任务模板框架 — 公共类型(crypto-native-agent-ops 任务 18)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C7「项目方交付包 + Agent 团队」:
 *       **交付包 = 任务模板**:S0(文档/品牌/研究/审计协调)、S1(6 个增长交付包)、
 *       贯穿(监控/sybil 检测/报告)。**每个含「输入 → 动作 → 交付物 → 量化验收 → 计费」**。
 *   - 需求 13(项目方 · S0 建设期立项与上线准备交付包):
 *       13.1 产出 litepaper/tokenomics 草稿(必备章节清单覆盖)、赛道/竞品定位报告。
 *       13.2 协助搭建并配置品牌社媒矩阵(X/TG/Discord/落地页)至「上线可用」。
 *       13.3 维护审计/服务商对接清单与进度跟踪。
 *       13.4 涉及对外发布/账号操作的写动作 SHALL 接入分级审批(任务 9/10)。
 *
 * 框架把每个交付包表达为一个**声明式任务模板** {@link DeliveryPackageTemplate},
 * 五要素分别落在:
 *   - 输入   → {@link DeliveryPackageTemplate.inputs}
 *   - 动作   → {@link DeliveryPackageStep}(`deliverable_production` 只读自动 / `write_action` 接审批)
 *   - 交付物 → {@link DeliverableStepSpec.deliverableType}(落库到 `agent_ops_deliverable`)
 *   - 量化验收 → {@link DeliverableStepSpec.requiredSections} + {@link AcceptanceCriterion}
 *   - 计费   → {@link BillingSpec}
 *
 * 纯数据/契约,不含执行逻辑;执行由 `DeliveryPackageRunnerService` 承担。
 */

/** 交付包阶段(对应需求 13/14/15 的 S0/S1/贯穿层)。 */
export type DeliveryPackageStage = 'S0' | 'S1' | 'cross_cutting';

/**
 * 步骤动作类别:
 *   - `deliverable_production`:产出交付物(草稿/报告/清单),**只读自动**(无对外副作用)。
 *   - `write_action`:对外发布 / 账号操作等写动作,**必经分级审批**(任务 9/10,需求 13.4)。
 */
export type DeliveryStepKind = 'deliverable_production' | 'write_action';

/** 计费模式(需求各交付包「计费」口径)。 */
export type DeliveryBillingModel =
  | 'one_time' // 一次性(如 S0 建设期立项)
  | 'subscription' // 订阅(周期配额,计量 user_subscription_usage)
  | 'per_result' // 按结果(合格条数 / 转化数)
  | 'subscription_or_per_result'; // 二选一

/** 计费规格(交付包五要素之「计费」)。 */
export interface BillingSpec {
  model: DeliveryBillingModel;
  /** 计量单位说明(如「项目」「条/周」「合格 KOL 条」)。 */
  unit?: string;
  /** 计量挂载点(现有计费基础设施引用)。 */
  meteringRef?: 'user_subscription_usage' | 'agent_hire_escrow' | 'none';
  /** 计费补充说明。 */
  note?: string;
}

/** 输入字段类型。 */
export type InputFieldType =
  | 'string'
  | 'string[]'
  | 'object'
  | 'enum'
  | 'boolean'
  | 'number';

/** 输入字段规格(交付包五要素之「输入」)。 */
export interface InputFieldSpec {
  key: string;
  label: string;
  required: boolean;
  type: InputFieldType;
  /** type=enum 时的允许值。 */
  enumValues?: string[];
}

/**
 * 交付物步骤规格(`deliverable_production`)。
 *
 * 量化验收 = **必备章节清单覆盖**(需求 13.1):产出内容须覆盖 {@link requiredSections}
 * 列出的全部章节;缺任一章节 → 该交付物判不合格(`qualified=false`)。
 */
export interface DeliverableStepSpec {
  /** 落库到 `agent_ops_deliverable` 的交付物类型。 */
  deliverableType: AgentOpsDeliverableType;
  /** 必备章节清单(量化验收口径)。 */
  requiredSections: string[];
  /** 可选:某些章节要求的最小条目数(如竞品 ≥ 3)。 */
  minItems?: Record<string, number>;
}

/**
 * 写动作步骤规格(`write_action`)。
 *
 * 需求 13.4:涉及对外发布 / 账号操作的写动作必经分级审批。`actionType` 直接对接
 * 任务 9 `PolicyEvaluatorService` 的动作类型集合用于风险分级:
 *   - `external_publish` / `transaction_sign` … → high → 人确认;
 *   - `submit_form` / `publish` / `click` … → medium → 策略+预算放行或回落人确认;
 *   - 红线动作(买粉/机器人/sybil…)→ 永久拒绝(不可绕过)。
 */
export interface WriteActionStepSpec {
  /** 对接 PolicyEvaluator 的动作类型(决定风险分级)。 */
  actionType: string;
  /** 动作目标(平台 / 账号 / URL,用于审计与红线进程判定)。 */
  target: string;
  /** 是否批量操作(升级为 high)。 */
  isBatch?: boolean;
  /** 是否跨外部域(navigate 升级为 medium)。 */
  toExternalDomain?: boolean;
}

/** 交付包步骤(交付包五要素之「动作」)。 */
export interface DeliveryPackageStep {
  /** 步骤稳定标识(包内唯一)。 */
  id: string;
  /** 步骤标签(人类可读)。 */
  label: string;
  /** 动作类别。 */
  kind: DeliveryStepKind;
  /** kind=deliverable_production 时的交付物规格。 */
  deliverable?: DeliverableStepSpec;
  /** kind=write_action 时的写动作规格。 */
  action?: WriteActionStepSpec;
  /** 对应的需求条目(可追溯)。 */
  requirementRefs?: string[];
}

/** 量化验收准则(交付包五要素之「量化验收」,可追溯到需求)。 */
export interface AcceptanceCriterion {
  /** 准则标识(通常 = 需求条目,如 '13.1')。 */
  id: string;
  /** 准则描述。 */
  description: string;
}

/**
 * 交付包任务模板(交付包 = 任务模板;含五要素)。
 */
export interface DeliveryPackageTemplate {
  /** 包 slug(稳定标识)。 */
  slug: string;
  /** 阶段。 */
  stage: DeliveryPackageStage;
  /** 标题。 */
  title: string;
  /** 摘要。 */
  summary: string;
  /** 对应需求条目。 */
  requirementRefs: string[];
  /** 五要素 1:输入。 */
  inputs: InputFieldSpec[];
  /** 五要素 2/3:动作 + 交付物(步骤序列)。 */
  steps: DeliveryPackageStep[];
  /** 五要素 4:量化验收。 */
  acceptance: AcceptanceCriterion[];
  /** 五要素 5:计费。 */
  billing: BillingSpec;
}

// ───────────────────────── 运行期类型 ─────────────────────────

/** 交付包执行上下文(归属 + 任务)。 */
export interface DeliveryPackageContext {
  /** 所属 agent-ops 任务 id(交付物 / 动作日志归集维度)。 */
  taskId: string;
  /** 执行该交付包的 Agent(AgentAccount id)。 */
  agentId: string;
  /** 交付包归属用户(项目方)。 */
  userId: string;
}

/** 必备章节清单覆盖判定结果(量化验收口径)。 */
export interface SectionCoverageResult {
  /** 是否覆盖全部必备章节(且满足最小条目数)。 */
  qualified: boolean;
  /** 已覆盖的章节。 */
  coveredSections: string[];
  /** 缺失的章节。 */
  missingSections: string[];
  /** 未达最小条目数的章节(章节 → {要求, 实际})。 */
  underfilledSections: { section: string; required: number; actual: number }[];
}

/** 交付物产出步骤的结果。 */
export interface DeliverableStepResult {
  stepId: string;
  deliverableType: AgentOpsDeliverableType;
  /** 章节覆盖判定。 */
  coverage: SectionCoverageResult;
  /** 是否合格(= coverage.qualified)。 */
  qualified: boolean;
  /** 落库后的交付物 id(persist=false 时为 null)。 */
  deliverableId: string | null;
}

/** 写动作步骤的审批决策(对接任务 9/10)。 */
export interface WriteActionStepResult {
  stepId: string;
  actionType: string;
  /** auto_execute(自动放行)/ user_confirmation(回落人确认)/ deny(红线拒绝)。 */
  decision: 'auto_execute' | 'user_confirmation' | 'deny';
  /** 风险档。 */
  tier: 'read' | 'medium' | 'high' | 'redline';
  /** 是否命中红线。 */
  redline: boolean;
  /** 调用方是否可继续执行该写动作(仅 auto_execute 为 true)。 */
  mayProceed: boolean;
  /** 决策原因码(审计用)。 */
  reason?: string;
  /** 写动作审计日志 id。 */
  actionLogId: string;
}

/**
 * 交付包模板集合注入令牌。
 *
 * 当前提供 S0 建设期包(任务 18);S1 增长包(任务 19)、贯穿层(任务 20)在后续
 * 任务追加进同一集合,Runner 据 slug 路由,无需改动框架。
 */
export const DELIVERY_PACKAGES = Symbol('DELIVERY_PACKAGES');
