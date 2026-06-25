import {
  MetricValue,
  NOT_COLLECTED,
  isNotCollected,
} from './growth-metrics';

/**
 * Quest / 活动(Galxe/Zealy)— 活动配置口径 + 核验(合格参与者/完成率/被排除依据)
 * + 反 sybil 只读标记(纯函数)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 14 共同前提:
 *       · 分级审批锚点:核验 = 🟢(只读自动);活动「配置上线」= 🟡 人确认
 *         (防错误条件/奖励,需求 14.16);买粉/机器人/多钱包 sybil 制造 = 红线拒绝(需求 6)。
 *   - 需求 14.16:项目方提供活动目标与任务清单 → 配置活动;配置上线为 🟡 人确认
 *       (防错误条件/奖励)。
 *   - 需求 14.17:交付活动核验报告 —— 合格参与者 = 完成必做任务且过反 sybil 的「唯一」参与者;
 *       完成率 = 合格 / 总参与者;列出被排除者及依据。
 *   - 需求 14.18:反 sybil 校验复用需求 15 的只读链上分析,仅识别标记,SHALL NOT 反向用于
 *       制造 sybil,SHALL NOT 自动处置奖励发放(由项目方决定)。
 *   - 需求 14.19:计费为按结果(合格参与者数)。
 *   - 需求 15.2:基于链上行为输出 sybil/作弊风险评分与可疑簇 + 判定依据
 *       (只读分析,不替项目方处置;不得反向用于作弊)。
 *   - design Property 7「不编造数据」:缺失基数(总参与者为 0)时完成率取「未获取」,不杜撰。
 *
 * 纯数据/算法,不含 I/O。运行期由 DeliveryPackageRunnerService / Quest 执行链调用;
 * 「配置上线」的 🟡 人确认由 `S1_QUEST_EVENT_PACKAGE` 的 write_action 步骤承载。
 *
 * **边界(需求 14.18,硬约束):**
 *   - 本模块仅做**只读识别与标记**:产出 sybil 风险评分 + 可疑簇 + 判定依据。
 *   - SHALL NOT 反向用于制造 sybil(不输出「如何规避检测」「如何编排多钱包」类产物)。
 *   - SHALL NOT 自动处置奖励发放:被排除者仅被标记并列依据,**最终发放与处置由项目方决定**
 *     ({@link rewardDispositionIsProjectOwnerDecision} 恒为 true,本模块不提供任何发放/扣发函数)。
 */

// ───────────────────────── 活动配置(14.16) ─────────────────────────

/**
 * 单个 Quest 任务定义(活动任务清单的一项)。
 * `mandatory=true` 为「必做任务」,合格参与者须完成全部必做任务(需求 14.17)。
 */
export interface QuestTaskDef {
  /** 任务稳定标识(活动内唯一)。 */
  id: string;
  /** 任务标签(人类可读)。 */
  label: string;
  /** 是否必做(true = 计入合格判定的必做任务)。 */
  mandatory: boolean;
}

/** 活动配置(项目方提供活动目标与任务清单,需求 14.16)。 */
export interface QuestConfig {
  /** 活动目标(描述,审计/报告用)。 */
  objective: string;
  /** 任务清单。 */
  tasks: QuestTaskDef[];
}

/** 活动配置校验结果(配置上线前的健全性检查,防错误条件)。 */
export interface QuestConfigValidation {
  /** 是否为可上线的有效配置。 */
  ok: boolean;
  /** 错误原因码(审计用)。 */
  errors: QuestConfigError[];
  /** 必做任务 id 列表(归一化后,去重)。 */
  mandatoryTaskIds: string[];
}

/** 活动配置错误码。 */
export type QuestConfigError =
  | 'missing_objective' // 缺活动目标
  | 'empty_task_list' // 任务清单为空
  | 'no_mandatory_task' // 无任一必做任务(合格判定无依据)
  | 'duplicate_task_id' // 任务 id 重复
  | 'invalid_task_id'; // 任务 id 缺失/空

