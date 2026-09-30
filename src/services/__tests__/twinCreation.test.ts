/**
 * T5 (REQ-mobile-047): the phone shows the nine-step creation read-only, with the shared step
 * model Web drives the flow with.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { DIGITAL_TWIN_CAPABILITIES_V1 } from '../../../shared/types/digital-twin';
import { fetchTwinCreation, twinCreationWebUrl } from '../twinCreation';

const AGENT = '75e5c531-4c1e-4d6a-9b0a-3f2e1d0c9b8a';
const BASE = 'https://api.example.test/api';
const NOW = '2026-09-29T08:00:00.000Z';
const base = { baseUrl: BASE, token: 'tok', now: () => NOW };
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

const P = `/v1/agents/${AGENT}/twin`;
const PROFILE = {
  schemaVersion: 1,
  contractVersion: 'digital-twin/v1',
  profileRef: { kind: 'digital_twin_profile', id: 'p1' },
  agentRef: { kind: 'agent_account', id: AGENT },
  ownerRef: { kind: 'principal', id: 'principal:user:u1' },
  environment: 'test',
  mode: 'private',
  state: 'private_draft',
  stateVersion: 1,
  prerequisites: { identity: 'active', represents: 'absent', likeness_consent: 'absent', mandate: 'absent', public_facet: 'absent' },
  likenessConsentRefs: [],
  bodyBindingRefs: [],
  seedInterim: true,
  createdAt: '2026-09-29T07:00:00.000Z',
  updatedAt: '2026-09-29T07:00:00.000Z',
};
const projection = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    schemaVersion: 1,
    contractVersion: 'digital-twin/v1',
    agentRef: { kind: 'agent_account', id: AGENT },
    environment: 'test',
    cohort: 'limited_preview',
    capabilities: DIGITAL_TWIN_CAPABILITIES_V1.map((capability) => ({ capability, status: 'available' })),
    profile: null,
    notImplemented: [],
    projectedAt: '2026-09-29T07:30:00.000Z',
    ...overrides,
  },
});
const profile = PROFILE;

async function read(routes: Record<string, Route>) {
  return fetchTwinCreation(AGENT, { ...base, transport: transport(routes) });
}

describe('fetchTwinCreation', () => {
  it('no profile yet: step 1 is next, every other step waits for it', async () => {
    const state = await read({ [`GET ${P}`]: { status: 200, body: projection() } });
    // The secondary reads 599 here, so the view is marked partial but still honest.
    expect(state.kind).toBe('ready');
    if (state.kind !== 'ready') return;
    expect(state.data.current).toBe('entry');
    expect(state.data.steps.filter((step) => step.id !== 'entry').every((step) => step.status === 'locked')).toBe(true);
    expect(state.data.partial).toBe(true);
  });

  it('a profile with nothing brought in: step 2 is next; the check and publish steps are not open without readiness', async () => {
    const state = await read({
      [`GET ${P}`]: { status: 200, body: projection({ profile }) },
      [`GET ${P}/interview`]: { status: 200, body: { success: true, data: { interim: null } } },
      [`GET ${P}/private/thread`]: { status: 200, body: { success: true, data: null } },
      [`GET ${P}/public`]: { status: 503, body: { code: 'digital_twin_capability_unavailable', capability: 'public', blockedBy: 'flag:DIGITAL_TWIN_PUBLIC_ENABLED' } },
    });
    expect(state.kind).toBe('ready');
    if (state.kind !== 'ready') return;
    expect(state.data.partial).toBe(false);
    expect(state.data.current).toBe('bring');
    const statusOf = (id: string) => state.data.steps.find((step) => step.id === id)?.status;
    expect(statusOf('entry')).toBe('done');
    expect(statusOf('bring')).toBe('available');
    // Local page material does not exist on the phone: rights wait for a source.
    expect(state.data.steps.find((step) => step.id === 'rights')).toMatchObject({ status: 'locked', lockReason: 'needs_source' });
    expect(statusOf('publish')).toBe('locked');
  });

  it('an accepted policy marks the services step done', async () => {
    const state = await read({
      [`GET ${P}`]: { status: 200, body: projection({ profile }) },
      [`GET ${P}/interview`]: { status: 200, body: { success: true, data: { interim: { policy: { version: 1 } } } } },
      [`GET ${P}/private/thread`]: { status: 200, body: { success: true, data: null } },
      [`GET ${P}/public`]: { status: 503, body: {} },
    });
    expect(state.kind === 'ready' ? state.data.steps.find((step) => step.id === 'services')?.status : null).toBe('done');
  });

  it('the projection decides: 404, 503, network and a wrong Agent are honest states, not a fake progress', async () => {
    expect(await read({ [`GET ${P}`]: { status: 404, body: {} } })).toMatchObject({ kind: 'unavailable', reason: 'not_found' });
    expect(await read({ [`GET ${P}`]: { status: 503, body: {} } })).toMatchObject({ kind: 'unavailable', reason: 'capability_unavailable' });
    expect(await read({ [`GET ${P}`]: 'throw' })).toMatchObject({ kind: 'error', reason: 'network' });
    const other = projection();
    (other.data as Record<string, unknown>).agentRef = { kind: 'agent_account', id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    expect(await read({ [`GET ${P}`]: { status: 200, body: other } })).toMatchObject({ kind: 'error', reason: 'projection_agent_mismatch' });
    expect(await fetchTwinCreation('../x', { ...base, transport: transport({}) })).toMatchObject({ kind: 'unavailable', reason: 'agent_account_required' });
  });

  it('only reads (four GETs, no write)', async () => {
    const t = transport({ [`GET ${P}`]: { status: 200, body: projection({ profile }) } });
    await fetchTwinCreation(AGENT, { ...base, transport: t });
    expect(t.calls.map((call) => call.method)).toEqual(['GET', 'GET', 'GET', 'GET']);
  });
});

describe('twinCreationWebUrl', () => {
  it('opens the Web step, or the flow when there is no step', () => {
    expect(twinCreationWebUrl(AGENT, 'bring', 'https://www.example.test')).toBe(`https://www.example.test/agents/${AGENT}/twin/create?step=bring`);
    expect(twinCreationWebUrl(AGENT, null, 'https://www.example.test')).toBe(`https://www.example.test/agents/${AGENT}/twin/create`);
    expect(twinCreationWebUrl('../x', 'bring')).toBeNull();
  });
});

describe('source guard', () => {
  it('uses the shared step model, never a copy', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'twinCreation.ts'), 'utf8');
    expect(src).toMatch(/from '\.\.\/\.\.\/shared\/types\/digital-twin-creation'/);
    expect(src).not.toMatch(/function resolveTwinCreation/);
  });
});
