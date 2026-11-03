/**
 * Developer Economy V1 wire contracts.
 *
 * Additive fulfilment/mapping contracts only. This module does not create a
 * second marketplace, ledger, order book, or receipt writer. Discovery, quote,
 * mandate, payment, settlement, and receipts stay with Agent Economy /
 * SubscriptionService owners.
 *
 * Payment success is never entitlement activation. family_seats is quota
 * metadata, not a per-user seat. BYO credentials have no wire field.
 */

import { isRecordRefV1 } from "./agent-attribution";
import {
  DISCOVERABLE_KINDS_V1,
  type DiscoverableKindV1,
} from "./agent-economy";
import type { DigestRef, Money, RecordRef } from "./trust-loop-primitives";

export const DEVELOPER_ECONOMY_SCHEMA_VERSION = 1 as const;
export const DEVELOPER_ECONOMY_CANONICALIZATION = "jcs/1" as const;

export const DEVELOPER_ECONOMY_DISCOVERY_KINDS_V1 = DISCOVERABLE_KINDS_V1;
export type DeveloperEconomyDiscoveryKindV1 = DiscoverableKindV1;

export const DEVELOPER_OFFERING_CLASSES_V1 = [
  "ide_subscription",
  "team_seat",
  "api_credits",
  "connector",
  "mcp",
  "template",
  "consulting",
  "review",
  "delivery",
  "coding_runtime",
  "specialist_agent",
] as const;
export type DeveloperOfferingClassV1 =
  (typeof DEVELOPER_OFFERING_CLASSES_V1)[number];

export const DEVELOPER_OFFERING_KIND_MAP_V1: Record<
  DeveloperOfferingClassV1,
  readonly DeveloperEconomyDiscoveryKindV1[]
> = {
  ide_subscription: ["product", "resource"],
  team_seat: ["product", "resource"],
  api_credits: ["product", "resource"],
  connector: ["skill", "product"],
  mcp: ["skill", "product"],
  template: ["skill", "product"],
  consulting: ["service", "task"],
  review: ["service", "task"],
  delivery: ["service", "task"],
  coding_runtime: ["agent"],
  specialist_agent: ["agent"],
};

export const DEVELOPER_COMMERCIAL_MODES_V1 = [
  "byo_subscription",
  "platform_subscription",
  "authorized_referral",
  "authorized_reseller",
  "team_seat",
  "vendor_approved_family_credit",
  "api_credit",
  "metered_usage",
  "service",
] as const;
export type DeveloperCommercialModeV1 =
  (typeof DEVELOPER_COMMERCIAL_MODES_V1)[number];

export const DEVELOPER_ENTITLEMENT_KINDS_V1 = [
  "byo",
  "subscription",
  "team_seat",
  "api_credit",
  "service",
] as const;
export type DeveloperEntitlementKindV1 =
  (typeof DEVELOPER_ENTITLEMENT_KINDS_V1)[number];

export const DEVELOPER_PAYMENT_STATES_V1 = [
  "not_started",
  "pending",
  "succeeded",
  "failed",
  "unknown",
] as const;
export type DeveloperPaymentStateV1 =
  (typeof DEVELOPER_PAYMENT_STATES_V1)[number];

export const DEVELOPER_PROVISIONING_STATES_V1 = [
  "not_started",
  "provision_pending",
  "provisioned",
  "recoverable_failed",
  "cancelled",
  "unknown",
] as const;
export type DeveloperProvisioningStateV1 =
  (typeof DEVELOPER_PROVISIONING_STATES_V1)[number];

export const DEVELOPER_ENTITLEMENT_STATES_V1 = [
  "quoted",
  "ordered",
  "provision_pending",
  "active",
  "suspended",
  "renewal_due",
  "cancelled",
  "expired",
  "refund_pending",
  "refunded",
  "unknown",
] as const;
export type DeveloperEntitlementStateV1 =
  (typeof DEVELOPER_ENTITLEMENT_STATES_V1)[number];

export const DEVELOPER_RENEWAL_STATES_V1 = [
  "not_applicable",
  "current",
  "due",
  "blocked_fresh_approval",
  "lapsed",
  "unknown",
] as const;
export type DeveloperRenewalStateV1 =
  (typeof DEVELOPER_RENEWAL_STATES_V1)[number];

export const DEVELOPER_REFUND_STATES_V1 = [
  "none",
  "refund_pending",
  "refunded",
  "rejected",
  "unknown",
] as const;
export type DeveloperRefundStateV1 =
  (typeof DEVELOPER_REFUND_STATES_V1)[number];

export const DEVELOPER_DISPUTE_STATES_V1 = [
  "none",
  "open",
  "under_review",
  "resolved",
  "unknown",
] as const;
export type DeveloperDisputeStateV1 =
  (typeof DEVELOPER_DISPUTE_STATES_V1)[number];

export const DEVELOPER_ECONOMY_ENVIRONMENTS_V1 = [
  "live",
  "test",
  "sandbox",
] as const;
export type DeveloperEconomyEnvironmentV1 =
  (typeof DEVELOPER_ECONOMY_ENVIRONMENTS_V1)[number];

export const DEVELOPER_CREDENTIAL_PLACEMENTS_V1 = [
  "desktop_os_secure_storage",
  "none",
] as const;
export type DeveloperCredentialPlacementV1 =
  (typeof DEVELOPER_CREDENTIAL_PLACEMENTS_V1)[number];

export const DEVELOPER_RESELLER_AUTHORIZATIONS_V1 = [
  "unsupported",
  "vendor_written_and_api",
] as const;
export type DeveloperResellerAuthorizationV1 =
  (typeof DEVELOPER_RESELLER_AUTHORIZATIONS_V1)[number];

