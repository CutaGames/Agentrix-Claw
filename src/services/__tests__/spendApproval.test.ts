/**
 * D2 payment approval card on the phone (spendApproval.ts, contract shared/types/spend-budget.ts v0).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  SpendApprovalError,
  createMobileSpendApprovalClient,
  formatSpendOriginal,
  formatSpendUsdCents,
  isSpendApprovalRef,
  runSpendApprovalDecision,
  spendApprovalButtons,
  spendApprovalCardEnabled,
  spendApprovalFromStreamEvent,
  spendApprovalMinutesLeft,
  spendPathLabel,
  spendPayeeDisplay,
  type MobileSpendApprovalClientV0,
} from '../spendApproval';

const REF = `spa_${'a1'.repeat(16)}`;
const NOW = Date.parse('2026-10-01T08:00:00Z');
const BASE = 'https://api.example.test/api';

function view(overrides: Record<string, unknown> = {}) {
  return {
    approvalRef: REF,
    agentAccountId: '6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
    toolName: 'skill_purchase',
    spend: { path: 'skill_purchase', amountCents: 2500, original: null, payeeLabel: 'Seller Agent', stepUpRequired: true },
    status: 'pending',
    createdAt: '2026-10-01T07:58:00Z',
    expiresAt: '2026-10-01T08:08:00Z',
    decidedAt: null,
    resultSummary: null,
    ...overrides,
  };
}

function transport(answers: Array<HttpResponseV1 | Error>): HttpTransportV1 & { calls: HttpRequestV1[] } {
  const calls: HttpRequestV1[] = [];
  return {
    calls,
    async request(req) {
      calls.push(req);
      const next = answers.shift();
      if (!next) throw new Error('no more answers');
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const ok = (body: unknown): HttpResponseV1 => ({ status: 200, headers: {}, body });
const err = (status: number, body: unknown): HttpResponseV1 => ({ status, headers: {}, body });

function client(answers: Array<HttpResponseV1 | Error>, token: string | null = 'user-token') {
  const t = transport(answers);
  return { t, c: createMobileSpendApprovalClient({ transport: t, baseUrl: `${BASE}/`, token: () => token, now: () => NOW }) };
}

async function failureOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof SpendApprovalError ? error.failure : `other:${String(error)}`;
  }
  return 'resolved';
}

describe('flag, ref and stream event', () => {
  it('is on only for exactly "1"', () => {
    expect(spendApprovalCardEnabled('1')).toBe(true);
    for (const value of [undefined, '', '0', 'true', 1, true]) expect(spendApprovalCardEnabled(value)).toBe(false);
  });

  it('accepts only spa_ refs', () => {
    expect(isSpendApprovalRef(REF)).toBe(true);
    for (const value of ['spa_123', `SPA_${'a1'.repeat(16)}`, `spa_${'g'.repeat(32)}`, 'appr_1', null, 42]) expect(isSpendApprovalRef(value)).toBe(false);
  });

  it('reads a payment approval event; an ordinary tool approval or a broken one gives null', () => {
    const event = { type: 'approval_required', toolCallId: 'call_1', toolName: 'skill_purchase', riskLevel: 2, reason: 'Pay', approvalRef: REF, spend: view().spend, expiresAt: '2026-10-01T08:08:00Z' };
    expect(spendApprovalFromStreamEvent(event)?.approvalRef).toBe(REF);
    expect(spendApprovalFromStreamEvent({ type: 'approval_required', toolCallId: 'c', toolName: 'run', input: {}, riskLevel: 1, reason: 'r' })).toBeNull();
    expect(spendApprovalFromStreamEvent({ ...event, approvalRef: 'spa_bad' })).toBeNull();
    expect(spendApprovalFromStreamEvent({ ...event, spend: { ...event.spend, amountCents: 1.5 } })).toBeNull();
  });
});

describe('client', () => {
  it('reads one record with the user token and decodes it', async () => {
    const { t, c } = client([ok({ success: true, data: view() })]);
    const record = await c.read(REF);
    expect(record.status).toBe('pending');
    expect(t.calls[0]).toMatchObject({ method: 'GET', path: `${BASE}/spend-approvals/${REF}` });
    expect(t.calls[0].headers?.Authorization).toBe('Bearer user-token');
  });

  it('a pending record past its expiry reads as expired', async () => {
    const { c } = client([ok(view({ expiresAt: '2026-10-01T07:59:00Z' }))]);
    expect((await c.read(REF)).status).toBe('expired');
  });

  it('a malformed answer or another record is unreadable', async () => {
    expect(await failureOf(client([ok({ approvalRef: REF })]).c.read(REF))).toBe('unreadable');
    expect(await failureOf(client([ok(view({ approvalRef: `spa_${'b2'.repeat(16)}` }))]).c.read(REF))).toBe('unreadable');
  });

  it('never sends a bad ref or a request without a token', async () => {
    const bad = client([]);
    expect(await failureOf(bad.c.read('spa_../../x'))).toBe('not_found');
    expect(bad.t.calls).toHaveLength(0);
    const signedOut = client([], null);
    expect(await failureOf(signedOut.c.decide(REF, 'approve'))).toBe('no_session');
    expect(signedOut.t.calls).toHaveLength(0);
  });

  it('posts approve / reject and returns the record when the answer has one', async () => {
    const { t, c } = client([ok(view({ status: 'approved', decidedAt: '2026-10-01T08:00:00Z' })), ok({ success: true })]);
    expect((await c.decide(REF, 'approve'))?.status).toBe('approved');
    expect(await c.decide(REF, 'reject')).toBeNull();
    expect(t.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `POST ${BASE}/spend-approvals/${REF}/approve`,
      `POST ${BASE}/spend-approvals/${REF}/reject`,
    ]);
  });

  it.each([
    [403, { code: 'STEP_UP_REQUIRED', reasonCode: 'recent_sign_in_required' }, 'step_up_required'],
    [403, { success: false, data: { code: 'STEP_UP_REQUIRED', reasonCode: 'recent_sign_in_required' } }, 'step_up_required'],
    [403, { code: 'SPEND_APPROVAL_STEP_UP_REQUIRED' }, 'step_up_required'],
    [403, { code: 'SPEND_APPROVAL_SIGN_IN_REQUIRED' }, 'sign_in_required'],
    [403, { code: 'STEP_UP_REQUIRED', reasonCode: 'admin' }, 'unavailable'],
    [401, { code: 'UNAUTHORIZED' }, 'unavailable'],
    [404, { code: 'SPEND_APPROVAL_NOT_FOUND' }, 'not_found'],
    [409, { code: 'SPEND_APPROVAL_EXPIRED' }, 'expired'],
    [409, { code: 'SPEND_APPROVAL_ARGS_CHANGED' }, 'args_changed'],
    [409, { code: 'SPEND_APPROVAL_BUDGET_EXCEEDED' }, 'budget_exceeded'],
    [409, { code: 'SOMETHING_ELSE' }, 'unavailable'],
    [429, { code: 'RATE_LIMITED' }, 'rate_limited'],
    [500, {}, 'unavailable'],
  ])('HTTP %i %j → %s', async (status, body, failure) => {
    expect(await failureOf(client([err(status, body)]).c.decide(REF, 'approve'))).toBe(failure);
  });

  it('a network failure is unavailable, not a decision', async () => {
    expect(await failureOf(client([new Error('offline')]).c.decide(REF, 'approve'))).toBe('unavailable');
  });

  it('keeps the record sent with a 409 only when it is this one', async () => {
    const same = client([err(409, { code: 'SPEND_APPROVAL_ARGS_CHANGED', current: view({ status: 'failed' }) })]);
    await same.c.decide(REF, 'approve').catch((error: SpendApprovalError) => expect(error.current?.status).toBe('failed'));
    const other = client([err(409, { code: 'SPEND_APPROVAL_ARGS_CHANGED', current: view({ approvalRef: `spa_${'c3'.repeat(16)}` }) })]);
    await other.c.decide(REF, 'approve').catch((error: SpendApprovalError) => expect(error.current).toBeNull());
  });
});

describe('runSpendApprovalDecision', () => {
  function fake(script: Array<'ok' | 'none' | 'step_up' | 'sign_in' | 'args_changed'>, readStatus = 'pending') {
    const decide = jest.fn(async () => {
      const step = script.shift();
      if (step === 'ok') return { ...(view({ status: 'approved' }) as any) };
      if (step === 'none') return null;
      throw new SpendApprovalError(step === 'step_up' ? 'step_up_required' : step === 'sign_in' ? 'sign_in_required' : 'args_changed');
    });
    const read = jest.fn(async () => view({ status: readStatus }) as any);
    return { decide, read } as unknown as MobileSpendApprovalClientV0 & { decide: jest.Mock; read: jest.Mock };
  }

  it('returns the record from the answer', async () => {
    const c = fake(['ok']);
    const confirmStepUp = jest.fn(async () => true);
    const outcome = await runSpendApprovalDecision({ client: c, approvalRef: REF, decision: 'approve', confirmStepUp });
    expect(outcome).toMatchObject({ kind: 'done', view: { status: 'approved' } });
    expect(confirmStepUp).not.toHaveBeenCalled();
  });

  it('reads the record again when the answer has none (never optimistic)', async () => {
    const c = fake(['none'], 'executed');
    const outcome = await runSpendApprovalDecision({ client: c, approvalRef: REF, decision: 'approve', confirmStepUp: async () => true });
    expect(outcome).toMatchObject({ kind: 'done', view: { status: 'executed' } });
    expect(c.read).toHaveBeenCalledTimes(1);
  });

  it('step-up, then one retry', async () => {
    const c = fake(['step_up', 'ok']);
    const confirmStepUp = jest.fn(async () => true);
    const outcome = await runSpendApprovalDecision({ client: c, approvalRef: REF, decision: 'approve', confirmStepUp });
    expect(outcome.kind).toBe('done');
    expect(confirmStepUp).toHaveBeenCalledTimes(1);
    expect(c.decide).toHaveBeenCalledTimes(2);
  });

  it('asked again after confirming: stops, no third call', async () => {
    const c = fake(['step_up', 'step_up', 'ok']);
    const outcome = await runSpendApprovalDecision({ client: c, approvalRef: REF, decision: 'approve', confirmStepUp: async () => true });
    expect(outcome).toEqual({ kind: 'failed', failure: 'step_up_again', view: null });
    expect(c.decide).toHaveBeenCalledTimes(2);
  });

  it('cancelled or broken step-up: no retry', async () => {
    for (const confirmStepUp of [async () => false, async () => Promise.reject(new Error('sheet'))]) {
      const c = fake(['step_up', 'ok']);
      const outcome = await runSpendApprovalDecision({ client: c, approvalRef: REF, decision: 'approve', confirmStepUp });
      expect(outcome).toEqual({ kind: 'failed', failure: 'step_up_cancelled', view: null });
      expect(c.decide).toHaveBeenCalledTimes(1);
    }
  });

  it('not the owner credential never opens the step-up', async () => {
    const c = fake(['sign_in']);
    const confirmStepUp = jest.fn(async () => true);
    const outcome = await runSpendApprovalDecision({ client: c, approvalRef: REF, decision: 'approve', confirmStepUp });
    expect(outcome).toMatchObject({ kind: 'failed', failure: 'sign_in_required' });
    expect(confirmStepUp).not.toHaveBeenCalled();
  });

  it('a 409 locks the card and reads the record again', async () => {
    const c = fake(['args_changed'], 'failed');
    const outcome = await runSpendApprovalDecision({ client: c, approvalRef: REF, decision: 'approve', confirmStepUp: async () => true });
    expect(outcome).toMatchObject({ kind: 'failed', failure: 'args_changed', view: { status: 'failed' } });
    expect(c.read).toHaveBeenCalledTimes(1);
  });
});

describe('what the card shows', () => {
  it('buttons follow the record and the clock', () => {
    expect(spendApprovalButtons({ status: 'pending', expiresAt: '2026-10-01T08:08:00Z' }, NOW)).toEqual({ approve: true, reject: true });
    expect(spendApprovalButtons({ status: 'pending', expiresAt: '2026-10-01T07:59:59Z' }, NOW)).toEqual({ approve: false, reject: true });
    expect(spendApprovalButtons({ status: 'expired', expiresAt: '2026-10-01T07:59:59Z' }, NOW)).toEqual({ approve: false, reject: true });
    for (const status of ['approved', 'rejected', 'executed', 'failed'] as const) {
      expect(spendApprovalButtons({ status, expiresAt: '2026-10-01T08:08:00Z' }, NOW)).toEqual({ approve: false, reject: false });
    }
  });

  it('minutes left round up and stop at 0', () => {
    expect(spendApprovalMinutesLeft('2026-10-01T08:08:00Z', NOW)).toBe(8);
    expect(spendApprovalMinutesLeft('2026-10-01T08:00:01Z', NOW)).toBe(1);
    expect(spendApprovalMinutesLeft('2026-10-01T07:00:00Z', NOW)).toBe(0);
    expect(spendApprovalMinutesLeft('not a date', NOW)).toBe(0);
  });

  it('formats USD cents like the web card and refuses anything else', () => {
    expect(formatSpendUsdCents(2500, 'zh')).toBe('25.00 美元');
    expect(formatSpendUsdCents(2500, 'en')).toBe('$25.00');
    expect(formatSpendUsdCents(123456789, 'en')).toBe('$1,234,567.89');
    expect(formatSpendUsdCents(5, 'en')).toBe('$0.05');
    for (const value of [0, -1, 1.5, Number.NaN]) expect(formatSpendUsdCents(value, 'en')).toBeNull();
  });

  it('formats a non-USD original amount by its minor unit', () => {
    expect(formatSpendOriginal({ amountMinor: 9600, currency: 'HKD' })).toBe('HKD 96.00');
    expect(formatSpendOriginal({ amountMinor: 1500, currency: 'JPY' })).toBe('JPY 1,500');
    expect(formatSpendOriginal({ amountMinor: 1234, currency: 'KWD' })).toBe('KWD 1.234');
    expect(formatSpendOriginal({ amountMinor: 7, currency: 'USDC' })).toBe('USDC 0.07');
    expect(formatSpendOriginal({ amountMinor: 2500, currency: 'USD' })).toBeNull();
    expect(formatSpendOriginal({ amountMinor: 2500, currency: 'usd<' })).toBeNull();
    expect(formatSpendOriginal(null)).toBeNull();
  });

  it('shows the payee as plain text without direction or control characters', () => {
    expect(spendPayeeDisplay('Seller\u202Eevil\u202C Agent', 'en')).toBe('Sellerevil Agent');
    expect(spendPayeeDisplay('a\u200Bb\u2066c\u0007', 'en')).toBe('abc');
    expect(spendPayeeDisplay(' \u202E ', 'zh')).toBe('（收款方没有名字）');
    expect(spendPayeeDisplay('x'.repeat(120), 'en')).toHaveLength(80);
  });

  it('labels payment kinds, unknown ones generically', () => {
    expect(spendPathLabel('skill_purchase')).toEqual({ zh: '购买技能', en: 'Skill purchase' });
    expect(spendPathLabel('something_new')).toEqual({ zh: '付款', en: 'Payment' });
  });
});

describe('wiring (static)', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');

  it('事项 shows the card only behind the flag and only for spa_ refs', () => {
    const src = read('screens/four-zone/MattersHomeScreen.tsx');
    expect(src).toMatch(/SPEND_APPROVAL_CARD_ENABLED && isSpendApprovalRef\(route\.params\?\.ref\)/);
    expect(src).toMatch(/\{spendRef \? <SpendApprovalCard approvalRef=\{spendRef\}/);
  });

  it('the chat attaches the card only behind the flag, deduped by approvalRef', () => {
    const src = read('screens/agent/AgentChatScreen.tsx');
    expect(src).toMatch(/SPEND_APPROVAL_CARD_ENABLED \? spendApprovalFromStreamEvent\(event\) : null/);
    expect(src).toMatch(/existing\.some\(\(a\) => a\.approvalRef === entry\.approvalRef\)/);
  });

  it('the card decides through runSpendApprovalDecision with StepUpSheet and two taps', () => {
    const src = read('components/SpendApprovalCard.tsx');
    expect(src).toMatch(/runSpendApprovalDecision\(\{ client: mobileSpendApprovalClient\(\), approvalRef, decision, confirmStepUp \}\)/);
    expect(src).toMatch(/<StepUpSheet visible=\{stepUpVisible\}/);
    expect(src).toMatch(/onPress=\{\(\) => ask\('approve'\)\}/);
    expect(src).toMatch(/onPress: \(\) => void decide\(decision\)/);
    expect(src).not.toMatch(/setQueryData\(key, \{/);
  });

  it('the flag is read as a literal so the Expo build inlines it', () => {
    expect(read('services/spendApproval.ts')).toMatch(/spendApprovalCardEnabled\(process\.env\.EXPO_PUBLIC_SPEND_APPROVAL_CARD\)/);
  });
});
