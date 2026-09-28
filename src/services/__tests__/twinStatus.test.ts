/**
 * M4-b (2026-09-28) — 分身 → 公开状态与急停 on the phone: read the stop and
 * publish views, and allow only the tightening commands (stop, unpublish)
 * under D16 / product doc 8.3. Publishing and resuming stay on Web.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  TWIN_STATUS_CAPABILITY,
  buildTwinTighteningRequest,
  deriveTwinVisibility,
  fetchTwinStatus,
  tightenTwin,
  twinPublicPath,
  twinStopPath,
} from '../twinStatus';
import { fourZoneTarget } from '../../navigation/four-zone/fourZoneRoutes';

const AGENT = '75e5c531-4c1e-4d6a-9b0a-3f2e1d0c9b8a';
const BASE = 'https://api.example.test/api';
const NOW = '2026-09-28T08:00:00.000Z';
const AT = '2026-09-28T07:00:00.000Z';
const base = { baseUrl: BASE, token: 'tok', now: () => NOW };

type Route = { status: number; body: unknown } | 'throw';

function transport(routes: Record<string, Route>): HttpTransportV1 & { calls: HttpRequestV1[] } {
  const calls: HttpRequestV1[] = [];
  return {
    calls,
    async request(request: HttpRequestV1): Promise<HttpResponseV1> {
      calls.push(request);
      const key = `${request.method} ${request.path.replace(BASE, '')}`;
      const route = routes[key];
      if (!route) return { status: 599, headers: {}, body: undefined };
      if (route === 'throw') throw new Error('offline');
      return { status: route.status, headers: {}, body: route.body };
    },
  };
}

const applied = (value: unknown) => ({ success: true, data: { status: 'applied', value, operationRef: { kind: 'operation', id: 'read' } } });

const plan = [
  { target: 'public_ingress', owner: 'digital-twin', status: 'converged', at: AT },
  { target: 'private_answers', owner: 'digital-twin', status: 'converged', at: AT },
  { target: 'mandate_actions', owner: 'Authority', status: 'not_applicable', reasonCode: 'blocked_tc_02_0', at: AT },
];

const stopRecord = (targets: unknown[], state: 'stopped' | 'resumed' = 'stopped') => ({
  schemaVersion: 1,
  record: 'interim_seed_stop',
  stopRef: { kind: 'twin_stop', id: 'stop_1' },
  profileRef: { kind: 'profile', id: 'p_1' },
  stopEpoch: 2,
  scope: 'all',
  state,
  targets,
  requestedAt: AT,
});

const stopView = (record: unknown = null, status: unknown = { stopped: false, stopPending: false, stopEpoch: 0 }) =>
  applied({ schemaVersion: 1, status, record, plan });

const facet = (state: 'published' | 'unpublished') => ({
  schemaVersion: 1,
  record: 'interim_seed_public_facet',
  notAGrant: true,
  facetRef: { kind: 'public_facet_interim', id: 'f_1' },
  profileRef: { kind: 'profile', id: 'p_1' },
  state,
  topics: ['design'],
  version: 1,
  publishedAt: state === 'published' ? AT : undefined,
  revokeEpoch: 1,
});

const publishView = (record: unknown = null) =>
  applied({
    schemaVersion: 1,
    record,
    readiness: {
      ready: false,
      checks: [
        { check: 'public_flag', status: 'ok', detail: '' },
        { check: 'represents', status: 'blocked', detail: 'operator verification missing' },
      ],
    },
    profileState: 'ready_private',
    shareRoute: `/share/agent/${AGENT}`,
  });

const reads = (stop: Route, publish: Route) =>
  transport({ [`GET ${twinStopPath(AGENT)}`]: stop, [`GET ${twinPublicPath(AGENT)}`]: publish });

describe('reading the status', () => {
  it('GETs the owner stop and publish views with the bearer token and surface header', async () => {
    const t = reads({ status: 200, body: stopView() }, { status: 200, body: publishView() });
    await fetchTwinStatus(AGENT, { ...base, transport: t });
    expect(t.calls.map((call) => `${call.method} ${call.path}`).sort()).toEqual([
      `GET ${BASE}/v1/agents/${AGENT}/twin/public`,
      `GET ${BASE}/v1/agents/${AGENT}/twin/stop`,
    ]);
    for (const call of t.calls) {
      expect(call.headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
      expect(call.body).toBeUndefined();
    }
  });

  it('private: no stop, not published; the plan lists what a stop would cover', async () => {
    const state = await fetchTwinStatus(AGENT, { ...base, transport: reads({ status: 200, body: stopView() }, { status: 200, body: publishView() }) });
    expect(state.kind).toBe('ready');
    if (state.kind !== 'ready') return;
    expect(state.data.visibility).toBe('private');
    expect(state.data.outstanding).toEqual([]);
    expect(state.data.targets.map((target) => target.target)).toEqual(['public_ingress', 'private_answers', 'mandate_actions']);
    expect(state.data.publishBlockedBy).toEqual(['represents']);
    expect(state.data.publicAvailable).toBe(true);
    expect(state.capturedAt).toBe(NOW);
  });

  it('public: the publish record says published', async () => {
    const state = await fetchTwinStatus(AGENT, { ...base, transport: reads({ status: 200, body: stopView() }, { status: 200, body: publishView(facet('published')) }) });
    expect(state).toMatchObject({ kind: 'ready', data: { visibility: 'public', published: true, publishedAt: AT, topics: ['design'] } });
  });

  it('unpublished reads as private', async () => {
    const state = await fetchTwinStatus(AGENT, { ...base, transport: reads({ status: 200, body: stopView() }, { status: 200, body: publishView(facet('unpublished')) }) });
    expect(state).toMatchObject({ kind: 'ready', data: { visibility: 'private', published: false } });
  });

  it('paused: a converged stop wins over a published record', async () => {
    const record = stopRecord([
      { target: 'public_ingress', owner: 'x', status: 'converged', at: AT },
      { target: 'mandate_actions', owner: 'x', status: 'not_applicable', reasonCode: 'blocked_tc_02_0', at: AT },
    ]);
    const state = await fetchTwinStatus(AGENT, {
      ...base,
      transport: reads({ status: 200, body: stopView(record, { stopped: true, stopPending: false, stopEpoch: 2 }) }, { status: 200, body: publishView(facet('published')) }),
    });
    expect(state).toMatchObject({ kind: 'ready', data: { visibility: 'paused', stopEpoch: 2, stoppedAt: AT, outstanding: [] } });
    if (state.kind === 'ready') expect(state.data.targets.map((target) => target.target)).toEqual(['public_ingress', 'mandate_actions']);
  });

  it('stopping: pending and unknown targets are outstanding, never counted as done', async () => {
    const record = stopRecord([
      { target: 'public_ingress', owner: 'x', status: 'converged', at: AT },
      { target: 'body_voice', owner: 'x', status: 'pending', reasonCode: 'provider_converge_required', at: AT },
      { target: 'visitor_sessions', owner: 'x', status: 'unknown', at: AT },
    ]);
    const state = await fetchTwinStatus(AGENT, { ...base, transport: reads({ status: 200, body: stopView(record) }, { status: 200, body: publishView() }) });
    expect(state).toMatchObject({ kind: 'ready', data: { visibility: 'stopping', outstanding: ['body_voice', 'visitor_sessions'] } });
  });

  it('recomputes the stop status from the record instead of trusting the status field', async () => {
    const record = stopRecord([{ target: 'body_avatar', owner: 'x', status: 'pending', at: AT }]);
    const claimsDone = { stopped: true, stopPending: false, stopEpoch: 2 };
    const state = await fetchTwinStatus(AGENT, { ...base, transport: reads({ status: 200, body: stopView(record, claimsDone) }, { status: 200, body: publishView() }) });
    expect(state).toMatchObject({ kind: 'ready', data: { visibility: 'stopping' } });
  });

  it('a resumed record reads as not stopped', async () => {
    const record = stopRecord([{ target: 'public_ingress', owner: 'x', status: 'converged', at: AT }], 'resumed');
    const state = await fetchTwinStatus(AGENT, { ...base, transport: reads({ status: 200, body: stopView(record) }, { status: 200, body: publishView(facet('published')) }) });
    expect(state).toMatchObject({ kind: 'ready', data: { visibility: 'public', outstanding: [] } });
  });

  it('public capability off (503) reads as private with the public page marked closed', async () => {
    const state = await fetchTwinStatus(AGENT, {
      ...base,
      transport: reads({ status: 200, body: stopView() }, { status: 503, body: { code: 'digital_twin_capability_unavailable', capability: 'public', reasonCode: 'capability_off' } }),
    });
    expect(state).toMatchObject({ kind: 'ready', data: { visibility: 'private', publicAvailable: false } });
  });

  it('any other publish failure is not guessed as private', async () => {
    const state = await fetchTwinStatus(AGENT, { ...base, transport: reads({ status: 200, body: stopView() }, { status: 500, body: {} }) });
    expect(state).toEqual({ kind: 'error', retryable: true, reason: 'http_500' });
  });

  it('maps HTTP failures of the stop view to read states', async () => {
    const run = (stop: Route) => fetchTwinStatus(AGENT, { ...base, transport: reads(stop, { status: 200, body: publishView() }) });
    await expect(run({ status: 401, body: {} })).resolves.toEqual({ kind: 'unauthorized', reason: 'authentication_required' });
    await expect(run({ status: 403, body: {} })).resolves.toEqual({ kind: 'forbidden', reason: 'agent_not_owned' });
    await expect(run({ status: 404, body: {} })).resolves.toEqual({ kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason: 'not_found' });
    await expect(run({ status: 503, body: { code: 'digital_twin_capability_unavailable', capability: 'digital_twin', blockedBy: 'flag:DIGITAL_TWIN_ENABLED' } })).resolves.toEqual({
      kind: 'unavailable',
      capability: 'digital_twin',
      reason: 'flag:DIGITAL_TWIN_ENABLED',
    });
    await expect(run('throw')).resolves.toEqual({ kind: 'error', retryable: true, reason: 'network' });
  });

  it('no twin yet is an honest unavailable state', async () => {
    const rejected = { success: true, data: { status: 'rejected', reasonCode: 'profile_not_found', retryable: false } };
    const state = await fetchTwinStatus(AGENT, { ...base, transport: reads({ status: 200, body: rejected }, { status: 200, body: rejected }) });
    expect(state).toEqual({ kind: 'unavailable', capability: TWIN_STATUS_CAPABILITY, reason: 'profile_not_found' });
  });

  it('a malformed stop record or an unknown schema version is not rendered', async () => {
    const badRecord = { ...stopRecord([{ target: 'public_ingress', owner: 'x', status: 'converged', at: AT }]), stopEpoch: 0 };
    await expect(
      fetchTwinStatus(AGENT, { ...base, transport: reads({ status: 200, body: stopView(badRecord) }, { status: 200, body: publishView() }) }),
    ).resolves.toEqual({ kind: 'error', retryable: false, reason: 'stop_view_malformed' });
    const v2 = applied({ schemaVersion: 2, status: {}, record: null, plan });
    await expect(fetchTwinStatus(AGENT, { ...base, transport: reads({ status: 200, body: v2 }, { status: 200, body: publishView() }) })).resolves.toMatchObject({
      kind: 'unsupported_schema',
      schemaVersion: '2',
    });
  });

  it('an unsafe agent id or a missing token sends nothing', async () => {
    const t = reads({ status: 200, body: stopView() }, { status: 200, body: publishView() });
    await expect(fetchTwinStatus('../admin', { ...base, transport: t })).resolves.toMatchObject({ kind: 'unavailable', reason: 'agent_account_required' });
    await expect(fetchTwinStatus('', { ...base, transport: t })).resolves.toMatchObject({ kind: 'unavailable', reason: 'agent_account_required' });
    await expect(fetchTwinStatus(AGENT, { ...base, token: '', transport: t })).resolves.toEqual({ kind: 'unauthorized', reason: 'authentication_required' });
    expect(t.calls).toHaveLength(0);
  });

  it('visibility precedence: stopping > paused > public > private', () => {
    expect(deriveTwinVisibility({ stopped: false, stopPending: true }, true)).toBe('stopping');
    expect(deriveTwinVisibility({ stopped: true, stopPending: false }, true)).toBe('paused');
    expect(deriveTwinVisibility({ stopped: false, stopPending: false }, true)).toBe('public');
    expect(deriveTwinVisibility({ stopped: false, stopPending: false }, false)).toBe('private');
  });
});

describe('tightening commands', () => {
  const commandRoutes = (route: Route) =>
    transport({ [`POST ${twinStopPath(AGENT)}`]: route, [`POST ${twinPublicPath(AGENT)}`]: route });

  it('stop POSTs scope all with no target list', async () => {
    const t = commandRoutes({ status: 200, body: applied(stopRecord([])) });
    await expect(tightenTwin(AGENT, 'stop', { ...base, transport: t })).resolves.toEqual({ kind: 'done', action: 'stop', replayed: false });
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].method).toBe('POST');
    expect(t.calls[0].path).toBe(`${BASE}/v1/agents/${AGENT}/twin/stop`);
    expect(t.calls[0].body).toEqual({ schemaVersion: 1, action: 'stop', scope: 'all' });
    expect(t.calls[0].headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
  });

  it('unpublish POSTs only the action (no topics)', async () => {
    const t = commandRoutes({ status: 200, body: { success: true, data: { status: 'replayed', value: {}, operationRef: { kind: 'operation', id: 'o' } } } });
    await expect(tightenTwin(AGENT, 'unpublish', { ...base, transport: t })).resolves.toEqual({ kind: 'done', action: 'unpublish', replayed: true });
    expect(t.calls[0].path).toBe(`${BASE}/v1/agents/${AGENT}/twin/public`);
    expect(t.calls[0].body).toEqual({ schemaVersion: 1, action: 'unpublish' });
  });

  it('D16: publish and resume are never sent from the phone', async () => {
    const t = commandRoutes({ status: 200, body: applied({}) });
    for (const action of ['publish', 'resume', 'grant', '', undefined]) {
      await expect(tightenTwin(AGENT, action as any, { ...base, transport: t })).resolves.toEqual({ kind: 'blocked', reason: 'action_not_allowed_on_phone' });
      expect(buildTwinTighteningRequest(AGENT, action)).toBeNull();
    }
    expect(t.calls).toHaveLength(0);
  });

  it('an unsafe agent id or a missing token sends nothing', async () => {
    const t = commandRoutes({ status: 200, body: applied({}) });
    await expect(tightenTwin('a/b/../c', 'stop', { ...base, transport: t })).resolves.toEqual({ kind: 'blocked', reason: 'agent_account_required' });
    await expect(tightenTwin(AGENT, 'stop', { ...base, token: '', transport: t })).resolves.toEqual({ kind: 'blocked', reason: 'authentication_required' });
    expect(t.calls).toHaveLength(0);
  });

  it('rejections and failures are reported, not shown as done', async () => {
    const run = (route: Route) => tightenTwin(AGENT, 'stop', { ...base, transport: commandRoutes(route) });
    await expect(run({ status: 200, body: { success: true, data: { status: 'rejected', reasonCode: 'profile_not_found', retryable: false } } })).resolves.toEqual({
      kind: 'rejected',
      action: 'stop',
      reasonCode: 'profile_not_found',
      retryable: false,
    });
    await expect(run({ status: 409, body: { code: 'digital_twin_version_conflict', reasonCode: 'version_conflict', retryable: false } })).resolves.toMatchObject({
      kind: 'rejected',
      reasonCode: 'version_conflict',
    });
    await expect(run({ status: 503, body: { reasonCode: 'flag_off', retryable: true } })).resolves.toMatchObject({ kind: 'rejected', reasonCode: 'flag_off', retryable: true });
    await expect(run({ status: 500, body: {} })).resolves.toEqual({ kind: 'failed', action: 'stop', reason: 'http_500', retryable: true });
    await expect(run({ status: 200, body: { success: true, data: { status: 'maybe' } } })).resolves.toMatchObject({ kind: 'failed', reason: 'response_malformed' });
    await expect(run('throw')).resolves.toEqual({ kind: 'failed', action: 'stop', reason: 'network', retryable: true });
  });
});

describe('source guards (D16)', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '..', 'twinStatus.ts'), 'utf8');
  const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'four-zone', 'TwinStatusScreen.tsx'), 'utf8');

  it('the service never builds a publish or resume body', () => {
    expect(service).not.toMatch(/['"]resume['"]/);
    expect(service).not.toMatch(/['"]publish['"]/);
    // The only POST bodies are the two built in buildTwinTighteningRequest.
    expect(service.match(/method: 'POST'/g)).toHaveLength(1);
    expect(service).not.toMatch(/method: '(PUT|PATCH|DELETE)'/);
  });

  it('the screen only sends stop / unpublish and hands loosening to the web twin workspace', () => {
    const sent = [...screen.matchAll(/mutate\('([^']*)'\)/g)].map((match) => match[1]).sort();
    expect(sent).toEqual(['stop', 'unpublish']);
    expect(screen).not.toMatch(/['"]resume['"]|['"]publish['"]/);
    expect(screen).toMatch(/getTwinWebUrl\(/);
    // Text on the danger fill uses the paired on-colour token (M1-g).
    expect(screen).toMatch(/color: c\.onDanger/);
  });

  it('twin/status opens the status screen', () => {
    expect(fourZoneTarget('twin', 'status')).toEqual({ tab: 'Twin', screen: 'TwinStatus' });
  });
});
