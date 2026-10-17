/**
 * 人人都有分身 v1 on the phone (E116): read the one-tap home, make the twin in one tap, and fall
 * back to the old start card whenever the server has no everyone flow.
 */
import { describe, it, expect } from '@jest/globals';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { createTwinEveryone, fetchTwinEveryoneHome, getTwinEveryoneWebUrl, readTwinEveryoneHome } from '../twinEveryone';

const BASE = 'https://api.example.test/api';
const AGENT = '75e5c531-4c1e-4d6a-9b0a-3f2e1d0c9b8a';
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

const readyHome = {
  schemaVersion: 1,
  status: 'ready',
  twin: {
    agentAccountId: AGENT,
    profileState: 'ready_private',
    stopped: false,
    displayName: '小周',
    intro: '',
    knowledge: { points: 0, level: 0, hasIntro: false, answeredQuestions: 0, notes: 0, linkedImports: 0 },
    nextQuestion: null,
    answers: [],
    notes: [],
    boundaries: [],
    pendingQuestions: [],
    publicCard: { state: 'private', displayName: null, shareRoute: null, visitorAnswersLast24h: 0, visitorDailyCap: 30, canPublish: true },
    proSettingsRoute: `/agents/${AGENT}/twin?view=pro`,
  },
};

describe('twinEveryone', () => {
  it('reads the home and treats a missing or switched-off flow as absent', async () => {
    const t = transport({ 'GET /v1/me/twin': { status: 200, body: { success: true, data: { schemaVersion: 1, status: 'no_twin', agentAccountId: null } } } });
    expect(await fetchTwinEveryoneHome({ ...base, transport: t })).toEqual({ kind: 'ready', home: { schemaVersion: 1, status: 'no_twin', agentAccountId: null } });
    expect(t.calls[0].headers?.Authorization).toBe('Bearer tok');
    expect(readTwinEveryoneHome(404, undefined)).toEqual({ kind: 'absent' });
    expect(readTwinEveryoneHome(503, { code: 'digital_twin_capability_unavailable' })).toEqual({ kind: 'absent' });
    expect(readTwinEveryoneHome(200, { success: true, data: { schemaVersion: 1, status: 'unavailable', reasonCode: 'flag_off' } })).toEqual({ kind: 'absent' });
    expect(readTwinEveryoneHome(200, { success: true, data: { schemaVersion: 1, status: 'ready' } }).kind).toBe('error');
    expect(await fetchTwinEveryoneHome({ baseUrl: BASE, token: '', transport: t })).toEqual({ kind: 'unauthorized' });
  });

  it('makes the twin in one tap for the linked Agent, with an Idempotency-Key', async () => {
    const t = transport({ 'POST /v1/me/twin': { status: 200, body: { success: true, data: { status: 'applied', value: readyHome, operationRef: { kind: 'operation', id: 'op' } } } } });
    const result = await createTwinEveryone(AGENT, 'key-1', { ...base, transport: t });
    expect(result.kind).toBe('ready');
    expect(t.calls[0].body).toEqual({ schemaVersion: 1, agentAccountId: AGENT });
    expect(t.calls[0].headers?.['Idempotency-Key']).toBe('key-1');
  });

  it('leaves the choice of Agent to the owner and never sends an unsafe id', async () => {
    const t = transport({
      'POST /v1/me/twin': { status: 200, body: { success: true, data: { status: 'rejected', reasonCode: 'invalid_request', retryable: false, blockedBy: 'twin_everyone:agent_choice_required' } } },
    });
    expect(await createTwinEveryone('../etc', 'key-2', { ...base, transport: t })).toEqual({ kind: 'choice_required' });
    expect(t.calls[0].body).toEqual({ schemaVersion: 1 });
    expect(await createTwinEveryone(null, 'key-3', { ...base, transport: transport({ 'POST /v1/me/twin': 'throw' }) })).toEqual({ kind: 'error', reason: 'network' });
  });

  it('opens the Web home for everything else', () => {
    expect(getTwinEveryoneWebUrl('https://www.agentrix.top/')).toBe('https://www.agentrix.top/console/twin');
  });
});