export const DEVELOPER_SELLER_TERMS_STATES_V1 = [
  "missing",
  "draft",
  "accepted",
  "expired",
] as const;
export type DeveloperSellerTermsStateV1 =
  (typeof DEVELOPER_SELLER_TERMS_STATES_V1)[number];

export const DEVELOPER_SELLER_REVIEW_STATES_V1 = [
  "unreviewed",
  "reviewing",
  "passed",
  "failed",
] as const;
export type DeveloperSellerReviewStateV1 =
  (typeof DEVELOPER_SELLER_REVIEW_STATES_V1)[number];

export const DEVELOPER_BYO_LIFECYCLE_STATES_V1 = [
  "connected",
  "revoked",
  "logged_out",
  "unknown",
] as const;
export type DeveloperByoLifecycleStateV1 =
  (typeof DEVELOPER_BYO_LIFECYCLE_STATES_V1)[number];

export const DEVELOPER_WEBHOOK_SOURCES_V1 = ["stripe", "iap"] as const;
export type DeveloperWebhookSourceV1 =
  (typeof DEVELOPER_WEBHOOK_SOURCES_V1)[number];

export const DEVELOPER_WEBHOOK_KINDS_V1 = [
  "purchase",
  "renewal",
  "cancellation",
  "lapse",
  "refund",
  "past_due",
  "payment_only",
  "dispute",
] as const;
export type DeveloperWebhookKindV1 =
  (typeof DEVELOPER_WEBHOOK_KINDS_V1)[number];

export const DEVELOPER_QUOTA_METADATA_KEYS_V1 = ["family_seats"] as const;
export type DeveloperQuotaMetadataKeyV1 =
  (typeof DEVELOPER_QUOTA_METADATA_KEYS_V1)[number];

export const DEVELOPER_TRANSFER_POLICIES_V1 = [
  "non_transferable",
  "vendor_approved_reassign",
  "unsupported",
] as const;
export type DeveloperTransferPolicyV1 =
  (typeof DEVELOPER_TRANSFER_POLICIES_V1)[number];

export const DEVELOPER_SEAT_IDENTITY_POLICIES_V1 = [
  "independent_user_binding",
  "unsupported_shared_account",
] as const;
export type DeveloperSeatIdentityPolicyV1 =
  (typeof DEVELOPER_SEAT_IDENTITY_POLICIES_V1)[number];

export interface DeveloperOfferingV1 {
  schemaVersion: typeof DEVELOPER_ECONOMY_SCHEMA_VERSION;
  contractType: "developer_offering";
  offeringId: string;
  offeringClass: DeveloperOfferingClassV1;
  discoveryKind: DeveloperEconomyDiscoveryKindV1;
  commercialMode: DeveloperCommercialModeV1;
  entitlementKind: DeveloperEntitlementKindV1;
  vendorRef: RecordRef;
  productRef: RecordRef;
  termsRef: RecordRef;
  environment: DeveloperEconomyEnvironmentV1;
  regionPolicy: {
    allowedRegions: string[];
    blockedRegions: string[];
  };
  seatIdentityPolicy: DeveloperSeatIdentityPolicyV1;
  transferPolicy: DeveloperTransferPolicyV1;
  credentialPlacement: DeveloperCredentialPlacementV1;
  resellerAuthorization: DeveloperResellerAuthorizationV1;
  termsState: DeveloperSellerTermsStateV1;
  securityState: DeveloperSellerReviewStateV1;
  qualityState: DeveloperSellerReviewStateV1;
  createdAt: string;
}

export interface DeveloperRecurringPurchaseMandateV1 {
  schemaVersion: typeof DEVELOPER_ECONOMY_SCHEMA_VERSION;
  contractType: "developer_recurring_purchase_mandate";
  mandateId: string;
  ownerUserId: string;
  tenantRef: string | null;
  merchantRef: RecordRef;
  offeringRef: RecordRef;
  seatRef?: RecordRef;
  periodCeiling: Money;
  currency: string;
  cadence: "monthly" | "yearly" | "weekly";
  nextChargeAt: string;
  expiresAt: string;
  termsVersion: string;
  cancellationPath: string;
  status: "active" | "revoked" | "expired" | "superseded";
  issuedAt: string;
  revokedAt?: string;
}

export interface DeveloperEntitlementPlanesV1 {
  payment: DeveloperPaymentStateV1;
  provisioning: DeveloperProvisioningStateV1;
  entitlement: DeveloperEntitlementStateV1;
  renewal: DeveloperRenewalStateV1;
  refund: DeveloperRefundStateV1;
  dispute: DeveloperDisputeStateV1;
}

export interface DeveloperEntitlementV1 {
  schemaVersion: typeof DEVELOPER_ECONOMY_SCHEMA_VERSION;
  contractType: "developer_entitlement";
  entitlementId: string;
  ownerUserId: string;
  tenantRef: string | null;
  offeringRef: RecordRef;
  entitlementKind: DeveloperEntitlementKindV1;
  environment: DeveloperEconomyEnvironmentV1;
  planes: DeveloperEntitlementPlanesV1;
  discoveryItemRef?: RecordRef;
  quoteRef?: RecordRef;
  mandateRef?: RecordRef;
  paymentAttemptRef?: RecordRef;
  settlementEventRef?: RecordRef;
  receiptRef?: RecordRef;
  subscriptionRef?: RecordRef;
  providerEntitlementRef?: RecordRef;
  createdAt: string;
  updatedAt: string;
}