/**
 * 校验活动配置是否可上线(需求 14.16 防错误条件)。
 *
 * 合法条件(全部满足):有活动目标、任务清单非空、任务 id 唯一且非空、
 * 至少一个必做任务(否则合格判定无依据)。
 * 仅做配置健全性校验,**不触发上线**——上线为 🟡 人确认(见交付包写动作步骤)。
 */
export function validateQuestConfig(config: QuestConfig): QuestConfigValidation {
  const errors: QuestConfigError[] = [];

  if (!isNonEmptyString(config?.objective)) {
    errors.push('missing_objective');
  }

  const tasks = Array.isArray(config?.tasks) ? config.tasks : [];
  if (tasks.length === 0) {
    errors.push('empty_task_list');
  }

  const seen = new Set<string>();
  let hasInvalidId = false;
  let hasDuplicate = false;
  const mandatoryTaskIds: string[] = [];
  for (const t of tasks) {
    const id = (t?.id ?? '').trim();
    if (!isNonEmptyString(id)) {
      hasInvalidId = true;
      continue;
    }
    if (seen.has(id)) {
      hasDuplicate = true;
      continue;
    }
    seen.add(id);
    if (t.mandatory) mandatoryTaskIds.push(id);
  }
  if (hasInvalidId) errors.push('invalid_task_id');
  if (hasDuplicate) errors.push('duplicate_task_id');
  if (tasks.length > 0 && mandatoryTaskIds.length === 0) {
    errors.push('no_mandatory_task');
  }

  return {
    ok: errors.length === 0,
    errors,
    mandatoryTaskIds,
  };
}

// ───────────────────────── 反 sybil 只读标记(14.18 / 需求 15.2) ─────────────────────────

/**
 * 参与者链上行为读数(复用需求 15 的只读链上分析输入)。
 * 任一字段缺失(null/undefined)→ 对应信号不据以判定(不编造,Property 7)。
 */
export interface ParticipantOnchainBehavior {
  /** 参与者钱包地址(唯一标识来源,需求 14.17 去重键)。 */
  address: string;
  /** 首次资金来源地址(共享资金来源 → 可疑簇,需求 15.2)。 */
  funderAddress?: string | null;
  /** 链上交易数(过低 → 低活跃信号)。 */
  txCount?: number | null;
  /** 钱包年龄(天;过新 → 新钱包信号)。 */
  walletAgeDays?: number | null;
  /** 不同交互对手数(过少 → 单一交互模式信号)。 */
  distinctCounterparties?: number | null;
}

/** 反 sybil 判定阈值(由项目方按活动基线设定,需求 15)。 */
export interface SybilThresholds {
  /** 链上交易数下限:低于 → 低活跃信号。 */
  minTxCount: number;
  /** 钱包年龄(天)下限:低于 → 新钱包信号。 */
  minWalletAgeDays: number;
  /** 不同交互对手数下限:低于 → 单一交互模式信号。 */
  minDistinctCounterparties: number;
  /** 共享资金来源簇规模下限:同一资金来源地址数 ≥ 此值 → 标记为可疑簇。 */
  minClusterSize: number;
  /** 风险评分阈值:综合评分 ≥ 此值 → 标记疑似 sybil(0–100)。 */
  riskScoreThreshold: number;
}

/** sybil 风险信号(判定依据,需求 15.2)。 */
export type SybilSignal =
  | 'shared_funding_cluster' // 与他人共享资金来源,落入可疑簇
  | 'low_onchain_activity' // 链上交易数过低
  | 'new_wallet' // 钱包过新
  | 'single_counterparty_pattern'; // 交互对手过少(单一模式)

/** 各信号的风险权重(综合评分 = 命中信号权重之和,封顶 100)。 */
const SYBIL_SIGNAL_WEIGHT: Record<SybilSignal, number> = {
  shared_funding_cluster: 50,
  low_onchain_activity: 25,
  new_wallet: 15,
  single_counterparty_pattern: 10,
};

