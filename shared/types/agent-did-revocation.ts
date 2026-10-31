/**
 * DID revocation (L8 batch 2, B7). The owner of an Agent can revoke the DID the platform vouches for. It is one way:
 * a revoked DID is never valid again, and its identity credential no longer verifies. Behind
 * `AGENT_DID_REVOCATION_V1_ENABLED` (server, default off); the routes answer 404 while it is off.
 *
 * Routes (all under `/agent-accounts/:id`, object-authorized by the account guard; revoke and list are owner only):
 * - `POST /did/revoke`      body `{ reason? }` → `{ success, data: { did, reason, revokedAt } }`; 409 `did_already_revoked`.
 * - `GET  /did/revocations` → `{ success, data: { did, items: [{ did, reason, revokedAt }] } }`.
 * - `GET  /did/status`      → `{ success, data: { did, revoked, revokedAt } }`.
 * A revoked DID shows on the passport as `identityCredential: 'revoked'` (agent-passport.ts).
 */
export const AGENT_DID_REVOCATION_FLAG_V1 = 'AGENT_DID_REVOCATION_V1_ENABLED';

export const AGENT_DID_REVOCATION_REASONS_V1 = ['key_compromised', 'superseded', 'no_longer_used', 'other'] as const;
export type AgentDidRevocationReasonV1 = (typeof AGENT_DID_REVOCATION_REASONS_V1)[number];

export interface AgentDidRevocationV1 {
  did: string;
  reason: AgentDidRevocationReasonV1;
  /** ISO time. */
  revokedAt: string;
}

export interface AgentDidStatusV1 {
  did: string;
  revoked: boolean;
  revokedAt: string | null;
}

export function agentDidRevokePathV1(agentAccountId: string): string {
  return `/agent-accounts/${encodeURIComponent(agentAccountId)}/did/revoke`;
}

export function agentDidStatusPathV1(agentAccountId: string): string {
  return `/agent-accounts/${encodeURIComponent(agentAccountId)}/did/status`;
}

export function agentDidRevocationsPathV1(agentAccountId: string): string {
  return `/agent-accounts/${encodeURIComponent(agentAccountId)}/did/revocations`;
}

export function readAgentDidRevocationReasonV1(value: unknown): AgentDidRevocationReasonV1 | null {
  return (AGENT_DID_REVOCATION_REASONS_V1 as readonly unknown[]).includes(value) ? (value as AgentDidRevocationReasonV1) : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function decodeRevocation(value: unknown): AgentDidRevocationV1 | null {
  const row = record(value);
  const reason = readAgentDidRevocationReasonV1(row?.reason);
  if (!row || typeof row.did !== 'string' || !row.did.startsWith('did:') || !reason || !isIso(row.revokedAt)) return null;
  return { did: row.did, reason, revokedAt: row.revokedAt };
}

/** `{ success, data: { did, reason, revokedAt } }`. Anything else is unreadable. */
export function decodeAgentDidRevocationV1(body: unknown): AgentDidRevocationV1 | null {
  return decodeRevocation(record(body)?.data);
}

/** `{ success, data: { did, revoked, revokedAt } }`; `revoked` and `revokedAt` must agree. */
export function decodeAgentDidStatusV1(body: unknown): AgentDidStatusV1 | null {
  const data = record(record(body)?.data);
  if (!data || typeof data.did !== 'string' || !data.did.startsWith('did:') || typeof data.revoked !== 'boolean') return null;
  if (data.revoked) return isIso(data.revokedAt) ? { did: data.did, revoked: true, revokedAt: data.revokedAt } : null;
  return data.revokedAt === null || data.revokedAt === undefined ? { did: data.did, revoked: false, revokedAt: null } : null;
}

/** `{ success, data: { did, items } }`; one bad row makes the whole list unreadable. */
export function decodeAgentDidRevocationListV1(body: unknown): { did: string | null; items: AgentDidRevocationV1[] } | null {
  const data = record(record(body)?.data);
  if (!data || !Array.isArray(data.items) || data.items.length > 100) return null;
  const did = data.did === null ? null : typeof data.did === 'string' && data.did.startsWith('did:') ? data.did : undefined;
  if (did === undefined) return null;
  const items: AgentDidRevocationV1[] = [];
  for (const raw of data.items) {
    const item = decodeRevocation(raw);
    if (!item) return null;
    items.push(item);
  }
  return { did, items };
}
