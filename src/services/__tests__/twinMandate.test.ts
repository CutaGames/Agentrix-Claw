/**
 * REQ-backend-033 (2026-09-29) — 分身的代表范围 on the phone: read the mandate, and only
 * narrow or revoke it. Granting and widening stay on the web (D16 / 8.3).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { classifyMandateChangeV1, type RepresentationMandateV1 } from '../../../shared/types/representation-mandate';
import {
  availableTwinMandateNarrowings,
  describeTwinMandateLimits,
  narrowTwinMandate,
  planTwinMandateNarrowing,
  readTwinMandate,
  revokeTwinMandate,
  twinMandatePath,
} from '../twinMandate';

const AGENT = '75e5c531-4c1e-4d6a-9b0a-3f2e1d0c9b8a';
const BASE = 'https://api.example.test/api';
const NOW = Date.parse('2026-09-29T08:00:00.000Z');
const base = { baseUrl: BASE, token: 'tok' };
type Route = { status: number; body: unknown } | 'throw';

function transport(routes: Record<string, Route>): HttpTransportV1 & { calls: HttpRequestV1[] } {
  const calls: HttpRequestV1[] = [];
  return {
    calls,
    async request(request: HttpRequestV1): Promise<HttpResponseV1> {
      calls.push(request);
      const route = routes[`${request.method} ${request.path.replace(BASE, '')}`];
      if (!route) return { status: 599, headers: {}, body: undefined };
      if (route === 'throw') throw new Error('offline');
      return { status: route.status, headers: {}, body: route.body };
    },
  };
}

const mandate = (terms: Partial<RepresentationMandateV1['terms']> = {}, status: RepresentationMandateV1['status'] = 'active'): RepresentationMandateV1 => ({
  schemaVersion: 'agentrix.representation-mandate.v0',
  agentAccountId: AGENT,
  grantRef: 'grant-1',
  grantVersion: 3,
  status,
  revocationEpoch: 1,
  terms: {
    actions: ['answer', 'lead', 'paid_answer'],
    modes: ['text', 'voice'],
    audiences: ['public', 'agent'],
    channels: ['web', 'a2a'],
    topics: ['course'],
    dataClasses: ['public_facet'],
    collectionCeiling: { perOrder: { amountMinor: '5000', currency: 'SGD', decimals: 2 } },
    validFrom: '2026-09-01T00:00:00.000Z',
    handoffContactRefs: [],
    ...terms,
  },
});
const tightenReceipt = { v: 'agentrix.visibility.v1', objectKind: 'representation_mandate', objectRef: AGENT, tier: 'tighten', operations: ['mandate_narrow'], confirmedBy: 'none', previewDigest: null, at: '2026-09-29T08:00:00.000Z' };
const GET = `GET ${twinMandatePath('get', AGENT)}`;
const PUT = `PUT ${twinMandatePath('put', AGENT)}`;
const REVOKE = `POST ${twinMandatePath('revoke', AGENT)}`;

describe('paths', () => {
  it('drop the /api prefix of the contract routes', () => {
    expect(twinMandatePath('get', AGENT)).toBe(`/agent-accounts/${AGENT}/twin/mandate`);
    expect(twinMandatePath('revoke', AGENT)).toBe(`/agent-accounts/${AGENT}/twin/mandate/revoke`);
  });
});

describe('planTwinMandateNarrowing: only pure tightening leaves the phone', () => {
  it('dropping an action is a narrowing; dropping the last collecting action also drops the ceiling', () => {
    const plan = planTwinMandateNarrowing(mandate(), { kind: 'remove_action', action: 'paid_answer' }, NOW);
    expect(plan).toMatchObject({ ok: true });
    if (!plan.ok) return;
    expect(plan.terms.actions).toEqual(['answer', 'lead']);
    expect(plan.terms).not.toHaveProperty('collectionCeiling');
    expect(classifyMandateChangeV1(mandate().terms, plan.terms).tier).toBe('tighten');
  });

  it('never removes the last item (that is a revoke) or something that is not there', () => {
    expect(planTwinMandateNarrowing(mandate({ channels: ['web'] }), { kind: 'remove_channel', channel: 'web' }, NOW)).toEqual({ ok: false, reason: 'last_item' });
    expect(planTwinMandateNarrowing(mandate(), { kind: 'remove_channel', channel: 'wechat_h5' }, NOW)).toEqual({ ok: false, reason: 'not_present' });
  });

  it('"end in 7 days" only when it is earlier than the current end', () => {
    const plan = planTwinMandateNarrowing(mandate(), { kind: 'end_within_7d' }, NOW);
    expect(plan).toMatchObject({ ok: true, terms: { validUntil: '2026-10-06T08:00:00.000Z' } });
    expect(planTwinMandateNarrowing(mandate({ validUntil: '2026-10-01T00:00:00.000Z' }), { kind: 'end_within_7d' }, NOW)).toEqual({ ok: false, reason: 'not_a_narrowing' });
  });

  it('nothing for a mandate that is not in effect', () => {
    expect(planTwinMandateNarrowing(mandate({}, 'revoked'), { kind: 'remove_mode', mode: 'voice' }, NOW)).toEqual({ ok: false, reason: 'not_active' });
    expect(availableTwinMandateNarrowings(mandate({}, 'revoked'), NOW)).toEqual([]);
  });

  it('every offered option is a narrowing by the contract classifier', () => {
    const current = mandate();
    const options = availableTwinMandateNarrowings(current, NOW);
    expect(options.length).toBeGreaterThan(5);
    for (const option of options) {
      const plan = planTwinMandateNarrowing(current, option, NOW);
      expect(plan.ok).toBe(true);
      if (plan.ok) expect(classifyMandateChangeV1(current.terms, plan.terms)).toEqual({ tier: 'tighten', widened: [] });
    }
    // The phone never offers adding anything or clearing the topic list (empty topics = every topic).
    expect(options.map((o) => o.kind)).not.toContain('add_action');
    expect(JSON.stringify(options)).not.toContain('topic');
  });
});

describe('readTwinMandate', () => {
  it('reads a mandate, and none', async () => {
    expect(await readTwinMandate(AGENT, { ...base, transport: transport({ [GET]: { status: 200, body: { success: true, data: { mandate: mandate() } } } }) })).toEqual({ kind: 'ready', mandate: mandate() });
    expect(await readTwinMandate(AGENT, { ...base, transport: transport({ [GET]: { status: 200, body: { success: true, data: { mandate: null } } } }) })).toEqual({ kind: 'ready', mandate: null });
  });

  it('flags off, not the owner, malformed terms and a network error are all honest states', async () => {
    const run = (route: Route) => readTwinMandate(AGENT, { ...base, transport: transport({ [GET]: route }) });
    expect(await run({ status: 503, body: { code: 'REPRESENTATION_MANDATE_UNAVAILABLE' } })).toEqual({ kind: 'unavailable', reason: 'not_enabled' });
    expect(await run({ status: 404, body: {} })).toEqual({ kind: 'unavailable', reason: 'not_found' });
    expect(await run({ status: 200, body: { success: true, data: { mandate: { ...mandate(), terms: { ...mandate().terms, actions: [] } } } } })).toMatchObject({ kind: 'error', reason: 'response_malformed' });
    expect(await run('throw')).toMatchObject({ kind: 'error', reason: 'network', retryable: true });
    expect(await readTwinMandate('../not/an/id', { ...base, transport: transport({}) })).toEqual({ kind: 'unavailable', reason: 'agent_account_required' });
  });
});

describe('narrowTwinMandate and revokeTwinMandate', () => {
  it('sends the narrowed terms with no preview digest and accepts only a tightening receipt', async () => {
    const t = transport({ [PUT]: { status: 200, body: { success: true, data: { mandate: mandate({ actions: ['answer', 'lead'], collectionCeiling: undefined }), receipt: tightenReceipt } } } });
    const next = mandate();
    delete (next.terms as Partial<RepresentationMandateV1['terms']>).collectionCeiling;
    const outcome = await narrowTwinMandate(AGENT, mandate(), { kind: 'remove_action', action: 'paid_answer' }, { ...base, transport: t, nowMs: NOW });
    expect(outcome.kind).toBe('done');
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].body).toEqual({ terms: expect.objectContaining({ actions: ['answer', 'lead'] }) });
    expect(JSON.stringify(t.calls[0].body)).not.toContain('previewDigest');
  });

  it('a refused plan sends nothing', async () => {
    const t = transport({});
    expect(await narrowTwinMandate(AGENT, mandate({ modes: ['text'] }), { kind: 'remove_mode', mode: 'text' }, { ...base, transport: t })).toEqual({ kind: 'blocked', reason: 'last_item' });
    expect(t.calls).toHaveLength(0);
  });

  it('a loosening receipt, 428/403 and 409 never count as done', async () => {
    const run = (route: Route) => narrowTwinMandate(AGENT, mandate(), { kind: 'remove_mode', mode: 'voice' }, { ...base, transport: transport({ [PUT]: route }) });
    expect(await run({ status: 200, body: { success: true, data: { mandate: mandate(), receipt: { ...tightenReceipt, tier: 'loosen' } } } })).toEqual({ kind: 'failed', reason: 'receipt_not_tighten', retryable: false });
    expect(await run({ status: 428, body: { code: 'VISIBILITY_PREVIEW_REQUIRED' } })).toEqual({ kind: 'needs_web' });
    expect(await run({ status: 403, body: { code: 'STEP_UP_REQUIRED' } })).toEqual({ kind: 'needs_web' });
    expect(await run({ status: 409, body: { code: 'REPRESENTATION_MANDATE_CONFLICT' } })).toEqual({ kind: 'conflict' });
    expect(await run({ status: 503, body: { code: 'REPRESENTATION_MANDATE_UNAVAILABLE' } })).toEqual({ kind: 'failed', reason: 'not_enabled', retryable: false });
  });

  it('revoke posts to the revoke route and needs a tightening receipt', async () => {
    const t = transport({ [REVOKE]: { status: 200, body: { success: true, data: { receipt: { ...tightenReceipt, operations: ['mandate_revoke'] } } } } });
    expect(await revokeTwinMandate(AGENT, { ...base, transport: t })).toEqual({ kind: 'done', mandate: null });
    expect(t.calls[0].method).toBe('POST');
    expect(await revokeTwinMandate(AGENT, { baseUrl: BASE, transport: transport({}) })).toEqual({ kind: 'blocked', reason: 'authentication_required' });
  });
});

describe('no widening from the phone (source guard)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'twinMandate.ts'), 'utf8');
  const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'four-zone', 'TwinMandateSection.tsx'), 'utf8');
  it('never calls the preview route and never sends a digest', () => {
    expect(src).not.toMatch(/twinMandatePath\('preview'/);
    expect(src).not.toMatch(/previewDigest/);
    expect(screen).toMatch(/getTwinWebUrl/);
  });
});

describe('limits summary (read-only)', () => {
  it('shows the collection cap exactly, the topics and how many hand-off contacts, never their content', () => {
    const limits = describeTwinMandateLimits(mandate({ handoffContactRefs: ['inbox:owner'] }));
    expect(limits).toEqual({
      perOrder: '50.00 SGD',
      perDay: null,
      collects: true,
      topics: ['course'],
      handoffContacts: 1,
      handoffToOwnerInbox: true,
      validFrom: '2026-09-01T00:00:00.000Z',
      validUntil: null,
    });
    expect(JSON.stringify(limits)).not.toContain('inbox:owner');
    expect(describeTwinMandateLimits(mandate({ collectionCeiling: { perOrder: { amountMinor: '5000', currency: 'SGD', decimals: 2 }, perDay: { amountMinor: '20000', currency: 'SGD', decimals: 2 } } })).perDay).toBe('200.00 SGD');
  });

  it('no paid actions (or no cap) reads as "collects no money", and an empty topic list means every published topic', () => {
    const none = describeTwinMandateLimits(mandate({ actions: ['answer', 'lead'], topics: [] }));
    expect(none).toMatchObject({ perOrder: null, perDay: null, collects: false, topics: [], handoffContacts: 0, handoffToOwnerInbox: false });
    // A cap left over without paid actions is not shown as money the twin may collect.
    expect(describeTwinMandateLimits(mandate({ actions: ['answer'] })).perOrder).toBeNull();
  });
});
