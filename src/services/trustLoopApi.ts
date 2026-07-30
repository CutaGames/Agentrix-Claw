/**
 * trustLoopApi — TL-01.4 (A 线) 移动端只读客户端。
 *
 * 复用共享 `apiFetch`（token + baseURL 已处理）——不新建 HTTP 客户端。消费后端
 * `/api/v1/soul-cores/:soulCoreId/...` 的 trust-loop 读接口，解包 `{ success, data }`。
 * 所有响应在进入 UI 前通过 shared canonical validator 与 route-lineage 检查；未知
 * schema、非法 enum 或畸形引用一律抛错并由调用方显示 unavailable，不做本地推导。
 */
import { apiFetch } from './api';
import {
  AUTHORITY_DECISIONS,
  REMEDY_STATUSES,
  REMEDY_TYPES,
  type ActionContextV1,
  type AssuranceProfileV1,
  type DisputeCaseV1,
  type FeedbackRightV1,
  type OutcomeRecordV1,
  type RemedyOutcome,
  type ReputationCardV1,
  type ReputationContext,
  type RiskDecisionV1,
  type TrustActionTimelineV1,
  type VerificationResultV1,
} from '../../shared/types/trust-loop-contracts';
import {
  DIGEST_ALGORITHMS,
  PARTY_KINDS,
  TRUST_LOOP_CANONICALIZATION,
  TRUST_LOOP_SCHEMA_VERSION,
  TRUST_RECORD_TYPES,
  type RecordRef,
} from '../../shared/types/trust-loop-primitives';
import {
  TrustValidationError,
  validateActionContextV1,
  validateAssuranceProfileV1,
  validateDisputeCaseV1,
  validateFeedbackRightV1,
  validateOutcomeRecordV1,
  validateReputationCardV1,
  validateRiskDecisionV1,
  validateVerificationResultV1,
  type TrustValidationResult,
} from '../../shared/types/trust-loop-validation';

/** Economic assurance is kept separate from behavioural reputation (R8). */
export interface EconomicAssuranceView {
  escrowRefs: RecordRef[];
  depositRefs: RecordRef[];
  insuranceRefs: RecordRef[];
  refundAuthorityRefs: RecordRef[];
  note?: string;
}

export interface AssuranceProfileView {
  profile: AssuranceProfileV1;
  economicAssurance: EconomicAssuranceView;
}

/** @deprecated Mobile consumers use the unified `mobile.trust_loop` feature flag. */
export const TRUST_LOOP_MOBILE_ENABLED = false;

interface Envelope<T> {
  success: boolean;
  data: T;
}

type Validator = (input: unknown) => TrustValidationResult;

function isObject(input: unknown): input is Record<string, unknown> {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0;
}

function unwrap(input: unknown): unknown {
  if (isObject(input) && 'success' in input && 'data' in input) {
    if (input.success !== true) {
      throw new TrustValidationError(['response.success: expected true']);
    }
    return (input as unknown as Envelope<unknown>).data;
  }
  return input;
}

function objectValue(input: unknown, label: string): Record<string, unknown> {
  const value = unwrap(input);
  if (!isObject(value)) throw new TrustValidationError([`${label}: expected object`]);
  return value;
}

function arrayValue(input: unknown, label: string): unknown[] {
  const value = unwrap(input);
  if (!Array.isArray(value)) throw new TrustValidationError([`${label}: expected array`]);
  return value;
}

function validateValue<T>(input: unknown, label: string, validator: Validator): T {
  const validation = validator(input);
  if (!validation.valid) {
    throw new TrustValidationError(validation.errors.map((error) => `${label}.${error}`));
  }
  return input as T;
}