export interface DeveloperByoUsageProjectionV1 {
  periodStart: string;
  periodEnd: string;
  unitsUsed: number;
  unitsCeiling?: number;
}

export interface DeveloperByoCostProjectionV1 {
  currency: string;
  projectedMinor: string;
  ceilingMinor?: string;
}

export interface DeveloperByoConnectionV1 {
  schemaVersion: typeof DEVELOPER_ECONOMY_SCHEMA_VERSION;
  contractType: "developer_byo_connection";
  connectionId: string;
  ownerUserId: string;
  tenantRef: string | null;
  provider: string;
  adapterCapability: {
    adapterRef: string;
    providerRef: string;
    supportStatus: "supported" | "planned" | "unsupported";
  };
  entitlementRef: RecordRef;
  environment: DeveloperEconomyEnvironmentV1;
  credentialPlacement: "desktop_os_secure_storage";
  lifecycleState: DeveloperByoLifecycleStateV1;
  usageProjection?: DeveloperByoUsageProjectionV1;
  costProjection?: DeveloperByoCostProjectionV1;
  createdAt: string;
  updatedAt: string;
}

export interface DeveloperSeatBindingV1 {
  schemaVersion: typeof DEVELOPER_ECONOMY_SCHEMA_VERSION;
  contractType: "developer_seat_binding";
  seatId: string;
  offeringRef: RecordRef;
  entitlementRef: RecordRef;
  occupantUserId: string;
  environment: DeveloperEconomyEnvironmentV1;
  assignedAt: string;
  reclaimedAt?: string;
}

export interface DeveloperEconomyWebhookEventV1 {
  schemaVersion: typeof DEVELOPER_ECONOMY_SCHEMA_VERSION;
  contractType: "developer_economy_webhook_event";
  source: DeveloperWebhookSourceV1;
  kind: DeveloperWebhookKindV1;
  eventId: string;
  eventAt: string;
  ownerUserId: string;
  tenantRef: string | null;
  productRef: RecordRef;
  environment: DeveloperEconomyEnvironmentV1;
  offeringRef?: RecordRef;
}

export interface DeveloperSellerListingV1 {
  schemaVersion: typeof DEVELOPER_ECONOMY_SCHEMA_VERSION;
  contractType: "developer_seller_listing";
  listingId: string;
  offeringRef: RecordRef;
  sellerUserId: string;
  tenantRef: string | null;
  environment: DeveloperEconomyEnvironmentV1;
  termsState: DeveloperSellerTermsStateV1;
  securityState: DeveloperSellerReviewStateV1;
  qualityState: DeveloperSellerReviewStateV1;
  fulfilmentRef?: RecordRef;
  commissionRef?: RecordRef;
  refundRef?: RecordRef;
  disputeRef?: RecordRef;
  publishedAt?: string;
}

export interface DeveloperEconomyValidationResultV1 {
  valid: boolean;
  errors: string[];
}

export class DeveloperEconomyContractValidationError extends Error {
  readonly code = "developer_economy_contract_invalid";

  constructor(readonly errors: string[]) {
    super(`Developer Economy contract validation failed: ${errors.join("; ")}`);
    this.name = "DeveloperEconomyContractValidationError";
  }
}

const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const REASON_CODE = /^[a-z][a-z0-9_]{1,79}$/;
const CURRENCY = /^[A-Z]{3}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const REGION = /^[A-Z]{2}$/;

const FORBIDDEN_CREDENTIAL_KEYS = [
  "credential",
  "credentials",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "api_key",
  "secret",
  "password",
  "cookie",
  "cookies",
  "authorization",
  "sessionCookie",
  "privateKey",
] as const;

export function commercialModeToEntitlementKind(
  mode: DeveloperCommercialModeV1,
): DeveloperEntitlementKindV1 {
  if (mode === "byo_subscription") return "byo";
  if (mode === "team_seat") return "team_seat";
  if (mode === "api_credit" || mode === "metered_usage") return "api_credit";
  if (mode === "service") return "service";
  return "subscription";
}

export function isFamilySeatsQuotaMetadata(key: string): boolean {
  return key === "family_seats";
}

export function paymentSuccessActivatesEntitlement(
  planes: DeveloperEntitlementPlanesV1,
): boolean {
  return (
    planes.payment === "succeeded" &&
    planes.entitlement === "active" &&
    planes.provisioning !== "provisioned"
  );
}

export function isDisplayableActiveEntitlement(
  planes: DeveloperEntitlementPlanesV1,
): boolean {
  return (
    planes.entitlement === "active" &&
    planes.provisioning === "provisioned" &&
    planes.refund !== "refunded" &&
    planes.refund !== "refund_pending"
  );
}

function validation(errors: string[]): DeveloperEconomyValidationResultV1 {
  return { valid: errors.length === 0, errors };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectValue(
  value: unknown,
  path: string,
  errors: string[],
): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected plain object`);
    return undefined;
  }
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
  errors: string[],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}: unknown field`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      errors.push(`${path}.${key}: required`);
    }
  }
  for (const key of optional) {
    if (
      Object.prototype.hasOwnProperty.call(value, key) &&
      value[key] === null
    ) {
      errors.push(`${path}.${key}: null does not represent absence`);
    }
  }
}

function schema(
  value: Record<string, unknown>,
  contractType: string,
  path: string,
  errors: string[],
): void {
  if (value.schemaVersion !== DEVELOPER_ECONOMY_SCHEMA_VERSION) {
    errors.push(
      `${path}.schemaVersion: unsupported version ${JSON.stringify(value.schemaVersion)}`,
    );
  }
  if (value.contractType !== contractType) {
    errors.push(`${path}.contractType: expected ${contractType}`);
  }
}

