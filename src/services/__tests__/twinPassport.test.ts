/**
 * M4-a (2026-09-28) — 分身 → Agent 护照 on the phone: read-only card plus
 * tightening-only share management (D16 / product doc 8.3).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const apiFetch = jest.fn() as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<any>>;
jest.mock('../api', () => ({
  apiFetch: (p: string, options?: RequestInit) => apiFetch(p, options),
  getApiConfig: () => ({ baseUrl: 'https://api.example.test/api', token: 't' }),
}));

import {
  PASSPORT_SHARE_ID_INVALID,
  PASSPORT_SHARE_NOT_TIGHTENING,
  listPassportShares,
  normalizePassportShare,
  planPassportShareTightening,
  readPassportShareVisitors,
  revokePassportShare,
  tightenPassportShare,
} from '../passportShares';
import { getPassportWebPath } from '../webHandoff';
import { fourZoneTarget } from '../../navigation/four-zone/fourZoneRoutes';

const NOW = Date.parse('2026-09-28T00:00:00Z');
const AGENT = '75e5c531-4c1e-4d6a-9b0a-3f2e1d0c9b8a';
const grant = (overrides: Record<string, unknown> = {}) => ({
  shareId: 'shr_1',
  audience: 'partner',
  fields: ['persona', 'skills'],
  label: 'Acme',
  status: 'active',
  createdAt: '2026-09-20T00:00:00Z',
  expiresAt: '2026-10-20T00:00:00Z',
  revokedAt: null,
  accessCount: 3,
  firstAccessedAt: null,
  lastAccessedAt: '2026-09-25T00:00:00Z',
  viewerAgentRef: null,
  ...overrides,
});

beforeEach(() => apiFetch.mockReset());

describe('share receipts', () => {
  it('lists receipts from the {success, data: {items}} envelope', async () => {
    apiFetch.mockResolvedValueOnce({ success: true, data: { items: [grant(), grant({ shareId: 'shr_2', revokedAt: '2026-09-26T00:00:00Z' })] } });
    const items = await listPassportShares(AGENT, NOW);
    expect(apiFetch).toHaveBeenCalledWith(`/agent-accounts/${AGENT}/passport/shares`, { method: 'GET' });
    expect(items.map((item) => [item.shareId, item.status])).toEqual([
      ['shr_1', 'active'],
      ['shr_2', 'revoked'],
    ]);
  });

  it('recomputes status from the dates instead of trusting the payload', () => {
    expect(normalizePassportShare(grant({ status: 'active', expiresAt: '2026-09-27T00:00:00Z' }), NOW)?.status).toBe('expired');
    expect(normalizePassportShare(grant({ status: 'active', revokedAt: '2026-09-27T00:00:00Z' }), NOW)?.status).toBe('revoked');
  });

  it('drops malformed receipts and never surfaces a token', () => {
    expect(normalizePassportShare({ ...grant(), shareId: '../x' }, NOW)).toBeNull();
    expect(normalizePassportShare(null, NOW)).toBeNull();
    const normalized = normalizePassportShare({ ...grant(), token: 'secret-token', url: 'https://x/?g=secret' }, NOW) as any;
    expect(normalized.token).toBeUndefined();
    expect(JSON.stringify(normalized)).not.toContain('secret');
  });
});

describe('revoke (tightening)', () => {
  it('DELETEs one share and returns the backend read-back', async () => {
    apiFetch.mockResolvedValueOnce({ success: true, data: { grant: grant({ revokedAt: '2026-09-28T00:00:00Z', status: 'revoked' }) } });
    const result = await revokePassportShare(AGENT, 'shr_1', NOW);
    expect(apiFetch).toHaveBeenCalledWith(`/agent-accounts/${AGENT}/passport/shares/shr_1`, { method: 'DELETE' });
    expect(result?.status).toBe('revoked');
  });

  it.each([
    ['', 'shr_1'],
    [AGENT, ''],
    [AGENT, '../../passport'],
    ['a/b', 'shr_1'],
  ])('refuses unsafe ids %p / %p before any request', async (agent, share) => {
    await expect(revokePassportShare(agent, share)).rejects.toMatchObject({ code: PASSPORT_SHARE_ID_INVALID });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('tightening edits (visibility contract v1, M4-d)', () => {
  const share = (overrides: Record<string, unknown> = {}) => normalizePassportShare(grant(overrides), NOW)!;
  const DAY = 24 * 60 * 60 * 1000;

  it('hide one field: PATCH with the remaining fields and no preview digest', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { grant: grant({ fields: ['skills'] }), receipt: { tier: 'tighten', operations: ['hide_fields'] } } });
    const result = await tightenPassportShare(AGENT, share(), { kind: 'hide_field', field: 'persona' }, NOW);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [p, options] = apiFetch.mock.calls[0];
    expect(p).toBe(`/agent-accounts/${AGENT}/passport/shares/shr_1`);
    expect(options?.method).toBe('PATCH');
    expect(JSON.parse(String(options?.body))).toEqual({ fields: ['skills'] });
    expect(result).toMatchObject({ receiptTier: 'tighten', share: { fields: ['skills'] } });
  });

  it('hiding the last field sends an empty list (all hidden is a tightening)', () => {
    expect(planPassportShareTightening(share({ fields: ['skills'] }), { kind: 'hide_field', field: 'skills' }, NOW)).toEqual({ ok: true, body: { fields: [] } });
  });

  it('shorten to 7 days only when that is earlier than the current expiry', () => {
    expect(planPassportShareTightening(share({ expiresAt: new Date(NOW + 20 * DAY).toISOString() }), { kind: 'shorten_to_7d' }, NOW)).toEqual({ ok: true, body: { expiresIn: '7d' } });
    expect(planPassportShareTightening(share({ expiresAt: null }), { kind: 'shorten_to_7d' }, NOW)).toMatchObject({ ok: true });
    // Only 2 days left: "7 days from now" would extend it (8.3: judged by effect).
    expect(planPassportShareTightening(share({ expiresAt: new Date(NOW + 2 * DAY).toISOString() }), { kind: 'shorten_to_7d' }, NOW)).toEqual({ ok: false, reason: 'not_a_tightening' });
  });

  it('refuses before any request: a field that is not shared, a revoked / expired link, an unknown audience', async () => {
    const cases: Array<[any, any, string]> = [
      [share({ fields: ['skills'] }), { kind: 'hide_field', field: 'persona' }, 'not_a_tightening'],
      [share({ revokedAt: '2026-09-27T00:00:00Z' }), { kind: 'hide_field', field: 'persona' }, 'not_active'],
      [share({ expiresAt: '2026-09-27T00:00:00Z' }), { kind: 'shorten_to_7d' }, 'not_active'],
      [share({ audience: 'everyone' }), { kind: 'hide_field', field: 'persona' }, 'unknown_audience'],
    ];
    for (const [s, change, reason] of cases) {
      expect(planPassportShareTightening(s, change, NOW)).toEqual({ ok: false, reason });
      await expect(tightenPassportShare(AGENT, s, change, NOW)).rejects.toMatchObject({ code: PASSPORT_SHARE_NOT_TIGHTENING, reason });
    }
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('a receipt that is not a tightening is reported as such, not as done', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { grant: grant(), receipt: { tier: 'loosen' } } });
    await expect(tightenPassportShare(AGENT, share(), { kind: 'hide_field', field: 'persona' }, NOW)).resolves.toMatchObject({ receiptTier: 'loosen' });
  });
});

describe('D16: loosening stays on Web', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '..', 'passportShares.ts'), 'utf8');
  const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'four-zone', 'TwinPassportScreen.tsx'), 'utf8');

  it('the phone has no create / preview / extend call; its one PATCH goes through the tightening plan', () => {
    expect(service).not.toMatch(/method:\s*'(POST|PUT)'/);
    expect(service.match(/method:\s*'PATCH'/g)).toHaveLength(1);
    expect(service).not.toMatch(/\/preview|previewDigest:/);
    expect(service).not.toMatch(/export (async )?function (create|preview|update|extend)/i);
    expect(service).not.toMatch(/expiresIn: '(30d|never)'/);
  });

  it('the screen does not mint or send a new share link', () => {
    expect(screen).not.toMatch(/socialShare|getAgentPassportShareUrl|getAgentPassportShareText|Share\.share/);
    expect(screen).toMatch(/revokePassportShare/);
    // Tightening buttons appear only when the plan allows them.
    expect(screen).toMatch(/planPassportShareTightening\(share, \{ kind: 'hide_field', field \}\)\.ok \?/);
    expect(screen).toMatch(/planPassportShareTightening\(share, \{ kind: 'shorten_to_7d' \}\)\.ok \?/);
    expect(screen).toMatch(/getPassportWebUrl\(agentAccountId\)/);
  });

  it('edits hand off to the web passport route', () => {
    expect(getPassportWebPath(AGENT)).toBe(`/agents/${AGENT}/twin?card=passport`);
    expect(getPassportWebPath('bad/id')).toBe('/twin');
  });

  it('twin/passport now opens the passport screen', () => {
    expect(fourZoneTarget('twin', 'passport')).toEqual({ tab: 'Twin', screen: 'TwinPassport' });
  });
});

describe('who visited a link (D21, M4-f, read-only)', () => {
  const SHARE = '0f8c2b1e-4d5a-4c3b-9a8e-1b2c3d4e5f60';
  const visitors = (overrides: Record<string, unknown> = {}) => ({
    schemaVersion: 'agentrix.passport-visitors.v1',
    shareId: SHARE,
    verified: [{ agentRef: 'AGT-VISITOR', name: '小助手', proof: 'signed_request', firstSeenAt: '2026-09-20T00:00:00.000Z', lastSeenAt: '2026-09-27T00:00:00.000Z', visits: 3 }],
    verifiedAgents: 4,
    unverifiedVisits: 12,
    retentionDays: 90,
    since: '2026-06-30T00:00:00.000Z',
    ...overrides,
  });

  it('GETs the owner route and decodes with the contract decoder', async () => {
    apiFetch.mockResolvedValueOnce({ success: true, data: { visitors: visitors() } });
    const read = await readPassportShareVisitors(AGENT, SHARE);
    expect(apiFetch).toHaveBeenCalledWith(`/agent-accounts/${AGENT}/passport/shares/${SHARE}/visitors`, { method: 'GET' });
    expect(read).toEqual({ kind: 'ready', visitors: visitors() });
  });

  it('a failed read, a shape the contract rejects, or another share: unavailable, never an empty list', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Request failed: 404'));
    expect(await readPassportShareVisitors(AGENT, SHARE)).toEqual({ kind: 'unavailable', reason: 'read_failed' });
    apiFetch.mockResolvedValueOnce({ success: true, data: { visitors: visitors({ schemaVersion: 'v0' }) } });
    expect(await readPassportShareVisitors(AGENT, SHARE)).toEqual({ kind: 'unavailable', reason: 'decode_schema' });
    apiFetch.mockResolvedValueOnce({ success: true, data: { visitors: visitors({ verifiedAgents: 0 }) } });
    expect((await readPassportShareVisitors(AGENT, SHARE)).kind).toBe('unavailable');
    apiFetch.mockResolvedValueOnce({ success: true, data: { visitors: visitors({ shareId: 'other-share' }) } });
    expect(await readPassportShareVisitors(AGENT, SHARE)).toEqual({ kind: 'unavailable', reason: 'decode_shareId' });
    apiFetch.mockResolvedValueOnce({ success: true, data: {} });
    expect((await readPassportShareVisitors(AGENT, SHARE)).kind).toBe('unavailable');
    await expect(readPassportShareVisitors(AGENT, '../x')).rejects.toMatchObject({ code: PASSPORT_SHARE_ID_INVALID });
    expect(apiFetch).toHaveBeenCalledTimes(5);
  });

  it('the visitors view only reads, and says it could not read instead of showing nothing', () => {
    const view = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'four-zone', 'TwinPassportVisitors.tsx'), 'utf8');
    expect(view).toMatch(/readPassportShareVisitors\(agentAccountId, shareId\)/);
    expect(view).not.toMatch(/apiFetch|useMutation|method:/);
    expect(view).toMatch(/暂时读不到来访记录/);
    // The ref is always shown next to the name.
    expect(view).toMatch(/\$\{visitor\.agentRef\} · /);
  });
});
