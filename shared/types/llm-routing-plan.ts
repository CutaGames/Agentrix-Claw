import type { CredentialSource, LlmBillingDomain, LlmGatewayErrorCode } from "./llm-model-selection";

export const LLM_ROUTING_PLAN_SCHEMA_VERSION = 1 as const;

export const AUDIENCES = ["internal", "member", "public_api"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const BRAIN_MODES = ["auto", "quality", "economy", "private", "fixed"] as const;
export type BrainMode = (typeof BRAIN_MODES)[number];

export const SUPPLY_CLASSES = [
  "platform_official",
  "platform_oauth_pool",
  "user_byo_api",
  "user_byo_subscription",
  "local_runtime",
  "private_machine_compute",
  "market_compute",
] as const;
export type SupplyClass = (typeof SUPPLY_CLASSES)[number];

export const COMMERCIAL_USE_DECISIONS = [
  "internal_only",
  "member_allowed",
  "public_api_allowed",
] as const;
export type CommercialUseDecision = (typeof COMMERCIAL_USE_DECISIONS)[number];

export interface SupplyGroupPolicyV1 {
  supplyGroupRef: string;
  supplyClass: SupplyClass;
  providerId: string;
  allowedAudiences: Audience[];
  allowedModels?: string[];
  allowedTenants?: string[];
  allowedCohorts?: string[];
  commercialUseDecision: CommercialUseDecision;
  riskAcceptanceRef?: string;
  approvalRef?: string;
  effectiveAt: string;
  expiresAt?: string;
  emergencyDisable: boolean;
  capacityReservation: { member: number; public_api: number; internal: number };
  riskBudget: {
    maxConcurrency: number;
    maxAudienceShare: Partial<Record<Audience, number>>;
    hourlyRateLimit?: number;
    windowWaterlineHigh: number;
    consecutiveFailureThreshold: number;
    role: "canary" | "production";
  };
  policyVersion: string;
}

export interface RoutingTargetV1 {
  selectionId: string;
  providerId: string;
  upstreamModelId: string;
  credentialSource: CredentialSource;
  billingDomain: LlmBillingDomain;
  supplyClass: SupplyClass;
  supplyGroupRef?: string;
  score?: number;
}

export interface RoutingPlanConstraintsV1 {
  maxBudgetCents?: number;
  latencySloMs?: number;
  requiredCapabilities: string[];
  regionPolicy: "any" | `exclude:${string}`;
  privacyPolicy: "standard" | "private";
  allowedSupplyClasses: SupplyClass[];
  allowCrossModelFallback: boolean;
  allowFallbackToOwnCredential: boolean;
  maxSingleRequestShare: number;
}

export interface RoutingPlanV1 {
  schemaVersion: 1;
  requestId: string;
  policyVersion: string;
  audience: Audience;
  brainMode: BrainMode;
  payerRef: string;
  accountableAgentId?: string;
  mandateId?: string;
  requestedSelectionId?: string;
  sessionAffinityKey?: string;
  primaryTarget: RoutingTargetV1;
  fallbackTargets: RoutingTargetV1[];
  finalTarget?: RoutingTargetV1;
  constraints: RoutingPlanConstraintsV1;
  freeze: { sourceFrozen: boolean; modelFrozen: boolean; streamingStarted: boolean };
  reasonCodes: string[];
}

export interface RoutingEvidenceV1 {
  schemaVersion: 1;
  requestId: string;
  policyVersion: string;
  audience: Audience;
  brainMode: BrainMode;
  reasonCodes: string[];
  candidateCount: number;
  rejectedCount: number;
  primarySelectionId: string;
  finalSelectionId?: string;
  scores?: Array<{ selectionId: string; score: number; reasons: string[] }>;
  shadowDiff?: { matched: boolean; legacySource?: string; planSource?: string };
}

export interface BrainProfileV1 {
  schemaVersion: 1;
  mode: BrainMode;
  preferredSelectionId?: string;
  maxSingleRequestShare: number;
  allowUpgrade: boolean;
  allowDowngrade: boolean;
  allowCrossModelFallback: boolean;
  allowFallbackToOwnCredential: boolean;
  privacyPolicy: "standard" | "private";
  allowedSupplyClasses: SupplyClass[];
  policyVersion: string;
}

export const DEFAULT_BRAIN_PROFILES: Record<BrainMode, Omit<BrainProfileV1, "policyVersion" | "preferredSelectionId">> = {
  auto: {
    schemaVersion: 1,
    mode: "auto",
    maxSingleRequestShare: 0.02,
    allowUpgrade: true,
    allowDowngrade: true,
    allowCrossModelFallback: true,
    allowFallbackToOwnCredential: false,
    privacyPolicy: "standard",
    allowedSupplyClasses: [
      "platform_official",
      "platform_oauth_pool",
      "user_byo_api",
      "user_byo_subscription",
      "local_runtime",
    ],
  },
  quality: {
    schemaVersion: 1,
    mode: "quality",
    maxSingleRequestShare: 0.05,
    allowUpgrade: true,
    allowDowngrade: false,
    allowCrossModelFallback: true,
    allowFallbackToOwnCredential: false,
    privacyPolicy: "standard",
    allowedSupplyClasses: [
      "platform_official",
      "platform_oauth_pool",
      "user_byo_api",
      "user_byo_subscription",
    ],
  },
  economy: {
    schemaVersion: 1,
    mode: "economy",
    maxSingleRequestShare: 0.01,
    allowUpgrade: false,
    allowDowngrade: true,
    allowCrossModelFallback: true,
    allowFallbackToOwnCredential: false,
    privacyPolicy: "standard",
    allowedSupplyClasses: [
      "platform_official",
      "platform_oauth_pool",
      "user_byo_api",
      "user_byo_subscription",
      "local_runtime",
    ],
  },
  private: {
    schemaVersion: 1,
    mode: "private",
    maxSingleRequestShare: 0.02,
    allowUpgrade: false,
    allowDowngrade: false,
    allowCrossModelFallback: false,
    allowFallbackToOwnCredential: true,
    privacyPolicy: "private",
    allowedSupplyClasses: ["local_runtime", "private_machine_compute"],
  },
  fixed: {
    schemaVersion: 1,
    mode: "fixed",
    maxSingleRequestShare: 0.02,
    allowUpgrade: false,
    allowDowngrade: false,
    allowCrossModelFallback: false,
    allowFallbackToOwnCredential: false,
    privacyPolicy: "standard",
    allowedSupplyClasses: [
      "platform_official",
      "platform_oauth_pool",
      "user_byo_api",
      "user_byo_subscription",
      "local_runtime",
    ],
  },
};

export const DEFAULT_CAPACITY_RESERVATION = {
  member: 60,
  public_api: 30,
  internal: 10,
} as const;

export function isAudience(value: unknown): value is Audience {
  return typeof value === "string" && (AUDIENCES as readonly string[]).includes(value);
}

export function isBrainMode(value: unknown): value is BrainMode {
  return typeof value === "string" && (BRAIN_MODES as readonly string[]).includes(value);
}

export function isSupplyClass(value: unknown): value is SupplyClass {
  return typeof value === "string" && (SUPPLY_CLASSES as readonly string[]).includes(value);
}

export function audienceAllowsPolicy(audience: Audience, policy: Pick<SupplyGroupPolicyV1, "allowedAudiences" | "emergencyDisable" | "commercialUseDecision">): boolean {
  if (policy.emergencyDisable) return false;
  if (!policy.allowedAudiences.includes(audience)) return false;
  if (audience === "public_api") return policy.commercialUseDecision === "public_api_allowed";
  if (audience === "member") {
    return policy.commercialUseDecision === "member_allowed"
      || policy.commercialUseDecision === "public_api_allowed";
  }
  return true;
}

export function typedUnavailableForSupplyClass(supplyClass: SupplyClass): LlmGatewayErrorCode {
  if (supplyClass === "private_machine_compute" || supplyClass === "market_compute") {
    return "SUPPLY_UNAVAILABLE";
  }
  return "ROUTING_PLAN_EMPTY";
}