function boundedString(
  value: unknown,
  path: string,
  errors: string[],
  maxLength = 128,
): value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    CONTROL_CHARACTERS.test(value)
  ) {
    errors.push(`${path}: invalid string`);
    return false;
  }
  return true;
}

function opaqueRef(
  value: unknown,
  path: string,
  errors: string[],
): value is string {
  if (!boundedString(value, path, errors)) return false;
  if (!OPAQUE_REF.test(value)) {
    errors.push(`${path}: invalid opaque ref`);
    return false;
  }
  return true;
}

function timestamp(
  value: unknown,
  path: string,
  errors: string[],
): value is string {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP.test(value)) {
    errors.push(`${path}: invalid timestamp`);
    return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    errors.push(`${path}: invalid timestamp`);
    return false;
  }
  return true;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  errors: string[],
): value is T {
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    errors.push(`${path}: unknown enum ${JSON.stringify(value)}`);
    return false;
  }
  return true;
}

function recordRef(
  value: unknown,
  path: string,
  errors: string[],
  expectedType?: string,
): value is RecordRef {
  if (!isRecordRefV1(value)) {
    errors.push(`${path}: invalid record ref`);
    return false;
  }
  if (expectedType && value.type !== expectedType) {
    errors.push(`${path}: expected type ${expectedType}`);
    return false;
  }
  return true;
}

function nullableString(
  value: unknown,
  path: string,
  errors: string[],
): value is string | null {
  if (value === null) return true;
  return opaqueRef(value, path, errors);
}

function money(value: unknown, path: string, errors: string[]): value is Money {
  const object = objectValue(value, path, errors);
  if (!object) return false;
  exactKeys(object, ["amountMinor", "currency", "decimals"], [], path, errors);
  if (
    typeof object.amountMinor !== "string" ||
    !/^-?\d+$/.test(object.amountMinor)
  ) {
    errors.push(`${path}.amountMinor: invalid`);
  }
  if (typeof object.currency !== "string" || !CURRENCY.test(object.currency)) {
    errors.push(`${path}.currency: invalid`);
  }
  if (
    typeof object.decimals !== "number" ||
    !Number.isInteger(object.decimals) ||
    object.decimals < 0 ||
    object.decimals > 8
  ) {
    errors.push(`${path}.decimals: invalid`);
  }
  return errors.every((item) => !item.startsWith(`${path}`));
}

function rejectCredentialKeys(
  value: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  for (const key of Object.keys(value)) {
    if (
      (FORBIDDEN_CREDENTIAL_KEYS as readonly string[]).includes(key) ||
      (FORBIDDEN_CREDENTIAL_KEYS as readonly string[]).includes(
        key.toLowerCase(),
      )
    ) {
      errors.push(`${path}.${key}: credential fields are forbidden`);
    }
  }
}

function rejectFamilySeatsAsSeat(
  value: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  if (
    value.occupantUserId === "family_seats" ||
    value.seatIdentity === "family_seats"
  ) {
    errors.push(`${path}: family_seats is quota metadata, not a seat identity`);
  }
}

