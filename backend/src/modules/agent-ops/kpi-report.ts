import type { MonitorCheckOutcome } from './monitor.types';
import type { SybilDetectionReport } from './sybil-detection';
import type { FudAssessment } from './fud-monitor';

/**
 * 运营 / 数据报告(KPI 看板)+ 按时产出研判(贯穿层,任务 20 / 需求 15.4)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 15.4:THE 系统 SHALL 按时产出可保存/可分享的运营与数据报告(KPI 看板)。
 *   - 需求 15.1:周期性监控协议指标/金库/治理,异常时告警(本报告汇总监控结果)。
 *   - 需求 15.2:sybil 只读检测结果(评分 + 可疑簇汇总)纳入看板。
 *   - 需求 15.3:FUD/情绪研判纳入看板。
 *
 * 「按时产出」= 报告按订阅周期(日/周/月)产出;{@link assessReportTimeliness} 依据上次产出
 * 时间 + 周期 + 宽限期研判本次产出是否「按时」(onTime)及逾期秒数。
 *
 * 纯数据/算法,不含 I/O。KPI 看板报告为只读可保存/可分享交付物(落库 `kpi_dashboard_report`)。
 */

// ───────────────────────── 按时产出研判(15.4) ─────────────────────────

/** 报告产出周期。 */
export type ReportPeriod = 'daily' | 'weekly' | 'monthly';

/** 各周期对应秒数(月按 30 天近似,用于到期推算)。 */
export const REPORT_PERIOD_SECONDS: Record<ReportPeriod, number> = {
  daily: 24 * 60 * 60,
  weekly: 7 * 24 * 60 * 60,
  monthly: 30 * 24 * 60 * 60,
};

/** 默认宽限期(秒):允许略晚于到期点仍判「按时」(默认 1 小时)。 */
export const DEFAULT_REPORT_GRACE_SECONDS = 60 * 60;

/** 按时产出研判结果(需求 15.4)。 */
export interface ReportScheduleStatus {
  period: ReportPeriod;
  /** 本周期应产出的到期时刻(ISO 8601)。 */
  dueAt: string;
  /** 含宽限期的最晚按时时刻(ISO 8601)。 */
  deadlineAt: string;
  /** 本次产出是否按时(产出时刻 ≤ 到期 + 宽限)。 */
  onTime: boolean;
  /** 逾期秒数(按时为 0)。 */
  overdueSeconds: number;
}

/** 按时产出研判入参。 */
export interface ReportTimelinessInput {
  period: ReportPeriod;
  /** 上次产出时刻(ISO 8601);缺省/非法 → 视为首期(以本次产出为基准,恒按时)。 */
  lastProducedAt?: string | null;
  /** 本次产出时刻(ISO 8601)。 */
  producedAt: string;
  /** 宽限期(秒),默认 {@link DEFAULT_REPORT_GRACE_SECONDS}。 */
  graceSeconds?: number;
}

/**
 * 研判报告是否「按时产出」(需求 15.4)。
 *
 * - 到期时刻 dueAt = lastProducedAt + period;首期(无 lastProducedAt)以本次产出为到期点(恒按时)。
 * - 含宽限期的最晚按时时刻 deadlineAt = dueAt + grace。
 * - onTime = producedAt ≤ deadlineAt;overdueSeconds = max(0, producedAt − deadlineAt)。
 *
 * 不变式:onTime ⇔ overdueSeconds === 0。
 */
export function assessReportTimeliness(
  input: ReportTimelinessInput,
): ReportScheduleStatus {
  const periodSec = REPORT_PERIOD_SECONDS[input.period];
  const grace = Math.max(0, input.graceSeconds ?? DEFAULT_REPORT_GRACE_SECONDS);

  const producedMs = parseEpochMs(input.producedAt);
  if (producedMs == null) {
    throw new TypeError(`assessReportTimeliness: invalid producedAt "${input.producedAt}"`);
  }

  const lastMs = parseEpochMs(input.lastProducedAt);
  // 首期:以本次产出为到期点(恒按时)。
  const dueMs = lastMs == null ? producedMs : lastMs + periodSec * 1000;
  const deadlineMs = dueMs + grace * 1000;

  const overdueMs = Math.max(0, producedMs - deadlineMs);
  const overdueSeconds = Math.round(overdueMs / 1000);

  return {
    period: input.period,
    dueAt: new Date(dueMs).toISOString(),
    deadlineAt: new Date(deadlineMs).toISOString(),
    onTime: overdueSeconds === 0,
    overdueSeconds,
  };
}

// ───────────────────────── 监控结果汇总(15.1) ─────────────────────────

