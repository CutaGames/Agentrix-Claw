import {
  DEFAULT_SYBIL_THRESHOLDS,
  detectSuspiciousClusters,
  screenParticipantSybil,
  type ParticipantOnchainBehavior,
  type SuspiciousCluster,
  type SybilScreenResult,
  type SybilSignal,
  type SybilThresholds,
} from './quest-verification';

/**
 * Sybil 只读链上行为检测(贯穿层独立服务,crypto-native-agent-ops 任务 20 / 需求 15.2)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 15.2:WHEN 项目方提供参与者地址/活动数据 THEN 系统 SHALL 基于链上行为输出
 *       sybil/作弊风险评分与可疑簇 + 判定依据(**只读分析,不替项目方处置;不得反向用于作弊**)。
 *   - design §C7「sybil 检测」:只读链上行为分析服务,输出风险评分 + 可疑簇 + 依据
 *       (不替项目方处置)。
 *   - 需求 14.18:反 sybil 校验仅识别标记,SHALL NOT 反向用于制造 sybil,
 *       SHALL NOT 自动处置奖励发放(由项目方决定)。
 *
 * 与任务 19.4 `quest-verification.ts` 的关系:
 *   - 19.4 把 sybil 只读分析**内嵌**在 Quest 活动核验流程里(产出合格/被排除参与者)。
 *   - 任务 20 在此把同一套只读分析(`detectSuspiciousClusters` / `screenParticipantSybil`)
 *     提炼为**独立的贯穿层检测报告**:输入任意参与者地址/链上行为读数,输出
 *     「风险评分 + 可疑簇 + 判定依据」的结构化报告,供项目方在 Quest 之外的任意场景复用
 *     (空投资格初筛、激励发放前审查等),且严格保持**只读不处置**。
 *
 * 纯数据/算法,不含 I/O。
 *
 * **边界(需求 15.2 / 14.18,硬约束):**
 *   - 本模块仅做**只读识别与标记**:产出 sybil 风险评分 + 可疑簇 + 判定依据。
 *   - SHALL NOT 自动处置:本模块**不提供任何发放/扣发/封禁函数**;最终处置由项目方决定
 *     ({@link dispositionIsProjectOwnerDecision} 恒为 true)。
 *   - SHALL NOT 反向用于制造 sybil:不输出「如何规避检测 / 如何编排多钱包」类产物
 *     ({@link reverseSybilUseProhibited} 恒为 true)。
 */

// ───────────────────────── 报告结构(15.2) ─────────────────────────

/** 风险等级(由评分映射,供看板/报告展示)。 */
export type SybilRiskBand = 'low' | 'medium' | 'high';

/** 单个参与者的 sybil 只读检测条目(评分 + 依据,需求 15.2)。 */
export interface SybilDetectionEntry {
  /** 归一化唯一标识(小写地址)。 */
  identifier: string;
  /** 综合风险评分(0–100)。 */
  riskScore: number;
  /** 风险等级(由评分映射)。 */
  riskBand: SybilRiskBand;
  /** 是否被标记为疑似 sybil(评分 ≥ 阈值)。 */
  flaggedSybil: boolean;
  /** 命中的风险信号(判定依据,可多个)。 */
  signals: SybilSignal[];
  /** 所属可疑簇 id(共享资金来源簇;不在任何簇 → null)。 */
  clusterId: string | null;
}

/** Sybil 只读检测报告(贯穿层,需求 15.2)。 */
export interface SybilDetectionReport {
  /**
   * 逐参与者检测条目:按风险评分降序、评分相同按标识升序(确定性排序),
   * 便于看板「高风险优先」展示。
   */
  entries: SybilDetectionEntry[];
  /** 识别到的可疑簇(共享资金来源;仅列举,不处置)。 */
  suspiciousClusters: SuspiciousCluster[];
  /** 分析的唯一参与者数(按归一化地址去重)。 */
  totalAnalyzed: number;
  /** 被标记为疑似 sybil 的参与者数。 */
  flaggedCount: number;
  /** 可疑簇数。 */
  clusterCount: number;
  /** 去重剔除的重复地址条数。 */
  duplicatesRemoved: number;
  /** 本次使用的判定阈值(审计/复算用)。 */
  thresholds: SybilThresholds;
  /**
   * 处置归属:**恒为项目方决定**(需求 15.2 / 14.18)。
   * 本报告仅标记疑似 sybil 与列依据,绝不自动发放/扣发/封禁。
   */
  dispositionIsProjectOwnerDecision: true;
}

/**
 * 风险等级阈值(评分 → 等级映射)。
 * low:[0, medium);medium:[medium, high);high:[high, 100]。
 */
export const SYBIL_RISK_BAND_THRESHOLDS = {
  /** medium 下限(含)。 */
  medium: 25,
  /** high 下限(含)。 */
  high: 50,
} as const;

