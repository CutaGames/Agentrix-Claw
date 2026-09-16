/**
 * signRequest.service — mobile client for Trust3 sign-request lifecycle.
 *
 * Backed by the `/v1/wallet/sign-request` endpoint family (shipped in
 * Task 0.6). All mobile surfaces (ConversationBubble auto-spend, QuickPay,
 * remote-control gateway) share these calls.
 *
 * Phase 1 (T7):
 *   - createSignRequest() — originator endpoint; returns signRequestId
 *     and (if idempotency hit) cached signature.
 *   - getSignRequest() — pollable status; cheap, used for dedup before
 *     biometric prompt (R6.12).
 *   - completeSignRequest() — submit user-signed signature; backend
 *     marks status='completed' and emits presence event.
 *   - cancelSignRequest() — explicit user-initiated cancel or 60s timeout.
 *
 * Spec: requirements.md R6.3 / R6.10 / R6.12.
 */
import { apiFetch } from './api';

export type SignRequestReason =
  | 'wallet-transfer'
  | 'marketplace-purchase'
  | 'skill-install'
  | 'remote-control'
  | 'approval'
  | 'agentic-commerce-overlimit';

export type SignRequestStatus = 'pending' | 'completed' | 'cancelled' | 'expired';

export interface SignRequestSummary {
  id: string;
  status: SignRequestStatus;
  reason: SignRequestReason;
  metadata?: Record<string, unknown>;
  signature?: string | null;
  expiresAt?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  /** Server hint that the idempotencyKey already resolved successfully. */
  cachedHit?: boolean;
}

export interface CreateSignRequestPayload {
  reason: SignRequestReason;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
  originDeviceId?: string | null;
  timeoutSeconds?: number;
}

export async function createSignRequest(
  payload: CreateSignRequestPayload,
): Promise<SignRequestSummary> {
  return apiFetch<SignRequestSummary>('/v1/wallet/sign-request', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getSignRequest(id: string): Promise<SignRequestSummary> {
  return apiFetch<SignRequestSummary>(`/v1/wallet/sign-request/${encodeURIComponent(id)}`);
}

export async function completeSignRequest(
  id: string,
  signature: string,
): Promise<SignRequestSummary> {
  return apiFetch<SignRequestSummary>(
    `/v1/wallet/sign-request/${encodeURIComponent(id)}/complete`,
    {
      method: 'POST',
      body: JSON.stringify({ signature }),
    },
  );
}

export async function cancelSignRequest(
  id: string,
  reason?: string,
): Promise<SignRequestSummary> {
  return apiFetch<SignRequestSummary>(
    `/v1/wallet/sign-request/${encodeURIComponent(id)}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({ reason: reason ?? null }),
    },
  );
}
