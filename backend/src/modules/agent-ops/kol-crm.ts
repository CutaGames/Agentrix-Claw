import {
  MetricValue,
  NOT_COLLECTED,
  isNotCollected,
} from './growth-metrics';

/**
 * KOL 发现 / 外联 / CRM — 去重 + 真实性核验 + CRM 量化口径 + 谈判人确认门(纯函数)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 14 共同前提:
 *       · 分级审批锚点:发现/CRM = 🟢;外联 = 🟡(策略+预算放行,新模板首发人确认);
 *         KOL 谈判/报价/签约/对外承诺 = 🔴 人确认;买粉/机器人/假互动 = 红线拒绝(需求 6)。
 *       · 真实增长口径:所有「增长」指标 SHALL 仅统计平台原生、未被标记为 bot/spam 的真实行为。
 *   - 需求 14.11:项目方提供赛道/受众画像 → 产出去重 + 真实性核验的 KOL 名单,每条含:
 *       账号、粉丝量、近 30 天均互动率、相关性标签、可核来源。
 *   - 需求 14.12:真实性核验标注疑似刷粉信号(粉丝/互动比异常、互动率低于阈值);
 *       疑似造假项标记而不计入「合格 KOL」;按唯一标识去重。
 *   - 需求 14.13:经 🟡 审批触达并记 CRM —— 触达数 = 唯一外联条数;回复率 = 回复数/触达数;
 *       转化合作数 = 进入合作状态数。
 *   - 需求 14.14:进入报价/佣金/签约/对外承诺 → 转 🔴 人确认,agent 仅备料跟踪,不自动签约。
 *   - 需求 14.15:计费为按结果(合格 KOL 条数/转化合作数)或订阅,二选一。
 *   - design Property 7「不编造数据」:缺失即「未获取」(回复率无触达基数时不杜撰)。
 *
 * 纯数据/算法,不含 I/O。运行期由 DeliveryPackageRunnerService / KOL 执行链调用;
 * 外联与谈判的分级审批由 `S1_KOL_CRM_PACKAGE` 的 write_action 步骤承载(🟡 外联 / 🔴 谈判)。
 */

// ───────────────────────── KOL 候选与名单(14.11 / 14.12) ─────────────────────────

/**
 * KOL 候选条目。每条须含需求 14.11 的字段:
 * 账号(handle)、粉丝量、近 30 天均互动率、相关性标签、可核来源。
 */
export interface KolCandidate {
  /** 账号 / 唯一标识(handle 或主页,去重键的来源,需求 14.11/14.12)。 */
  handle: string;
  /** 平台(x/telegram/youtube/...);与 handle 共同构成唯一标识。 */
  platform: string;
  /** 粉丝量(平台原生;null/undefined = 未获取,需求 14.11)。 */
  followerCount: number | null | undefined;
  /** 近 30 天均互动率(百分比;null/undefined = 未获取,需求 14.11)。 */
  avgEngagementRate30d: number | null | undefined;
  /**
   * 近 30 天均互动量(每条均互动数,可选)。
   * 提供时用于「粉丝/互动比」异常检测(需求 14.12 信号一)。
   */
  avgInteractions30d?: number | null;
  /** 相关性标签(赛道/受众匹配,需求 14.11;至少 1 个方判完整)。 */
  relevanceTags: string[];
  /** 可核来源(链接/端点,需求 14.11;缺失 → 不可核 → 不计合格)。 */
  sourceUrl: string | null | undefined;
}

/** 真实性核验阈值(需求 14.12,由项目方按平台基线设定)。 */
export interface AuthenticityThresholds {
  /** 互动率阈值(百分比):低于此值 → 疑似刷粉信号(需求 14.12)。 */
  minEngagementRatePercent: number;
  /**
   * 粉丝/互动比上限:followerCount / avgInteractions30d 超过此值 → 比例异常
   * (粉丝量虚高、真实互动不成比例,需求 14.12)。仅在提供 avgInteractions30d 时评估。
   */
  maxFollowerToInteractionRatio: number;
}

/** 疑似刷粉信号标识(审计用)。 */
export type AuthenticitySignal =
  | 'engagement_below_threshold' // 互动率低于阈值
  | 'follower_engagement_ratio_abnormal'; // 粉丝/互动比异常

