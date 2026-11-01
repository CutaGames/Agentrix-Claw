/**
 * L9 P2-7 on the phone: "take your business data with you". Off unless EXPO_PUBLIC_ACCOUNT_EXPORT_BUSINESS_V1 is exactly
 * '1'; the card asks the L9 list first and draws nothing outside it; the export and check carry the surface header and
 * the token, and a 404 means "closed" (the card disappears).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { BUSINESS_EXPORT_FORMAT_V1, BUSINESS_EXPORT_SCHEMA_VERSION_V1 } from '../../../shared/types/account-export-business';
import { businessExportEnabled, createMobileBusinessExportClient, readMobileL9Cohort } from '../businessExport';

const BASE = 'https://api.example.test/api';
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
const deps = (t: HttpTransportV1, token: string | null = 'tok') => ({ transport: t, baseUrl: BASE, token: () => token });
const cohort = (inCohort: boolean, hasIncoming = false) => ({ status: 200, body: { schemaVersion: 1, inCohort, hasIncoming } });
const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');

function documentV1() {
  const section = { status: 'complete', count: 0, items: [] };
  return {
    schemaVersion: BUSINESS_EXPORT_SCHEMA_VERSION_V1,
    format: BUSINESS_EXPORT_FORMAT_V1,
    exportId: 'e1',
    generatedAt: '2026-10-31T08:00:00.000Z',
    account: { ownerId: 'owner-1' },
    sections: { customers: section, answers: section, introductions: section, receipts: section },
    omissions: [],
    sectionsDigest: 'sha256:abc',
  };
}
function checkV1() {
  return {
    schemaVersion: BUSINESS_EXPORT_SCHEMA_VERSION_V1,
    checkedAt: '2026-10-31T08:00:00.000Z',
    counts: { customers: { active: 0, deleted: 1 }, answers: { privateTurns: 0, decisions: 0, reviewItems: 0 }, introductions: { introducer: 0, introduced: 0 }, receipts: 0 },
    deletedStillHoldingContact: 0,
    unavailable: [],
    verifiedEmpty: true,
  };
}

describe('EXPO_PUBLIC_ACCOUNT_EXPORT_BUSINESS_V1', () => {
  it('is on only for an exact 1', () => {
    expect(businessExportEnabled('1')).toBe(true);
    for (const value of [undefined, null, '', '0', 'true', ' 1', '1 ', 1, true]) expect(businessExportEnabled(value)).toBe(false);
  });

  it('is read as a literal member expression so the Expo build inlines it', () => {
    expect(read('services/businessExport.ts')).toContain('businessExportEnabled(process.env.EXPO_PUBLIC_ACCOUNT_EXPORT_BUSINESS_V1)');
  });

  it('settings shows the card only for a signed-in owner with both export switches on; the full export is untouched', () => {
    const screen = read('screens/SettingsScreen.tsx');
    expect(screen).toContain('{user && ACCOUNT_EXPORT_ENABLED ? <AccountExportCard /> : null}');
    expect(screen).toContain('{user && ACCOUNT_EXPORT_ENABLED && BUSINESS_EXPORT_ENABLED ? <BusinessExportCard /> : null}');
  });

  it('the card asks the list first and draws nothing until it is "in"; a 404 hides it', () => {
    const card = read('components/BusinessExportCard.tsx');
    expect(card).toContain('readMobileL9Cohort(deps())');
    expect(card).toContain("if (cohort !== 'in' || state === 'closed') return null;");
    expect(card).toContain("if (failure === 'closed')");
    // One language per screen: every visible string comes from the shared copy or the zh / en label table.
    expect(card).not.toMatch(/>[^<{]*[\u4e00-\u9fff][^<{]*</);
  });

  it('review D-R4: the file is deleted from the app cache after the share sheet, whether sharing worked or not', () => {
    const card = read('components/BusinessExportCard.tsx');
    const share = card.indexOf('await Sharing.shareAsync(path');
    const final = card.indexOf('} finally {', share);
    const remove = card.indexOf('await FileSystem.deleteAsync(path, { idempotent: true })', final);
    expect(share).toBeGreaterThan(0);
    expect(final).toBeGreaterThan(share);
    expect(remove).toBeGreaterThan(final);
    // The path is built outside the try, so the clean-up always knows which file to remove.
    expect(card.indexOf('const path = `${FileSystem.cacheDirectory')).toBeLessThan(card.indexOf('await FileSystem.writeAsStringAsync(path'));
  });
});

describe('the L9 list on the phone', () => {
  it('only inCohort opens it; something waiting for me alone does not', async () => {
    expect(await readMobileL9Cohort(deps(transport({ 'GET /l9/cohort/me': cohort(true) })))).toBe('in');
    expect(await readMobileL9Cohort(deps(transport({ 'GET /l9/cohort/me': cohort(false, true) })))).toBe('out');
    expect(await readMobileL9Cohort(deps(transport({ 'GET /l9/cohort/me': cohort(false) })))).toBe('out');
  });

  it('a 404, a 401, a body it cannot read, a network error or no token are all "out"', async () => {
    expect(await readMobileL9Cohort(deps(transport({ 'GET /l9/cohort/me': { status: 404, body: {} } })))).toBe('out');
    expect(await readMobileL9Cohort(deps(transport({ 'GET /l9/cohort/me': { status: 401, body: {} } })))).toBe('out');
    expect(await readMobileL9Cohort(deps(transport({ 'GET /l9/cohort/me': { status: 200, body: { schemaVersion: 1, inCohort: 'yes', hasIncoming: false } } })))).toBe('out');
    expect(await readMobileL9Cohort(deps(transport({ 'GET /l9/cohort/me': { status: 200, body: { schemaVersion: 1, inCohort: true, hasIncoming: false, extra: 1 } } })))).toBe('out');
    expect(await readMobileL9Cohort(deps(transport({ 'GET /l9/cohort/me': { status: 200, body: { inCohort: true, hasIncoming: false } } })))).toBe('out');
    expect(await readMobileL9Cohort(deps(transport({ 'GET /l9/cohort/me': 'throw' })))).toBe('out');
    const t = transport({ 'GET /l9/cohort/me': cohort(true) });
    expect(await readMobileL9Cohort(deps(t, null))).toBe('out');
    expect(t.calls).toHaveLength(0);
  });

  it('sends the token and the surface header', async () => {
    const t = transport({ 'GET /l9/cohort/me': cohort(true) });
    await readMobileL9Cohort(deps(t));
    expect(t.calls[0].headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
  });
});

describe('the business export client on the phone', () => {
  it('posts to the file route and the check route with the token, the surface header and no body (the owner is never sent)', async () => {
    const t = transport({
      'POST /account-export/business/v1': { status: 200, body: documentV1() },
      'POST /account-export/business/v1/check': { status: 200, body: checkV1() },
    });
    const client = createMobileBusinessExportClient(deps(t));
    const file = await client.exportAll();
    expect(file.ok).toBe(true);
    if (file.ok === true) expect(file.fileName).toBe('agentrix-business-export-2026-10-31.json');
    const check = await client.check();
    expect(check.ok).toBe(true);
    for (const call of t.calls) {
      expect(call.method).toBe('POST');
      expect(call.body).toBeUndefined();
      expect(call.headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
    }
  });

  it('404 is closed (the card disappears); 403 step-up; no token is no_session without a request', async () => {
    const closed = createMobileBusinessExportClient(deps(transport({ 'POST /account-export/business/v1': { status: 404, body: {} }, 'POST /account-export/business/v1/check': { status: 404, body: {} } })));
    expect(await closed.exportAll()).toEqual({ ok: false, failure: 'closed' });
    expect(await closed.check()).toEqual({ ok: false, failure: 'closed' });
    const stale = createMobileBusinessExportClient(deps(transport({ 'POST /account-export/business/v1': { status: 403, body: { code: 'STEP_UP_REQUIRED', reasonCode: 'recent_sign_in_required' } } })));
    expect(await stale.exportAll()).toEqual({ ok: false, failure: 'step_up_required' });
    const t = transport({});
    expect(await createMobileBusinessExportClient(deps(t, null)).exportAll()).toEqual({ ok: false, failure: 'no_session' });
    expect(t.calls).toHaveLength(0);
  });
});
