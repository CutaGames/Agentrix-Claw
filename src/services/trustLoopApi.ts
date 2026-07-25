/**
 * trustLoopApi — TL-01.4 (A 线) 移动端只读客户端。
 *
 * 复用共享 `apiFetch`（token + baseURL 已处理）——不新建 HTTP 客户端。消费后端
 * `/api/v1/soul-cores/:soulCoreId/...` 的 trust-loop 读接口，解包 `{ success, data }`。
 * 后端双 flag（SOUL_TRUST_LOOP_ENABLED + SOUL_TRUST_CONTEXT_OUTCOME_ENABLED）默认关 →
 * 404 → `apiFetch` 抛错 → 调用方 catch 后回退（不显示、不伪造）。只读；写接口不在移动端。
 */
import { apiFetch } from './api';
import type {
  ActionContextV1,
  AssuranceProfileV1,
  DisputeCaseV1,
  FeedbackRightV1,
  OutcomeRecordV1,
  RemedyOutcome,
  ReputationCardV1,
  ReputationContext,
  RiskDecisionV1,
  TrustActionTimelineV1,
  VerificationResultV1,
} from '../../shared/types/trust-loop-contracts';
import type { RecordRef } from '../../shared/types/trust-loop-primitives';

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

/**
 * 移动端入口开关（默认关，与后端 flag 对齐）。开启前后端 flag 未开时调用会 404 →
 * 回退。放量时同时开后端 flag 与此常量（后续可接远程灰度）。
 */
export const TRUST_LOOP_MOBILE_ENABLED = false;

interface Envelope<T> {
  success: boolean;
  data: T;
}

function unwrap<T>(res: Envelope<T> | T): T {
  if (res && typeof res === 'object' && 'success' in (res as any) && 'data' in (res as any)) {
    return (res as Envelope<T>).data;
  }
  return res as T;
}

/** 组合时间线（最新 context + outcomes）。legacy=true 表示该动作暂无信任闭环记录。 */
export async function fetchTrustTimeline(soulCoreId: string, actionId: string): Promise<TrustActionTimelineV1> {
  return unwrap<TrustActionTimelineV1>(
    await apiFetch(`/v1/soul-cores/${encodeURIComponent(soulCoreId)}/actions/${encodeURIComponent(actionId)}/trust-timeline`),
  );
}

export async function fetchTrustContext(soulCoreId: string, contextId: string): Promise<ActionContextV1> {
  return unwrap<ActionContextV1>(
    await apiFetch(`/v1/soul-cores/${encodeURIComponent(soulCoreId)}/trust-contexts/${encodeURIComponent(contextId)}`),
  );
}

export async function fetchTrustOutcome(soulCoreId: string, outcomeId: string): Promise<OutcomeRecordV1> {
  return unwrap<OutcomeRecordV1>(
    await apiFetch(`/v1/soul-cores/${encodeURIComponent(soulCoreId)}/trust-outcomes/${encodeURIComponent(outcomeId)}`),
  );
}

/** Verifications whose primary subject is the given record (e.g. an outcome). */
export async function fetchVerificationsBySubject(soulCoreId: string, subjectId: string): Promise<VerificationResultV1[]> {
  return unwrap<VerificationResultV1[]>(
    await apiFetch(`/v1/soul-cores/${encodeURIComponent(soulCoreId)}/subjects/${encodeURIComponent(subjectId)}/trust-verifications`),
  );
}

/** Disputes whose primary contested record is the given subject (e.g. an outcome). */
export async function fetchDisputesByContested(
  soulCoreId: string,
  subjectId: string,
  contestedType = 'outcome_record',
): Promise<DisputeCaseV1[]> {
  return unwrap<DisputeCaseV1[]>(
    await apiFetch(
      `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/subjects/${encodeURIComponent(subjectId)}/trust-disputes?contestedType=${encodeURIComponent(contestedType)}`,
    ),
  );
}

/**
 * Latest remedy execution per decided remedy. `status: 'confirmed'` WITH a
 * `settlementRef` means money actually moved; anything else is owed/pending.
 */
export async function fetchDisputeRemedies(soulCoreId: string, disputeId: string): Promise<RemedyOutcome[]> {
  return unwrap<RemedyOutcome[]>(
    await apiFetch(`/v1/soul-cores/${encodeURIComponent(soulCoreId)}/trust-disputes/${encodeURIComponent(disputeId)}/remedies`),
  );
}

/** Feedback rights offered for a dispute (notice/explanation/contest/appeal/human-review). */
export async function fetchDisputeFeedbackRights(soulCoreId: string, disputeId: string): Promise<FeedbackRightV1[]> {
  return unwrap<FeedbackRightV1[]>(
    await apiFetch(`/v1/soul-cores/${encodeURIComponent(soulCoreId)}/trust-disputes/${encodeURIComponent(disputeId)}/feedback-rights`),
  );
}

function contextQuery(context?: ReputationContext): string {
  if (!context) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(context)) if (v) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `&${parts.join('&')}` : '';
}

/** Latest contextual reputation card for a subject (no global score). */
export async function fetchReputationCard(
  soulCoreId: string,
  subjectKind: string,
  subjectId: string,
  context?: ReputationContext,
): Promise<ReputationCardV1> {
  return unwrap<ReputationCardV1>(
    await apiFetch(
      `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/subjects/${encodeURIComponent(subjectId)}/trust-reputation?subjectKind=${encodeURIComponent(subjectKind)}${contextQuery(context)}`,
    ),
  );
}

/** Latest assurance profile + SEPARATE economic assurance (never behavioural reputation). */
export async function fetchAssuranceProfile(
  soulCoreId: string,
  subjectKind: string,
  subjectId: string,
): Promise<AssuranceProfileView> {
  return unwrap<AssuranceProfileView>(
    await apiFetch(
      `/v1/soul-cores/${encodeURIComponent(soulCoreId)}/subjects/${encodeURIComponent(subjectId)}/trust-assurance?subjectKind=${encodeURIComponent(subjectKind)}`,
    ),
  );
}

/** Shadow risk decision + telemetry (advisory only; never enforces execution). */
export interface RiskDecisionView {
  decision: RiskDecisionV1;
  actualDecision: string | null;
  disagreement: boolean | null;
}

/** Shadow risk decisions for an action. SHADOW ONLY — advisory, never enforces execution. */
export async function fetchRiskDecisions(soulCoreId: string, actionId: string): Promise<RiskDecisionView[]> {
  return unwrap<RiskDecisionView[]>(
    await apiFetch(`/v1/soul-cores/${encodeURIComponent(soulCoreId)}/actions/${encodeURIComponent(actionId)}/trust-risk`),
  );
}