function isRecordRef(input: unknown): input is RecordRef {
  if (!isObject(input)
    || !(TRUST_RECORD_TYPES as readonly unknown[]).includes(input.type)
    || !isNonEmptyString(input.id)) return false;
  if (input.version !== undefined && (!Number.isInteger(input.version) || Number(input.version) < 0)) return false;
  if (input.digest === undefined) return true;
  if (!isObject(input.digest)) return false;
  return (DIGEST_ALGORITHMS as readonly unknown[]).includes(input.digest.algorithm)
    && input.digest.canonicalization === TRUST_LOOP_CANONICALIZATION
    && typeof input.digest.value === 'string'
    && /^[0-9a-f]{64}$/.test(input.digest.value);
}

function isPartyRef(input: unknown): boolean {
  return isObject(input)
    && (PARTY_KINDS as readonly unknown[]).includes(input.kind)
    && isNonEmptyString(input.id);
}

function decodeTimeline(input: unknown, expectedActionId: string): TrustActionTimelineV1 {
  const value = objectValue(input, 'trustTimeline');
  if (value.schemaVersion !== TRUST_LOOP_SCHEMA_VERSION
    || value.actionId !== expectedActionId
    || typeof value.legacy !== 'boolean'
    || !(value.context === null || isObject(value.context))
    || !Array.isArray(value.outcomes)) {
    throw new TrustValidationError(['trustTimeline: invalid response envelope or route lineage']);
  }

  const context = value.context === null
    ? null
    : validateValue<ActionContextV1>(value.context, 'trustTimeline.context', validateActionContextV1);
  const outcomes = value.outcomes.map((outcome, index) =>
    validateValue<OutcomeRecordV1>(outcome, `trustTimeline.outcomes[${index}]`, validateOutcomeRecordV1));
  if (context && context.actionId !== expectedActionId) {
    throw new TrustValidationError(['trustTimeline.context.actionId: route lineage mismatch']);
  }
  if (outcomes.some((outcome) => outcome.actionId !== expectedActionId)) {
    throw new TrustValidationError(['trustTimeline.outcomes: route lineage mismatch']);
  }
  if (value.legacy && (context !== null || outcomes.length > 0)) {
    throw new TrustValidationError(['trustTimeline.legacy: legacy timeline cannot contain canonical records']);
  }
  return { ...value, context, outcomes } as unknown as TrustActionTimelineV1;
}

function decodeValidatedArray<T>(input: unknown, label: string, validator: Validator): T[] {
  return arrayValue(input, label).map((item, index) =>
    validateValue<T>(item, `${label}[${index}]`, validator));
}

function decodeRemedies(input: unknown): RemedyOutcome[] {
  return arrayValue(input, 'trustRemedies').map((item, index) => {
    if (!isObject(item)
      || !isNonEmptyString(item.remedyId)
      || !(REMEDY_TYPES as readonly unknown[]).includes(item.type)
      || !(REMEDY_STATUSES as readonly unknown[]).includes(item.status)
      || (item.confirmedBy !== undefined && !isPartyRef(item.confirmedBy))
      || (item.confirmedAt !== undefined && !isNonEmptyString(item.confirmedAt))) {
      throw new TrustValidationError([`trustRemedies[${index}]: invalid remedy outcome`]);
    }
    if (item.settlementRef !== undefined) {
      if (!isRecordRef(item.settlementRef)
        || !['settlement', 'settlement_event'].includes(item.settlementRef.type)) {
        throw new TrustValidationError([`trustRemedies[${index}].settlementRef: invalid settlement lineage`]);
      }
    }
    return item as unknown as RemedyOutcome;
  });
}

function decodeReputation(input: unknown, expectedSubjectId: string): ReputationCardV1 {
  const card = validateValue<ReputationCardV1>(
    unwrap(input),
    'trustReputation',
    validateReputationCardV1,
  );
  const sample = card.sample;
  if (card.subject.id !== expectedSubjectId
    || !sample
    || ![sample.total, sample.verified, sample.disputed, sample.remedied]
      .every((count) => Number.isInteger(count) && count >= 0)
    || sample.verified > sample.total
    || sample.disputed > sample.total
    || sample.remedied > sample.total) {
    throw new TrustValidationError(['trustReputation: invalid subject lineage or sample counts']);
  }
  return card;
}

