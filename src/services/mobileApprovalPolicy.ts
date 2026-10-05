/**
 * mobileApprovalPolicy — what the phone may do with a desktop approval.
 *
 * Since 09-28 on the shared approval-card contract v1
 * (`shared/types/approval-card.ts`, backend 6eb6dcf7, REQ-backend-019,
 * REQ-mobile-020). The phone is never the requesting computer and cannot sign
 * locally, so `approvalActionAvailableV1` gives it:
 *   - Reject: any risk level, while pending and also after expiry (reject is a
 *     tightening action, 8.3). Only `requestDigest` is needed.
 *   - Approve: L0 / L1 only, pending and unexpired. L2 / L3 (and unknown risk
 *     levels, treated as L3) are approved on the computer that asked, with its
 *     device signature.
 *   - Nothing once the record is approved or rejected.
 * Phone-side tightenings on top of the contract:
 *   - The status is projected locally too (`projectApprovalStatusV1`); an
 *     expiry that does not parse counts as expired (fail closed for approve).
 *   - A record without a well-formed `requestDigest` offers nothing: the
 *     backend requires the original digest and would refuse the decision.
 *   - `rememberForSession` is never sent.
 * The result shown to the user is the backend read-back; callers refresh
 * after responding.
 */
import {
  APPROVAL_REQUEST_DIGEST_PATTERN,
  approvalActionAvailableV1,
  normalizeApprovalRiskLevelV1,
  projectApprovalStatusV1,
  type ApprovalRespondRequestV1,
  type ApprovalStatusV1,
} from '../../shared/types/approval-card';

export const MOBILE_APPROVAL_BLOCKED = 'MOBILE_APPROVAL_BLOCKED' as const;

export type MobileApprovalDecision = 'approved' | 'rejected';

export type MobileApprovalBlockReason =
  | 'missing_approval_id'
  | 'missing_request_digest'
  | 'not_pending'
  | 'expired'
  /** L2 / L3 / unknown risk: approve on the computer that asked (device signature). */
  | 'requires_local_confirmation';

export interface MobileApprovalLike {
  approvalId?: string;
  riskLevel?: string;
  status?: string;
  expiresAt?: string | null;
  requestDigest?: string | null;
}

export interface MobileApprovalCapabilities {
  canApprove: boolean;
  canReject: boolean;
  approveBlockedReason?: MobileApprovalBlockReason;
  rejectBlockedReason?: MobileApprovalBlockReason;
}

export type MobileApprovalResponseBody = Pick<ApprovalRespondRequestV1, 'decision' | 'requestDigest'>;

export class MobileApprovalBlockedError extends Error {
  readonly code = MOBILE_APPROVAL_BLOCKED;
  readonly reason: MobileApprovalBlockReason;

  constructor(reason: MobileApprovalBlockReason) {
    super(`${MOBILE_APPROVAL_BLOCKED}: ${reason}`);
    this.name = 'MobileApprovalBlockedError';
    this.reason = reason;
  }
}

/** Contract projection plus: an expiry that does not parse counts as expired. */
export function mobileApprovalStatus(approval: MobileApprovalLike, now: number = Date.now()): ApprovalStatusV1 {
  const status = String(approval.status ?? '');
  if (status === 'expired') return 'expired';
  const projected = projectApprovalStatusV1(status, approval.expiresAt ?? null, now);
  if (projected === 'pending' && approval.expiresAt && !Number.isFinite(Date.parse(approval.expiresAt))) return 'expired';
  return projected;
}

function digestOf(approval: MobileApprovalLike | null | undefined): string {
  const digest = typeof approval?.requestDigest === 'string' ? approval.requestDigest.trim() : '';
  return APPROVAL_REQUEST_DIGEST_PATTERN.test(digest) ? digest : '';
}

function none(reason: MobileApprovalBlockReason): MobileApprovalCapabilities {
  return { canApprove: false, canReject: false, approveBlockedReason: reason, rejectBlockedReason: reason };
}

export function mobileApprovalCapabilities(
  approval: MobileApprovalLike | null | undefined,
  now: number = Date.now(),
): MobileApprovalCapabilities {
  const id = String(approval?.approvalId ?? '').trim();
  if (!approval || !id) return none('missing_approval_id');
  const status = mobileApprovalStatus(approval, now);
  if (status === 'approved' || status === 'rejected') return none('not_pending');
  if (!digestOf(approval)) return none('missing_request_digest');
  const onPhone = { riskLevel: approval.riskLevel, status, onRequestingDevice: false, canSignLocally: false };
  const canApprove = approvalActionAvailableV1({ ...onPhone, decision: 'approved' });
  const canReject = approvalActionAvailableV1({ ...onPhone, decision: 'rejected' });
  if (canApprove) return { canApprove, canReject };
  const risk = normalizeApprovalRiskLevelV1(approval.riskLevel);
  const approveBlockedReason: MobileApprovalBlockReason =
    risk === 'L2' || risk === 'L3' ? 'requires_local_confirmation' : status === 'expired' ? 'expired' : 'not_pending';
  return {
    canApprove: false,
    canReject,
    approveBlockedReason,
    ...(canReject ? {} : { rejectBlockedReason: 'not_pending' as const }),
  };
}

/** Build the respond body, or throw before any network call. */
export function buildMobileApprovalResponse(
  approval: MobileApprovalLike | null | undefined,
  decision: MobileApprovalDecision,
  now: number = Date.now(),
): MobileApprovalResponseBody {
  const caps = mobileApprovalCapabilities(approval, now);
  if (decision === 'approved' && !caps.canApprove) {
    throw new MobileApprovalBlockedError(caps.approveBlockedReason ?? 'requires_local_confirmation');
  }
  if (decision === 'rejected' && !caps.canReject) {
    throw new MobileApprovalBlockedError(caps.rejectBlockedReason ?? 'not_pending');
  }
  return { decision, requestDigest: digestOf(approval) };
}

export function isMobileApprovalBlockedError(error: unknown): error is MobileApprovalBlockedError {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === MOBILE_APPROVAL_BLOCKED;
}
