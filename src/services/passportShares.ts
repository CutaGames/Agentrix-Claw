/**
 * passportShares — the phone's side of Passport v4 audience shares (slice
 * 3.2) under D16 / product doc 8.3.
 *
 * Tightening only: the phone lists the owner's share receipts and can revoke
 * one (revoke is idempotent and takes effect at once; the row stays as the
 * receipt). Creating a share, adding fields or extending an expiry are
 * loosening actions and stay on Web (exact preview + step-up), so this module
 * deliberately has no create / preview call.
 *
 * M4-d (visibility contract v1, `shared/types/visibility-actions.ts`,
 * REQ-backend-017): two more tightening edits through PATCH, sent without a
 * preview digest — hide one field, and shorten the expiry to 7 days when that
 * is earlier than now. Before sending, the phone runs the contract's own
 * classifier (`classifyPassportShareUpdateV1`) on the share as it read it and
 * sends only when the result is `tighten` with a real change; the backend
 * classifies again and answers 428 for anything that would loosen.
 *
 * Endpoints (backend `agent-account.controller.ts`, object-guarded by
 * `AgentAccountObjectGuard`):
 *   GET    /agent-accounts/:id/passport/shares
 *   PATCH  /agent-accounts/:id/passport/shares/:shareId   (tightening body only)
 *   DELETE /agent-accounts/:id/passport/shares/:shareId
 *   GET    /agent-accounts/:id/passport/shares/:shareId/visitors   (D21, read-only)
 */
import { apiFetch } from './api';
import {
  isPassportAudience,
  passportShareStatus,
  type AgentPassportShareGrantV1,
  type PassportAudience,
  type PassportShareField,
  type PassportShareStatus,
} from '../../shared/types/agent-passport';
import {
  classifyPassportShareUpdateV1,
  validatePassportShareUpdateV1,
  type PassportShareUpdateV1,
  type VisibilityActionReceiptV1,
} from '../../shared/types/visibility-actions';
import { decodePassportShareVisitorsV1, type PassportShareVisitorsV1 } from '../../shared/types/agent-passport-visitors';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;

export const PASSPORT_SHARE_ID_INVALID = 'PASSPORT_SHARE_ID_INVALID' as const;

export interface MobilePassportShare {
  shareId: string;
  audience: string;
  label: string | null;
  fields: string[];
  status: PassportShareStatus;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
}

function sharesPath(agentAccountId: string): string {
  return `/agent-accounts/${encodeURIComponent(agentAccountId)}/passport/shares`;
}

function assertSafeId(value: string, what: string): void {
  if (!SAFE_ID.test(String(value ?? ''))) {
    const error = new Error(`${PASSPORT_SHARE_ID_INVALID}: ${what}`) as Error & { code: string };
    error.code = PASSPORT_SHARE_ID_INVALID;
    throw error;
  }
}

function unwrap(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const data = record.data;
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : record;
}

/** Keeps only what the phone shows; the status is recomputed from the dates, never trusted blindly. */
export function normalizePassportShare(input: unknown, now: number = Date.now()): MobilePassportShare | null {
  if (!input || typeof input !== 'object') return null;
  const grant = input as Partial<AgentPassportShareGrantV1>;
  if (typeof grant.shareId !== 'string' || !SAFE_ID.test(grant.shareId)) return null;
  if (typeof grant.audience !== 'string' || typeof grant.createdAt !== 'string') return null;
  const expiresAt = typeof grant.expiresAt === 'string' ? grant.expiresAt : null;
  const revokedAt = typeof grant.revokedAt === 'string' ? grant.revokedAt : null;
  return {
    shareId: grant.shareId,
    audience: grant.audience,
    label: typeof grant.label === 'string' ? grant.label : null,
    fields: Array.isArray(grant.fields) ? grant.fields.filter((field): field is AgentPassportShareGrantV1['fields'][number] => typeof field === 'string') : [],
    status: passportShareStatus({ expiresAt, revokedAt }, now),
    createdAt: grant.createdAt,
    expiresAt,
    revokedAt,
    accessCount: typeof grant.accessCount === 'number' && Number.isFinite(grant.accessCount) ? grant.accessCount : 0,
    lastAccessedAt: typeof grant.lastAccessedAt === 'string' ? grant.lastAccessedAt : null,
  };
}

export async function listPassportShares(agentAccountId: string, now: number = Date.now()): Promise<MobilePassportShare[]> {
  assertSafeId(agentAccountId, 'agentAccountId');
  const payload = await apiFetch<unknown>(sharesPath(agentAccountId), { method: 'GET' });
  const items = unwrap(payload)?.items;
  if (!Array.isArray(items)) return [];
  return items.map((item) => normalizePassportShare(item, now)).filter((item): item is MobilePassportShare => !!item);
}

/** Revoke one share link (tightening; idempotent). Returns the backend's read-back. */
export async function revokePassportShare(
  agentAccountId: string,
  shareId: string,
  now: number = Date.now(),
): Promise<MobilePassportShare | null> {
  assertSafeId(agentAccountId, 'agentAccountId');
  assertSafeId(shareId, 'shareId');
  const payload = await apiFetch<unknown>(`${sharesPath(agentAccountId)}/${encodeURIComponent(shareId)}`, { method: 'DELETE' });
  return normalizePassportShare(unwrap(payload)?.grant, now);
}

