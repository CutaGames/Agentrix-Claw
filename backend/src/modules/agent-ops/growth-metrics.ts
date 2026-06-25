import { checkRedline } from '../agent/redlines';

/**
 * 社媒增长运营 — 量化口径 + 真实增长校验 + 拒刷量 + 互动限流(纯函数)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 14 共同前提「真实增长口径」:所有「增长」指标 SHALL 仅统计平台原生、
 *     未被标记为 bot/spam 的真实账户行为;依赖刷量达成的指标 SHALL 判不达标并拒绝执行。
 *   - 需求 14.2:量化交付周报口径 —— 粉丝净增 =(周末−周初)粉丝数;曝光 = 平台原生
 *     impressions;互动率 =(赞+评+转+藏)/曝光(窗口 7 天,两位小数)。
 *   - 需求 14.3:报告标注采集时间与来源,缺失标「未获取」,SHALL NOT 编造或估算。
 *   - 需求 14.4:任一指标达成路径需买粉/机器人/刷量 → 拒绝并按红线记录。
 *   - 需求 14.5:互动仅以单一真实账号执行;单账号单平台日互动量不超项目方设定且不超平台
 *     ToS 上限;触顶即停并告警。
 *   - design Property 3「红线不可绕过」(Validates 3.5/6.2)、Property 7「不编造数据」
 *     (Validates 8.5/8.6)在增长场景的延伸。
 *
 * 纯数据/算法,不含 I/O。运行期由 DeliveryPackageRunnerService / 增长执行链调用。
 */

/**
 * 「未获取」哨兵(需求 14.3:缺失标「未获取」,不编造/估算)。
 * 任一输入缺失(null/undefined)或无法在口径内计算时,指标取此值,绝不回退为 0 或估算。
 */
export const NOT_COLLECTED = '未获取' as const;
export type NotCollected = typeof NOT_COLLECTED;

/** 指标值:要么是按口径算出的真实数值,要么显式「未获取」。 */
export type MetricValue<T = number> = T | NotCollected;

/** 指标是否为「未获取」。 */
export function isNotCollected<T>(v: MetricValue<T>): v is NotCollected {
  return v === NOT_COLLECTED;
}

// ───────────────────────── 真实增长口径 ─────────────────────────

/**
 * 单侧粉丝读数(真实增长口径:仅平台原生、未被标记为 bot/spam 的真实账户)。
 *
 * `reported` 为平台报告的总粉丝数;`botFlagged` 为其中被平台标记为 bot/spam 的数量。
 * 真实粉丝数 = reported − botFlagged。任一缺失 → 该侧读数「未获取」(不估算)。
 */
export interface FollowerReading {
  /** 平台报告的总粉丝数(null/undefined = 未获取)。 */
  reported: number | null | undefined;
  /** 其中被平台标记为 bot/spam 的数量(null/undefined = 未获取,不按 0 估算)。 */
  botFlagged: number | null | undefined;
}

/**
 * 计算单侧「真实粉丝数」(平台原生、非 bot)。
 *
 * - reported 或 botFlagged 缺失 → 「未获取」(需求 14.3,不估算)。
 * - botFlagged > reported(数据异常)→ 真实数下限取 0,不出现负数。
 */
export function realFollowerCount(reading: FollowerReading): MetricValue {
  const { reported, botFlagged } = reading;
  if (!isFiniteNum(reported) || !isFiniteNum(botFlagged)) {
    return NOT_COLLECTED;
  }
  return Math.max(0, reported - botFlagged);
}

/**
 * 粉丝净增 =(周末−周初)真实粉丝数(需求 14.2)。
 *
 * 任一侧「未获取」→ 净增「未获取」(需求 14.3,不编造)。净增可为负(真实流失)。
 */
export function computeNetFollowerGrowth(
  weekStart: FollowerReading,
  weekEnd: FollowerReading,
): MetricValue {
  const start = realFollowerCount(weekStart);
  const end = realFollowerCount(weekEnd);
  if (isNotCollected(start) || isNotCollected(end)) {
    return NOT_COLLECTED;
  }
  return end - start;
}

/**
 * 曝光 = 平台原生 impressions(需求 14.2)。
 * 仅采纳平台原生 impressions;缺失 → 「未获取」(不以其它字段估算)。
 */
export function computeImpressions(
  platformNativeImpressions: number | null | undefined,
): MetricValue {
  if (!isFiniteNum(platformNativeImpressions) || platformNativeImpressions < 0) {
    return NOT_COLLECTED;
  }
  return platformNativeImpressions;
}

