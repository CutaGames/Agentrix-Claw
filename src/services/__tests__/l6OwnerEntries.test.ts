import type { HttpRequestV1, HttpResponseV1 } from '../../../shared/client/transport';
import { TrustLadderError, createMobileTrustLadderClient, runTrustLadderSave, trustLadderEnabled } from '../trustLadder';
import { AgentCollaborationError, agentCollaborationEnabled, counterpartTier, createMobileAgentCollaborationClient } from '../agentCollaboration';
import { SharePagesError, createMobileSharePagesClient, sharePagePublicLink, sharePagesEnabled } from '../sharePages';
import { OwnerGoalsError, createMobileOwnerGoalsClient, ownerGoalCheckInAt, ownerGoalsEnabled } from '../ownerGoals';

type Reply = HttpResponseV1 | Error;

function transportOf(replies: Reply[]) {
  const requests: HttpRequestV1[] = [];
  const transport = {
    request: jest.fn(async (req: HttpRequestV1) => {
      requests.push(req);
      const reply = replies.shift();
      if (!reply) throw new Error('no reply queued');
      if (reply instanceof Error) throw reply;
      return reply;
    }),
  };
  return { requests, transport };
}

const ok = (body: unknown, status = 200): HttpResponseV1 => ({ status, headers: {}, body });
const err = (status: number, code: string, extra: Record<string, unknown> = {}): HttpResponseV1 => ({ status, headers: {}, body: { success: false, code, message: 'x', ...extra } });

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return error instanceof Error && 'failure' in error ? String((error as { failure: unknown }).failure) : 'other';
  }
}

const BASE = 'https://api.agentrix.top/api/';
const AGENT = '1129f3c4-8da8-43cf-b795-26062cd68d0d';