/** 单条 KOL 真实性核验结果(需求 14.12)。 */
export interface AuthenticityResult {
  /** 是否疑似造假(命中任一信号)。 */
  suspectedFake: boolean;
  /** 命中的疑似刷粉信号(可多个)。 */
  signals: AuthenticitySignal[];
  /** 计算出的粉丝/互动比(无法计算 → 「未获取」)。 */
  followerToInteractionRatio: MetricValue;
}

/**
 * 单条 KOL 真实性核验(需求 14.12)。
 *
 * 标注疑似刷粉信号:
 *   - 互动率低于阈值(`minEngagementRatePercent`);
 *   - 粉丝/互动比异常(`followerCount / avgInteractions30d` 超过上限)。
 *
 * 缺失的字段不据以「编造」信号:互动率未获取时不判「低于阈值」;
 * 互动量未获取时不判「比例异常」(需求 14.3/Property 7 在 KOL 场景延伸)。
 */
export function screenKolAuthenticity(
  candidate: KolCandidate,
  thresholds: AuthenticityThresholds,
): AuthenticityResult {
  const signals: AuthenticitySignal[] = [];

  // 信号一:互动率低于阈值(仅在互动率已获取时判定)。
  const rate = candidate.avgEngagementRate30d;
  if (isFiniteNum(rate) && rate < thresholds.minEngagementRatePercent) {
    signals.push('engagement_below_threshold');
  }

  // 信号二:粉丝/互动比异常(仅在粉丝量与互动量均已获取时判定)。
  const ratio = computeFollowerToInteractionRatio(candidate);
  if (
    !isNotCollected(ratio) &&
    ratio > thresholds.maxFollowerToInteractionRatio
  ) {
    signals.push('follower_engagement_ratio_abnormal');
  }

  return {
    suspectedFake: signals.length > 0,
    signals,
    followerToInteractionRatio: ratio,
  };
}

/**
 * 粉丝/互动比 = followerCount / avgInteractions30d(需求 14.12 信号一)。
 * 任一缺失或互动量 ≤ 0 → 「未获取」(不编造)。
 */
export function computeFollowerToInteractionRatio(
  candidate: KolCandidate,
): MetricValue {
  const followers = candidate.followerCount;
  const interactions = candidate.avgInteractions30d;
  if (!isFiniteNum(followers) || !isFiniteNum(interactions)) {
    return NOT_COLLECTED;
  }
  if (interactions <= 0) {
    return NOT_COLLECTED;
  }
  return round2(followers / interactions);
}

/** 需求 14.11 每条 KOL 的必备字段(缺任一 → 条目不完整 → 不计合格)。 */
export type KolRequiredField =
  | 'handle'
  | 'followerCount'
  | 'avgEngagementRate30d'
  | 'relevanceTags'
  | 'sourceUrl';

/** 单条 KOL 评估(完整性 + 真实性 → 是否合格)。 */
export interface KolEvaluation {
  /** 去重后的唯一标识(归一化 handle@platform)。 */
  identifier: string;
  /** 原始候选。 */
  candidate: KolCandidate;
  /** 是否字段完整(需求 14.11 必备字段齐全)。 */
  complete: boolean;
  /** 缺失的必备字段。 */
  missingFields: KolRequiredField[];
  /** 真实性核验结果。 */
  authenticity: AuthenticityResult;
  /**
   * 是否合格 KOL(需求 14.12:字段完整 ∧ 非疑似造假)。
   * 疑似造假项被标记但 SHALL NOT 计入「合格 KOL」。
   */
  qualified: boolean;
}

/** 合格 KOL 名单产出结果(需求 14.11/14.12 的量化口径)。 */
export interface QualifiedKolListResult {
  /** 合格 KOL(字段完整且非疑似造假)。 */
  qualified: KolEvaluation[];
  /** 被标记的疑似造假项(标记但不计合格,需求 14.12)。 */
  flaggedSuspect: KolEvaluation[];
  /** 字段不完整(缺可核来源等)被排除项。 */
  incomplete: KolEvaluation[];
  /** 合格 KOL 条数(计费口径之一,需求 14.15)。 */
  qualifiedCount: number;
  /** 去重剔除的重复条数(需求 14.12 按唯一标识去重)。 */
  duplicatesRemoved: number;
}

/** 必备字段清单(需求 14.11)。 */
const KOL_REQUIRED_FIELDS: KolRequiredField[] = [
  'handle',
  'followerCount',
  'avgEngagementRate30d',
  'relevanceTags',
  'sourceUrl',
];