function decodeAssurance(input: unknown, expectedSubjectId: string): AssuranceProfileView {
  const value = objectValue(input, 'trustAssurance');
  const profile = validateValue<AssuranceProfileV1>(
    value.profile,
    'trustAssurance.profile',
    validateAssuranceProfileV1,
  );
  if (profile.subject.id !== expectedSubjectId || !isObject(value.economicAssurance)) {
    throw new TrustValidationError(['trustAssurance: invalid subject lineage or economic assurance']);
  }
  const economic = value.economicAssurance;
  for (const key of ['escrowRefs', 'depositRefs', 'insuranceRefs', 'refundAuthorityRefs'] as const) {
    if (!Array.isArray(economic[key]) || !economic[key].every(isRecordRef)) {
      throw new TrustValidationError([`trustAssurance.economicAssurance.${key}: invalid refs`]);
    }
  }
  if (economic.note !== undefined && typeof economic.note !== 'string') {
    throw new TrustValidationError(['trustAssurance.economicAssurance.note: expected string']);
  }
  return { profile, economicAssurance: economic as unknown as EconomicAssuranceView };
}

/** 组合时间线（最新 context + outcomes）。legacy=true 表示该动作暂无信任闭环记录。 */
export async function fetchTrustTimeline(soulCoreId: string, actionId: string): Promise<TrustActionTimelineV1> {
  const response = await apiFetch<unknown>(
    `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/actions/${encodeURIComponent(actionId)}/trust-timeline`,
  );
  return decodeTimeline(response, actionId);
}

export async function fetchTrustContext(soulCoreId: string, contextId: string): Promise<ActionContextV1> {
  const response = await apiFetch<unknown>(
    `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/trust-contexts/${encodeURIComponent(contextId)}`,
  );
  const context = validateValue<ActionContextV1>(unwrap(response), 'trustContext', validateActionContextV1);
  if (context.contextId !== contextId) throw new TrustValidationError(['trustContext.contextId: route lineage mismatch']);
  return context;
}

export async function fetchTrustOutcome(soulCoreId: string, outcomeId: string): Promise<OutcomeRecordV1> {
  const response = await apiFetch<unknown>(
    `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/trust-outcomes/${encodeURIComponent(outcomeId)}`,
  );
  const outcome = validateValue<OutcomeRecordV1>(unwrap(response), 'trustOutcome', validateOutcomeRecordV1);
  if (outcome.outcomeId !== outcomeId) throw new TrustValidationError(['trustOutcome.outcomeId: route lineage mismatch']);
  return outcome;
}

/** Verifications whose primary subject is the given record (e.g. an outcome). */
export async function fetchVerificationsBySubject(soulCoreId: string, subjectId: string): Promise<VerificationResultV1[]> {
  const response = await apiFetch<unknown>(
    `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/subjects/${encodeURIComponent(subjectId)}/trust-verifications`,
  );
  const records = decodeValidatedArray<VerificationResultV1>(response, 'trustVerifications', validateVerificationResultV1);
  if (records.some((record) => !record.subjectRefs.some((ref) => ref.id === subjectId))) {
    throw new TrustValidationError(['trustVerifications: subject route lineage mismatch']);
  }
  return records;
}

/** Disputes whose primary contested record is the given subject (e.g. an outcome). */
export async function fetchDisputesByContested(
  soulCoreId: string,
  subjectId: string,
  contestedType = 'outcome_record',
): Promise<DisputeCaseV1[]> {
  const response = await apiFetch<unknown>(
    `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/subjects/${encodeURIComponent(subjectId)}/trust-disputes?contestedType=${encodeURIComponent(contestedType)}`,
  );
  const records = decodeValidatedArray<DisputeCaseV1>(response, 'trustDisputes', validateDisputeCaseV1);
  if (records.some((record) => !record.contestedRefs.some((ref) => ref.id === subjectId && ref.type === contestedType))) {
    throw new TrustValidationError(['trustDisputes: contested route lineage mismatch']);
  }
  return records;
}

