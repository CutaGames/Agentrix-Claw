import {
  CANONICAL_ENFORCEMENT_LAYERS,
  type EnforcementLayer,
} from './authority';
import {
  isActorRefV1,
  isAuthorityRootRefV1,
  isRecordRefV1,
  type ActorRefV1,
  type AuthorityRootRefV1,
} from './agent-attribution';
import {
  canonicalizeJson,
  computeDigest,
  type DigestRef,
  type Money,
  type RecordRef,
} from './trust-loop-primitives';

export const AUTHORITY_GRANT_SCHEMA_VERSION = 1 as const;
export const AUTHORITY_PERMISSION_PREVIEW_SCHEMA_VERSION = 1 as const;
export const AUTHORITY_ACCEPTED_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const AUTHORITY_DELEGATION_SCHEMA_VERSION = 1 as const;

export const AUTHORITY_GRANT_STATUSES_V1 = [
  'proposed',
  'active',
  'expired',
  'revoked',
  'superseded',
] as const;
export type AuthorityGrantStatusV1 =
  (typeof AUTHORITY_GRANT_STATUSES_V1)[number];

export const AUTHORITY_STEP_UP_METHODS_V1 = [
  'passkey',
  'wallet_signature',
  'device_attestation',
  'human_approval',
] as const;
export type AuthorityStepUpMethodV1 =
  (typeof AUTHORITY_STEP_UP_METHODS_V1)[number];

export interface AuthorityScopeV1 {
  capabilities: string[];
  resources?: string[];
  counterparties?: string[];
  constraints?: Record<string, unknown>;
}

export interface AuthorityBudgetV1 {
  singleTransaction?: Money;
  daily?: Money;
  monthly?: Money;
}

export interface AuthorityStepUpPolicyV1 {
  required: boolean;
  methods: AuthorityStepUpMethodV1[];
  threshold?: AuthorityBudgetV1;
  reasonCodes?: string[];
}

/** Machine policy supplied to the server before copy is rendered. */
export interface AuthorityGrantPreviewRequestV1 {
  schemaVersion: typeof AUTHORITY_GRANT_SCHEMA_VERSION;
  subjectRef: ActorRefV1;
  accountableAgentId: string;
  authorityRootRef: AuthorityRootRefV1;
  scope: AuthorityScopeV1;
  resourceScope?: Record<string, unknown>;
  budget?: AuthorityBudgetV1;
  validFrom: string;
  validUntil?: string;
  audience: string[];
  requiredMechanisms: EnforcementLayer[];
  stepUpPolicy?: AuthorityStepUpPolicyV1;
}

export interface AuthorityAcceptedPolicyV1 extends AuthorityGrantPreviewRequestV1 {
  principalRef: RecordRef;
  tenantRef?: RecordRef;
}

export interface AuthorityAcceptedSnapshotV1 {
  schemaVersion: typeof AUTHORITY_ACCEPTED_SNAPSHOT_SCHEMA_VERSION;
  previewVersion: typeof AUTHORITY_PERMISSION_PREVIEW_SCHEMA_VERSION;
  locale: 'zh-CN' | 'en';
  policy: AuthorityAcceptedPolicyV1;
  display: {
    title: string;
    summary: string;
    capabilityLines: string[];
    materialTerms: string[];
    warnings: string[];
  };
  renderedAt: string;
}

export interface AuthorityPermissionPreviewV1 {
  schemaVersion: typeof AUTHORITY_PERMISSION_PREVIEW_SCHEMA_VERSION;
  snapshot: AuthorityAcceptedSnapshotV1;
  digest: DigestRef;
}