// ---------------------------------------------------------------------------
// M4-f: who visited a link (D21, `shared/types/agent-passport-visitors.ts`). Read-only.

export type PassportShareVisitorsRead =
  | { kind: 'ready'; visitors: PassportShareVisitorsV1 }
  /** Could not be read or did not decode: say so, never "no visitors". */
  | { kind: 'unavailable'; reason: string };

/**
 * `GET /agent-accounts/:id/passport/shares/:shareId/visitors`. Decoded with the contract's
 * own decoder (the same one Web uses); a list for another share is not trusted.
 */
export async function readPassportShareVisitors(agentAccountId: string, shareId: string): Promise<PassportShareVisitorsRead> {
  assertSafeId(agentAccountId, 'agentAccountId');
  assertSafeId(shareId, 'shareId');
  let payload: unknown;
  try {
    payload = await apiFetch<unknown>(`${sharesPath(agentAccountId)}/${encodeURIComponent(shareId)}/visitors`, { method: 'GET' });
  } catch {
    return { kind: 'unavailable', reason: 'read_failed' };
  }
  const decoded = decodePassportShareVisitorsV1(unwrap(payload)?.visitors);
  if (decoded.ok === false) return { kind: 'unavailable', reason: `decode_${decoded.reason}` };
  if (decoded.value.shareId !== shareId) return { kind: 'unavailable', reason: 'decode_shareId' };
  return { kind: 'ready', visitors: decoded.value };
}

// ---------------------------------------------------------------------------
// M4-d: tightening edits (visibility contract v1)

export type PassportShareTightening =
  | { kind: 'hide_field'; field: PassportShareField }
  | { kind: 'shorten_to_7d' };

export type PassportShareTighteningPlan =
  | { ok: true; body: PassportShareUpdateV1 }
  | { ok: false; reason: 'not_active' | 'unknown_audience' | 'not_a_tightening' | 'invalid' };

/**
 * The PATCH body for one tightening, or why there is none. Uses the
 * contract's classifier on the share exactly as the phone read it; anything
 * that is not a pure `tighten` with at least one change is refused here.
 */
export function planPassportShareTightening(
  share: MobilePassportShare,
  change: PassportShareTightening,
  now: number = Date.now(),
): PassportShareTighteningPlan {
  if (share.status !== 'active') return { ok: false, reason: 'not_active' };
  if (!isPassportAudience(share.audience)) return { ok: false, reason: 'unknown_audience' };
  const audience: PassportAudience = share.audience;
  let body: PassportShareUpdateV1;
  if (change.kind === 'hide_field') {
    if (!share.fields.includes(change.field)) return { ok: false, reason: 'not_a_tightening' };
    body = { fields: share.fields.filter((field) => field !== change.field) as PassportShareField[] };
  } else {
    body = { expiresIn: '7d' };
  }
  const validated = validatePassportShareUpdateV1(body, audience);
  if ('errors' in validated) return { ok: false, reason: 'invalid' };
  const classified = classifyPassportShareUpdateV1(
    { audience, fields: share.fields as PassportShareField[], expiresAt: share.expiresAt, revokedAt: share.revokedAt },
    validated.value,
    now,
  );
  if ('code' in classified) return { ok: false, reason: 'not_active' };
  if (classified.tier !== 'tighten' || classified.operations.length === 0) return { ok: false, reason: 'not_a_tightening' };
  return { ok: true, body: validated.value };
}

export interface PassportShareTighteningResult {
  share: MobilePassportShare | null;
  /** The backend's receipt; the phone treats only `tier: 'tighten'` as done. */
  receiptTier: VisibilityActionReceiptV1['tier'] | null;
}

export const PASSPORT_SHARE_NOT_TIGHTENING = 'PASSPORT_SHARE_NOT_TIGHTENING' as const;

/** Apply one tightening edit. Throws before any request when the plan refuses it. */
export async function tightenPassportShare(
  agentAccountId: string,
  share: MobilePassportShare,
  change: PassportShareTightening,
  now: number = Date.now(),
): Promise<PassportShareTighteningResult> {
  assertSafeId(agentAccountId, 'agentAccountId');
  assertSafeId(share.shareId, 'shareId');
  const plan = planPassportShareTightening(share, change, now);
  if ('reason' in plan) {
    const error = new Error(`${PASSPORT_SHARE_NOT_TIGHTENING}: ${plan.reason}`) as Error & { code: string; reason: string };
    error.code = PASSPORT_SHARE_NOT_TIGHTENING;
    error.reason = plan.reason;
    throw error;
  }
  const payload = await apiFetch<unknown>(`${sharesPath(agentAccountId)}/${encodeURIComponent(share.shareId)}`, {
    method: 'PATCH',
    body: JSON.stringify(plan.body),
  });
  const data = unwrap(payload);
  const receipt = data && typeof data.receipt === 'object' && data.receipt ? (data.receipt as Record<string, unknown>) : null;
  const tier = receipt && (receipt.tier === 'tighten' || receipt.tier === 'loosen' || receipt.tier === 'content_edit') ? receipt.tier : null;
  return { share: normalizePassportShare(data?.grant, now), receiptTier: tier };
}