/**
 * Latest remedy execution per decided remedy. `status: 'confirmed'` WITH a
 * validated settlement ref means money actually moved; anything else remains owed/pending.
 */
export async function fetchDisputeRemedies(soulCoreId: string, disputeId: string): Promise<RemedyOutcome[]> {
  const response = await apiFetch<unknown>(
    `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/trust-disputes/${encodeURIComponent(disputeId)}/remedies`,
  );
  return decodeRemedies(response);
}

/** Feedback rights offered for a dispute (notice/explanation/contest/appeal/human-review). */
export async function fetchDisputeFeedbackRights(soulCoreId: string, disputeId: string): Promise<FeedbackRightV1[]> {
  const response = await apiFetch<unknown>(
    `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/trust-disputes/${encodeURIComponent(disputeId)}/feedback-rights`,
  );
  return decodeValidatedArray<FeedbackRightV1>(response, 'trustFeedbackRights', validateFeedbackRightV1);
}

function contextQuery(context?: ReputationContext): string {
  if (!context) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(context)) {
    if (value) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `&${parts.join('&')}` : '';
}

/** Latest contextual reputation card for a subject (no global score). */
export async function fetchReputationCard(
  soulCoreId: string,
  subjectKind: string,
  subjectId: string,
  context?: ReputationContext,
): Promise<ReputationCardV1> {
  const response = await apiFetch<unknown>(
    `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/subjects/${encodeURIComponent(subjectId)}/trust-reputation?subjectKind=${encodeURIComponent(subjectKind)}${contextQuery(context)}`,
  );
  return decodeReputation(response, subjectId);
}

/** Latest assurance profile + SEPARATE economic assurance (never behavioural reputation). */
export async function fetchAssuranceProfile(
  soulCoreId: string,
  subjectKind: string,
  subjectId: string,
): Promise<AssuranceProfileView> {
  const response = await apiFetch<unknown>(
    `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/subjects/${encodeURIComponent(subjectId)}/trust-assurance?subjectKind=${encodeURIComponent(subjectKind)}`,
  );
  return decodeAssurance(response, subjectId);
}

/** Shadow risk decision + telemetry (advisory only; never enforces execution). */
export interface RiskDecisionView {
  decision: RiskDecisionV1;
  actualDecision: string | null;
  disagreement: boolean | null;
}

/** Shadow risk decisions for an action. SHADOW ONLY — advisory, never enforces execution. */
export async function fetchRiskDecisions(soulCoreId: string, actionId: string): Promise<RiskDecisionView[]> {
  const response = await apiFetch<unknown>(
    `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/actions/${encodeURIComponent(actionId)}/trust-risk`,
  );
  return arrayValue(response, 'trustRisk').map((item, index) => {
    if (!isObject(item)) throw new TrustValidationError([`trustRisk[${index}]: expected object`]);
    const decision = validateValue<RiskDecisionV1>(
      item.decision,
      `trustRisk[${index}].decision`,
      validateRiskDecisionV1,
    );
    if (decision.actionId !== actionId
      || !(item.actualDecision === null || (AUTHORITY_DECISIONS as readonly unknown[]).includes(item.actualDecision))
      || !(item.disagreement === null || typeof item.disagreement === 'boolean')) {
      throw new TrustValidationError([`trustRisk[${index}]: invalid route lineage or telemetry`]);
    }
    return {
      decision,
      actualDecision: item.actualDecision as RiskDecisionView['actualDecision'],
      disagreement: item.disagreement as boolean | null,
    };
  });
}