describe('mobile L6 owner entries', () => {
  it('every entry is on only when its flag is exactly 1', () => {
    for (const enabled of [trustLadderEnabled, agentCollaborationEnabled, sharePagesEnabled, ownerGoalsEnabled]) {
      expect(enabled('1')).toBe(true);
      for (const value of [undefined, '', '0', 'true', 1]) expect(enabled(value)).toBe(false);
    }
  });

  describe('trust ladder (L6-6)', () => {
    const view = { agentAccountId: AGENT, level: 'suggest', updatedAt: null, budgetRevision: 3, checklist: { connectCalendar: 'unknown', setBudget: 'todo' } };

    it('reads one Agent with the bearer token and refuses a view about another Agent', async () => {
      const { transport, requests } = transportOf([ok(view), ok({ ...view, agentAccountId: '2e697719-0000-4000-8000-000000000000' })]);
      const api = createMobileTrustLadderClient({ transport, baseUrl: BASE, token: () => 't' });
      await expect(api.read(AGENT)).resolves.toMatchObject({ level: 'suggest', budgetRevision: 3 });
      expect(requests[0]).toMatchObject({ method: 'GET', path: `https://api.agentrix.top/api/trust-ladder/${AGENT}`, headers: { Authorization: 'Bearer t', 'X-Agentrix-Surface': 'mobile' } });
      expect(await failureOf(api.read(AGENT))).toBe('unreadable');
      expect(await failureOf(api.read('not-a-uuid'))).toBe('closed');
      expect(requests).toHaveLength(2);
    });

    it('never sends commit without the four limits and maps 404 / 409', async () => {
      const { transport, requests } = transportOf([err(404, 'NotFoundException'), err(409, 'SPEND_BUDGET_SETTINGS_STALE')]);
      const api = createMobileTrustLadderClient({ transport, baseUrl: BASE, token: () => 't' });
      expect(await failureOf(api.update(AGENT, { level: 'commit', budgetRevision: 3 }))).toBe('limits_required');
      expect(requests).toHaveLength(0);
      expect(await failureOf(api.read(AGENT))).toBe('closed');
      expect(await failureOf(api.update(AGENT, { level: 'look', budgetRevision: 3 }))).toBe('stale');
    });

    it('raising asks for a step-up once, then sends the same change again; a second request stops', async () => {
      const stepUp = err(403, 'STEP_UP_REQUIRED', { reasonCode: 'recent_sign_in_required' });
      const update = { level: 'commit' as const, budgetRevision: 3, limits: { singleTxLimitCents: 500, dailyLimitCents: 1000, monthlyLimitCents: 5000, freeApprovalCents: 100 } };
      const first = transportOf([stepUp, ok({ ...view, level: 'commit', budgetRevision: 4 })]);
      const confirmStepUp = jest.fn(async () => true);
      const done = await runTrustLadderSave({ client: createMobileTrustLadderClient({ transport: first.transport, baseUrl: BASE, token: () => 't' }), agentAccountId: AGENT, update, confirmStepUp });
      expect(done).toMatchObject({ kind: 'done', view: { level: 'commit', budgetRevision: 4 } });
      expect(confirmStepUp).toHaveBeenCalledTimes(1);
      expect(first.requests.map((r) => r.body)).toEqual([update, update]);
      const again = transportOf([stepUp, stepUp]);
      const outcome = await runTrustLadderSave({ client: createMobileTrustLadderClient({ transport: again.transport, baseUrl: BASE, token: () => 't' }), agentAccountId: AGENT, update, confirmStepUp });
      expect(outcome).toMatchObject({ kind: 'failed', failure: 'step_up_again' });
      const cancelled = transportOf([stepUp]);
      const no = await runTrustLadderSave({ client: createMobileTrustLadderClient({ transport: cancelled.transport, baseUrl: BASE, token: () => 't' }), agentAccountId: AGENT, update, confirmStepUp: async () => false });
      expect(no).toMatchObject({ kind: 'failed', failure: 'step_up_cancelled' });
      expect(cancelled.requests).toHaveLength(1);
    });

    it('a stale save reads the level again so the card shows what it is now', async () => {
      const { transport } = transportOf([err(409, 'SPEND_BUDGET_SETTINGS_STALE'), ok({ ...view, budgetRevision: 5 })]);
      const outcome = await runTrustLadderSave({ client: createMobileTrustLadderClient({ transport, baseUrl: BASE, token: () => 't' }), agentAccountId: AGENT, update: { level: 'look', budgetRevision: 3 }, confirmStepUp: async () => true });
      expect(outcome).toMatchObject({ kind: 'failed', failure: 'stale', view: { budgetRevision: 5 } });
      expect(await failureOf(createMobileTrustLadderClient({ transport, baseUrl: BASE, token: () => null }).read(AGENT))).toBe('no_session');
      expect(new TrustLadderError('closed').failure).toBe('closed');
    });
  });

  describe('requests from other Agents (L6-1)', () => {
    const identity = { kind: 'email', value: 'peer@example.com' };
    const request = {
      receiptId: 'r1', kind: 'book', audience: 'client', status: 'pending_owner', verification: 'unverified', receivedAt: '2026-10-05T07:00:00.000Z',
      counterpartName: 'Peer', identity, message: '<b>Tuesday?</b>', proposedStartAt: '2026-10-07T03:00:00.000Z', amountMinor: null, currency: null, fileUrl: null,
    };

    it('lists requests and tiers, and finds each counterpart\'s tier', async () => {
      const { transport, requests } = transportOf([ok([request]), ok([{ identity, tier: 'client', updatedAt: '2026-10-05T07:01:00.000Z' }])]);
      const api = createMobileAgentCollaborationClient({ transport, baseUrl: BASE, token: () => 't' });
      const list = await api.requests();
      expect(list[0]).toMatchObject({ counterpartName: 'Peer', message: '<b>Tuesday?</b>', kind: 'book' });
      const tiers = await api.relationships();
      expect(counterpartTier(tiers, list[0].identity)).toBe('client');
      expect(counterpartTier([], list[0].identity)).toBe('stranger');
      expect(requests.map((r) => r.path)).toEqual(['https://api.agentrix.top/api/agent-collaboration/requests', 'https://api.agentrix.top/api/agent-collaboration/relationships']);
    });

    it('refuses an unreadable list, maps a closed server, and sends only checked tier changes', async () => {
      const { transport, requests } = transportOf([ok([{ ...request, status: 'accepted' }]), err(404, 'NotFoundException'), ok({ identity, tier: null })]);
      const api = createMobileAgentCollaborationClient({ transport, baseUrl: BASE, token: () => 't' });
      expect(await failureOf(api.requests())).toBe('unreadable');
      expect(await failureOf(api.relationships())).toBe('closed');
      expect(await failureOf(api.setTier(identity as never, 'boss' as never))).toBe('invalid');
      await expect(api.setTier(identity as never, null)).resolves.toBeUndefined();
      expect(requests[2]).toMatchObject({ method: 'PUT', path: 'https://api.agentrix.top/api/agent-collaboration/relationships', body: { tier: null } });
      expect(new AgentCollaborationError('closed').failure).toBe('closed');
    });
  });

  describe('share pages (L6-2)', () => {
    const page = { kind: 'quote', title: 'Quote', body: 'Two days', bookingUrl: null, shareId: 's1', token: 'a'.repeat(43), status: 'active', expiresAt: null, createdAt: '2026-10-05T07:00:00.000Z', replyCount: 1 };

    it('lists, creates a checked page and revokes; the link points at the web page', async () => {
      const { transport, requests } = transportOf([ok([page]), ok(page, 201), ok({ ...page, status: 'revoked' })]);
      const api = createMobileSharePagesClient({ transport, baseUrl: BASE, token: () => 't' });
      await expect(api.mine()).resolves.toHaveLength(1);
      await expect(api.create({ kind: 'quote', title: 'Quote', body: 'Two days' })).resolves.toMatchObject({ token: page.token });
      await expect(api.revoke('s1')).resolves.toMatchObject({ status: 'revoked' });
      expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        'GET https://api.agentrix.top/api/share-pages',
        'POST https://api.agentrix.top/api/share-pages',
        'POST https://api.agentrix.top/api/share-pages/s1/revoke',
      ]);
      expect(sharePagePublicLink(page.token)).toBe(`https://agentrix.top/s/${page.token}`);
    });

    it('never sends an off-site booking link and maps refusals', async () => {
      const { transport, requests } = transportOf([err(404, 'NotFoundException'), err(404, 'SHARE_PAGE_NOT_FOUND'), ok([{ ...page, token: 'short' }])]);
      const api = createMobileSharePagesClient({ transport, baseUrl: BASE, token: () => 't' });
      expect(await failureOf(api.create({ kind: 'quote', title: 'Q', body: 'B', bookingUrl: 'https://evil.example/book' }))).toBe('invalid');
      expect(requests).toHaveLength(0);
      expect(await failureOf(api.mine())).toBe('closed');
      expect(await failureOf(api.revoke('s1'))).toBe('not_found');
      expect(await failureOf(api.mine())).toBe('unreadable');
      expect(new SharePagesError('closed').failure).toBe('closed');
    });
  });

  describe('in progress (L6-3)', () => {
    const goal = { goalId: 'g1', title: 'Ship L6', note: null, status: 'active', checkInAt: '2026-10-06T07:00:00.000Z', createdAt: '2026-10-05T07:00:00.000Z', updatedAt: '2026-10-05T07:00:00.000Z' };
    const list = { goals: [goal], cards: [{ kind: 'goal_check_in', cardId: 'c1', goalId: 'g1', title: 'Ship L6', dueAt: '2026-10-06T07:00:00.000Z' }], quietNow: false };

    it('reads goals and due cards, creates and moves goals', async () => {
      const { transport, requests } = transportOf([ok(list), ok(goal, 201), ok({ ...goal, status: 'done' })]);
      const api = createMobileOwnerGoalsClient({ transport, baseUrl: BASE, token: () => 't' });
      await expect(api.list()).resolves.toMatchObject({ cards: [{ cardId: 'c1' }], quietNow: false });
      await expect(api.create({ title: 'Ship L6', checkInAt: '2026-10-06T07:00:00.000Z' })).resolves.toMatchObject({ goalId: 'g1' });
      await expect(api.update('g1', { status: 'done' })).resolves.toMatchObject({ status: 'done' });
      expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        'GET https://api.agentrix.top/api/owner-goals',
        'POST https://api.agentrix.top/api/owner-goals',
        'PUT https://api.agentrix.top/api/owner-goals/g1',
      ]);
    });

    it('never sends an empty title, maps refusals, and builds the check-in presets', async () => {
      const { transport, requests } = transportOf([err(404, 'NotFoundException'), err(404, 'OWNER_GOAL_NOT_FOUND'), ok({ ...list, cards: [{ kind: 'lead_follow_up' }] }), new Error('offline')]);
      const api = createMobileOwnerGoalsClient({ transport, baseUrl: BASE, token: () => 't' });
      expect(await failureOf(api.create({ title: '   ' }))).toBe('invalid');
      expect(requests).toHaveLength(0);
      expect(await failureOf(api.list())).toBe('closed');
      expect(await failureOf(api.update('g1', { status: 'archived' }))).toBe('not_found');
      expect(await failureOf(api.list())).toBe('unreadable');
      expect(await failureOf(api.list())).toBe('unavailable');
      expect(ownerGoalCheckInAt('tomorrow', new Date('2026-10-05T08:00:00.000Z'))).toBe('2026-10-06T08:00:00.000Z');
      expect(ownerGoalCheckInAt('next_week', new Date('2026-10-05T08:00:00.000Z'))).toBe('2026-10-12T08:00:00.000Z');
      expect(new OwnerGoalsError('closed').failure).toBe('closed');
    });
  });
});
