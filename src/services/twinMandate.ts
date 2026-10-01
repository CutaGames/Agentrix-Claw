/**
 * twinMandate — the phone's side of the Representation Mandate (分身的代表范围;
 * `shared/types/representation-mandate.ts` v0.3, REQ-backend-033, D16).
 *
 * Tightening only. The phone reads the current mandate and can:
 * - narrow it: drop one action, audience, channel or mode, or make it end within 7 days;
 * - revoke it.
 * Both go straight to the backend without a preview digest. Before sending a
 * narrowing, the phone runs the contract's own validator and classifier on the
 * mandate as it read it and only sends a pure `tighten` with a real change.
 * The backend classifies again. Granting and widening open the web, where the
 * preview and the recent sign-in live.
 *
 * Endpoints (owner only; 404 for anyone else):
 *   GET  /agent-accounts/:id/twin/mandate          { mandate | null }
 *   PUT  /agent-accounts/:id/twin/mandate          { terms } → { mandate, receipt }
 *   POST /agent-accounts/:id/twin/mandate/revoke   → { receipt }
 */
import {
  REPRESENTATION_ACTIONS,
  REPRESENTATION_AUDIENCES,
  REPRESENTATION_CHANNELS,
  REPRESENTATION_HANDOFF_OWNER_INBOX_REF_V1,
  REPRESENTATION_MANDATE_ERROR_CODES,
  REPRESENTATION_MANDATE_ROUTES,
  REPRESENTATION_MANDATE_SCHEMA_VERSION,
  REPRESENTATION_MODES,
  classifyMandateChangeV1,
  validateRepresentationMandateTermsV1,
  type RepresentationActionV1,
  type RepresentationAudienceV1,
  type RepresentationChannelV1,
  type RepresentationMandateTermsV1,
  type RepresentationMandateV1,
  type RepresentationModeV1,
} from '../../shared/types/representation-mandate';
import { formatMoney } from '../../shared/types/order-escrow-view';
import { isSafeTwinAgentId, resolveTwinTransport, twinAuthHeaders, type TwinStatusTransportInput } from './twinStatus';

export const MANDATE_END_SOON_MS = 7 * 24 * 60 * 60 * 1000;

export type TwinMandateRead =
  | { kind: 'ready'; mandate: RepresentationMandateV1 | null }
  | { kind: 'unavailable'; reason: 'not_enabled' | 'not_found' | 'agent_account_required' | 'authentication_required' }
  | { kind: 'error'; reason: string; retryable: boolean };

export type TwinMandateNarrowing =
  | { kind: 'remove_action'; action: RepresentationActionV1 }
  | { kind: 'remove_audience'; audience: RepresentationAudienceV1 }
  | { kind: 'remove_channel'; channel: RepresentationChannelV1 }
  | { kind: 'remove_mode'; mode: RepresentationModeV1 }
  | { kind: 'end_within_7d' };

export type TwinMandatePlan =
  | { ok: true; terms: RepresentationMandateTermsV1 }
  | { ok: false; reason: 'not_active' | 'not_present' | 'last_item' | 'not_a_narrowing' | 'invalid' };

export type TwinMandateOutcome =
  | { kind: 'done'; mandate: RepresentationMandateV1 | null }
  | { kind: 'blocked'; reason: string }
  | { kind: 'conflict' }
  | { kind: 'needs_web' }
  | { kind: 'failed'; reason: string; retryable: boolean };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Contract route with the `/api` prefix removed (the API base already ends in `/api`). */
export function twinMandatePath(route: keyof typeof REPRESENTATION_MANDATE_ROUTES, agentAccountId: string): string {
  return REPRESENTATION_MANDATE_ROUTES[route].replace(/^\/api/, '').replace(':id', encodeURIComponent(agentAccountId));
}

/** A mandate as the phone trusts it: known schema, well-formed ids and terms the contract validator accepts. */
export function normalizeTwinMandate(value: unknown): RepresentationMandateV1 | null {
  if (!isRecord(value) || value.schemaVersion !== REPRESENTATION_MANDATE_SCHEMA_VERSION) return null;
  if (typeof value.agentAccountId !== 'string' || typeof value.grantRef !== 'string' || !value.grantRef) return null;
  if (!Number.isInteger(value.grantVersion) || !Number.isInteger(value.revocationEpoch) || typeof value.status !== 'string') return null;
  if (!validateRepresentationMandateTermsV1(value.terms).valid) return null;
  return value as unknown as RepresentationMandateV1;
}

function withoutItem<T>(list: readonly T[], item: T): T[] | null {
  if (!list.includes(item)) return null;
  return list.filter((entry) => entry !== item);
}