export function validateDeveloperOfferingV1(
  input: unknown,
): DeveloperEconomyValidationResultV1 {
  const errors: string[] = [];
  const value = objectValue(input, "offering", errors);
  if (!value) return validation(errors);
  rejectCredentialKeys(value, "offering", errors);
  exactKeys(
    value,
    [
      "schemaVersion",
      "contractType",
      "offeringId",
      "offeringClass",
      "discoveryKind",
      "commercialMode",
      "entitlementKind",
      "vendorRef",
      "productRef",
      "termsRef",
      "environment",
      "regionPolicy",
      "seatIdentityPolicy",
      "transferPolicy",
      "credentialPlacement",
      "resellerAuthorization",
      "termsState",
      "securityState",
      "qualityState",
      "createdAt",
    ],
    [],
    "offering",
    errors,
  );
  schema(value, "developer_offering", "offering", errors);
  opaqueRef(value.offeringId, "offering.offeringId", errors);
  const classOk = oneOf(
    value.offeringClass,
    DEVELOPER_OFFERING_CLASSES_V1,
    "offering.offeringClass",
    errors,
  );
  const kindOk = oneOf(
    value.discoveryKind,
    DEVELOPER_ECONOMY_DISCOVERY_KINDS_V1,
    "offering.discoveryKind",
    errors,
  );
  const modeOk = oneOf(
    value.commercialMode,
    DEVELOPER_COMMERCIAL_MODES_V1,
    "offering.commercialMode",
    errors,
  );
  const entitlementOk = oneOf(
    value.entitlementKind,
    DEVELOPER_ENTITLEMENT_KINDS_V1,
    "offering.entitlementKind",
    errors,
  );
  if (classOk && kindOk) {
    const offeringClass = value.offeringClass as DeveloperOfferingClassV1;
    const discoveryKind = value.discoveryKind as DeveloperEconomyDiscoveryKindV1;
    const allowed = DEVELOPER_OFFERING_KIND_MAP_V1[offeringClass];
    if (!allowed.includes(discoveryKind)) {
      errors.push("offering.discoveryKind: incompatible with offeringClass");
    }
  }
  if (modeOk && entitlementOk) {
    const expected = commercialModeToEntitlementKind(
      value.commercialMode as DeveloperCommercialModeV1,
    );
    if (value.entitlementKind !== expected) {
      errors.push("offering.entitlementKind: incompatible with commercialMode");
    }
  }
  recordRef(value.vendorRef, "offering.vendorRef", errors, "provider");
  recordRef(value.productRef, "offering.productRef", errors);
  recordRef(value.termsRef, "offering.termsRef", errors, "terms");
  oneOf(
    value.environment,
    DEVELOPER_ECONOMY_ENVIRONMENTS_V1,
    "offering.environment",
    errors,
  );
  const region = objectValue(
    value.regionPolicy,
    "offering.regionPolicy",
    errors,
  );
  if (region) {
    exactKeys(
      region,
      ["allowedRegions", "blockedRegions"],
      [],
      "offering.regionPolicy",
      errors,
    );
    if (
      !Array.isArray(region.allowedRegions) ||
      !Array.isArray(region.blockedRegions)
    ) {
      errors.push("offering.regionPolicy: regions must be arrays");
    } else {
      for (const [index, item] of region.allowedRegions.entries()) {
        if (typeof item !== "string" || !REGION.test(item)) {
          errors.push(
            `offering.regionPolicy.allowedRegions[${index}]: invalid`,
          );
        }
      }
      for (const [index, item] of region.blockedRegions.entries()) {
        if (typeof item !== "string" || !REGION.test(item)) {
          errors.push(
            `offering.regionPolicy.blockedRegions[${index}]: invalid`,
          );
        }
      }
    }
  }
  oneOf(
    value.seatIdentityPolicy,
    DEVELOPER_SEAT_IDENTITY_POLICIES_V1,
    "offering.seatIdentityPolicy",
    errors,
  );
  if (value.seatIdentityPolicy === "unsupported_shared_account") {
    errors.push("offering.seatIdentityPolicy: shared accounts are forbidden");
  }
  oneOf(
    value.transferPolicy,
    DEVELOPER_TRANSFER_POLICIES_V1,
    "offering.transferPolicy",
    errors,
  );
  const placementOk = oneOf(
    value.credentialPlacement,
    DEVELOPER_CREDENTIAL_PLACEMENTS_V1,
    "offering.credentialPlacement",
    errors,
  );
  if (
    placementOk &&
    value.commercialMode === "byo_subscription" &&
    value.credentialPlacement !== "desktop_os_secure_storage"
  ) {
    errors.push(
      "offering.credentialPlacement: BYO credentials stay on Desktop OS secure storage",
    );
  }
  oneOf(
    value.resellerAuthorization,
    DEVELOPER_RESELLER_AUTHORIZATIONS_V1,
    "offering.resellerAuthorization",
    errors,
  );
  oneOf(
    value.termsState,
    DEVELOPER_SELLER_TERMS_STATES_V1,
    "offering.termsState",
    errors,
  );
  oneOf(
    value.securityState,
    DEVELOPER_SELLER_REVIEW_STATES_V1,
    "offering.securityState",
    errors,
  );
  oneOf(
    value.qualityState,
    DEVELOPER_SELLER_REVIEW_STATES_V1,
    "offering.qualityState",
    errors,
  );
  timestamp(value.createdAt, "offering.createdAt", errors);
  return validation(errors);
}

export function validateDeveloperEntitlementPlanesV1(
  input: unknown,
  path = "planes",
): DeveloperEconomyValidationResultV1 {
  const errors: string[] = [];
  const value = objectValue(input, path, errors);
  if (!value) return validation(errors);
  exactKeys(
    value,
    ["payment", "provisioning", "entitlement", "renewal", "refund", "dispute"],
    [],
    path,
    errors,
  );
  oneOf(value.payment, DEVELOPER_PAYMENT_STATES_V1, `${path}.payment`, errors);
  oneOf(
    value.provisioning,
    DEVELOPER_PROVISIONING_STATES_V1,
    `${path}.provisioning`,
    errors,
  );
  oneOf(
    value.entitlement,
    DEVELOPER_ENTITLEMENT_STATES_V1,
    `${path}.entitlement`,
    errors,
  );
  oneOf(value.renewal, DEVELOPER_RENEWAL_STATES_V1, `${path}.renewal`, errors);
  oneOf(value.refund, DEVELOPER_REFUND_STATES_V1, `${path}.refund`, errors);
  oneOf(value.dispute, DEVELOPER_DISPUTE_STATES_V1, `${path}.dispute`, errors);
  if (errors.length === 0) {
    const planes = value as unknown as DeveloperEntitlementPlanesV1;
    if (paymentSuccessActivatesEntitlement(planes)) {
      errors.push(
        `${path}: payment success must not mark entitlement active without provisioned read-back`,
      );
    }
    if (
      planes.entitlement === "active" &&
      planes.provisioning !== "provisioned"
    ) {
      errors.push(`${path}: active requires provisioned provider read-back`);
    }
    if (
      planes.entitlement === "active" &&
      (planes.refund === "refunded" || planes.refund === "refund_pending")
    ) {
      errors.push(`${path}: refunded entitlements cannot display active`);
    }
  }
  return validation(errors);
}