/** 单个参与者的反 sybil 只读判定(需求 15.2:评分 + 依据)。 */
export interface SybilScreenResult {
  /** 归一化唯一标识(小写地址)。 */
  identifier: string;
  /** 综合风险评分(0–100)。 */
  riskScore: number;
  /** 是否被标记为疑似 sybil(评分 ≥ 阈值)。 */
  flaggedSybil: boolean;
  /** 命中的风险信号(判定依据,可多个)。 */
  signals: SybilSignal[];
  /** 所属可疑簇 id(共享资金来源簇;不在任何簇 → null)。 */
  clusterId: string | null;
}

/**
 * 可疑簇(共享资金来源,需求 15.2)。
 * 仅识别与列举,**不替项目方处置**(需求 14.18)。
 */
export interface SuspiciousCluster {
  /** 簇 id(= 归一化资金来源地址)。 */
  clusterId: string;
  /** 共享的资金来源地址。 */
  funderAddress: string;
  /** 簇成员(参与者归一化地址)。 */
  members: string[];
}

/**
 * 跨参与者集合识别共享资金来源的可疑簇(需求 15.2)。
 * 同一 `funderAddress` 的成员数 ≥ `minClusterSize` → 标记为可疑簇。
 * 缺资金来源(null/undefined)的参与者不并入任何簇(不编造关联)。
 */
export function detectSuspiciousClusters(
  behaviors: ParticipantOnchainBehavior[],
  minClusterSize: number,
): SuspiciousCluster[] {
  const byFunder = new Map<string, string[]>();
  for (const b of behaviors ?? []) {
    const funder = normalizeAddress(b?.funderAddress);
    const member = normalizeAddress(b?.address);
    if (!funder || !member) continue;
    const list = byFunder.get(funder) ?? [];
    if (!list.includes(member)) list.push(member);
    byFunder.set(funder, list);
  }

  const clusters: SuspiciousCluster[] = [];
  for (const [funder, members] of byFunder.entries()) {
    if (members.length >= Math.max(2, minClusterSize)) {
      clusters.push({ clusterId: funder, funderAddress: funder, members });
    }
  }
  return clusters;
}

/**
 * 单个参与者的反 sybil 只读评分(需求 15.2)。
 *
 * 信号(缺数据者不判该信号,不编造):
 *   - 共享资金来源簇(由 `clusterMembership` 提供时计入);
 *   - 链上交易数 < minTxCount;
 *   - 钱包年龄 < minWalletAgeDays;
 *   - 不同交互对手数 < minDistinctCounterparties。
 * 综合评分 = 命中信号权重之和(封顶 100);≥ 阈值 → 标记疑似 sybil。
 *
 * @param clusterMembership 该地址所属可疑簇 id(由 {@link detectSuspiciousClusters} 预算,无则 null)。
 */
export function screenParticipantSybil(
  behavior: ParticipantOnchainBehavior,
  thresholds: SybilThresholds,
  clusterMembership: string | null = null,
): SybilScreenResult {
  const signals: SybilSignal[] = [];

  if (clusterMembership != null) {
    signals.push('shared_funding_cluster');
  }

  const tx = behavior?.txCount;
  if (isFiniteNum(tx) && tx < thresholds.minTxCount) {
    signals.push('low_onchain_activity');
  }

  const age = behavior?.walletAgeDays;
  if (isFiniteNum(age) && age < thresholds.minWalletAgeDays) {
    signals.push('new_wallet');
  }

  const cp = behavior?.distinctCounterparties;
  if (isFiniteNum(cp) && cp < thresholds.minDistinctCounterparties) {
    signals.push('single_counterparty_pattern');
  }

  const riskScore = Math.min(
    100,
    signals.reduce((acc, s) => acc + SYBIL_SIGNAL_WEIGHT[s], 0),
  );

  return {
    identifier: normalizeAddress(behavior?.address),
    riskScore,
    flaggedSybil: riskScore >= thresholds.riskScoreThreshold,
    signals,
    clusterId: clusterMembership,
  };
}

/**
 * 奖励处置归属:**恒为项目方决定**(需求 14.18)。
 * 本模块仅标记疑似 sybil 与被排除者,绝不自动发放/扣发奖励。
 */