/** 评分 → 风险等级映射(确定性)。 */
export function riskBandForScore(riskScore: number): SybilRiskBand {
  const score = Number.isFinite(riskScore) ? riskScore : 0;
  if (score >= SYBIL_RISK_BAND_THRESHOLDS.high) return 'high';
  if (score >= SYBIL_RISK_BAND_THRESHOLDS.medium) return 'medium';
  return 'low';
}

/**
 * 处置归属:**恒为项目方决定**(需求 15.2)。
 * 本模块只识别/评分/列依据,绝不自动处置(无任何发放/扣发/封禁函数)。
 */
export const dispositionIsProjectOwnerDecision = true as const;

/**
 * 禁止反向用于制造 sybil(需求 14.18 / 15.2)。
 * 本模块只产出「检测依据」,不产出「规避检测/编排多钱包」类指导。
 */
export const reverseSybilUseProhibited = true as const;

/**
 * 产出 sybil 只读检测报告(需求 15.2)。
 *
 * 流程:
 *   1. 按唯一标识(归一化地址)去重参与者(保留首现,统计剔除数;不编造关联)。
 *   2. 跨集合识别共享资金来源的可疑簇(只读,复用 `detectSuspiciousClusters`)。
 *   3. 逐个评分(复用 `screenParticipantSybil`,缺数据者不据以判定该信号,Property 7)。
 *   4. 按风险评分降序排序,映射风险等级,汇总统计。
 *
 * 仅识别与列依据;**不替项目方处置**(`dispositionIsProjectOwnerDecision` 恒为 true)。
 */
export function buildSybilDetectionReport(
  behaviors: ParticipantOnchainBehavior[],
  thresholds: SybilThresholds = DEFAULT_SYBIL_THRESHOLDS,
): SybilDetectionReport {
  // 1. 去重(唯一参与者)。
  const { unique, duplicatesRemoved } = dedupBehaviors(behaviors);

  // 2. 可疑簇(只读)。
  const suspiciousClusters = detectSuspiciousClusters(
    unique,
    thresholds.minClusterSize,
  );
  const clusterByMember = new Map<string, string>();
  for (const cluster of suspiciousClusters) {
    for (const member of cluster.members) {
      clusterByMember.set(member, cluster.clusterId);
    }
  }

  // 3. 逐个评分。
  const entries: SybilDetectionEntry[] = unique.map((behavior) => {
    const identifier = normalizeAddress(behavior?.address);
    const screen: SybilScreenResult = screenParticipantSybil(
      behavior,
      thresholds,
      clusterByMember.get(identifier) ?? null,
    );
    return {
      identifier: screen.identifier,
      riskScore: screen.riskScore,
      riskBand: riskBandForScore(screen.riskScore),
      flaggedSybil: screen.flaggedSybil,
      signals: screen.signals,
      clusterId: screen.clusterId,
    };
  });

  // 4. 确定性排序(高风险优先)。
  entries.sort(
    (a, b) =>
      b.riskScore - a.riskScore || a.identifier.localeCompare(b.identifier),
  );

  return {
    entries,
    suspiciousClusters,
    totalAnalyzed: entries.length,
    flaggedCount: entries.filter((e) => e.flaggedSybil).length,
    clusterCount: suspiciousClusters.length,
    duplicatesRemoved,
    thresholds,
    dispositionIsProjectOwnerDecision: true,
  };
}

/**
 * 取被标记为疑似 sybil 的参与者条目(只读筛选)。
 * 仅用于报告/看板展示;**不触发任何处置**。
 */
export function flaggedParticipants(
  report: SybilDetectionReport,
): SybilDetectionEntry[] {
  return report.entries.filter((e) => e.flaggedSybil);
}

// ───────────────────────── 内部工具 ─────────────────────────

/**
 * 按唯一标识(归一化地址)去重参与者链上读数(保留首现,统计剔除数)。
 * 空地址(无唯一标识)条目原样保留(后续评分时其 identifier 为空串)。
 */
function dedupBehaviors(behaviors: ParticipantOnchainBehavior[]): {
  unique: ParticipantOnchainBehavior[];
  duplicatesRemoved: number;
} {
  const seen = new Set<string>();
  const unique: ParticipantOnchainBehavior[] = [];
  let duplicatesRemoved = 0;

  for (const b of behaviors ?? []) {
    const id = normalizeAddress(b?.address);
    const hasId = id.length > 0;
    if (hasId && seen.has(id)) {
      duplicatesRemoved += 1;
      continue;
    }
    if (hasId) seen.add(id);
    unique.push(b);
  }

  return { unique, duplicatesRemoved };
}

/** 归一化地址(去首尾空白 + 小写;空/缺失 → 空串)。 */
function normalizeAddress(addr: unknown): string {
  if (typeof addr !== 'string') return '';
  return addr.trim().toLowerCase();
}

// re-export 复用类型,便于报告消费方无需双导入。
export type {
  ParticipantOnchainBehavior,
  SuspiciousCluster,
  SybilSignal,
  SybilThresholds,
} from './quest-verification';
export { DEFAULT_SYBIL_THRESHOLDS } from './quest-verification';