export function validateDeveloperEntitlementV1(
  input: unknown,
): DeveloperEconomyValidationResultV1 {
  const errors: string[] = [];
  const value = objectValue(input, "entitlement", errors);
  if (!value) return validation(errors);
  rejectCredentialKeys(value, "entitlement", errors);
  rejectFamilySeatsAsSeat(value, "entitlement", errors);
  exactKeys(
    value,
    [
      "schemaVersion",
      "contractType",
      "entitlementId",
      "ownerUserId",
      "tenantRef",
      "offeringRef",
      "entitlementKind",
      "environment",
      "planes",
      "createdAt",
      "updatedAt",
    ],
    [
      "discoveryItemRef",
      "quoteRef",
      "mandateRef",
      "paymentAttemptRef",
      "settlementEventRef",
      "receiptRef",
      "subscriptionRef",
      "providerEntitlementRef",
    ],
    "entitlement",
    errors,
  );
  schema(value, "developer_entitlement", "entitlement", errors);
  opaqueRef(value.entitlementId, "entitlement.entitlementId", errors);
  opaqueRef(value.ownerUserId, "entitlement.ownerUserId", errors);
  nullableString(value.tenantRef, "entitlement.tenantRef", errors);
  recordRef(value.offeringRef, "entitlement.offeringRef", errors, "offering");
  oneOf(
    value.entitlementKind,
    DEVELOPER_ENTITLEMENT_KINDS_V1,
    "entitlement.entitlementKind",
    errors,
  );
  oneOf(
    value.environment,
    DEVELOPER_ECONOMY_ENVIRONMENTS_V1,
    "entitlement.environment",
    errors,
  );
  errors.push(
    ...validateDeveloperEntitlementPlanesV1(value.planes, "entitlement.planes")
      .errors,
  );
  if (value.discoveryItemRef !== undefined) {
    recordRef(value.discoveryItemRef, "entitlement.discoveryItemRef", errors);
  }
  if (value.quoteRef !== undefined) {
    recordRef(value.quoteRef, "entitlement.quoteRef", errors, "action_quote");
  }
  if (value.mandateRef !== undefined) {
    recordRef(
      value.mandateRef,
      "entitlement.mandateRef",
      errors,
      "execution_mandate",
    );
  }
  if (value.paymentAttemptRef !== undefined) {
    recordRef(
      value.paymentAttemptRef,
      "entitlement.paymentAttemptRef",
      errors,
      "payment_attempt",
    );
  }
  if (value.settlementEventRef !== undefined) {
    recordRef(
      value.settlementEventRef,
      "entitlement.settlementEventRef",
      errors,
      "settlement_event",
    );
  }
  if (value.receiptRef !== undefined) {
    recordRef(
      value.receiptRef,
      "entitlement.receiptRef",
      errors,
      "action_receipt",
    );
  }
  if (value.subscriptionRef !== undefined) {
    recordRef(value.subscriptionRef, "entitlement.subscriptionRef", errors);
  }
  if (value.providerEntitlementRef !== undefined) {
    recordRef(
      value.providerEntitlementRef,
      "entitlement.providerEntitlementRef",
      errors,
    );
  }
  timestamp(value.createdAt, "entitlement.createdAt", errors);
  timestamp(value.updatedAt, "entitlement.updatedAt", errors);
  return validation(errors);
}

export function validateDeveloperRecurringPurchaseMandateV1(
  input: unknown,
): DeveloperEconomyValidationResultV1 {
  const errors: string[] = [];
  const value = objectValue(input, "mandate", errors);
  if (!value) return validation(errors);
  exactKeys(
    value,
    [
      "schemaVersion",
      "contractType",
      "mandateId",
      "ownerUserId",
      "tenantRef",
      "merchantRef",
      "offeringRef",
      "periodCeiling",
      "currency",
      "cadence",
      "nextChargeAt",
      "expiresAt",
      "termsVersion",
      "cancellationPath",
      "status",
      "issuedAt",
    ],
    ["seatRef", "revokedAt"],
    "mandate",
    errors,
  );
  schema(value, "developer_recurring_purchase_mandate", "mandate", errors);
  opaqueRef(value.mandateId, "mandate.mandateId", errors);
  opaqueRef(value.ownerUserId, "mandate.ownerUserId", errors);
  nullableString(value.tenantRef, "mandate.tenantRef", errors);
  recordRef(value.merchantRef, "mandate.merchantRef", errors);
  recordRef(value.offeringRef, "mandate.offeringRef", errors, "offering");
  if (value.seatRef !== undefined) {
    recordRef(value.seatRef, "mandate.seatRef", errors);
  }
  money(value.periodCeiling, "mandate.periodCeiling", errors);
  if (typeof value.currency !== "string" || !CURRENCY.test(value.currency)) {
    errors.push("mandate.currency: invalid");
  }
  oneOf(
    value.cadence,
    ["monthly", "yearly", "weekly"] as const,
    "mandate.cadence",
    errors,
  );
  timestamp(value.nextChargeAt, "mandate.nextChargeAt", errors);
  timestamp(value.expiresAt, "mandate.expiresAt", errors);
  if (
    typeof value.nextChargeAt === "string" &&
    typeof value.expiresAt === "string" &&
    Date.parse(value.expiresAt) <= Date.parse(value.nextChargeAt)
  ) {
    errors.push("mandate.expiresAt: must be after nextChargeAt");
  }
  boundedString(value.termsVersion, "mandate.termsVersion", errors, 64);
  boundedString(
    value.cancellationPath,
    "mandate.cancellationPath",
    errors,
    256,
  );
  oneOf(
    value.status,
    ["active", "revoked", "expired", "superseded"] as const,
    "mandate.status",
    errors,
  );
  timestamp(value.issuedAt, "mandate.issuedAt", errors);
  if (value.revokedAt !== undefined) {
    timestamp(value.revokedAt, "mandate.revokedAt", errors);
  }
  if (value.status === "revoked" && value.revokedAt === undefined) {
    errors.push("mandate.revokedAt: required when revoked");
  }
  return validation(errors);
}

