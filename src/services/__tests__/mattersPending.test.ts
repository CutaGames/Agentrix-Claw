/**
 * M3-a (2026-09-28) — 事项 → 待我处理: one list from backend reads, soonest
 * expiry first; approval buttons follow the backend-mirrored phone policy;
 * twin review items are read-only here (decided on Web, D16).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import type { MobileDesktopApproval } from '../desktopSync';
import { buildMattersPending, compareMattersPending, mattersDueLabel } from '../mattersPending';
import { fetchTwinReviewQueue, normalizeTwinReviewEntry, twinReviewPath, type MobileTwinReviewItem } from '../twinReviewQueue';

const NOW = Date.parse('2026-09-28T08:00:00Z');
const AGENT = '75e5c531-4c1e-4d6a-9b0a-3f2e1d0c9b8a';
const BASE = 'https://api.example.test/api';

function approval(overrides: Partial<MobileDesktopApproval> = {}): MobileDesktopApproval {
  return {
    approvalId: 'appr-1',
    deviceId: 'desk-1',
    taskId: 'task-1',
    title: 'Run tests',
    description: 'npm test in ~/proj',
    riskLevel: 'L1',
    status: 'pending',
    requestedAt: '2026-09-28T07:50:00Z',
    requestDigest: 'a'.repeat(64),
    expiresAt: '2026-09-28T08:10:00Z',
    ...overrides,
  };
}

function review(overrides: Partial<MobileTwinReviewItem> = {}): MobileTwinReviewItem {
  return { reviewRef: 'rev-1', priority: 'review', question: 'What do you charge?', createdAt: '2026-09-27T10:00:00Z', ...overrides };
}

describe('buildMattersPending', () => {
  it('keeps only pending approvals and open review items', () => {
    const items = buildMattersPending({
      approvals: [approval(), approval({ approvalId: 'appr-2', status: 'approved' }), approval({ approvalId: '  ' })],
      twinReview: [review()],
      now: NOW,
    });
    expect(items.map((item) => item.key)).toEqual(['computer_approval:appr-1', 'twin_review:rev-1']);
  });

  it('orders by expiry first, then priority and age; expired approvals last', () => {
    const items = buildMattersPending({
      approvals: [
        approval({ approvalId: 'later', expiresAt: '2026-09-28T09:00:00Z' }),
        approval({ approvalId: 'soon', expiresAt: '2026-09-28T08:02:00Z' }),
        approval({ approvalId: 'gone', expiresAt: '2026-09-28T07:59:00Z' }),
        approval({ approvalId: 'no-expiry', expiresAt: undefined, requestedAt: '2026-09-28T07:00:00Z' }),
      ],
      twinReview: [
        review({ reviewRef: 'insight', priority: 'insight', createdAt: '2026-09-20T00:00:00Z' }),
        review({ reviewRef: 'critical', priority: 'critical', createdAt: '2026-09-28T07:30:00Z' }),
        review({ reviewRef: 'old-review', priority: 'review', createdAt: '2026-09-26T00:00:00Z' }),
      ],
      now: NOW,
    });
    expect(items.map((item) => item.id)).toEqual(['soon', 'later', 'critical', 'no-expiry', 'old-review', 'insight', 'gone']);
    expect(items[items.length - 1]).toMatchObject({ expired: true, capabilities: { canApprove: false, canReject: false } });
  });

  it('carries the phone policy: L0/L1 both, L2 reject-only, L3 / unknown nothing', () => {
    const items = buildMattersPending({
      approvals: [
        approval({ approvalId: 'l1', riskLevel: 'L1' }),
        approval({ approvalId: 'l2', riskLevel: 'L2' }),
        approval({ approvalId: 'l3', riskLevel: 'L3' }),
        approval({ approvalId: 'odd', riskLevel: 'X9' as any }),
      ],
      now: NOW,
    });
    const caps = Object.fromEntries(items.map((item) => [item.id, item.capabilities]));
    expect(caps.l1).toEqual({ canApprove: true, canReject: true });
    expect(caps.l2).toMatchObject({ canApprove: false, canReject: true, approveBlockedReason: 'requires_receipt_refs' });
    expect(caps.l3).toMatchObject({ canApprove: false, canReject: false, rejectBlockedReason: 'requires_local_confirmation' });
    expect(caps.odd).toMatchObject({ canApprove: false, canReject: false });
    expect(items.find((item) => item.id === 'odd')?.risk).toBe('unknown');
  });

  it('an unparsable expiry fails closed as expired', () => {
    const [item] = buildMattersPending({ approvals: [approval({ expiresAt: 'soon-ish' })], now: NOW });
    expect(item).toMatchObject({ expired: true, capabilities: { canApprove: false, canReject: false } });
  });

  it('review items never carry decision capabilities', () => {
    const [item] = buildMattersPending({ twinReview: [review({ priority: 'critical' })], now: NOW });
    expect(item).toMatchObject({ kind: 'twin_review', capabilities: null, dueAt: null });
  });

  it('drops duplicate keys and tolerates missing sources', () => {
    expect(buildMattersPending({ approvals: [approval(), approval()], now: NOW })).toHaveLength(1);
    expect(buildMattersPending({ approvals: null, twinReview: undefined, now: NOW })).toEqual([]);
  });

  it('comparison is total and stable on ties', () => {
    const [a, b] = buildMattersPending({ twinReview: [review({ reviewRef: 'b' }), review({ reviewRef: 'a' })], now: NOW });
    expect(compareMattersPending(a, b)).toBeLessThan(0);
    expect(a.id).toBe('a');
  });
});

describe('mattersDueLabel', () => {
  it('counts down in minutes, hours, days and says expired', () => {
    expect(mattersDueLabel({ dueAt: '2026-09-28T08:04:10Z', expired: false }, NOW, 'zh')).toBe('还剩 5 分钟');
    expect(mattersDueLabel({ dueAt: '2026-09-28T11:00:00Z', expired: false }, NOW, 'en')).toBe('3 h left');
    expect(mattersDueLabel({ dueAt: '2026-10-01T08:00:00Z', expired: false }, NOW, 'zh')).toBe('还剩 3 天');
    expect(mattersDueLabel({ dueAt: '2026-09-28T07:00:00Z', expired: true }, NOW, 'zh')).toBe('已过期');
    expect(mattersDueLabel({ dueAt: null, expired: false }, NOW, 'zh')).toBeNull();
  });
});

describe('twin review queue (read-only)', () => {
  const entry = (item: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    item: {
      schemaVersion: 1,
      reviewRef: { kind: 'review_item', id: 'rev-1' },
      profileRef: { kind: 'profile', id: 'p' },
      sourceOutputRefs: [],
      priority: 'action',
      reasonCodes: ['inferred_answer'],
      recommendedActions: ['confirm'],
      state: 'open',
      createdAt: '2026-09-27T10:00:00Z',
      ...item,
    },
    question: 'Do you work weekends?',
    answerText: 'Probably not.',
    answerClass: 'inferred',
    sourceCanonicalIds: [],
    askedAt: '2026-09-27T10:00:00Z',
    ...extra,
  });

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
  const list = (open: unknown[]) => ({
    success: true,
    data: { status: 'applied', value: { schemaVersion: 1, profileRef: { kind: 'profile', id: 'p' }, open, decided: [], generatedAt: 'x' }, operationRef: { kind: 'operation', id: 'read' } },
  });
  const base = { baseUrl: BASE, token: 'tok', now: () => '2026-09-28T08:00:00.000Z' };

  it('GETs the owner review list and keeps open items only', async () => {
    const t = transport(200, list([entry({}), entry({ state: 'decided', reviewRef: { kind: 'review_item', id: 'rev-2' } })]));
    const state = await fetchTwinReviewQueue(AGENT, { ...base, transport: t });
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]).toMatchObject({ method: 'GET', path: `${BASE}${twinReviewPath(AGENT)}` });
    expect(t.calls[0].headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
    expect(state).toEqual({
      kind: 'ready',
      capturedAt: '2026-09-28T08:00:00.000Z',
      data: { open: [{ reviewRef: 'rev-1', priority: 'action', question: 'Do you work weekends?', createdAt: '2026-09-27T10:00:00Z' }] },
    });
  });

  it('uses the redacted sample when there is no thread question, and trims long text', () => {
    expect(normalizeTwinReviewEntry(entry({ questionSample: 'Visitor asked about pricing' }, { question: '' }))?.question).toBe('Visitor asked about pricing');
    const long = normalizeTwinReviewEntry(entry({}, { question: 'x'.repeat(500) }));
    expect(long?.question.length).toBe(120);
    expect(long?.question.endsWith('…')).toBe(true);
  });

  it('drops malformed entries and maps an unknown priority to review', () => {
    expect(normalizeTwinReviewEntry(entry({ reviewRef: null }))).toBeNull();
    expect(normalizeTwinReviewEntry(entry({ createdAt: 7 }))).toBeNull();
    expect(normalizeTwinReviewEntry({})).toBeNull();
    expect(normalizeTwinReviewEntry(entry({ priority: 'shouty' }))?.priority).toBe('review');
  });

  it('no twin / capability off are unavailable states, not errors', async () => {
    const rejected = { success: true, data: { status: 'rejected', reasonCode: 'profile_not_found', retryable: false } };
    await expect(fetchTwinReviewQueue(AGENT, { ...base, transport: transport(200, rejected) })).resolves.toMatchObject({ kind: 'unavailable', reason: 'profile_not_found' });
    await expect(
      fetchTwinReviewQueue(AGENT, { ...base, transport: transport(503, { capability: 'review', reasonCode: 'capability_off' }) }),
    ).resolves.toMatchObject({ kind: 'unavailable', capability: 'review', reason: 'capability_off' });
    await expect(fetchTwinReviewQueue(AGENT, { ...base, transport: transport(500, {}) })).resolves.toMatchObject({ kind: 'error', reason: 'http_500' });
  });

  it('an unsafe agent id or no token sends nothing', async () => {
    const t = transport(200, list([]));
    await expect(fetchTwinReviewQueue('../x', { ...base, transport: t })).resolves.toMatchObject({ kind: 'unavailable', reason: 'agent_account_required' });
    await expect(fetchTwinReviewQueue(AGENT, { ...base, token: '', transport: t })).resolves.toMatchObject({ kind: 'unauthorized' });
    expect(t.calls).toHaveLength(0);
  });
});

describe('source guards', () => {
  const read = (...parts: string[]) => fs.readFileSync(path.resolve(__dirname, '..', ...parts), 'utf8');
  const queue = read('twinReviewQueue.ts');
  const screen = read('..', 'screens', 'four-zone', 'MattersHomeScreen.tsx');

  it('the review queue has no decision call (content decisions are Web-only, D16)', () => {
    expect(queue).not.toMatch(/method:\s*'(POST|PUT|PATCH|DELETE)'/);
    expect(queue).not.toMatch(/\/decision/);
  });

  it('the screen decides only through respondToDesktopApproval and gates buttons on the policy', () => {
    expect(screen).toMatch(/respondToDesktopApproval\(approval, decision\)/);
    expect(screen).toMatch(/caps\.canApprove \? \(/);
    expect(screen).toMatch(/caps\.canReject \? \(/);
    expect(screen).not.toMatch(/rememberForSession/);
    // No direct network calls from the screen (`refetch()` is react-query).
    expect(screen).not.toMatch(/apiFetch|[^A-Za-z.]fetch\(/);
    // Review items open the Web twin workspace.
    expect(screen).toMatch(/getTwinWebUrl\(/);
    // Read-back, not optimistic: every decision invalidates the desktop state.
    expect(screen).toMatch(/onSettled: \(\) => void queryClient\.invalidateQueries\(\{ queryKey: DESKTOP_STATE_KEY \}\)/);
  });
});