/** The PUT body for one narrowing, or why the phone will not send it. */
export function planTwinMandateNarrowing(mandate: RepresentationMandateV1, change: TwinMandateNarrowing, nowMs: number = Date.now()): TwinMandatePlan {
  if (mandate.status !== 'active') return { ok: false, reason: 'not_active' };
  const current = mandate.terms;
  const next: RepresentationMandateTermsV1 = JSON.parse(JSON.stringify(current));
  const drop = <T>(list: readonly T[], item: T): T[] | TwinMandatePlan => {
    const remaining = withoutItem(list, item);
    if (!remaining) return { ok: false, reason: 'not_present' };
    // Nothing left means "no mandate": that is a revoke, not an edit.
    if (remaining.length === 0) return { ok: false, reason: 'last_item' };
    return remaining;
  };
  const isPlan = (value: unknown): value is TwinMandatePlan => isRecord(value) && 'ok' in value;
  switch (change.kind) {
    case 'remove_action': {
      const actions = drop(current.actions, change.action);
      if (isPlan(actions)) return actions;
      next.actions = actions;
      // Without paid answers or deposits the collection ceiling has nothing to cap.
      if (!actions.includes('paid_answer') && !actions.includes('deposit')) delete next.collectionCeiling;
      break;
    }
    case 'remove_audience': {
      const audiences = drop(current.audiences, change.audience);
      if (isPlan(audiences)) return audiences;
      next.audiences = audiences;
      break;
    }
    case 'remove_channel': {
      const channels = drop(current.channels, change.channel);
      if (isPlan(channels)) return channels;
      next.channels = channels;
      break;
    }
    case 'remove_mode': {
      const modes = drop(current.modes, change.mode);
      if (isPlan(modes)) return modes;
      next.modes = modes;
      break;
    }
    case 'end_within_7d': {
      const until = nowMs + MANDATE_END_SOON_MS;
      const currentUntil = current.validUntil ? Date.parse(current.validUntil) : Infinity;
      if (!(until < currentUntil)) return { ok: false, reason: 'not_a_narrowing' };
      next.validUntil = new Date(until).toISOString();
      break;
    }
    default:
      return { ok: false, reason: 'invalid' };
  }
  if (!validateRepresentationMandateTermsV1(next).valid) return { ok: false, reason: 'invalid' };
  const classified = classifyMandateChangeV1(current, next);
  if (classified.tier !== 'tighten' || JSON.stringify(next) === JSON.stringify(current)) return { ok: false, reason: 'not_a_narrowing' };
  return { ok: true, terms: next };
}

/** Which narrowings the screen can offer for this mandate (each one already passed the plan). */
export function availableTwinMandateNarrowings(mandate: RepresentationMandateV1, nowMs: number = Date.now()): TwinMandateNarrowing[] {
  const candidates: TwinMandateNarrowing[] = [
    ...REPRESENTATION_ACTIONS.map((action) => ({ kind: 'remove_action' as const, action })),
    ...REPRESENTATION_AUDIENCES.map((audience) => ({ kind: 'remove_audience' as const, audience })),
    ...REPRESENTATION_CHANNELS.map((channel) => ({ kind: 'remove_channel' as const, channel })),
    ...REPRESENTATION_MODES.map((mode) => ({ kind: 'remove_mode' as const, mode })),
    { kind: 'end_within_7d' },
  ];
  return candidates.filter((change) => planTwinMandateNarrowing(mandate, change, nowMs).ok);
}

async function send(
  method: 'GET' | 'PUT' | 'POST',
  path: string,
  body: unknown,
  input: TwinStatusTransportInput,
): Promise<{ status: number; body: unknown } | { blocked: string } | null> {
  const { baseUrl, token, transport } = resolveTwinTransport(input);
  if (!token) return { blocked: 'authentication_required' };
  try {
    const response = await transport.request({
      method,
      path: `${baseUrl}${path}`,
      headers: { ...twinAuthHeaders(token), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body } : {}),
    });
    return { status: response.status, body: response.body };
  } catch {
    return null;
  }
}

function dataOf(body: unknown): Record<string, unknown> | null {
  return isRecord(body) && body.success === true && isRecord(body.data) ? body.data : null;
}

export async function readTwinMandate(agentAccountId: string, input: TwinStatusTransportInput = {}): Promise<TwinMandateRead> {
  if (!isSafeTwinAgentId(agentAccountId)) return { kind: 'unavailable', reason: 'agent_account_required' };
  const response = await send('GET', twinMandatePath('get', agentAccountId), undefined, input);
  if (!response) return { kind: 'error', reason: 'network', retryable: true };
  if ('blocked' in response) return { kind: 'unavailable', reason: 'authentication_required' };
  if (response.status === 503) return { kind: 'unavailable', reason: 'not_enabled' };
  if (response.status === 404) return { kind: 'unavailable', reason: 'not_found' };
  if (response.status < 200 || response.status >= 300) {
    return { kind: 'error', reason: `http_${response.status}`, retryable: response.status >= 500 || response.status === 429 };
  }
  const data = dataOf(response.body);
  if (!data || !('mandate' in data)) return { kind: 'error', reason: 'response_malformed', retryable: false };
  if (data.mandate === null) return { kind: 'ready', mandate: null };
  const mandate = normalizeTwinMandate(data.mandate);
  return mandate ? { kind: 'ready', mandate } : { kind: 'error', reason: 'response_malformed', retryable: false };
}

