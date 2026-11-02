/**
 * L9 package 3 C3: where a tapped referral push (`introduction_update`, ref `int_…`) lands.
 *
 * Locks the data rule (review.md LOW): the landing reads data only for the signed-in user. It never
 * takes another user's id from the push payload and never shows names or contact details from it.
 * Screen wording and layout are not tested (E117 ④); they are checked on screenshots.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { resolveIntroductionLanding } from '../introductionLanding';
import { isIntroductionRef, isOrderRef } from '../webHandoff';
import { isSpendApprovalRef } from '../spendApproval';
import { parseMobilePushData, resolveMobilePushNavigation } from '../mobilePush';
import { buildPushMessageV1 } from '../../../shared/types/push-notification';
import type { FourZoneNavigation } from '../../navigation/four-zone/fourZoneRoutes';

const BASE = 'https://www.example.test';
const REF = 'int_0123abcd-0123-4abc-8abc-0123456789ab';

describe('resolveIntroductionLanding', () => {
  it('points at the signed-in user\'s own twin status page', () => {
    expect(resolveIntroductionLanding({ routeRef: REF, sessionAgentAccountId: 'agent-own-1', baseUrl: BASE })).toEqual({
      webUrl: `${BASE}/agents/agent-own-1/twin/status`,
    });
  });

  it('is null when the route ref is not a referral ref', () => {
    for (const routeRef of ['ord_1', 'spa_1', '0123abcd-0123-4abc-8abc-0123456789ab', 'int_../x', 'int_', undefined, null, 42]) {
      expect([routeRef, resolveIntroductionLanding({ routeRef, sessionAgentAccountId: 'agent-own-1', baseUrl: BASE })]).toEqual([routeRef, null]);
    }
  });

  it('has no web address (and no stand-in Agent) when the session has no usable Agent id', () => {
    for (const sessionAgentAccountId of ['', null, undefined, '../x', 'agent/1']) {
      expect([sessionAgentAccountId, resolveIntroductionLanding({ routeRef: REF, sessionAgentAccountId, baseUrl: BASE })]).toEqual([
        sessionAgentAccountId,
        { webUrl: null },
      ]);
    }
  });

  it('puts nothing of the route ref in the result or the address', () => {
    const landing = resolveIntroductionLanding({ routeRef: REF, sessionAgentAccountId: 'agent-own-1', baseUrl: BASE });
    expect(JSON.stringify(landing)).not.toContain(REF);
    expect(JSON.stringify(landing)).not.toContain('int_');
    expect(JSON.stringify(landing)).not.toContain('0123abcd');
  });

  it('push for account A, account B signed in: the address is B\'s and A\'s id appears nowhere', () => {
    const message = buildPushMessageV1({ type: 'introduction_update', ref: REF, agentId: 'agent-of-A' });
    const target = resolveMobilePushNavigation(parseMobilePushData(message.data), { fourZone: true });
    expect(target.name).toBe('Main');
    const params = (target as Extract<FourZoneNavigation, { name: 'Main' }>).params.params.params;
    expect(params).toEqual({ tab: 'pending', ref: REF });
    const landing = resolveIntroductionLanding({ routeRef: params.ref, sessionAgentAccountId: 'agent-of-B', baseUrl: BASE });
    expect(landing).toEqual({ webUrl: `${BASE}/agents/agent-of-B/twin/status` });
    expect(JSON.stringify(target)).not.toContain('agent-of-A');
    expect(JSON.stringify(landing)).not.toContain('agent-of-A');
  });

  it('a referral ref is neither an order ref nor a payment approval ref (one notice at a time)', () => {
    expect(isIntroductionRef(REF)).toBe(true);
    expect(isOrderRef(REF)).toBe(false);
    expect(isSpendApprovalRef(REF)).toBe(false);
  });
});

describe('source guards: the landing reads data for the signed-in user only', () => {
  const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, '..', '..', ...parts), 'utf8');
  const screen = read('screens', 'four-zone', 'MattersHomeScreen.tsx');

  it('the screen reads only `ref` from the route params', () => {
    const all = screen.match(/route\.params/g) ?? [];
    const refOnly = screen.match(/route\.params\??\.ref\b/g) ?? [];
    expect(all.length).toBeGreaterThan(0);
    expect(refOnly).toHaveLength(all.length);
    const props = [...screen.matchAll(/route\.params\??\.(\w+)/g)].map((match) => match[1]);
    expect([...new Set(props)]).toEqual(['ref']);
  });

  it('the Agent id comes from the signed-in session and is the only id given to the landing', () => {
    expect(screen).toContain('useAuthStore((state) => state.activeInstance)');
    expect(screen).toContain('const agentAccountId: string = activeInstance?.agentAccountId ?? activeInstance?.metadata?.agentAccountId ?? \'\';');
    expect(screen).toContain('resolveIntroductionLanding({ routeRef: route.params?.ref, sessionAgentAccountId: agentAccountId })');
  });

  it('adds no read of its own: the two existing queries are the only ones, and there is no direct network call', () => {
    expect(screen.match(/useQuery\(/g)).toHaveLength(2);
    expect(screen).toContain('queryFn: fetchDesktopState,');
    expect(screen).toContain('queryFn: () => fetchTwinReviewQueue(agentAccountId),');
    expect(screen).not.toMatch(/apiFetch|[^A-Za-z.]fetch\(/);
  });

  it('the referral notice shows fixed text, reads no route params, and only opens the signed-in user\'s web page', () => {
    const start = screen.indexOf('{introLanding ? (');
    const end = screen.indexOf('testID="matters-pending-list"', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = screen.slice(start, end);
    expect(block).not.toMatch(/route\.params|useQuery|useMutation|fetch/);
    expect(block).not.toMatch(/\$\{/);
    expect(block.match(/Linking\.openURL\(/g)).toHaveLength(1);
    expect(block).toMatch(/Linking\.openURL\(introLanding\.webUrl\b/);
  });

  it('the empty-list line stays out of the way of the notice', () => {
    expect(screen).toMatch(/items\.length === 0 && !spendRef && !introLanding \?/);
  });

  it('builds without the zone navigator carry the pushed ids into Inbox, which does not read its route params', () => {
    const inbox = read('screens', 'inbox', 'InboxScreen.tsx');
    expect(inbox).not.toMatch(/useRoute|route\.params/);
  });
});