export interface AuthorityGrantV1 {
  schemaVersion: typeof AUTHORITY_GRANT_SCHEMA_VERSION;
  grantRef: string;
  grantVersion: number;
  agentAccountId: string;
  status: AuthorityGrantStatusV1;
  revocationEpoch: number;
  optimisticVersion: number;
  acceptedSnapshot: AuthorityAcceptedSnapshotV1;
  acceptedSnapshotDigest: DigestRef;
  supersedesGrantRef?: string;
  revokedAt?: string;
  revocationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorityDelegationV1 {
  schemaVersion: typeof AUTHORITY_DELEGATION_SCHEMA_VERSION;
  delegationRef: string;
  grantRef: string;
  parentDelegationRef?: string;
  chainDepth: number;
  delegatorPrincipalRef: RecordRef;
  /** Present for nested chains; proves the parent delegatee authored this edge. */
  delegatorActorRef?: ActorRefV1;
  delegateeSubjectRef: ActorRefV1;
  scope: AuthorityScopeV1;
  budget?: AuthorityBudgetV1;
  validFrom: string;
  validUntil?: string;
  audience: string[];
  requiredMechanisms: EnforcementLayer[];
  stepUpPolicy?: AuthorityStepUpPolicyV1;
  status: AuthorityGrantStatusV1;
  revocationEpoch: number;
  optimisticVersion: number;
}

export interface AuthorityContractValidationV1 {
  valid: boolean;
  errors: string[];
}

export class AuthorityContractValidationError extends Error {
  readonly code = 'authority_contract_invalid';
  constructor(readonly errors: string[]) {
    super(`Authority contract validation failed: ${errors.join('; ')}`);
    this.name = 'AuthorityContractValidationError';
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function uniqueStrings(value: unknown, allowEmpty = false): value is string[] {
  return (
    Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.every(nonEmpty) &&
    new Set(value).size === value.length
  );
}

function validateMoney(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected Money`);
    return;
  }
  if (typeof value.amountMinor !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value.amountMinor)) {
    errors.push(`${path}.amountMinor: expected non-negative integer string`);
  }
  if (!nonEmpty(value.currency)) errors.push(`${path}.currency: required`);
  if (!Number.isInteger(value.decimals) || Number(value.decimals) < 0) {
    errors.push(`${path}.decimals: expected non-negative integer`);
  }
}

function validateBudget(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) return;
  if (!object(value)) {
    errors.push(`${path}: expected object`);
    return;
  }
  for (const key of ['singleTransaction', 'daily', 'monthly'] as const) {
    if (value[key] !== undefined) validateMoney(value[key], `${path}.${key}`, errors);
  }
}

function validateScope(value: unknown, path: string, errors: string[]): void {
  if (!object(value)) {
    errors.push(`${path}: expected object`);
    return;
  }
  if (!uniqueStrings(value.capabilities)) {
    errors.push(`${path}.capabilities: expected non-empty unique strings`);
  }
  if (value.resources !== undefined && !uniqueStrings(value.resources, true)) {
    errors.push(`${path}.resources: expected unique strings`);
  }
  if (value.counterparties !== undefined && !uniqueStrings(value.counterparties, true)) {
    errors.push(`${path}.counterparties: expected unique strings`);
  }
  if (value.constraints !== undefined && !object(value.constraints)) {
    errors.push(`${path}.constraints: expected object`);
  }
}

function validateStepUp(value: unknown, path: string, errors: string[]): void {
  if (value === undefined) return;
  if (!object(value)) {
    errors.push(`${path}: expected object`);
    return;
  }
  if (typeof value.required !== 'boolean') errors.push(`${path}.required: expected boolean`);
  if (
    !uniqueStrings(value.methods, value.required !== true) ||
    (value.methods as unknown[]).some(
      (method) => !(AUTHORITY_STEP_UP_METHODS_V1 as readonly unknown[]).includes(method),
    )
  ) {
    errors.push(`${path}.methods: unknown or duplicate method`);
  }
  validateBudget(value.threshold, `${path}.threshold`, errors);
  if (value.reasonCodes !== undefined && !uniqueStrings(value.reasonCodes, true)) {
    errors.push(`${path}.reasonCodes: expected unique strings`);
  }
}

export function validateAuthorityGrantPreviewRequestV1(
  input: unknown,
): AuthorityContractValidationV1 {
  const errors: string[] = [];
  if (!object(input)) return { valid: false, errors: ['request: expected object'] };
  if (input.schemaVersion !== AUTHORITY_GRANT_SCHEMA_VERSION) {
    errors.push('request.schemaVersion: unsupported version');
  }
  if (!isActorRefV1(input.subjectRef)) {
    errors.push('request.subjectRef: expected typed agent/worker actor');
  }
  if (!nonEmpty(input.accountableAgentId)) errors.push('request.accountableAgentId: required');
  if (!isAuthorityRootRefV1(input.authorityRootRef)) {
    errors.push('request.authorityRootRef: malformed');
  }
  validateScope(input.scope, 'request.scope', errors);
  if (input.resourceScope !== undefined && !object(input.resourceScope)) {
    errors.push('request.resourceScope: expected object');
  }
  validateBudget(input.budget, 'request.budget', errors);
  if (!timestamp(input.validFrom)) errors.push('request.validFrom: invalid timestamp');
  if (input.validUntil !== undefined && !timestamp(input.validUntil)) {
    errors.push('request.validUntil: invalid timestamp');
  }
  if (
    timestamp(input.validFrom) &&
    input.validUntil !== undefined &&
    timestamp(input.validUntil) &&
    Date.parse(input.validUntil) <= Date.parse(input.validFrom)
  ) {
    errors.push('request.validUntil: must be after validFrom');
  }
  if (!uniqueStrings(input.audience)) errors.push('request.audience: expected unique strings');
  if (
    !uniqueStrings(input.requiredMechanisms, true) ||
    (input.requiredMechanisms as unknown[]).some(
      (layer) => !(CANONICAL_ENFORCEMENT_LAYERS as readonly unknown[]).includes(layer),
    )
  ) {
    errors.push('request.requiredMechanisms: unknown enforcement layer');
  }
  validateStepUp(input.stepUpPolicy, 'request.stepUpPolicy', errors);
  return { valid: errors.length === 0, errors };
}

function formatMoneyForConsent(money: Money): string {
  const digits = money.amountMinor.padStart(money.decimals + 1, '0');
  const value = money.decimals === 0
    ? digits
    : `${digits.slice(0, -money.decimals)}.${digits.slice(-money.decimals)}`;
  return `${value} ${money.currency}`;
}

function buildAuthorityMaterialTerms(
  request: AuthorityGrantPreviewRequestV1,
  zh: boolean,
): string[] {
  const terms: string[] = [];
  const values = (items: string[] | undefined, unrestricted: string) =>
    items === undefined ? unrestricted : items.length ? [...items].sort().join(', ') : '∅';
  terms.push(
    zh
      ? `资源：${values(request.scope.resources, '未限定')}`
      : `Resources: ${values(request.scope.resources, 'unrestricted')}`,
    zh
      ? `对手方：${values(request.scope.counterparties, '未限定')}`
      : `Counterparties: ${values(request.scope.counterparties, 'unrestricted')}`,
  );
  if (request.scope.constraints !== undefined) {
    terms.push(
      `${zh ? '约束' : 'Constraints'}: ${canonicalizeJson(request.scope.constraints)}`,
    );
  }
  if (Object.keys(request.resourceScope ?? {}).length > 0) {
    terms.push(
      `${zh ? '资源范围' : 'Resource scope'}: ${canonicalizeJson(request.resourceScope)}`,
    );
  }
  for (const [key, labelZh, labelEn] of [
    ['singleTransaction', '单次预算', 'Single-transaction budget'],
    ['daily', '每日预算', 'Daily budget'],
    ['monthly', '每月预算', 'Monthly budget'],
  ] as const) {
    const money = request.budget?.[key];
    if (money) terms.push(`${zh ? labelZh : labelEn}: ${formatMoneyForConsent(money)}`);
  }
  if (!request.budget || Object.keys(request.budget).length === 0) {
    terms.push(zh ? '预算：未配置限制' : 'Budget: no configured limit');
  }
  terms.push(
    `${zh ? '生效时间' : 'Valid from'}: ${request.validFrom}`,
    `${zh ? '失效时间' : 'Valid until'}: ${request.validUntil ?? (zh ? '未设置' : 'not set')}`,
    `${zh ? '适用受众' : 'Audience'}: ${[...request.audience].sort().join(', ')}`,
    `${zh ? '执行机制' : 'Enforcement mechanisms'}: ${
      request.requiredMechanisms.length
        ? [...request.requiredMechanisms].sort().join(', ')
        : zh
          ? '未声明'
          : 'not declared'
    }`,
    `${zh ? '额外确认' : 'Step-up'}: ${
      request.stepUpPolicy?.required
        ? `${zh ? '需要' : 'required'} (${[...request.stepUpPolicy.methods].sort().join(', ')})`
        : zh
          ? '不需要'
          : 'not required'
    }`,
  );
  return terms;
}

export function buildAuthorityPermissionPreviewV1(
  request: AuthorityGrantPreviewRequestV1,
  context: {
    principalRef: RecordRef;
    tenantRef?: RecordRef;
    locale: 'zh-CN' | 'en';
    renderedAt: string;
  },
): AuthorityPermissionPreviewV1 {
  const requestValidation = validateAuthorityGrantPreviewRequestV1(request);
  const errors = [...requestValidation.errors];
  if (!isRecordRefV1(context.principalRef)) errors.push('context.principalRef: malformed');
  if (context.tenantRef !== undefined && !isRecordRefV1(context.tenantRef)) {
    errors.push('context.tenantRef: malformed');
  }
  if (!timestamp(context.renderedAt)) errors.push('context.renderedAt: invalid timestamp');
  if (errors.length) throw new AuthorityContractValidationError(errors);

  const capabilities = [...request.scope.capabilities].sort();
  const policy: AuthorityAcceptedPolicyV1 = {
    ...request,
    scope: { ...request.scope, capabilities },
    audience: [...request.audience].sort(),
    requiredMechanisms: [...request.requiredMechanisms].sort(),
    principalRef: context.principalRef,
    ...(context.tenantRef ? { tenantRef: context.tenantRef } : {}),
  };
  const zh = context.locale === 'zh-CN';
  const snapshot: AuthorityAcceptedSnapshotV1 = {
    schemaVersion: AUTHORITY_ACCEPTED_SNAPSHOT_SCHEMA_VERSION,
    previewVersion: AUTHORITY_PERMISSION_PREVIEW_SCHEMA_VERSION,
    locale: context.locale,
    policy,
    display: {
      title: zh ? 'Agent 权限确认' : 'Agent permission confirmation',
      summary: zh
        ? `将授予 ${capabilities.length} 项能力；扩权必须重新确认。`
        : `${capabilities.length} capabilities will be granted; expansion requires new consent.`,
      capabilityLines: capabilities.map((capability) =>
        zh ? `允许：${capability}` : `Allow: ${capability}`,
      ),
      materialTerms: buildAuthorityMaterialTerms(request, zh),
      warnings: [
        ...(request.requiredMechanisms.length === 0
          ? [zh ? '仅配置权限；未声明额外执行机制。' : 'Configuration only; no additional enforcement mechanism declared.']
          : []),
        ...(request.stepUpPolicy?.required
          ? [zh ? '执行前需要额外确认。' : 'Step-up is required before execution.']
          : []),
      ],
    },
    renderedAt: context.renderedAt,
  };
  return {
    schemaVersion: AUTHORITY_PERMISSION_PREVIEW_SCHEMA_VERSION,
    snapshot,
    digest: computeDigest(snapshot),
  };
}

export function validateAuthorityPermissionPreviewV1(
  input: unknown,
): AuthorityContractValidationV1 {
  const errors: string[] = [];
  if (!object(input)) return { valid: false, errors: ['preview: expected object'] };
  if (input.schemaVersion !== AUTHORITY_PERMISSION_PREVIEW_SCHEMA_VERSION) {
    errors.push('preview.schemaVersion: unsupported version');
  }
  if (!object(input.snapshot)) errors.push('preview.snapshot: expected object');
  if (!object(input.digest) || input.digest.algorithm !== 'sha-256') {
    errors.push('preview.digest: expected sha-256 DigestRef');
  } else if (object(input.snapshot)) {
    const expected = computeDigest(input.snapshot);
    if (canonicalizeJson(expected) !== canonicalizeJson(input.digest)) {
      errors.push('preview.digest: snapshot mismatch');
    }
  }
  if (object(input.snapshot)) {
    const snapshot = input.snapshot;
    if (snapshot.schemaVersion !== AUTHORITY_ACCEPTED_SNAPSHOT_SCHEMA_VERSION) {
      errors.push('preview.snapshot.schemaVersion: unsupported version');
    }
    if (snapshot.previewVersion !== AUTHORITY_PERMISSION_PREVIEW_SCHEMA_VERSION) {
      errors.push('preview.snapshot.previewVersion: unsupported version');
    }
    if (snapshot.locale !== 'zh-CN' && snapshot.locale !== 'en') {
      errors.push('preview.snapshot.locale: unsupported locale');
    }
    if (!timestamp(snapshot.renderedAt)) {
      errors.push('preview.snapshot.renderedAt: invalid timestamp');
    }
    if (!object(snapshot.display)) {
      errors.push('preview.snapshot.display: expected object');
    } else {
      if (!nonEmpty(snapshot.display.title)) {
        errors.push('preview.snapshot.display.title: required');
      }
      if (!nonEmpty(snapshot.display.summary)) {
        errors.push('preview.snapshot.display.summary: required');
      }
      if (!uniqueStrings(snapshot.display.capabilityLines)) {
        errors.push('preview.snapshot.display.capabilityLines: expected non-empty unique strings');
      }
      if (!uniqueStrings(snapshot.display.materialTerms)) {
        errors.push('preview.snapshot.display.materialTerms: expected non-empty unique strings');
      }
      if (!uniqueStrings(snapshot.display.warnings, true)) {
        errors.push('preview.snapshot.display.warnings: expected unique strings');
      }
    }

    const policy = snapshot.policy;
    const request = object(policy)
      ? (({ principalRef: _principal, tenantRef: _tenant, ...rest }) => rest)(policy)
      : policy;
    const requestValidation = validateAuthorityGrantPreviewRequestV1(request);
    errors.push(...requestValidation.errors);
    const principalRef = object(policy) && isRecordRefV1(policy.principalRef)
      ? policy.principalRef
      : undefined;
    const tenantRef = object(policy) && policy.tenantRef !== undefined && isRecordRefV1(policy.tenantRef)
      ? policy.tenantRef
      : undefined;
    if (!principalRef) {
      errors.push('preview.snapshot.policy.principalRef: malformed');
    }
    if (object(policy) && policy.tenantRef !== undefined && !tenantRef) {
      errors.push('preview.snapshot.policy.tenantRef: malformed');
    }

    // Acceptance never trusts caller-authored consent copy. Rebuild the exact
    // server rendering and reject extra, stale or locale-inconsistent fields.
    if (
      requestValidation.valid &&
      principalRef &&
      (snapshot.locale === 'zh-CN' || snapshot.locale === 'en') &&
      timestamp(snapshot.renderedAt)
    ) {
      const rebuilt = buildAuthorityPermissionPreviewV1(
        request as unknown as AuthorityGrantPreviewRequestV1,
        {
          principalRef,
          ...(tenantRef ? { tenantRef } : {}),
          locale: snapshot.locale,
          renderedAt: snapshot.renderedAt,
        },
      );
      if (canonicalizeJson(rebuilt.snapshot) !== canonicalizeJson(snapshot)) {
        errors.push('preview.snapshot: deterministic display or envelope mismatch');
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function authorityPreviewMateriallyChangedV1(
  accepted: AuthorityPermissionPreviewV1,
  next: AuthorityPermissionPreviewV1,
): boolean {
  return accepted.digest.value !== next.digest.value;
}