export function validateDeveloperByoConnectionV1(
  input: unknown,
): DeveloperEconomyValidationResultV1 {
  const errors: string[] = [];
  const value = objectValue(input, "byo", errors);
  if (!value) return validation(errors);
  rejectCredentialKeys(value, "byo", errors);
  exactKeys(
    value,
    [
      "schemaVersion",
      "contractType",
      "connectionId",
      "ownerUserId",
      "tenantRef",
      "provider",
      "adapterCapability",
      "entitlementRef",
      "environment",
      "credentialPlacement",
      "lifecycleState",
      "createdAt",
      "updatedAt",
    ],
    ["usageProjection", "costProjection"],
    "byo",
    errors,
  );
  schema(value, "developer_byo_connection", "byo", errors);
  opaqueRef(value.connectionId, "byo.connectionId", errors);
  opaqueRef(value.ownerUserId, "byo.ownerUserId", errors);
  nullableString(value.tenantRef, "byo.tenantRef", errors);
  opaqueRef(value.provider, "byo.provider", errors);
  const capability = objectValue(
    value.adapterCapability,
    "byo.adapterCapability",
    errors,
  );
  if (capability) {
    rejectCredentialKeys(capability, "byo.adapterCapability", errors);
    exactKeys(
      capability,
      ["adapterRef", "providerRef", "supportStatus"],
      [],
      "byo.adapterCapability",
      errors,
    );
    opaqueRef(
      capability.adapterRef,
      "byo.adapterCapability.adapterRef",
      errors,
    );
    opaqueRef(
      capability.providerRef,
      "byo.adapterCapability.providerRef",
      errors,
    );
    oneOf(
      capability.supportStatus,
      ["supported", "planned", "unsupported"] as const,
      "byo.adapterCapability.supportStatus",
      errors,
    );
  }
  recordRef(value.entitlementRef, "byo.entitlementRef", errors);
  oneOf(
    value.environment,
    DEVELOPER_ECONOMY_ENVIRONMENTS_V1,
    "byo.environment",
    errors,
  );
  if (value.credentialPlacement !== "desktop_os_secure_storage") {
    errors.push(
      "byo.credentialPlacement: only desktop_os_secure_storage is allowed",
    );
  }
  oneOf(
    value.lifecycleState,
    DEVELOPER_BYO_LIFECYCLE_STATES_V1,
    "byo.lifecycleState",
    errors,
  );
  if (value.usageProjection !== undefined) {
    const usage = objectValue(
      value.usageProjection,
      "byo.usageProjection",
      errors,
    );
    if (usage) {
      exactKeys(
        usage,
        ["periodStart", "periodEnd", "unitsUsed"],
        ["unitsCeiling"],
        "byo.usageProjection",
        errors,
      );
      timestamp(usage.periodStart, "byo.usageProjection.periodStart", errors);
      timestamp(usage.periodEnd, "byo.usageProjection.periodEnd", errors);
      if (
        typeof usage.unitsUsed !== "number" ||
        !Number.isFinite(usage.unitsUsed) ||
        usage.unitsUsed < 0
      ) {
        errors.push("byo.usageProjection.unitsUsed: invalid");
      }
    }
  }
  if (value.costProjection !== undefined) {
    const cost = objectValue(
      value.costProjection,
      "byo.costProjection",
      errors,
    );
    if (cost) {
      exactKeys(
        cost,
        ["currency", "projectedMinor"],
        ["ceilingMinor"],
        "byo.costProjection",
        errors,
      );
      if (typeof cost.currency !== "string" || !CURRENCY.test(cost.currency)) {
        errors.push("byo.costProjection.currency: invalid");
      }
    }
  }
  timestamp(value.createdAt, "byo.createdAt", errors);
  timestamp(value.updatedAt, "byo.updatedAt", errors);
  return validation(errors);
}

export function validateDeveloperSeatBindingV1(
  input: unknown,
): DeveloperEconomyValidationResultV1 {
  const errors: string[] = [];
  const value = objectValue(input, "seat", errors);
  if (!value) return validation(errors);
  rejectCredentialKeys(value, "seat", errors);
  rejectFamilySeatsAsSeat(value, "seat", errors);
  exactKeys(
    value,
    [
      "schemaVersion",
      "contractType",
      "seatId",
      "offeringRef",
      "entitlementRef",
      "occupantUserId",
      "environment",
      "assignedAt",
    ],
    ["reclaimedAt"],
    "seat",
    errors,
  );
  schema(value, "developer_seat_binding", "seat", errors);
  opaqueRef(value.seatId, "seat.seatId", errors);
  recordRef(value.offeringRef, "seat.offeringRef", errors, "offering");
  recordRef(value.entitlementRef, "seat.entitlementRef", errors);
  opaqueRef(value.occupantUserId, "seat.occupantUserId", errors);
  if (isFamilySeatsQuotaMetadata(String(value.occupantUserId))) {
    errors.push("seat.occupantUserId: family_seats is not a user identity");
  }
  oneOf(
    value.environment,
    DEVELOPER_ECONOMY_ENVIRONMENTS_V1,
    "seat.environment",
    errors,
  );
  timestamp(value.assignedAt, "seat.assignedAt", errors);
  if (value.reclaimedAt !== undefined) {
    timestamp(value.reclaimedAt, "seat.reclaimedAt", errors);
  }
  return validation(errors);
}

