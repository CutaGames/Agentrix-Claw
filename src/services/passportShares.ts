/**
 * passportShares — the phone's side of Passport v4 audience shares (slice
 * 3.2) under D16 / product doc 8.3.
 *
 * Tightening only: the phone lists the owner's share receipts and can revoke
 * one (revoke is idempotent and takes effect at once; the row stays as the
 * receipt). Creating a share, adding fields or extending an expiry are
 * loosening actions and stay on Web (exact preview + step-up), so this module
 * deliberately has no create / preview / update call.
 *
 * Endpoints (backend `agent-account.controller.ts`, object-guarded by
 * `AgentAccountObjectGuard`):
 *   GET    /agent-accounts/:id/passport/shares
 *   DELETE /agent-accounts/:id/passport/shares/:shareId
 */
import { apiFetch } from './api';
import {
  passportShareStatus,
  type AgentPassportShareGrantV1,
  type PassportShareStatus,
} from '../../shared/types/agent-passport';

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
