/**
 * M4-c (2026-09-28) — 分身名片 on the phone: owner projection (does a twin
 * exist), the anonymous visitor view, and sharing only the canonical public
 * page while a visitor can open it (D16: no publishing, no card snapshot).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { DIGITAL_TWIN_CAPABILITIES_V1, decodeDigitalTwinProjectionV1 } from '../../../shared/types/digital-twin';
import { DIGITAL_TWIN_AI_DISCLOSURE_V1 } from '../../../shared/types/digital-twin-public';
import { APP_URL } from '../../config/env';
import {
  canShareTwinCard,
  fetchTwinOverview,
  fetchTwinPublicCard,
  publicTwinPath,
  twinCardShareMessage,
  twinCardSharePath,
  twinCardShareUrl,
  twinProjectionPath,
  type MobileTwinPublicCard,
} from '../twinCard';

const AGENT = '75e5c531-4c1e-4d6a-9b0a-3f2e1d0c9b8a';
const BASE = 'https://api.example.test/api';
const base = { baseUrl: BASE, token: 'tok', now: () => '2026-09-28T10:00:00.000Z' };

function transport(status: number, body: unknown): HttpTransportV1 & { calls: HttpRequestV1[] } {
  const calls: HttpRequestV1[] = [];
  return {
    calls,
    async request(request: HttpRequestV1): Promise<HttpResponseV1> {
      calls.push(request);
      return { status, headers: {}, body };
    },
  };
}

const PROFILE = {
  schemaVersion: 1,
  contractVersion: 'digital-twin/v1',
  profileRef: { kind: 'digital_twin_profile', id: 'p1' },
  agentRef: { kind: 'agent_account', id: AGENT },
  ownerRef: { kind: 'principal', id: 'principal:user:u1' },
  environment: 'test',
  mode: 'private',
  state: 'ready_private',
  stateVersion: 1,
  prerequisites: { identity: 'active', represents: 'absent', likeness_consent: 'absent', mandate: 'absent', public_facet: 'absent' },
  likenessConsentRefs: [],
  bodyBindingRefs: [],
  seedInterim: true,
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-27T00:00:00.000Z',
};

const projection = (profile: unknown, overrides: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    schemaVersion: 1,
    contractVersion: 'digital-twin/v1',
    agentRef: { kind: 'agent_account', id: AGENT },
    environment: 'test',
    cohort: 'limited_preview',
    capabilities: DIGITAL_TWIN_CAPABILITIES_V1.map((capability) => ({ capability, status: 'available' })),
    profile,
    notImplemented: [],
    projectedAt: '2026-09-28T09:00:00.000Z',
    ...overrides,
  },
});

const publicProjection = (overrides: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    schemaVersion: 1,
    agentRef: { kind: 'agent_account', id: AGENT },
    state: 'available',
    aiDisclosure: DIGITAL_TWIN_AI_DISCLOSURE_V1,
    creator: { displayName: 'Lin', source: 'owner_nickname' },
    official: null,
    topics: ['brand design', 'pricing'],
    offers: ['Logo review'],
    askHuman: ['email'],
    reportContact: 'mailto:report@agentrix.top',
    facetVersion: 1,
    projectedAt: '2026-09-28T09:00:00.000Z',
    ...overrides,
  },
});

describe('owner overview', () => {
  it('the fixtures are valid for the shared decoder (so a failure below is the client, not the fixture)', () => {
    expect(decodeDigitalTwinProjectionV1(projection(null).data)).toMatchObject({ ok: true });
    expect(decodeDigitalTwinProjectionV1(projection(PROFILE).data)).toMatchObject({ ok: true });
  });

  it('a profile means a twin exists', async () => {
    const state = await fetchTwinOverview(AGENT, { ...base, transport: transport(200, projection(PROFILE)) });
    expect(state).toEqual({ kind: 'ready', capturedAt: '2026-09-28T10:00:00.000Z', data: { hasProfile: true, profileState: 'ready_private' } });
  });

  it('GETs the owner projection and reports whether a profile exists', async () => {
    const withNull = transport(200, projection(null));
    const none = await fetchTwinOverview(AGENT, { ...base, transport: withNull });
    expect(none).toEqual({ kind: 'ready', capturedAt: '2026-09-28T10:00:00.000Z', data: { hasProfile: false, profileState: null } });
    expect(withNull.calls[0]).toMatchObject({ method: 'GET', path: `${BASE}${twinProjectionPath(AGENT)}` });
    expect(withNull.calls[0].headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
  });

  it('a contract drift is an error state, never "no twin"', async () => {
    const drift = await fetchTwinOverview(AGENT, { ...base, transport: transport(200, projection(null, { surprise: true })) });
    expect(drift).toMatchObject({ kind: 'error', retryable: false });
    const newer = await fetchTwinOverview(AGENT, { ...base, transport: transport(200, projection(null, { schemaVersion: 2 })) });
    expect(newer.kind).toBe('unsupported_schema');
    const other = await fetchTwinOverview(AGENT, {
      ...base,
      transport: transport(200, projection(null, { agentRef: { kind: 'agent_account', id: '11111111-2222-4333-8444-555555555555' } })),
    });
    expect(other).toEqual({ kind: 'error', retryable: false, reason: 'projection_agent_mismatch' });
  });

  it('maps HTTP failures and sends nothing without a token or a safe id', async () => {
    await expect(fetchTwinOverview(AGENT, { ...base, transport: transport(503, { blockedBy: 'flag:DIGITAL_TWIN_ENABLED' }) })).resolves.toMatchObject({
      kind: 'unavailable',
      reason: 'flag:DIGITAL_TWIN_ENABLED',
    });
    await expect(fetchTwinOverview(AGENT, { ...base, transport: transport(404, {}) })).resolves.toMatchObject({ kind: 'unavailable', reason: 'not_found' });
    const t = transport(200, projection(null));
    await expect(fetchTwinOverview(AGENT, { ...base, token: '', transport: t })).resolves.toMatchObject({ kind: 'unauthorized' });
    await expect(fetchTwinOverview('x/../y', { ...base, transport: t })).resolves.toMatchObject({ kind: 'unavailable', reason: 'agent_account_required' });
    expect(t.calls).toHaveLength(0);
  });
});

describe('visitor view', () => {
  it('reads the public projection anonymously (no bearer token)', async () => {
    const t = transport(200, publicProjection());
    const state = await fetchTwinPublicCard(AGENT, { ...base, transport: t });
    expect(t.calls[0]).toMatchObject({ method: 'GET', path: `${BASE}${publicTwinPath(AGENT)}` });
    expect(t.calls[0].headers).not.toHaveProperty('Authorization');
    expect(JSON.stringify(t.calls[0])).not.toMatch(/tok/);
    expect(state).toMatchObject({
      kind: 'ready',
      data: { state: 'available', creatorName: 'Lin', topics: ['brand design', 'pricing'], offers: ['Logo review'], askHuman: ['email'] },
    });
  });

  it('paused / unavailable carry no creator name', async () => {
    const paused = await fetchTwinPublicCard(AGENT, { ...base, transport: transport(200, publicProjection({ state: 'paused', reasonCode: 'stopped', creator: undefined })) });
    expect(paused).toMatchObject({ kind: 'ready', data: { state: 'paused', reasonCode: 'stopped', creatorName: null } });
  });

  it('refuses what the shared decoder refuses (leaks, wrong disclosure, creator while paused)', async () => {
    const leak = await fetchTwinPublicCard(AGENT, { ...base, transport: transport(200, publicProjection({ offers: ['ownerPrincipalId=abc'] })) });
    expect(leak).toMatchObject({ kind: 'error', reason: 'public_projection_unknown_field' });
    const disclosure = await fetchTwinPublicCard(AGENT, { ...base, transport: transport(200, publicProjection({ aiDisclosure: { 'zh-CN': 'x', en: 'x' } })) });
    expect(disclosure.kind).toBe('error');
    const creatorWhilePaused = await fetchTwinPublicCard(AGENT, { ...base, transport: transport(200, publicProjection({ state: 'paused' })) });
    expect(creatorWhilePaused.kind).toBe('error');
  });

  it('caps list lengths and drops empty entries', async () => {
    const many = Array.from({ length: 20 }, (_, i) => `topic ${i}`);
    const state = await fetchTwinPublicCard(AGENT, { ...base, transport: transport(200, publicProjection({ topics: [...many, ''] })) });
    expect(state.kind === 'ready' && state.data.topics.length).toBe(8);
  });
});

describe('share', () => {
  const card = (overrides: Partial<MobileTwinPublicCard> = {}): MobileTwinPublicCard => ({
    state: 'available',
    reasonCode: null,
    creatorName: 'Lin',
    topics: ['brand design', 'pricing', 'workshops', 'extra'],
    offers: [],
    askHuman: [],
    aiDisclosure: { zh: DIGITAL_TWIN_AI_DISCLOSURE_V1['zh-CN'], en: DIGITAL_TWIN_AI_DISCLOSURE_V1.en },
    ...overrides,
  });

  it('links only to the canonical public page for an account UUID', () => {
    expect(twinCardSharePath(AGENT)).toBe(`/share/agent/${AGENT}`);
    expect(twinCardShareUrl(AGENT)).toBe(`${APP_URL.replace(/\/+$/, '')}/share/agent/${AGENT}`);
    expect(twinCardShareUrl(AGENT, 'https://www.agentrix.top/')).toBe(`https://www.agentrix.top/share/agent/${AGENT}`);
    expect(twinCardSharePath('AGT-123')).toBeNull();
    expect(twinCardSharePath('../x')).toBeNull();
    expect(twinCardShareUrl(null)).toBeNull();
  });

  it('share is offered only while a visitor can open the card', () => {
    expect(canShareTwinCard(card(), AGENT)).toBe(true);
    expect(canShareTwinCard(card({ state: 'paused' }), AGENT)).toBe(false);
    expect(canShareTwinCard(card({ state: 'unavailable' }), AGENT)).toBe(false);
    expect(canShareTwinCard(null, AGENT)).toBe(false);
    expect(canShareTwinCard(card(), 'AGT-1')).toBe(false);
  });

  it('the message says it is an AI twin, lists at most three topics and ends with the link', () => {
    const url = twinCardShareUrl(AGENT) as string;
    const zh = twinCardShareMessage(card(), 'zh', url);
    expect(zh).toBe(`Lin的 AI 分身\n可以问：brand design、pricing、workshops\n回答都标注为 AI 分身，不替本人承诺价格、合同或退款。\n${url}`);
    const en = twinCardShareMessage(card({ topics: [] }), 'en', url);
    expect(en.split('\n')).toEqual(["Lin's AI twin", 'Every answer is labelled as an AI twin and never commits to prices, contracts or refunds.', url]);
  });
});

describe('source guards (D16)', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '..', 'twinCard.ts'), 'utf8');
  const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'four-zone', 'TwinHomeScreen.tsx'), 'utf8');

  it('the card service only reads', () => {
    expect(service).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'/);
  });

  it('the screen shares only the canonical URL behind canShareTwinCard, and never publishes', () => {
    expect(screen).toMatch(/canShareTwinCard\(card, agentAccountId\) \? twinCardShareUrl\(agentAccountId\) : null/);
    expect(screen).toMatch(/Share\.share\(\{ message: twinCardShareMessage\(card, lang, shareUrl\) \}\)/);
    expect(screen).not.toMatch(/tightenTwin|publish\(|getAgentPassportShareUrl|\?c=/);
  });
});
