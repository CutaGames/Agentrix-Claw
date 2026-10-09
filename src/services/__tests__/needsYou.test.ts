import type { HttpRequestV1 } from '../../../shared/client/transport';
import { buildNeedsYou, needsYouCounts, needsYouSummary, readPendingSpendApprovals } from '../needsYou';

const NOW = Date.parse('2026-10-07T04:00:00.000Z');
const AGENT = '1129f3c4-8da8-43cf-b795-26062cd68d0d';
const iso = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();
const REF = `spa_${'a'.repeat(32)}`;

const approval = (ref: string, expiresInMin: number, status = 'pending') => ({
  approvalRef: ref,
  agentAccountId: AGENT,
  toolName: 'x402_pay',
  spend: { path: 'x402', amountCents: 1000, original: null, payeeLabel: 'notion.so', agentLabel: 'Lin assistant', stepUpRequired: false },
  status,
  createdAt: iso(-5),
  expiresAt: iso(expiresInMin),
  decidedAt: null,
  resultSummary: null,
}) as never;

const request = (id: string, receivedMinAgo: number) => ({
  receiptId: id, kind: 'book', audience: 'stranger', status: 'pending_owner', verification: 'verified', verifiedBy: 'dns', receivedAt: iso(-receivedMinAgo),
  counterpartName: "Daniel's Agent", identity: { kind: 'domain', value: 'daniel.studio' }, message: '<b>30 minutes on Tuesday?</b>', proposedStartAt: iso(60 * 24), amountMinor: null, currency: null, fileUrl: null,
}) as never;

describe('needs you (M0 home)', () => {
  it('puts payments first by expiry, then requests newest first, follow-ups, goal check-ins and 事项 items', () => {
    const cards = buildNeedsYou({
      approvals: [approval('apr_late', 30), approval('apr_soon', 5), approval('apr_done', 30, 'approved'), approval('apr_gone', -1)],
      requests: [request('r_old', 60 * 24 * 8), request('r_new', 5), request('r_mid', 60)],
      followUps: {
        quietNow: false,
        cards: [
          { cardId: 'booking_soon:b1', kind: 'booking_soon', refId: 'b1', agentAccountId: AGENT, dueAt: iso(600), startsAt: iso(600) },
          { cardId: 'lead_no_reply:l1', kind: 'lead_no_reply', refId: 'l1', agentAccountId: AGENT, dueAt: iso(-60), title: 'Do you take students?', draft: { zh: '你好', en: 'Hi' } },
          { cardId: 'deposit_unpaid:b2', kind: 'deposit_unpaid', refId: 'b2', agentAccountId: AGENT, dueAt: iso(120), startsAt: iso(2000) },
        ],
      } as never,
      goals: { goals: [], cards: [{ kind: 'goal_check_in', cardId: 'c1', goalId: 'g1', title: 'Weekly review', dueAt: iso(-10) }], quietNow: false } as never,
      matters: [
        { key: 'twin_review:t1', kind: 'twin_review', id: 't1', title: 'Is the fee per term?', detail: null, risk: null, priority: 'normal', dueAt: null, expired: false, createdAt: iso(-100) },
        { key: 'computer_approval:x1', kind: 'computer_approval', id: 'x1', title: 'Delete old logs', detail: null, risk: 'L2', priority: 'critical', dueAt: iso(-1), expired: true, createdAt: iso(-100) },
      ] as never,
    }, NOW);
    expect(cards.map((c) => c.key)).toEqual([
      'spend_approval:apr_soon', 'spend_approval:apr_late',
      'agent_request:r_new', 'agent_request:r_mid',
      'lead_no_reply:l1', 'deposit_unpaid:b2', 'booking_soon:b1',
      'goal_check_in:g1',
      'twin_review:t1',
    ]);
    expect(cards[0]).toMatchObject({ title: 'notion.so · US$10.00', detail: 'Lin assistant' });
    expect(cards[2].title).toBe("Daniel's Agent: <b>30 minutes on Tuesday?</b>");
    expect(cards[2].request?.verifiedBy).toBe('dns');
    expect(cards[4].draft).toEqual({ zh: '你好', en: 'Hi' });
    expect(cards[6].at).toBe(iso(600));
  });

  it('a closed or failed source hides only its own cards', () => {
    const cards = buildNeedsYou({ approvals: null, requests: [request('r1', 5)], followUps: null, goals: null, matters: null }, NOW);
    expect(cards.map((c) => c.kind)).toEqual(['agent_request']);
    expect(buildNeedsYou({ approvals: null, requests: null, followUps: null, goals: null, matters: null }, NOW)).toEqual([]);
  });

  it('caps the request list at the 10 newest of the last 7 days and clips long text', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ ...(request(`r${i}`, i) as object), message: 'x'.repeat(200) })) as never[];
    const cards = buildNeedsYou({ approvals: null, requests: many, followUps: null, goals: null, matters: null }, NOW);
    expect(cards).toHaveLength(10);
    expect(cards[0].id).toBe('r0');
    expect(cards[0].title.length).toBeLessThanOrEqual(15 + 2 + 80);
  });

  it('says how many decisions wait, by kind, in both languages', () => {
    const cards = buildNeedsYou({ approvals: [approval('a1', 5)], requests: [request('r1', 5), request('r2', 6)], followUps: null, goals: null, matters: null }, NOW);
    expect(needsYouCounts(cards)).toEqual({ spend_approval: 1, agent_request: 2 });
    expect(needsYouSummary(cards, 'zh')).toBe('3 件事要你拍板：1 笔付款等批准，2 条别人 Agent 的请求。');
    expect(needsYouSummary(cards, 'en')).toBe('3 things need you: 1 payment to approve, 2 requests from other Agents.');
    expect(needsYouSummary([], 'zh')).toBe('现在没有要你拍板的事。');
  });

  it('reads pending payments from the list route and treats 404, errors and bad bodies as no source', async () => {
    const requests: HttpRequestV1[] = [];
    const replies = [
      { status: 200, headers: {}, body: { items: [approval(REF, 5), approval('not-a-ref', 5)] } },
      { status: 404, headers: {}, body: { code: 'SPEND_APPROVAL_NOT_FOUND' } },
      { status: 200, headers: {}, body: { nope: true } },
    ];
    const transport = { request: jest.fn(async (req: HttpRequestV1) => { requests.push(req); const r = replies.shift(); if (!r) throw new Error('offline'); return r; }) };
    const deps = { transport, baseUrl: 'https://api.agentrix.top/api/', token: 't' };
    expect((await readPendingSpendApprovals(deps, NOW))?.map((a) => a.approvalRef)).toEqual([REF]);
    expect(requests[0]).toMatchObject({ method: 'GET', path: 'https://api.agentrix.top/api/spend-approvals?status=pending' });
    await expect(readPendingSpendApprovals(deps, NOW)).resolves.toBeNull();
    await expect(readPendingSpendApprovals(deps, NOW)).resolves.toBeNull();
    await expect(readPendingSpendApprovals(deps, NOW)).resolves.toBeNull();
    await expect(readPendingSpendApprovals({ ...deps, token: null }, NOW)).resolves.toBeNull();
    expect(requests).toHaveLength(4);
  });
});