/**
 * 归一化唯一标识(去重键,需求 14.12)。
 * = `platform:handle`,均小写并去首尾空白、去 handle 前导 @。
 */
export function kolIdentifier(candidate: KolCandidate): string {
  const platform = (candidate.platform ?? '').trim().toLowerCase();
  const handle = (candidate.handle ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
  return `${platform}:${handle}`;
}

/**
 * 按唯一标识去重(需求 14.12)。保留首现条目,统计剔除数量。
 * 空 handle(无唯一标识)条目不可去重 → 原样保留(后续完整性校验会判其不完整)。
 */
export function dedupKolCandidates(candidates: KolCandidate[]): {
  unique: KolCandidate[];
  duplicatesRemoved: number;
} {
  const seen = new Set<string>();
  const unique: KolCandidate[] = [];
  let duplicatesRemoved = 0;

  for (const c of candidates ?? []) {
    const hasHandle = isNonEmptyString(c?.handle);
    const id = kolIdentifier(c);
    if (hasHandle && seen.has(id)) {
      duplicatesRemoved += 1;
      continue;
    }
    if (hasHandle) seen.add(id);
    unique.push(c);
  }

  return { unique, duplicatesRemoved };
}

/** 校验单条 KOL 是否字段完整(需求 14.11)。 */
export function checkKolCompleteness(candidate: KolCandidate): {
  complete: boolean;
  missingFields: KolRequiredField[];
} {
  const missingFields: KolRequiredField[] = [];
  for (const field of KOL_REQUIRED_FIELDS) {
    if (!isFieldPresent(candidate, field)) missingFields.push(field);
  }
  return { complete: missingFields.length === 0, missingFields };
}

/**
 * 产出去重 + 真实性核验的合格 KOL 名单(需求 14.11 + 14.12)。
 *
 * 流程:按唯一标识去重 → 逐条核验完整性 + 真实性 → 分类:
 *   - 合格(qualified):字段完整 ∧ 非疑似造假;
 *   - 疑似造假(flaggedSuspect):字段完整但命中刷粉信号 → 标记不计合格;
 *   - 不完整(incomplete):缺必备字段(如缺可核来源)→ 不计合格。
 */
export function buildQualifiedKolList(
  candidates: KolCandidate[],
  thresholds: AuthenticityThresholds,
): QualifiedKolListResult {
  const { unique, duplicatesRemoved } = dedupKolCandidates(candidates);

  const qualified: KolEvaluation[] = [];
  const flaggedSuspect: KolEvaluation[] = [];
  const incomplete: KolEvaluation[] = [];

  for (const candidate of unique) {
    const { complete, missingFields } = checkKolCompleteness(candidate);
    const authenticity = screenKolAuthenticity(candidate, thresholds);
    const isQualified = complete && !authenticity.suspectedFake;

    const evaluation: KolEvaluation = {
      identifier: kolIdentifier(candidate),
      candidate,
      complete,
      missingFields,
      authenticity,
      qualified: isQualified,
    };

    if (!complete) {
      incomplete.push(evaluation);
    } else if (authenticity.suspectedFake) {
      flaggedSuspect.push(evaluation);
    } else {
      qualified.push(evaluation);
    }
  }

  return {
    qualified,
    flaggedSuspect,
    incomplete,
    qualifiedCount: qualified.length,
    duplicatesRemoved,
  };
}

// ───────────────────────── CRM 量化口径(14.13) ─────────────────────────

/**
 * 外联漏斗阶段(单调递进):
 *   reached(已触达) < replied(已回复) < in_negotiation(洽谈中) < converted(已转化合作)。
 */
export type KolCrmStage =
  | 'reached'
  | 'replied'
  | 'in_negotiation'
  | 'converted';

const STAGE_RANK: Record<KolCrmStage, number> = {
  reached: 0,
  replied: 1,
  in_negotiation: 2,
  converted: 3,
};

/** 单条外联 CRM 记录。 */
export interface OutreachRecord {
  /** 被外联 KOL 的 handle(唯一标识来源,触达数按此去重,需求 14.13)。 */
  handle: string;
  /** 平台。 */
  platform: string;
  /** 当前漏斗阶段。 */
  stage: KolCrmStage;
}

/** CRM 量化指标(需求 14.13)。 */
export interface KolCrmMetrics {
  /** 触达数 = 唯一外联条数(按唯一标识去重)。 */
  reachCount: number;
  /** 回复数 = 阶段 ≥ replied 的唯一条数。 */
  replyCount: number;
  /** 转化合作数 = 进入合作状态(converted)的唯一条数。 */
  conversionCount: number;
  /** 回复率 = 回复数/触达数(百分比,两位小数);触达数为 0 → 「未获取」(不编造)。 */
  replyRatePercent: MetricValue;
  /** 转化率 = 转化合作数/触达数(百分比,两位小数);触达数为 0 → 「未获取」。 */
  conversionRatePercent: MetricValue;
}

/**
 * 由外联记录计算 CRM 量化指标(需求 14.13)。
 *
 * 触达数按唯一标识去重(同一 KOL 多次外联只计一条);保留其最高阶段(漏斗单调)。
 * 回复率/转化率在触达数为 0 时取「未获取」(除数无意义,不报 0% 误导,Property 7)。
 */
export function computeKolCrmMetrics(
  records: OutreachRecord[],
): KolCrmMetrics {
  // 去重并保留最高阶段。
  const byId = new Map<string, KolCrmStage>();
  for (const r of records ?? []) {
    if (!isNonEmptyString(r?.handle)) continue;
    const id = kolIdentifier(r as unknown as KolCandidate);
    const prev = byId.get(id);
    if (prev == null || STAGE_RANK[r.stage] > STAGE_RANK[prev]) {
      byId.set(id, r.stage);
    }
  }

  let reachCount = 0;
  let replyCount = 0;
  let conversionCount = 0;
  for (const stage of byId.values()) {
    reachCount += 1;
    if (STAGE_RANK[stage] >= STAGE_RANK.replied) replyCount += 1;
    if (stage === 'converted') conversionCount += 1;
  }

  const replyRatePercent =
    reachCount === 0 ? NOT_COLLECTED : round2((replyCount / reachCount) * 100);
  const conversionRatePercent =
    reachCount === 0
      ? NOT_COLLECTED
      : round2((conversionCount / reachCount) * 100);

  return {
    reachCount,
    replyCount,
    conversionCount,
    replyRatePercent,
    conversionRatePercent,
  };
}

// ───────────────────────── 谈判人确认门(14.14) ─────────────────────────

/** KOL 协作活动类型。 */
export type KolActivity =
  | 'discovery' // 发现/CRM(🟢)
  | 'crm' // CRM 记录(🟢)
  | 'outreach' // 外联触达(🟡)
  | 'quote' // 报价(🔴)
  | 'commission' // 佣金(🔴)
  | 'sign' // 签约(🔴)
  | 'commitment'; // 对外承诺(🔴)

/**
 * 需求 14.14 的 🔴 人确认活动集合:报价/佣金/签约/对外承诺。
 * 这些活动 agent 仅备料跟踪,SHALL NOT 自动签约 → 必须转人确认。
 */
export const HUMAN_CONFIRMATION_ACTIVITIES: ReadonlySet<KolActivity> = new Set<
  KolActivity
>(['quote', 'commission', 'sign', 'commitment']);

/**
 * 判定某 KOL 协作活动是否必须转 🔴 人确认(需求 14.14)。
 * 报价/佣金/签约/对外承诺 → true(agent 仅备料,不自动签约)。
 */
export function requiresHumanConfirmation(activity: KolActivity): boolean {
  return HUMAN_CONFIRMATION_ACTIVITIES.has(activity);
}

// ───────────────────────── 内部工具 ─────────────────────────

/** 必备字段是否存在(需求 14.11)。 */
function isFieldPresent(
  candidate: KolCandidate,
  field: KolRequiredField,
): boolean {
  switch (field) {
    case 'handle':
    case 'sourceUrl':
      return isNonEmptyString(candidate?.[field]);
    case 'followerCount':
    case 'avgEngagementRate30d':
      return isFiniteNum(candidate?.[field]);
    case 'relevanceTags':
      return (
        Array.isArray(candidate?.relevanceTags) &&
        candidate.relevanceTags.some((t) => isNonEmptyString(t))
      );
    default:
      return false;
  }
}

/** 是否为有限数值(非 null/undefined/NaN/Infinity)。 */
function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 是否为非空字符串(去首尾空白后非空)。 */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** 四舍五入到两位小数(需求 14.13)。 */
function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