function writeOutcome(response: Awaited<ReturnType<typeof send>>, expectMandate: boolean): TwinMandateOutcome {
  if (!response) return { kind: 'failed', reason: 'network', retryable: true };
  if ('blocked' in response) return { kind: 'blocked', reason: response.blocked };
  const code = isRecord(response.body) && typeof response.body.code === 'string' ? response.body.code : '';
  if (response.status === 409) return { kind: 'conflict' };
  // 428 / 403 mean the backend saw a loosening: never retried from the phone.
  if (response.status === 428 || response.status === 403) return { kind: 'needs_web' };
  if (response.status === 503 || code === REPRESENTATION_MANDATE_ERROR_CODES.unavailable) return { kind: 'failed', reason: 'not_enabled', retryable: false };
  if (response.status < 200 || response.status >= 300) {
    return { kind: 'failed', reason: code || `http_${response.status}`, retryable: response.status >= 500 || response.status === 429 };
  }
  const data = dataOf(response.body);
  const receipt = data && isRecord(data.receipt) ? data.receipt : null;
  // Only a tightening receipt counts as done on the phone.
  if (!receipt || receipt.tier !== 'tighten') return { kind: 'failed', reason: 'receipt_not_tighten', retryable: false };
  if (!expectMandate) return { kind: 'done', mandate: null };
  const mandate = data && data.mandate !== null ? normalizeTwinMandate(data.mandate) : null;
  return { kind: 'done', mandate };
}

/** Send one narrowing. Nothing is sent unless the plan says it is a pure tightening. */
export async function narrowTwinMandate(
  agentAccountId: string,
  mandate: RepresentationMandateV1,
  change: TwinMandateNarrowing,
  input: TwinStatusTransportInput & { nowMs?: number } = {},
): Promise<TwinMandateOutcome> {
  if (!isSafeTwinAgentId(agentAccountId)) return { kind: 'blocked', reason: 'agent_account_required' };
  const plan = planTwinMandateNarrowing(mandate, change, input.nowMs ?? Date.now());
  if (plan.ok === false) return { kind: 'blocked', reason: plan.reason };
  return writeOutcome(await send('PUT', twinMandatePath('put', agentAccountId), { terms: plan.terms }, input), true);
}

/** Revoke the mandate (tightening, takes effect at once). */
export async function revokeTwinMandate(agentAccountId: string, input: TwinStatusTransportInput = {}): Promise<TwinMandateOutcome> {
  if (!isSafeTwinAgentId(agentAccountId)) return { kind: 'blocked', reason: 'agent_account_required' };
  return writeOutcome(await send('POST', twinMandatePath('revoke', agentAccountId), {}, input), false);
}

// ---------------------------------------------------------------------------
// Read-only summary of the limits (M4-e2): what the owner should see before narrowing.

export interface TwinMandateLimits {
  /** Per-order collection cap, formatted exactly (no floating point); `null` = the twin cannot collect money. */
  perOrder: string | null;
  /** Per-day cap; `null` = none set (only meaningful when `perOrder` is set). */
  perDay: string | null;
  /** Whether paid answers or deposits are granted at all. */
  collects: boolean;
  /** Topic ids the twin may discuss; empty = every published topic. */
  topics: string[];
  /** Number of confirmed hand-off contacts (never their content). */
  handoffContacts: number;
  /** v0.4: hand-off goes to the owner's matters inbox (`inbox:owner`). */
  handoffToOwnerInbox: boolean;
  validFrom: string;
  validUntil: string | null;
}

export function describeTwinMandateLimits(mandate: RepresentationMandateV1): TwinMandateLimits {
  const terms = mandate.terms;
  const collects = terms.actions.includes('paid_answer') || terms.actions.includes('deposit');
  const ceiling = collects ? terms.collectionCeiling : undefined;
  return {
    perOrder: ceiling ? formatMoney(ceiling.perOrder) : null,
    perDay: ceiling?.perDay ? formatMoney(ceiling.perDay) : null,
    collects: collects && Boolean(ceiling),
    topics: [...terms.topics],
    handoffContacts: terms.handoffContactRefs.length,
    handoffToOwnerInbox: terms.handoffContactRefs.includes(REPRESENTATION_HANDOFF_OWNER_INBOX_REF_V1),
    validFrom: terms.validFrom,
    validUntil: terms.validUntil ?? null,
  };
}
