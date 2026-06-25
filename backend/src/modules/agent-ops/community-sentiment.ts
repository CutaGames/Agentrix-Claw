import {
  MetricValue,
  NOT_COLLECTED,
  isNotCollected,
} from './growth-metrics';

/**
 * 社区审核 + 情绪日报 — 违规识别/记录(只读) + 情绪日报口径(响应时间中位数/P90、
 * 清理量按类型、情绪占比 + 主要话题)+ 清理动作审批边界(纯函数)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 14 共同前提:
 *       · 分级审批锚点:监控/巡检/识别/记录/日报草稿 = 🟢(只读自动);
 *         删除/封禁等清理写动作 = 🟡 审批,批量封禁强制人确认(需求 14.20);
 *         买粉/机器人/刷量等达成路径 = 红线拒绝(需求 6)。
 *   - 需求 14.20:WHILE 监控开启 持续巡检指定频道,识别垃圾/诈骗/违禁并记录;
 *       删除/封禁等清理写动作 SHALL 经 🟡 审批(批量封禁人确认)。
 *   - 需求 14.21:按日产出情绪日报 ——
 *       · 响应时间 = 违规出现到处置(中位数 + P90);
 *       · 清理量 = 当日处置条数(按类型);
 *       · 情绪 = 正/中/负占比 + 主要话题。
 *   - 需求 14.22:计费为订阅(频道数 / 周期)。
 *   - design Property 7「不编造数据」:无处置样本时响应时间取「未获取」、无情绪样本时占比取
 *       「未获取」,不回退为 0 / 不杜撰。
 *
 * 纯数据/算法,不含 I/O。运行期由 DeliveryPackageRunnerService / 社区审核执行链调用;
 * 清理动作(删除/封禁)的 🟡 审批与批量封禁人确认由 `S1_COMMUNITY_MODERATION_PACKAGE`
 * 的 write_action 步骤承载;**本模块绝不代执行清理**(仅识别、记录、统计与起草)。
 *
 * **边界(需求 14.20,硬约束):**
 *   - 本模块仅做**只读识别 / 记录 / 起草 / 统计**:产出违规记录、处置草稿与情绪日报口径。
 *   - 删除 / 封禁等清理为写动作,SHALL 经 🟡 审批;批量封禁强制人确认
 *     ({@link cleanupRequiresApproval} / {@link batchBanRequiresHumanConfirmation} 恒为 true)。
 */

// ───────────────────────── 违规识别 / 记录(14.20) ─────────────────────────

/** 违规类型(垃圾 / 诈骗 / 违禁,需求 14.20)。 */
export type ViolationType = 'spam' | 'scam' | 'prohibited';

/** 全部违规类型(稳定顺序,统计/报告用)。 */
export const VIOLATION_TYPES: readonly ViolationType[] = [
  'spam',
  'scam',
  'prohibited',
] as const;

/** 清理处置动作类型(删除 / 封禁 / 警告;清理量「按类型」口径,需求 14.21)。 */
export type DispositionAction = 'delete' | 'ban' | 'mute' | 'warn';

/**
 * 违规记录(巡检识别 + 记录,需求 14.20)。
 *
 * `detectedAt` 为违规出现/被识别时间;`dispositionedAt` 为完成处置时间
 * (未处置 → null/undefined,不计入响应时间与清理量,不编造)。
 */
export interface ModerationRecord {
  /** 记录稳定标识。 */
  id: string;
  /** 所属频道标识(巡检维度)。 */
  channelId: string;
  /** 违规类型(垃圾 / 诈骗 / 违禁)。 */
  violationType: ViolationType;
  /** 违规出现 / 被识别时间(ISO 字符串)。 */
  detectedAt: string;
  /** 处置完成时间(ISO 字符串;未处置 → null/undefined)。 */
  dispositionedAt?: string | null;
  /** 处置动作(清理量「按类型」分组键;未处置 → null/undefined)。 */
  dispositionAction?: DispositionAction | null;
}

/** 情绪极性(正 / 中 / 负,需求 14.21)。 */
export type SentimentPolarity = 'positive' | 'neutral' | 'negative';

/** 情绪样本(单条消息的情绪标注 + 话题,需求 14.21)。 */
export interface SentimentSample {
  /** 情绪极性。 */
  polarity: SentimentPolarity;
  /** 话题标签(可多个;用于「主要话题」聚合,缺省/空数组不计入)。 */
  topics?: string[];
}

// ───────────────────────── 响应时间(14.21:中位数 + P90) ─────────────────────────

/** 响应时间口径(违规出现到处置,单位:秒)。 */
export interface ResponseTimeMetrics {
  /** 已处置(detectedAt→dispositionedAt 均有效)的记录条数。 */
  dispositionedCount: number;
  /** 响应时间中位数(秒,两位小数);无有效样本 → 「未获取」(不编造)。 */
  medianSeconds: MetricValue;
  /** 响应时间 P90(秒,两位小数);无有效样本 → 「未获取」(不编造)。 */
  p90Seconds: MetricValue;
}