export const rewardDispositionIsProjectOwnerDecision = true as const;

// ───────────────────────── 活动核验(14.17) ─────────────────────────

/** 参与者提交记录(完成的任务 + 链上行为)。 */
export interface ParticipantSubmission {
  /** 参与者钱包地址(唯一标识来源,去重键)。 */
  address: string;
  /** 已完成的任务 id 列表。 */
  completedTaskIds: string[];
  /** 链上行为读数(用于反 sybil 只读分析,可选)。 */
  onchain?: ParticipantOnchainBehavior;
}

/** 被排除原因(需求 14.17:列出被排除者及依据)。 */
export type ExclusionReason =
  | 'incomplete_mandatory_tasks' // 未完成全部必做任务
  | 'sybil_flagged'; // 反 sybil 标记疑似

/** 单个参与者的核验评估。 */
export interface ParticipantEvaluation {
  /** 归一化唯一标识(小写地址)。 */
  identifier: string;
  /** 原始提交。 */
  submission: ParticipantSubmission;
  /** 是否完成全部必做任务。 */
  completedMandatory: boolean;
  /** 未完成的必做任务 id(依据)。 */
  missingMandatoryTaskIds: string[];
  /** 反 sybil 只读判定(评分 + 信号,依据)。 */
  sybil: SybilScreenResult;
  /** 是否合格(完成必做 ∧ 非 sybil 标记)。 */
  qualified: boolean;
  /** 被排除原因(qualified=true 时为空数组)。 */
  exclusionReasons: ExclusionReason[];
}

/** 活动核验报告(需求 14.17)。 */
export interface QuestVerificationReport {
  /** 合格参与者(完成必做任务且过反 sybil 的唯一参与者)。 */
  qualified: ParticipantEvaluation[];
  /** 被排除参与者(含依据)。 */
  excluded: ParticipantEvaluation[];
  /** 识别到的可疑簇(只读列举,不处置,需求 14.18 / 15.2)。 */
  suspiciousClusters: SuspiciousCluster[];
  /** 总参与者数(按唯一标识去重后)。 */
  totalParticipants: number;
  /** 合格参与者数(计费口径,需求 14.19)。 */
  qualifiedCount: number;
  /** 去重剔除的重复条数(需求 14.17「唯一参与者」)。 */
  duplicatesRemoved: number;
  /** 完成率 = 合格 / 总参与者(百分比,两位小数);总参与者为 0 → 「未获取」(不编造)。 */
  completionRatePercent: MetricValue;
}

/** 默认反 sybil 阈值(项目方未提供时的保守基线;项目方可覆盖)。 */
export const DEFAULT_SYBIL_THRESHOLDS: SybilThresholds = {
  minTxCount: 5,
  minWalletAgeDays: 7,
  minDistinctCounterparties: 3,
  minClusterSize: 3,
  riskScoreThreshold: 50,
};

/**
 * 产出活动核验报告(需求 14.17 + 14.18)。
 *
 * 流程:
 *   1. 按唯一标识(归一化地址)去重参与者(同一地址多次提交保留首现,统计剔除数)。
 *   2. 跨集合识别共享资金来源的可疑簇(只读,需求 15.2)。
 *   3. 逐个评估:是否完成全部必做任务 + 反 sybil 只读评分。
 *      合格 = 完成全部必做任务 ∧ 非 sybil 标记(需求 14.17)。
 *   4. 完成率 = 合格 / 总参与者(总参与者为 0 → 「未获取」,Property 7)。
 *
 * 仅识别与标记被排除者及依据;**不自动处置奖励**(需求 14.18)。
 */
