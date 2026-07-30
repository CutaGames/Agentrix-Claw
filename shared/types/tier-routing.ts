/**
 * Agentrix Tier Routing — Shared Types
 *
 * 三档路由（端侧 / 智能 / 云端）的统一信号。
 *
 * 设计原则：
 * - 用户在 UI 顶部显式选择 tier；不再隐式从 model id 反推
 * - `smart` 档由后端 LlmRouter 根据 prompt 复杂度选具体模型，对用户透明
 * - `local` 档不可用时**不静默 fallback**，由前端弹窗让用户决定是否升级
 * - tier 选择直接影响：可用 tool 集合（Computer Use 仅 ≥ smart）、
 *   隐私 scope、计费、延迟预期
 */

/**
 * 用户层 Tier 偏好。
 *
 * - `local`  端侧：模型在用户设备本地运行（Gemma Nano 2B 等），数据不离开本机
 * - `smart`  智能：后端 LlmRouter 按复杂度自动选最性价比模型（默认值）
 * - `cloud`  云端：始终走云端高能力模型（Claude Haiku/Sonnet/Opus 等）
 */
export type TierPreference = 'local' | 'smart' | 'cloud';

/** Smart 档内部分类（与 backend LlmRouter TaskTier 对齐）。 */
export type TaskTierLabel = 'local' | 'light' | 'medium' | 'heavy' | 'ultra';

/** 数据流向隐私范围。 */
export type PrivacyScope = 'device-only' | 'network';

/**
 * 一次会话/请求的 Tier 决策结果，由后端 tier-resolver 产出，
 * 通过 SSE 头部或首条事件透传给前端用于展示 micro-copy。
 */
export interface TierDecision {
  /** 用户原始选择 */
  requestedTier: TierPreference;
  /** Smart 档分类结果；非 smart 档 = requestedTier */
  classifiedTier: TaskTierLabel;
  /** 最终落到的具体 model id */
  chosenModel: string;
  /** 决策原因（人类可读） */
  reason: string;
  /** 估算成本（USD） */
  estimatedCostUsd?: number;
  /** 估算首 token 延迟（ms） */
  estimatedLatencyMs?: number;
  /** 数据流向 */
  privacyScope: PrivacyScope;
}

/**
 * 端侧不可用时的结构化错误。
 * 后端不静默 fallback 到云端，由前端决定如何引导用户。
 */
export interface LocalUnavailableReason {
  code:
    | 'model_not_downloaded'
    | 'device_unsupported'
    | 'context_too_long'
    | 'tool_required'        // 任务依赖 Computer Use / 网络工具，端侧无法完成
    | 'multimodal_required'
    | 'timeout';
  /** 人类可读说明 */
  message: string;
  /** 建议升级到的 tier */
  suggestedTier: 'smart' | 'cloud';
  /** 建议升级到的具体 model id */
  suggestedModel?: string;
}

/** 默认 tier — UI 与后端共享同一个常量。 */
export const DEFAULT_TIER: TierPreference = 'smart';

/** 三档可读标签（i18n 在前端做，这里只给英文 fallback）。 */
export const TIER_LABEL_FALLBACK: Record<TierPreference, string> = {
  local: 'Local',
  smart: 'Smart',
  cloud: 'Cloud',
};
