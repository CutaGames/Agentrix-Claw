import {
  computeSentimentMetrics,
  type SentimentMetrics,
  type SentimentSample,
  type TopicCount,
} from './community-sentiment';
import { isNotCollected, NOT_COLLECTED, type MetricValue } from './growth-metrics';

/**
 * FUD / 情绪监控与响应草稿(贯穿层,crypto-native-agent-ops 任务 20 / 需求 15.3)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - 需求 15.3:THE 系统 SHALL 提供 FUD/情绪监控与响应草稿。
 *
 * 与任务 19.5 `community-sentiment.ts` 的关系:
 *   - 19.5 产出**社区情绪日报**(响应时间 / 清理量 / 情绪占比 + 主要话题)。
 *   - 任务 20 在其情绪口径(`computeSentimentMetrics`)之上,加一层**FUD 研判**:
 *     依据负面占比与 FUD 焦点话题判定 FUD 等级,并生成**只读响应草稿**。
 *
 * 纯数据/算法,不含 I/O。
 *
 * **边界(需求 15.3,硬约束):**
 *   - 本模块仅产出**只读草稿**:研判 FUD 等级 + 起草响应文案,供人审阅。
 *   - **绝不自动发布**:发布响应为对外发布写动作,SHALL 经分级审批(交付包 `write_action`
 *     → high → 人确认),{@link responsePublishRequiresApproval} 恒为 true。
 *   - 无样本时 FUD 等级取 `unknown`、不出响应建议(Property 7「不编造数据」)。
 */

// ───────────────────────── FUD 研判(15.3) ─────────────────────────

/** FUD 等级。 */
export type FudLevel = 'low' | 'elevated' | 'high' | 'unknown';

/** FUD 研判阈值(由项目方按社区基线设定)。 */
export interface FudThresholds {
  /** 负面占比(%)≥ 此值 → elevated。 */
  elevatedNegativeRatioPercent: number;
  /** 负面占比(%)≥ 此值 → high。 */
  highNegativeRatioPercent: number;
  /** 计入研判的最小样本数;不足 → `unknown`(不编造)。 */
  minSampleSize: number;
}

/** 默认 FUD 阈值(保守基线;项目方可覆盖)。 */
export const DEFAULT_FUD_THRESHOLDS: FudThresholds = {
  elevatedNegativeRatioPercent: 30,
  highNegativeRatioPercent: 50,
  minSampleSize: 5,
};

/** FUD 研判结果(需求 15.3)。 */
export interface FudAssessment {
  /** FUD 等级。 */
  level: FudLevel;
  /** 负面占比(%,两位小数);样本不足 → 「未获取」。 */
  negativeRatioPercent: MetricValue;
  /** 计入研判的样本数。 */
  sampleSize: number;
  /** FUD 焦点话题(负面样本聚合的主要话题,降序;判定依据)。 */
  fudTopics: TopicCount[];
  /** 全量情绪口径(正/中/负占比 + 主要话题,复用 19.5)。 */
  sentiment: SentimentMetrics;
  /** 是否建议响应(elevated / high 时建议,unknown / low 不建议)。 */
  responseRecommended: boolean;
}

/**
 * 研判 FUD 等级(需求 15.3)。
 *
 * - 样本数 < `minSampleSize` → `unknown`,负面占比取「未获取」,不建议响应(不编造)。
 * - 否则按负面占比映射:≥ high 阈值 → `high`;≥ elevated 阈值 → `elevated`;否则 `low`。
 * - FUD 焦点话题 = **仅负面样本**聚合出的主要话题(判定依据)。
 *
 * 单调性:固定其它输入,负面占比越高,FUD 等级不降(low → elevated → high)。
 */
