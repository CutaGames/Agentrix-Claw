/**
 * 世界获客引擎 · 发布前「质量门」契约（跨端单一来源）。
 *
 * 背景（SSOT: docs/agentrix-positioning-2026-07.zh-CN.md §5 成败前提①）:
 *   发布管线原有的是「审核门」(ModerationService: 版权/违禁词/中国区) —— 管"违不违规"。
 *   本契约定义的是「质量门」—— 管"够不够好 / 可不可用 / 能不能被人和 Agent 消费"。
 *   首发创作类型收敛为两类，做到惊艳后再放开；未过质量门不进发现面/Feed。
 *
 * 设计:与 scan-quality-gate 的可替换判据(SCAN_QUALITY_CRITERION)同构 ——
 *   规则判据先行(确定性、可单测、零成本)，后续可整体替换/叠加 LLM 美学-连贯性打分，
 *   而发布管线接入层不改。
 *
 * 命名 camelCase，遵循全局 SnakeNamingStrategy(若落库)。
 */

/**
 * 质量维度:
 *  - structure: 场景/内容最小完整度（实体数、场景 meta 等）。
 *  - commerce:  可交易性（可下单店铺/场所首发类型:至少 1 个有效可下单 offering）。
 *  - visual:    预览物为真实产物（非占位兜底 URL）。
 *  - machine:   机器面（Agent 可调用):能力清单可派生且工具/schema 完整。
 *  - coherence: 标题/摘要与内容基本一致、非空。
 */
export type CreationQualityDimension =
  | 'structure'
  | 'commerce'
  | 'visual'
  | 'machine'
  | 'coherence';

/** 单条判据结果（一个维度一条）。 */
export interface CreationQualityCriterionResult {
  /** 所属质量维度。 */
  dimension: CreationQualityDimension;
  /** 是否通过。 */
  pass: boolean;
  /** 该维度归一化评分 0..1（可空;规则判据可只给 pass/fail）。 */
  score?: number;
  /**
   * 未过原因（面向创作者可读、可行动）。pass=true 时为空数组。
   */
  reasons: string[];
}

/** 质量门综合结果。 */
export interface CreationQualityResult {
  /** 综合是否通过（所有必过维度均 pass）。 */
  pass: boolean;
  /** 综合评分 0..1（各维度均值或加权;规则判据可为通过维度占比）。 */
  overallScore: number;
  /** 未过的维度明细（供创作者修正）。 */
  failed: CreationQualityCriterionResult[];
  /** 已过的维度明细。 */
  passed: CreationQualityCriterionResult[];
}

/**
 * 质量判据入参 —— 仅取判定所需的最小字段，不依赖具体实体，便于纯逻辑单测。
 * `ecsWorld` / `manifestToolCount` 由发布管线在派生 offerings/manifest 后一并传入，
 * 避免二次派生。
 */
export interface CreationQualityInput {
  /** Creation id（仅用于日志/记录）。 */
  creationId: string;
  /** 创作类型（决定套用哪套 rubric）。 */
  type: import('./creation').CreationType;
  /** 标题。 */
  title?: string | null;
  /** 摘要。 */
  summary?: string | null;
  /** 预览物（发布管线解析后的最终预览:显式 > 既有 > 占位）。 */
  preview?: import('./creation').CreationPreview | null;
  /** 派生后的 offerings。 */
  offerings: import('./creation').Offering[];
  /** 已派生能力清单的工具数（机器面完整度信号）。 */
  manifestToolCount: number;
  /** ECS 场景实体数（结构完整度信号;纯地理创作可为 0）。 */
  ecsEntityCount?: number;
  /** 预览是否为占位兜底（true = 未产出真实预览物）。 */
  previewIsPlaceholder?: boolean;
}

/**
 * 可替换的质量判据钩子契约。默认实现为规则判据；后续可在模块层整体替换为
 * LLM 美学/连贯性判据而接入层不变（与 SCAN_QUALITY_CRITERION 同构）。
 */
export interface CreationQualityCriterion {
  evaluate(input: CreationQualityInput): CreationQualityResult;
}