/** 互动构成(赞+评+转+藏)。任一缺失 → 互动量「未获取」。 */
export interface EngagementBreakdown {
  /** 赞。 */
  likes: number | null | undefined;
  /** 评。 */
  comments: number | null | undefined;
  /** 转。 */
  reposts: number | null | undefined;
  /** 藏。 */
  saves: number | null | undefined;
}

/** 互动量 = 赞+评+转+藏(需求 14.2)。任一构成缺失 → 「未获取」。 */
export function computeEngagementCount(
  engagement: EngagementBreakdown,
): MetricValue {
  const parts = [
    engagement.likes,
    engagement.comments,
    engagement.reposts,
    engagement.saves,
  ];
  if (parts.some((p) => !isFiniteNum(p) || (p as number) < 0)) {
    return NOT_COLLECTED;
  }
  return (parts as number[]).reduce((a, b) => a + b, 0);
}

/**
 * 互动率 =(赞+评+转+藏)/曝光,以百分比、两位小数表示(需求 14.2,窗口 7 天)。
 *
 * - 互动构成任一缺失,或曝光「未获取」→ 「未获取」(需求 14.3,不编造)。
 * - 曝光为 0 → 除数无意义,「未获取」(不报 0% 误导)。
 * - 返回值为百分比(如 5.23 表示 5.23%),四舍五入到两位小数。
 */
export function computeEngagementRatePercent(
  engagement: EngagementBreakdown,
  platformNativeImpressions: number | null | undefined,
): MetricValue {
  const count = computeEngagementCount(engagement);
  const impressions = computeImpressions(platformNativeImpressions);
  if (isNotCollected(count) || isNotCollected(impressions)) {
    return NOT_COLLECTED;
  }
  if (impressions === 0) {
    return NOT_COLLECTED;
  }
  return round2((count / impressions) * 100);
}

// ───────────────────────── 拒刷量(红线) ─────────────────────────

/** 增长意图/达成路径筛查结果(拒刷量,需求 14.4 / Property 3)。 */
export interface GrowthPathScreen {
  /** true = 合规(非刷量);false = 命中红线被拒。 */
  ok: boolean;
  /** 是否命中红线。 */
  redline: boolean;
  /** 命中的红线规则标识(审计用)。 */
  rule?: string;
  /** 拒绝原因。 */
  reason?: string;
}

/**
 * 筛查某一增长指标的「达成路径」描述是否依赖买粉/机器人/刷量(需求 14.4)。
 *
 * 复用任务 9 后端红线集(`ABUSE_REDLINE_PATTERNS` via `checkRedline`),命中即判
 * 不达标并拒绝执行,且按红线记录(Property 3:不可被任何策略/预算绕过)。
 */
export function screenGrowthPath(pathDescription: string): GrowthPathScreen {
  const check = checkRedline({ intent: pathDescription });
  if (!check.ok) {
    return {
      ok: false,
      redline: true,
      rule: check.rule,
      reason: check.reason,
    };
  }
  return { ok: true, redline: false };
}

// ───────────────────────── 互动日限流 ─────────────────────────

/** 单账号单平台日互动上限配置(需求 14.5)。 */
export interface InteractionLimitConfig {
  /** 项目方设定的单账号单平台日互动上限。 */
  projectDailyCap: number;
  /** 平台 ToS 日上限。 */
  platformTosCap: number;
}

/** 互动限流决策(需求 14.5:触顶即停并告警)。 */
export interface InteractionBudgetDecision {
  /** 有效上限 = min(项目方设定, 平台 ToS),且不小于 0。 */
  effectiveCap: number;
  /** 在不越界前提下实际可执行的互动次数(0..requested)。 */
  grantedCount: number;
  /** 是否允许继续执行(至少可执行 1 次)。 */
  allowed: boolean;
  /** 执行 grantedCount 后是否已触顶(used+granted ≥ effectiveCap)。 */
  capReached: boolean;
  /** 是否应告警(触顶即告警,需求 14.5)。 */
  shouldAlert: boolean;
  /** 决策原因码(审计用)。 */
  reason?: string;
}

/**
 * 评估「再执行 requested 次互动」的限流决策(需求 14.5,纯函数)。
 *
 * 不变式:`usedToday + grantedCount ≤ effectiveCap`,即任何决策都不会使当日互动量
 * 超过 min(项目方设定, 平台 ToS)。触顶(达到有效上限)即停(grantedCount 截断)
 * 并告警。
 *
 * @param config    上限配置(项目方设定 + 平台 ToS)。
 * @param usedToday 当日(单账号单平台)已执行互动量。
 * @param requested 本次请求执行的互动次数(默认 1)。
 */