/**
 * 计算单条违规记录的响应时长(秒)= dispositionedAt − detectedAt。
 *
 * 任一时间缺失/非法,或处置早于发现(负时长,数据异常)→ null(不计入,不编造)。
 */
export function responseDurationSeconds(record: ModerationRecord): number | null {
  const detected = parseEpochMs(record?.detectedAt);
  const dispositioned = parseEpochMs(record?.dispositionedAt);
  if (detected == null || dispositioned == null) return null;
  const deltaMs = dispositioned - detected;
  if (deltaMs < 0) return null;
  return deltaMs / 1000;
}

/**
 * 响应时间口径(需求 14.21:违规出现到处置的中位数 + P90)。
 *
 * 仅统计「已处置」记录(detectedAt→dispositionedAt 均有效且非负);
 * 无有效样本 → 中位数与 P90 均取「未获取」(Property 7,不报 0 误导)。
 * 中位数 = P50,故任意样本下恒有 `medianSeconds ≤ p90Seconds`(同一分位函数,单调)。
 */
export function computeResponseTimeMetrics(
  records: ModerationRecord[],
): ResponseTimeMetrics {
  const durations: number[] = [];
  for (const r of records ?? []) {
    const d = responseDurationSeconds(r);
    if (d != null) durations.push(d);
  }

  if (durations.length === 0) {
    return {
      dispositionedCount: 0,
      medianSeconds: NOT_COLLECTED,
      p90Seconds: NOT_COLLECTED,
    };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  return {
    dispositionedCount: sorted.length,
    medianSeconds: round2(percentile(sorted, 50)),
    p90Seconds: round2(percentile(sorted, 90)),
  };
}

// ───────────────────────── 清理量(14.21:当日处置条数,按类型) ─────────────────────────

/** 清理量口径(当日处置条数,按处置动作类型,需求 14.21)。 */
export interface CleanupVolumeMetrics {
  /** 当日处置总条数(已处置记录数)。 */
  total: number;
  /** 按处置动作类型分组的条数(仅含出现过的类型)。 */
  byType: Record<DispositionAction, number>;
}

/**
 * 清理量口径(需求 14.21:当日处置条数,按类型)。
 *
 * 仅统计「已处置」记录(dispositionedAt 有效且 dispositionAction 已知);
 * 未处置 / 缺动作类型不计入(不编造)。`total` 恒等于 `byType` 各项之和。
 */
export function computeCleanupVolume(
  records: ModerationRecord[],
): CleanupVolumeMetrics {
  const byType: Record<DispositionAction, number> = {
    delete: 0,
    ban: 0,
    mute: 0,
    warn: 0,
  };
  let total = 0;

  for (const r of records ?? []) {
    if (parseEpochMs(r?.dispositionedAt) == null) continue;
    const action = r?.dispositionAction;
    if (action == null || !(action in byType)) continue;
    byType[action] += 1;
    total += 1;
  }

  return { total, byType };
}

// ───────────────────────── 情绪(14.21:正/中/负占比 + 主要话题) ─────────────────────────

/** 主要话题项(话题 + 出现次数)。 */
export interface TopicCount {
  topic: string;
  count: number;
}

/** 情绪口径(正/中/负占比 + 主要话题,需求 14.21)。 */
export interface SentimentMetrics {
  /** 计入统计的情绪样本数。 */
  total: number;
  /** 正面占比(百分比,两位小数);无样本 → 「未获取」(不编造)。 */
  positiveRatioPercent: MetricValue;
  /** 中性占比(百分比,两位小数);无样本 → 「未获取」。 */
  neutralRatioPercent: MetricValue;
  /** 负面占比(百分比,两位小数);无样本 → 「未获取」。 */
  negativeRatioPercent: MetricValue;
  /** 主要话题(按出现次数降序,次数相同按话题名升序;空 → 空数组)。 */
  mainTopics: TopicCount[];
}

/** 「主要话题」默认取前 N 个。 */
export const DEFAULT_MAIN_TOPIC_LIMIT = 5;

/**
 * 情绪口径(需求 14.21:正/中/负占比 + 主要话题)。
 *
 * 占比 = 各极性样本数 / 总样本数(百分比,两位小数);无样本 → 三项占比均「未获取」
 * (Property 7,不报 0% 误导)。主要话题按出现次数降序取前 `topicLimit`,次数相同按
 * 话题名升序(确定性);空白话题忽略。
 */
export function computeSentimentMetrics(
  samples: SentimentSample[],
  topicLimit: number = DEFAULT_MAIN_TOPIC_LIMIT,
): SentimentMetrics {
  const list = Array.isArray(samples) ? samples : [];
  const counts: Record<SentimentPolarity, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };
  const topicFreq = new Map<string, number>();

  let total = 0;
  for (const s of list) {
    const polarity = s?.polarity;
    if (polarity !== 'positive' && polarity !== 'neutral' && polarity !== 'negative') {
      continue;
    }
    counts[polarity] += 1;
    total += 1;
    for (const t of s?.topics ?? []) {
      const topic = (t ?? '').trim();
      if (topic.length === 0) continue;
      topicFreq.set(topic, (topicFreq.get(topic) ?? 0) + 1);
    }
  }

  const mainTopics: TopicCount[] = [...topicFreq.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => (b.count - a.count) || a.topic.localeCompare(b.topic))
    .slice(0, Math.max(0, Math.floor(topicLimit)));

  if (total === 0) {
    return {
      total: 0,
      positiveRatioPercent: NOT_COLLECTED,
      neutralRatioPercent: NOT_COLLECTED,
      negativeRatioPercent: NOT_COLLECTED,
      mainTopics,
    };
  }

  return {
    total,
    positiveRatioPercent: round2((counts.positive / total) * 100),
    neutralRatioPercent: round2((counts.neutral / total) * 100),
    negativeRatioPercent: round2((counts.negative / total) * 100),
    mainTopics,
  };
}