export function assessFud(
  samples: SentimentSample[],
  thresholds: FudThresholds = DEFAULT_FUD_THRESHOLDS,
  topicLimit?: number,
): FudAssessment {
  const list = Array.isArray(samples) ? samples : [];
  const sentiment = computeSentimentMetrics(list, topicLimit);

  // FUD 焦点话题:仅取负面样本的话题聚合(判定依据)。
  const negativeOnly = list.filter((s) => s?.polarity === 'negative');
  const fudTopics = computeSentimentMetrics(negativeOnly, topicLimit).mainTopics;

  const sampleSize = sentiment.total;

  if (sampleSize < Math.max(0, Math.floor(thresholds.minSampleSize))) {
    return {
      level: 'unknown',
      negativeRatioPercent: NOT_COLLECTED,
      sampleSize,
      fudTopics,
      sentiment,
      responseRecommended: false,
    };
  }

  const neg = sentiment.negativeRatioPercent;
  // total>=minSampleSize>0 ⇒ computeSentimentMetrics 已给出数值占比;防御性兜底。
  const negValue = isNotCollected(neg) ? 0 : neg;

  let level: FudLevel = 'low';
  if (negValue >= thresholds.highNegativeRatioPercent) {
    level = 'high';
  } else if (negValue >= thresholds.elevatedNegativeRatioPercent) {
    level = 'elevated';
  }

  return {
    level,
    negativeRatioPercent: neg,
    sampleSize,
    fudTopics,
    sentiment,
    responseRecommended: level === 'elevated' || level === 'high',
  };
}

// ───────────────────────── 响应草稿(15.3) ─────────────────────────

/** FUD 响应草稿(只读;发布需经分级审批)。 */
export interface FudResponseDraft {
  /** 对应的 FUD 等级。 */
  level: FudLevel;
  /** 是否建议响应(= assessment.responseRecommended)。 */
  responseRecommended: boolean;
  /** 草稿正文(只读;空字符串表示无需/无依据起草)。 */
  draft: string;
  /** 草稿针对的 FUD 焦点话题(判定依据回链)。 */
  addressedTopics: string[];
  /**
   * 发布响应草稿恒需经分级审批(对外发布写动作 → high → 人确认,需求 15.3)。
   * 本模块仅起草,**绝不自动发布**。
   */
  publishRequiresApproval: true;
}

/** 起草响应草稿的可选项目信息。 */
export interface FudResponseDraftOptions {
  /** 项目名(用于称呼;缺省用占位)。 */
  projectName?: string;
  /** 「主要话题」回应取前 N 个,默认 3。 */
  topicLimit?: number;
}

/**
 * 生成 FUD 响应草稿(需求 15.3)。
 *
 * - 仅当 `responseRecommended`(elevated / high)时产出非空草稿;否则返回空草稿
 *   (level=low/unknown 不无端发声,避免无依据回应)。
 * - 草稿为**只读建议文案**,引用 FUD 焦点话题,不含价格承诺/收益保证类内容
 *   (这类内容由发布环节的红线检测兜底)。
 * - **绝不自动发布**:`publishRequiresApproval` 恒为 true。
 */
export function buildFudResponseDraft(
  assessment: FudAssessment,
  options: FudResponseDraftOptions = {},
): FudResponseDraft {
  const topicLimit = Math.max(1, Math.floor(options.topicLimit ?? 3));
  const addressedTopics = assessment.fudTopics
    .slice(0, topicLimit)
    .map((t) => t.topic);

  if (!assessment.responseRecommended) {
    return {
      level: assessment.level,
      responseRecommended: false,
      draft: '',
      addressedTopics: [],
      publishRequiresApproval: true,
    };
  }

  const project = (options.projectName ?? '').trim() || '团队';
  const focus =
    addressedTopics.length > 0
      ? `针对社区关注的「${addressedTopics.join('、')}」`
      : '针对近期社区关注的问题';
  const urgency = assessment.level === 'high' ? '我们高度重视' : '我们已注意到';

  const draft = [
    `${urgency}近期社区情绪波动。${focus},${project}在此说明:`,
    '1. 事实澄清:我们将基于可核事实逐条回应,不回避问题;',
    '2. 进展同步:相关工作的当前状态与下一步计划将同步公开;',
    '3. 沟通渠道:欢迎在官方渠道提出具体疑问,我们会持续更新。',
    '(本文为待审阅草稿,发布前需人工确认。)',
  ].join('\n');

  return {
    level: assessment.level,
    responseRecommended: true,
    draft,
    addressedTopics,
    publishRequiresApproval: true,
  };
}

/**
 * 发布 FUD 响应草稿恒需经分级审批(需求 15.3)。
 * 本模块仅监控 + 起草,绝不自动对外发布。
 */
export const responsePublishRequiresApproval = true as const;

// re-export 便于消费方判空 / 复用类型。
export { NOT_COLLECTED, isNotCollected } from './growth-metrics';
export type { MetricValue } from './growth-metrics';
export type { SentimentSample, SentimentMetrics, TopicCount } from './community-sentiment';