/** 监控结果汇总(协议/金库/治理周期检查结果聚合,需求 15.1)。 */
export interface MonitoringSummary {
  /** 本期纳入汇总的检查次数。 */
  totalChecks: number;
  /** 命中触发条件(异常告警)的次数。 */
  triggeredCount: number;
  /** 只读采集失败(error)的检查次数(降级显式,不编造)。 */
  errorCount: number;
  /** 命中告警的摘要列表(供看板展示)。 */
  alerts: { summary: string; checkedAt: string }[];
}

/**
 * 汇总一组监控检查结果(需求 15.1)。
 * 仅统计真实结果;采集失败计入 `errorCount`(不并入 triggered,不编造异常)。
 */
export function summarizeMonitoring(
  outcomes: MonitorCheckOutcome[],
): MonitoringSummary {
  const list = Array.isArray(outcomes) ? outcomes : [];
  const alerts: { summary: string; checkedAt: string }[] = [];
  let triggeredCount = 0;
  let errorCount = 0;

  for (const o of list) {
    if (o?.error) errorCount += 1;
    if (o?.triggered) {
      triggeredCount += 1;
      alerts.push({ summary: o.summary ?? '', checkedAt: o.checkedAt ?? '' });
    }
  }

  return {
    totalChecks: list.length,
    triggeredCount,
    errorCount,
    alerts,
  };
}

// ───────────────────────── KPI 看板报告组装(15.4) ─────────────────────────

/** sybil 检测在看板上的汇总切片(只读;不含处置)。 */
export interface SybilDashboardSlice {
  totalAnalyzed: number;
  flaggedCount: number;
  clusterCount: number;
  /** 处置归属恒为项目方决定(回链 15.2 只读不处置)。 */
  dispositionIsProjectOwnerDecision: true;
}

/** FUD 在看板上的汇总切片。 */
export interface FudDashboardSlice {
  level: FudAssessment['level'];
  negativeRatioPercent: FudAssessment['negativeRatioPercent'];
  sampleSize: number;
  fudTopics: string[];
  responseRecommended: boolean;
}

/** KPI 看板报告(可保存/可分享,需求 15.4)。 */
export interface KpiDashboardReport {
  /** 报告日期/期次标注(口径标注,由调用方提供)。 */
  date: string;
  /** 监控汇总(协议/金库/治理,需求 15.1)。 */
  monitoring: MonitoringSummary;
  /** sybil 检测汇总(需求 15.2);未提供 → null。 */
  sybil: SybilDashboardSlice | null;
  /** FUD/情绪汇总(需求 15.3);未提供 → null。 */
  fud: FudDashboardSlice | null;
  /** 按时产出研判(需求 15.4)。 */
  schedule: ReportScheduleStatus;
  /** 可保存/可分享标记(需求 15.4)。 */
  shareable: true;
}

/** KPI 看板报告组装入参。 */
export interface BuildKpiDashboardInput {
  date: string;
  monitorOutcomes: MonitorCheckOutcome[];
  sybilReport?: SybilDetectionReport | null;
  fud?: FudAssessment | null;
  timeliness: ReportTimelinessInput;
}

/**
 * 组装 KPI 看板报告(需求 15.4)。
 *
 * 汇总:监控结果(15.1)+ sybil 只读检测(15.2)+ FUD/情绪(15.3)+ 按时产出研判(15.4)。
 * sybil 切片保留「处置归属恒为项目方」标记(只读不处置);缺失输入项落 null,不编造。
 */
export function buildKpiDashboardReport(
  input: BuildKpiDashboardInput,
): KpiDashboardReport {
  const sybil: SybilDashboardSlice | null = input.sybilReport
    ? {
        totalAnalyzed: input.sybilReport.totalAnalyzed,
        flaggedCount: input.sybilReport.flaggedCount,
        clusterCount: input.sybilReport.clusterCount,
        dispositionIsProjectOwnerDecision: true,
      }
    : null;

  const fud: FudDashboardSlice | null = input.fud
    ? {
        level: input.fud.level,
        negativeRatioPercent: input.fud.negativeRatioPercent,
        sampleSize: input.fud.sampleSize,
        fudTopics: input.fud.fudTopics.map((t) => t.topic),
        responseRecommended: input.fud.responseRecommended,
      }
    : null;

  return {
    date: input.date,
    monitoring: summarizeMonitoring(input.monitorOutcomes),
    sybil,
    fud,
    schedule: assessReportTimeliness(input.timeliness),
    shareable: true,
  };
}

// ───────────────────────── 内部工具 ─────────────────────────

/** 解析 ISO 时间为 epoch 毫秒;非法/缺失 → null(不编造)。 */
function parseEpochMs(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