export function buildQuestVerificationReport(
  config: QuestConfig,
  submissions: ParticipantSubmission[],
  thresholds: SybilThresholds = DEFAULT_SYBIL_THRESHOLDS,
): QuestVerificationReport {
  const mandatoryTaskIds = (Array.isArray(config?.tasks) ? config.tasks : [])
    .filter((t) => t?.mandatory && isNonEmptyString(t?.id))
    .map((t) => t.id.trim());

  // 1. 去重(唯一参与者,需求 14.17)。
  const { unique, duplicatesRemoved } = dedupSubmissions(submissions);

  // 2. 可疑簇(只读,需求 15.2)。
  const behaviors = unique
    .map((s) => s.onchain)
    .filter((b): b is ParticipantOnchainBehavior => b != null);
  const suspiciousClusters = detectSuspiciousClusters(
    behaviors,
    thresholds.minClusterSize,
  );
  const clusterByMember = new Map<string, string>();
  for (const cluster of suspiciousClusters) {
    for (const member of cluster.members) {
      clusterByMember.set(member, cluster.clusterId);
    }
  }

  // 3. 逐个评估。
  const qualified: ParticipantEvaluation[] = [];
  const excluded: ParticipantEvaluation[] = [];

  for (const submission of unique) {
    const identifier = normalizeAddress(submission.address);
    const completedSet = new Set(
      (submission.completedTaskIds ?? []).map((id) => (id ?? '').trim()),
    );
    const missingMandatoryTaskIds = mandatoryTaskIds.filter(
      (id) => !completedSet.has(id),
    );
    const completedMandatory = missingMandatoryTaskIds.length === 0;

    const sybil = screenParticipantSybil(
      submission.onchain ?? { address: submission.address },
      thresholds,
      clusterByMember.get(identifier) ?? null,
    );

    const exclusionReasons: ExclusionReason[] = [];
    if (!completedMandatory) exclusionReasons.push('incomplete_mandatory_tasks');
    if (sybil.flaggedSybil) exclusionReasons.push('sybil_flagged');

    const isQualified = exclusionReasons.length === 0;

    const evaluation: ParticipantEvaluation = {
      identifier,
      submission,
      completedMandatory,
      missingMandatoryTaskIds,
      sybil,
      qualified: isQualified,
      exclusionReasons,
    };

    if (isQualified) qualified.push(evaluation);
    else excluded.push(evaluation);
  }

  const totalParticipants = unique.length;
  const qualifiedCount = qualified.length;
  const completionRatePercent =
    totalParticipants === 0
      ? NOT_COLLECTED
      : round2((qualifiedCount / totalParticipants) * 100);

  return {
    qualified,
    excluded,
    suspiciousClusters,
    totalParticipants,
    qualifiedCount,
    duplicatesRemoved,
    completionRatePercent,
  };
}

/**
 * 按唯一标识(归一化地址)去重参与者提交(需求 14.17「唯一参与者」)。
 * 保留首现条目,统计剔除数量;空地址(无唯一标识)条目原样保留(后续判定其不合格)。
 */
export function dedupSubmissions(submissions: ParticipantSubmission[]): {
  unique: ParticipantSubmission[];
  duplicatesRemoved: number;
} {
  const seen = new Set<string>();
  const unique: ParticipantSubmission[] = [];
  let duplicatesRemoved = 0;

  for (const s of submissions ?? []) {
    const id = normalizeAddress(s?.address);
    const hasId = id.length > 0;
    if (hasId && seen.has(id)) {
      duplicatesRemoved += 1;
      continue;
    }
    if (hasId) seen.add(id);
    unique.push(s);
  }

  return { unique, duplicatesRemoved };
}

// ───────────────────────── 内部工具 ─────────────────────────

/** 归一化地址(去首尾空白 + 小写;空/缺失 → 空串)。 */
function normalizeAddress(addr: unknown): string {
  if (typeof addr !== 'string') return '';
  return addr.trim().toLowerCase();
}

/** 是否为有限数值(非 null/undefined/NaN/Infinity)。 */
function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 是否为非空字符串(去首尾空白后非空)。 */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** 四舍五入到两位小数(需求 14.17)。 */
function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

// re-export 「未获取」哨兵相关,便于核验报告消费方判空。
export { NOT_COLLECTED, isNotCollected } from './growth-metrics';
export type { MetricValue } from './growth-metrics';
