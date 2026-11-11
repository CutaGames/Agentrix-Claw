import {
  AGENTRIX_POOL_PROVIDER_ID,
  type CredentialSource,
  type LlmModelBillingType,
  type ModelAvailability,
  type ModelSelection,
} from "./llm-model-selection";

/**
 * Presentation helpers shared by Web, Desktop, Mobile, and Agent Builder.
 *
 * These exist so every surface labels source and billing identically. The
 * grouping helper deliberately groups *for display only* and keeps both
 * selections intact: collapsing "same model, two sources" into one row is what
 * previously hid the fact that one option spends the user's own key and the other
 * spends their Agentrix budget.
 */

export interface ModelSourceBadge {
  /** Stable key for styling/tests. */
  key: CredentialSource;
  labelEn: string;
  labelZh: string;
  /** Who pays. */
  billingEn: string;
  billingZh: string;
}

const SOURCE_BADGES: Readonly<Record<CredentialSource, ModelSourceBadge>> = Object.freeze({
  byo: {
    key: "byo",
    labelEn: "Your key",
    labelZh: "自带 Key",
    billingEn: "Billed by your provider",
    billingZh: "由你的厂商账单结算",
  },
  pool: {
    key: "pool",
    labelEn: "Agentrix capacity",
    labelZh: "Agentrix 平台额度",
    billingEn: "Uses your Agentrix subscription budget",
    billingZh: "消耗你的 Agentrix 订阅预算",
  },
  "platform-env": {
    key: "platform-env",
    labelEn: "Agentrix default",
    labelZh: "Agentrix 默认",
    billingEn: "Uses your Agentrix subscription budget",
    billingZh: "消耗你的 Agentrix 订阅预算",
  },
  "platform-claude": {
    key: "platform-claude",
    labelEn: "Agentrix default",
    labelZh: "Agentrix 默认",
    billingEn: "Uses your Agentrix subscription budget",
    billingZh: "消耗你的 Agentrix 订阅预算",
  },
});

export function sourceBadgeOf(selection: ModelSelection): ModelSourceBadge {
  return SOURCE_BADGES[selection.credentialSource] ?? SOURCE_BADGES["platform-env"];
}

export function billingLabelOf(billingType: LlmModelBillingType, locale: "en" | "zh" = "en"): string {
  if (billingType === "api-key") return locale === "zh" ? "按 Key 计费" : "API key";
  if (billingType === "subscription") return locale === "zh" ? "订阅额度" : "Subscription";
  return locale === "zh" ? "平台额度" : "Platform";
}

/** Whether a selector should allow clicking this entry. */
export function isSelectableSelection(selection: ModelSelection): boolean {
  return selection.availability === "available" || selection.availability === "degraded";
}

/** Short, safe reason text for a disabled entry. */
export function unavailableHintOf(selection: ModelSelection, locale: "en" | "zh" = "en"): string | undefined {
  if (isSelectableSelection(selection)) return undefined;
  if (selection.availability === "disabled" && selection.requiresAuth) {
    return locale === "zh" ? "登录后可用" : "Available after sign-in";
  }
  switch (selection.availabilityReason) {
    case "POOL_NO_DISPATCHABLE_ACCOUNT":
      return locale === "zh" ? "平台容量暂时不可用" : "Platform capacity unavailable";
    case "POOL_DISABLED":
      return locale === "zh" ? "平台额度已关闭" : "Platform capacity disabled";
    case "POOL_MODEL_UNSUPPORTED":
      return locale === "zh" ? "该来源不支持此模型" : "Not supported by this source";
    case "POOL_ACCOUNT_EXPIRED":
      return locale === "zh" ? "平台凭据已过期" : "Platform credential expired";
    case "POOL_RATE_LIMITED":
      return locale === "zh" ? "被限流，请稍后重试" : "Rate limited, retry shortly";
    default:
      return locale === "zh" ? "暂不可用" : "Currently unavailable";
  }
}

export interface ModelSelectionGroup {
  modelId: string;
  label: string;
  /** Every source that exposes this model. Never truncated to one. */
  options: ModelSelection[];
  /** True when the same model is reachable through more than one billing domain. */
  hasMultipleBillingDomains: boolean;
}

/**
 * Groups selections by `modelId` for display while preserving every option.
 *
 * Order of groups follows the incoming order of their first option, so the
 * server-side canonical ordering is not reshuffled on the client.
 */
export function groupSelectionsByModel(selections: ModelSelection[]): ModelSelectionGroup[] {
  const groups = new Map<string, ModelSelectionGroup>();
  for (const selection of selections) {
    let group = groups.get(selection.modelId);
    if (!group) {
      group = {
        modelId: selection.modelId,
        label: selection.label,
        options: [],
        hasMultipleBillingDomains: false,
      };
      groups.set(selection.modelId, group);
    }
    group.options.push(selection);
    const domains = new Set(
      group.options.map((option) => (option.credentialSource === "byo" ? "byo" : "platform")),
    );
    group.hasMultipleBillingDomains = domains.size > 1;
  }
  return [...groups.values()];
}

/** True when this selection spends Agentrix budget rather than the user's key. */
export function spendsPlatformBudget(selection: ModelSelection): boolean {
  return selection.credentialSource !== "byo";
}

/** Convenience flag for surfaces that badge pool entries distinctly. */
export function isPoolSelection(selection: ModelSelection): boolean {
  return selection.providerId === AGENTRIX_POOL_PROVIDER_ID;
}

/** Availability ordering used by clients that re-sort locally. */
export const CLIENT_AVAILABILITY_ORDER: readonly ModelAvailability[] = [
  "available",
  "degraded",
  "unavailable",
  "disabled",
];