export function validateDeveloperEconomyWebhookEventV1(
  input: unknown,
): DeveloperEconomyValidationResultV1 {
  const errors: string[] = [];
  const value = objectValue(input, "webhook", errors);
  if (!value) return validation(errors);
  rejectCredentialKeys(value, "webhook", errors);
  exactKeys(
    value,
    [
      "schemaVersion",
      "contractType",
      "source",
      "kind",
      "eventId",
      "eventAt",
      "ownerUserId",
      "tenantRef",
      "productRef",
      "environment",
    ],
    ["offeringRef"],
    "webhook",
    errors,
  );
  schema(value, "developer_economy_webhook_event", "webhook", errors);
  oneOf(value.source, DEVELOPER_WEBHOOK_SOURCES_V1, "webhook.source", errors);
  oneOf(value.kind, DEVELOPER_WEBHOOK_KINDS_V1, "webhook.kind", errors);
  opaqueRef(value.eventId, "webhook.eventId", errors);
  timestamp(value.eventAt, "webhook.eventAt", errors);
  opaqueRef(value.ownerUserId, "webhook.ownerUserId", errors);
  nullableString(value.tenantRef, "webhook.tenantRef", errors);
  recordRef(value.productRef, "webhook.productRef", errors);
  oneOf(
    value.environment,
    DEVELOPER_ECONOMY_ENVIRONMENTS_V1,
    "webhook.environment",
    errors,
  );
  if (value.offeringRef !== undefined) {
    recordRef(value.offeringRef, "webhook.offeringRef", errors, "offering");
  }
  return validation(errors);
}

export function validateDeveloperSellerListingV1(
  input: unknown,
): DeveloperEconomyValidationResultV1 {
  const errors: string[] = [];
  const value = objectValue(input, "listing", errors);
  if (!value) return validation(errors);
  exactKeys(
    value,
    [
      "schemaVersion",
      "contractType",
      "listingId",
      "offeringRef",
      "sellerUserId",
      "tenantRef",
      "environment",
      "termsState",
      "securityState",
      "qualityState",
    ],
    [
      "fulfilmentRef",
      "commissionRef",
      "refundRef",
      "disputeRef",
      "publishedAt",
    ],
    "listing",
    errors,
  );
  schema(value, "developer_seller_listing", "listing", errors);
  opaqueRef(value.listingId, "listing.listingId", errors);
  recordRef(value.offeringRef, "listing.offeringRef", errors, "offering");
  opaqueRef(value.sellerUserId, "listing.sellerUserId", errors);
  nullableString(value.tenantRef, "listing.tenantRef", errors);
  oneOf(
    value.environment,
    DEVELOPER_ECONOMY_ENVIRONMENTS_V1,
    "listing.environment",
    errors,
  );
  oneOf(
    value.termsState,
    DEVELOPER_SELLER_TERMS_STATES_V1,
    "listing.termsState",
    errors,
  );
  oneOf(
    value.securityState,
    DEVELOPER_SELLER_REVIEW_STATES_V1,
    "listing.securityState",
    errors,
  );
  oneOf(
    value.qualityState,
    DEVELOPER_SELLER_REVIEW_STATES_V1,
    "listing.qualityState",
    errors,
  );
  const published = value.publishedAt !== undefined;
  if (published) {
    timestamp(value.publishedAt, "listing.publishedAt", errors);
    if (value.termsState !== "accepted") {
      errors.push("listing.termsState: publish requires accepted terms");
    }
    if (value.securityState !== "passed") {
      errors.push("listing.securityState: publish requires passed security");
    }
    if (value.qualityState !== "passed") {
      errors.push("listing.qualityState: publish requires passed quality");
    }
    if (
      value.fulfilmentRef === undefined ||
      value.commissionRef === undefined ||
      value.refundRef === undefined ||
      value.disputeRef === undefined
    ) {
      errors.push(
        "listing: paid publish requires fulfilment/commission/refund/dispute refs",
      );
    }
  }
  if (value.fulfilmentRef !== undefined) {
    recordRef(value.fulfilmentRef, "listing.fulfilmentRef", errors);
  }
  if (value.commissionRef !== undefined) {
    recordRef(
      value.commissionRef,
      "listing.commissionRef",
      errors,
      "commission_allocation",
    );
  }
  if (value.refundRef !== undefined) {
    recordRef(value.refundRef, "listing.refundRef", errors, "settlement_event");
  }
  if (value.disputeRef !== undefined) {
    recordRef(value.disputeRef, "listing.disputeRef", errors, "dispute_case");
  }
  return validation(errors);
}

export function assertDeveloperEconomyContractV1(
  kind:
    | "offering"
    | "entitlement"
    | "mandate"
    | "byo"
    | "seat"
    | "webhook"
    | "listing",
  input: unknown,
): void {
  const result =
    kind === "offering"
      ? validateDeveloperOfferingV1(input)
      : kind === "entitlement"
        ? validateDeveloperEntitlementV1(input)
        : kind === "mandate"
          ? validateDeveloperRecurringPurchaseMandateV1(input)
          : kind === "byo"
            ? validateDeveloperByoConnectionV1(input)
            : kind === "seat"
              ? validateDeveloperSeatBindingV1(input)
              : kind === "webhook"
                ? validateDeveloperEconomyWebhookEventV1(input)
                : validateDeveloperSellerListingV1(input);
  if (!result.valid) {
    throw new DeveloperEconomyContractValidationError(result.errors);
  }
}

export function sellerListingPublishable(
  listing: Pick<
    DeveloperSellerListingV1,
    "termsState" | "securityState" | "qualityState"
  >,
): boolean {
  return (
    listing.termsState === "accepted" &&
    listing.securityState === "passed" &&
    listing.qualityState === "passed"
  );
}

export function resellerAdapterSupported(
  authorization: DeveloperResellerAuthorizationV1,
): boolean {
  return authorization === "vendor_written_and_api";
}

export function reasonCode(value: string): boolean {
  return REASON_CODE.test(value);
}

export type DeveloperEconomyDigestRefV1 = DigestRef;