// ───────────────────────── 情绪日报组装(14.21) ─────────────────────────

/** 违规识别汇总(按类型计数,巡检/记录侧,需求 14.20)。 */
export interface ViolationSummary {
  /** 识别到的违规总数。 */
  total: number;
  /** 按违规类型计数(垃圾 / 诈骗 / 违禁)。 */
  byType: Record<ViolationType, number>;
}

/**
 * 违规识别汇总(需求 14.20:识别垃圾/诈骗/违禁并记录)。
 * `total` 恒等于 `byType` 各项之和。
 */
export function summarizeViolations(
  records: ModerationRecord[],
): ViolationSummary {
  const byType: Record<ViolationType, number> = {
    spam: 0,
    scam: 0,
    prohibited: 0,
  };
  let total = 0;
  for (const r of records ?? []) {
    const t = r?.violationType;
    if (t === 'spam' || t === 'scam' || t === 'prohibited') {
      byType[t] += 1;
      total += 1;
    }
  }
  return { total, byType };
}

/** 情绪日报(需求 14.21)。 */
export interface SentimentDailyReport {
  /** 报告日期(口径标注;由调用方提供,如 '2026-05-10')。 */
  date: string;
  /** 巡检识别违规汇总(需求 14.20)。 */
  violations: ViolationSummary;
  /** 响应时间(中位数 + P90,需求 14.21)。 */
  responseTime: ResponseTimeMetrics;
  /** 清理量(当日处置条数,按类型,需求 14.21)。 */
  cleanup: CleanupVolumeMetrics;
  /** 情绪(正/中/负占比 + 主要话题,需求 14.21)。 */
  sentiment: SentimentMetrics;
}

/**
 * 产出情绪日报(需求 14.21)。
 *
 * 汇总:违规识别(14.20)+ 响应时间中位数/P90 + 清理量按类型 + 情绪占比与主要话题。
 * 缺样本的口径严格落「未获取」(Property 7),绝不回退 0 / 估算。
 * **只读产出**——不含任何清理(删除/封禁)写动作。
 */
export function buildSentimentDailyReport(input: {
  date: string;
  moderationRecords: ModerationRecord[];
  sentimentSamples: SentimentSample[];
  topicLimit?: number;
}): SentimentDailyReport {
  return {
    date: input.date,
    violations: summarizeViolations(input.moderationRecords),
    responseTime: computeResponseTimeMetrics(input.moderationRecords),
    cleanup: computeCleanupVolume(input.moderationRecords),
    sentiment: computeSentimentMetrics(
      input.sentimentSamples,
      input.topicLimit ?? DEFAULT_MAIN_TOPIC_LIMIT,
    ),
  };
}

// ───────────────────────── 清理动作审批边界(14.20) ─────────────────────────

/**
 * 清理动作(删除/封禁)恒需经 🟡 审批(需求 14.20)。
 * 本模块仅识别 / 记录 / 起草,绝不代执行清理。
 */
export const cleanupRequiresApproval = true as const;

/**
 * 批量封禁恒需人确认(需求 14.20「批量封禁人确认」)。
 * 批量清理(多条删除/封禁)在交付包中以 `batch_operation` 写动作承载 → high → 人确认。
 */
export const batchBanRequiresHumanConfirmation = true as const;

// ───────────────────────── 内部工具 ─────────────────────────

/**
 * 分位数(线性插值法,p ∈ [0,100])。输入须为升序非空数组。
 * 单调:p1 ≤ p2 ⇒ percentile(_, p1) ≤ percentile(_, p2)。导出供日报口径复用与测试。
 */
export function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sortedAsc[0];
  const clamped = Math.min(100, Math.max(0, p));
  const rank = (clamped / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

/** 解析 ISO 时间为 epoch 毫秒;非法/缺失 → null(不编造)。 */
function parseEpochMs(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** 四舍五入到两位小数(需求 14.21)。 */
function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

// re-export 「未获取」哨兵,便于日报消费方判空。
export { NOT_COLLECTED, isNotCollected } from './growth-metrics';
export type { MetricValue } from './growth-metrics';
