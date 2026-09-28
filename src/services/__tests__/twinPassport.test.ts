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
  listPassportShares,
  normalizePassportShare,
  revokePassportShare,
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

describe('D16: loosening stays on Web', () => {
  const service = fs.readFileSync(path.resolve(__dirname, '..', 'passportShares.ts'), 'utf8');
  const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'four-zone', 'TwinPassportScreen.tsx'), 'utf8');

  it('the phone has no create / preview / update share call', () => {
    expect(service).not.toMatch(/method:\s*'(POST|PUT|PATCH)'/);
    expect(service).not.toMatch(/shares\/preview/);
    expect(service).not.toMatch(/export (async )?function (create|preview|update|extend)/i);
  });

  it('the screen does not mint or send a new share link', () => {
    expect(screen).not.toMatch(/socialShare|getAgentPassportShareUrl|getAgentPassportShareText|Share\.share/);
    expect(screen).toMatch(/revokePassportShare/);
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