export function evaluateInteractionBudget(
  config: InteractionLimitConfig,
  usedToday: number,
  requested = 1,
): InteractionBudgetDecision {
  const effectiveCap = Math.max(
    0,
    Math.min(config.projectDailyCap, config.platformTosCap),
  );
  const used = Math.max(0, usedToday);
  const want = Math.max(0, Math.floor(requested));

  const remaining = Math.max(0, effectiveCap - used);
  const grantedCount = Math.min(want, remaining);
  const capReached = used + grantedCount >= effectiveCap;
  const allowed = grantedCount > 0;

  let reason: string | undefined;
  if (remaining === 0) {
    reason = 'DAILY_INTERACTION_CAP_REACHED';
  } else if (grantedCount < want) {
    reason = 'PARTIAL_GRANT_CAP_LIMIT';
  }

  return {
    effectiveCap,
    grantedCount,
    allowed,
    capReached,
    // 触顶即告警:已无余量或本次将打满上限。
    shouldAlert: capReached,
    reason,
  };
}

// ───────────────────────── 周报组装(不编造) ─────────────────────────

/** 指标来源标注(需求 14.3:标注采集时间与来源)。 */
export interface MetricSource {
  /** 平台(x/telegram/discord/...)。 */
  platform: string;
  /** 来源链接 / API 端点(可核)。 */
  sourceUrl?: string;
  /** 采集时间(ISO 字符串)。 */
  collectedAt?: string;
}

/** 一个指标在周报中的呈现(数值或「未获取」+ 来源标注)。 */
export interface ReportedMetric {
  value: MetricValue;
  /** value 为「未获取」时为 true(需求 14.3)。 */
  notCollected: boolean;
  source: MetricSource | null;
}

/** 增长周报口径汇总(7 天窗口)。 */
export interface GrowthWeeklyMetrics {
  netFollowerGrowth: ReportedMetric;
  impressions: ReportedMetric;
  engagementRatePercent: ReportedMetric;
  /** 报告窗口(固定 7 天)。 */
  windowDays: 7;
}

/** 把口径计算结果包装为带来源标注的周报指标(缺失即标「未获取」,不编造)。 */
export function toReportedMetric(
  value: MetricValue,
  source: MetricSource | null,
): ReportedMetric {
  const notCollected = isNotCollected(value);
  return {
    value,
    notCollected,
    // 未获取的指标不挂来源(无可核来源即不杜撰);有数值但无来源亦视为「未获取」(Property 7)。
    source: notCollected ? null : source,
  };
}

/**
 * 由原始采集数据组装增长周报指标(需求 14.2/14.3)。
 * 缺失项严格落「未获取」;有数值但缺可核来源的项亦降级为「未获取」(Property 7:不编造)。
 */
export function buildGrowthWeeklyMetrics(input: {
  weekStartFollowers: FollowerReading;
  weekEndFollowers: FollowerReading;
  platformNativeImpressions: number | null | undefined;
  engagement: EngagementBreakdown;
  sources: {
    followers: MetricSource | null;
    impressions: MetricSource | null;
    engagement: MetricSource | null;
  };
}): GrowthWeeklyMetrics {
  const net = computeNetFollowerGrowth(
    input.weekStartFollowers,
    input.weekEndFollowers,
  );
  const impressions = computeImpressions(input.platformNativeImpressions);
  const rate = computeEngagementRatePercent(
    input.engagement,
    input.platformNativeImpressions,
  );

  return {
    netFollowerGrowth: enforceSource(
      toReportedMetric(net, input.sources.followers),
    ),
    impressions: enforceSource(
      toReportedMetric(impressions, input.sources.impressions),
    ),
    engagementRatePercent: enforceSource(
      toReportedMetric(rate, input.sources.engagement),
    ),
    windowDays: 7,
  };
}

// ───────────────────────── 内部工具 ─────────────────────────

/** 有数值但缺来源 → 降级「未获取」(Property 7:不存在无来源的杜撰数值)。 */
function enforceSource(metric: ReportedMetric): ReportedMetric {
  if (!metric.notCollected && metric.source == null) {
    return { value: NOT_COLLECTED, notCollected: true, source: null };
  }
  return metric;
}

/** 是否为有限数值(非 null/undefined/NaN/Infinity)。 */
function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 四舍五入到两位小数(需求 14.2)。 */
function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
