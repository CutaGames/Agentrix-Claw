/**
 * mobileApprovalPolicy — what the phone may do with a desktop approval.
 *
 * M0-d (2026-09-27), tightened in M3-a (2026-09-28). Until the shared
 * approval-card contract lands (CONTRACTS.md "审批卡（三端同一张）",
 * REQ-desktop-001), the phone offers only what the backend will accept from
 * it. The rules mirror `assertApprovalResponsePolicy` in
 * `backend/src/modules/desktop-sync/remote-command-security.ts` (base
 * 9bd366c3), so no button is shown that is certain to fail:
 *   - L0 / L1, pending, unexpired: approve and reject.
 *   - L2: reject only. Approving needs `authorityReceiptRef` +
 *     `decisionReceiptRef`, which the phone cannot produce yet.
 *   - L3 and unknown risk levels: nothing on the phone. The backend requires
 *     a fresh `localConfirmationRef` from the computer for any L3 decision,
 *     reject included, and the desktop never honours a phone approval for L3.
 *   - Expired (or an unparsable expiry): nothing; the backend refuses both.
 *   - The response echoes the record's `requestDigest` (the backend rejects a
 *     decision without it) and never sends `rememberForSession`.
 *   - The result shown to the user is whatever the backend read-back says;
 *     the caller refreshes state after responding.
 */

export const MOBILE_APPROVAL_BLOCKED = 'MOBILE_APPROVAL_BLOCKED' as const;

export type MobileApprovalDecision = 'approved' | 'rejected';

export type MobileApprovalBlockReason =
  | 'missing_approval_id'
  | 'not_pending'
  | 'expired'
  /** L3 / unknown risk: only the computer can decide (approve or reject). */
  | 'requires_local_confirmation'
  /** L2 approve: needs authority + decision receipts the phone cannot produce yet. */
  | 'requires_receipt_refs';

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

export interface MobileApprovalResponseBody {
  decision: MobileApprovalDecision;
  requestDigest?: string;
}

export class MobileApprovalBlockedError extends Error {
  readonly code = MOBILE_APPROVAL_BLOCKED;
  readonly reason: MobileApprovalBlockReason;

  constructor(reason: MobileApprovalBlockReason) {
    super(`${MOBILE_APPROVAL_BLOCKED}: ${reason}`);
    this.name = 'MobileApprovalBlockedError';
    this.reason = reason;
  }
}

const PHONE_APPROVABLE_RISK = new Set(['L0', 'L1']);
const PHONE_REJECTABLE_RISK = new Set(['L0', 'L1', 'L2']);

function isExpired(expiresAt: string | null | undefined, now: number): boolean {
  if (!expiresAt) return false;
  const at = Date.parse(expiresAt);
  // An unparsable expiry fails closed.
  return !Number.isFinite(at) || at <= now;
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
  if (approval.status !== 'pending') return none('not_pending');
  if (isExpired(approval.expiresAt, now)) return none('expired');
  const risk = String(approval.riskLevel ?? '');
  if (!PHONE_REJECTABLE_RISK.has(risk)) return none('requires_local_confirmation');
  if (!PHONE_APPROVABLE_RISK.has(risk)) {
    return { canApprove: false, canReject: true, approveBlockedReason: 'requires_receipt_refs' };
  }
  return { canApprove: true, canReject: true };
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
  const digest = typeof approval?.requestDigest === 'string' ? approval.requestDigest.trim() : '';
  return { decision, ...(digest ? { requestDigest: digest } : {}) };
}

export function isMobileApprovalBlockedError(error: unknown): error is MobileApprovalBlockedError {
  return !!error && typeof error === 'object' && (error as { code?: unknown }).code === MOBILE_APPROVAL_BLOCKED;
}
