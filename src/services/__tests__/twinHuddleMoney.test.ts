import { describe, it, expect } from '@jest/globals';
import type { HttpRequestV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  TWIN_HUDDLE_BILL_STATUSES_V0,
  TWIN_HUDDLE_MONEY_CAP_LIMITS_V0,
  TWIN_HUDDLE_MONEY_CAP_SCHEMA_VERSION_V0,
  TWIN_HUDDLE_MONEY_CONFLICT_CODES_V0,
  TWIN_HUDDLE_MONEY_KINDS_V0,
  TWIN_HUDDLE_MONEY_SCHEMA_VERSION_V0,
  TWIN_HUDDLE_SHARE_STATUSES_V0,
  type TwinHuddleBillV0,
  type TwinHuddleMoneyCapViewV0,
  type TwinHuddleMoneyViewV0,
} from '../../../shared/types/twin-huddle-money';
import { TWIN_HUDDLE_FAILURE_COPY, TwinHuddleError } from '../twinHuddle';
import {
  TWIN_HUDDLE_BILL_STATUS_COPY,
  TWIN_HUDDLE_MONEY_CAP_COPY,
  TWIN_HUDDLE_MONEY_CAP_RULES,
  TWIN_HUDDLE_MONEY_CONFLICT_COPY,
  TWIN_HUDDLE_MONEY_KIND_COPY,
  TWIN_HUDDLE_MONEY_TEST_BADGE,
  TWIN_HUDDLE_SHARE_STATUS_COPY,
  TwinHuddleMoneyError,
  createMobileTwinHuddleMoneyCapClient,
  createMobileTwinHuddleMoneyClient,
  twinHuddleBillMineWords,
  twinHuddleBillProgressWords,
  twinHuddleBillTitleWords,
  twinHuddleMoneyAmountProblem,
  twinHuddleMoneyCapFailureWords,
  twinHuddleMoneyCapInput,
  twinHuddleMoneyCapProblem,
  twinHuddleMoneyCapStateWords,
  twinHuddleMoneyConflictOf,
  twinHuddleMoneyFailureWords,
  twinHuddleMoneyFormProblem,
  twinHuddleMoneyGuestsWords,
  twinHuddleMoneyHintWords,
  twinHuddleMoneyPreviewWords,
  twinHuddleMoneyRefsToggled,
  twinHuddleShareWhoWords,
} from '../twinHuddleMoney';

const BASE = 'https://api.example/api';
const HUDDLE = '0b6f3c1e-2d4a-4f5b-8c9d-1e2f3a4b5c6d';
const OTHER_HUDDLE = '1c7a4d2f-3e5b-4a6c-9d0e-2f3a4b5c6d7e';
const BILL = 'dddddddd-0000-4000-8000-000000000001';
const BOB = 'rel:aaaaaaaa-0000-4000-8000-000000000001';
const CAROL = 'rel:aaaaaaaa-0000-4000-8000-000000000002';
const CJK = /[\u3400-\u9fff]/;

const bill = (overrides: Partial<TwinHuddleBillV0> = {}): TwinHuddleBillV0 => ({
  id: BILL,
  kind: 'deposit',
  status: 'open',
  total: { amountMinor: '10000', currency: 'USD', decimals: 2 },
  headcount: 3,
  confirmedCount: 1,
  declinedCount: 0,
  mine: { amountMinor: '3334', status: 'confirmed' },
  shares: [
    { ref: null, amountMinor: '3334', status: 'confirmed' },
    { ref: BOB, amountMinor: '3333', status: 'pending' },
    { ref: CAROL, amountMinor: '3333', status: 'pending' },
  ],
  expiresAt: '2026-11-21T03:00:00.000Z',
  createdAt: '2026-11-18T03:00:00.000Z',
  canDecide: false,
  canCancel: true,
  ...overrides,
});
const VIEW: TwinHuddleMoneyViewV0 = {
  schemaVersion: TWIN_HUDDLE_MONEY_SCHEMA_VERSION_V0,
  huddleId: HUDDLE,
  role: 'initiator',
  testMode: true,
  available: true,
  canCreate: ['split'],
  eligibleRefs: [BOB, CAROL],
  guestsLeftOut: 1,
  bills: [bill()],
};

type Scripted = { status: number; body?: unknown } | Error;

function scripted(...responses: Scripted[]) {
  const calls: HttpRequestV1[] = [];
  const transport: HttpTransportV1 = {
    async request(req) {
      calls.push(req);
      const next = responses.shift();
      if (next === undefined) throw new Error('no scripted response left');
      if (next instanceof Error) throw next;
      return { status: next.status, headers: {}, body: next.body };
    },
  };
  const client = createMobileTwinHuddleMoneyClient({ transport, baseUrl: `${BASE}/`, token: () => 'tok' });
  return { calls, client };
}

const failure = async (run: Promise<unknown>): Promise<TwinHuddleError> => {
  try {
    await run;
  } catch (error) {
    if (error instanceof TwinHuddleError) return error;
    throw error;
  }
  throw new Error('expected the call to fail');
};

const HEADERS = { Accept: 'application/json', Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' };

describe('money on a settled plan, on the phone: the client', () => {
  it('reads the sheets as a signed-in mobile request, bare or wrapped', async () => {
    const { calls, client } = scripted({ status: 200, body: VIEW }, { status: 200, body: { data: VIEW } });
    await expect(client.get(HUDDLE)).resolves.toEqual(VIEW);
    await expect(client.get(HUDDLE)).resolves.toEqual(VIEW);
    expect(calls[0]).toEqual({ method: 'GET', path: `${BASE}/twin-huddle/${HUDDLE}/money`, headers: HEADERS });
  });

  it('opens a sheet with the typed total in minor units and exactly the people shown on screen', async () => {
    const { calls, client } = scripted({ status: 200, body: VIEW }, { status: 200, body: VIEW });
    await expect(client.create(HUDDLE, { kind: 'deposit', amount: ' 300.5 ', currency: 'SGD', refs: [BOB, CAROL] })).resolves.toEqual(VIEW);
    await client.create(HUDDLE, { kind: 'split', amount: '100', currency: 'USD', refs: [CAROL] });
    expect(calls).toEqual([
      { method: 'POST', path: `${BASE}/twin-huddle/${HUDDLE}/money`, headers: HEADERS, body: { kind: 'deposit', amount: { amountMinor: '30050', currency: 'SGD', decimals: 2 }, refs: [BOB, CAROL] } },
      { method: 'POST', path: `${BASE}/twin-huddle/${HUDDLE}/money`, headers: HEADERS, body: { kind: 'split', amount: { amountMinor: '10000', currency: 'USD', decimals: 2 }, refs: [CAROL] } },
    ]);
  });

  it('answers for my own part and cancels on their own routes; no call carries anyone else', async () => {
    const { calls, client } = scripted({ status: 200, body: VIEW }, { status: 200, body: VIEW }, { status: 200, body: VIEW });
    await client.decide(HUDDLE, BILL, 'confirmed');
    await client.decide(HUDDLE, BILL, 'declined');
    await client.cancel(HUDDLE, BILL);
    expect(calls).toEqual([
      { method: 'PUT', path: `${BASE}/twin-huddle/${HUDDLE}/money/${BILL}/mine`, headers: HEADERS, body: { decision: 'confirmed' } },
      { method: 'PUT', path: `${BASE}/twin-huddle/${HUDDLE}/money/${BILL}/mine`, headers: HEADERS, body: { decision: 'declined' } },
      { method: 'DELETE', path: `${BASE}/twin-huddle/${HUDDLE}/money/${BILL}`, headers: HEADERS },
    ]);
  });

  it('refuses before sending: a malformed id, no session, a total or a list of people the server would reject', async () => {
    const { calls, client } = scripted();
    expect((await failure(client.get('not-an-id'))).failure).toBe('not_found');
    expect((await failure(client.decide(HUDDLE, '../x', 'confirmed'))).failure).toBe('not_found');
    expect((await failure(client.cancel(HUDDLE, 'nope'))).failure).toBe('not_found');
    for (const amount of ['', '0', '0.99', '10000.01', '3e2', '300.505', '$300']) {
      const error = await failure(client.create(HUDDLE, { kind: 'deposit', amount, currency: 'USD', refs: [BOB] }));
      expect([error.failure, error.field]).toEqual(['invalid', 'body.amount.amountMinor']);
    }
    const nobody = await failure(client.create(HUDDLE, { kind: 'deposit', amount: '300', currency: 'USD', refs: [] }));
    expect([nobody.failure, nobody.field]).toEqual(['invalid', 'body.refs']);
    const guest = await failure(client.create(HUDDLE, { kind: 'deposit', amount: '300', currency: 'USD', refs: ['guest:0'] }));
    expect([guest.failure, guest.field]).toEqual(['invalid', 'body.refs[0]']);
    expect(calls).toHaveLength(0);

    const signedOut = createMobileTwinHuddleMoneyClient({ transport: { request: async () => ({ status: 200, headers: {}, body: VIEW }) }, baseUrl: BASE, token: () => null });
    expect((await failure(signedOut.get(HUDDLE))).failure).toBe('no_session');
  });

  it('turns each refusal into the failure the screen words, keeping which rule a 409 applied', async () => {
    const { client } = scripted(
      { status: 404 },
      { status: 403, body: { code: 'initiator_only' } },
      { status: 409, body: { code: 'bill_exists' } },
      { status: 409, body: { code: 'something_new' } },
      { status: 429, body: { code: 'rate_limited' } },
      { status: 503, body: { code: 'test_mode_only' } },
      { status: 400, body: { reasonCode: 'invalid_value', field: 'body.amount.amountMinor' } },
      new Error('offline'),
    );
    expect((await failure(client.get(HUDDLE))).failure).toBe('not_found');
    expect((await failure(client.cancel(HUDDLE, BILL))).failure).toBe('not_allowed');
    const exists = await failure(client.create(HUDDLE, { kind: 'deposit', amount: '300', currency: 'USD', refs: [BOB] }));
    expect(exists).toBeInstanceOf(TwinHuddleMoneyError);
    expect([exists.failure, twinHuddleMoneyConflictOf(exists)]).toEqual(['changed', 'bill_exists']);
    const unknown = await failure(client.decide(HUDDLE, BILL, 'confirmed'));
    expect([unknown.failure, twinHuddleMoneyConflictOf(unknown)]).toEqual(['changed', null]);
    expect((await failure(client.decide(HUDDLE, BILL, 'confirmed'))).failure).toBe('too_many');
    expect((await failure(client.decide(HUDDLE, BILL, 'confirmed'))).failure).toBe('unavailable');
    const invalid = await failure(client.get(HUDDLE));
    expect([invalid.failure, invalid.reasonCode, invalid.field]).toEqual(['invalid', 'invalid_value', 'body.amount.amountMinor']);
    expect((await failure(client.get(HUDDLE))).failure).toBe('unavailable');
  });

  it('does not accept an answer it cannot read, one for another plan, or one that is not marked test mode', async () => {
    const { client } = scripted(
      { status: 200, body: 'ok' },
      { status: 200, body: { ...VIEW, huddleId: OTHER_HUDDLE } },
      { status: 200, body: { ...VIEW, testMode: false } },
      { status: 200, body: { ...VIEW, role: 'invited' } },
    );
    for (let i = 0; i < 4; i += 1) expect((await failure(client.get(HUDDLE))).failure).toBe('unreadable');
  });
});

describe('money on a settled plan, on the phone: the words', () => {
  const all = [
    TWIN_HUDDLE_MONEY_TEST_BADGE,
    ...Object.values(TWIN_HUDDLE_MONEY_KIND_COPY),
    ...Object.values(TWIN_HUDDLE_BILL_STATUS_COPY),
    ...Object.values(TWIN_HUDDLE_SHARE_STATUS_COPY),
    ...Object.values(TWIN_HUDDLE_MONEY_CONFLICT_COPY),
    twinHuddleMoneyHintWords({ role: 'initiator', available: true }),
    twinHuddleMoneyHintWords({ role: 'invited', available: true }),
    twinHuddleMoneyHintWords({ role: 'invited', available: false }),
    twinHuddleMoneyGuestsWords(2)!,
    twinHuddleBillProgressWords(bill({ confirmedCount: 1, declinedCount: 1 })),
  ];

  it('has both languages for every kind, status and refusal the contract lists', () => {
    expect(Object.keys(TWIN_HUDDLE_MONEY_KIND_COPY).sort()).toEqual([...TWIN_HUDDLE_MONEY_KINDS_V0].sort());
    expect(Object.keys(TWIN_HUDDLE_BILL_STATUS_COPY).sort()).toEqual([...TWIN_HUDDLE_BILL_STATUSES_V0].sort());
    expect(Object.keys(TWIN_HUDDLE_SHARE_STATUS_COPY).sort()).toEqual([...TWIN_HUDDLE_SHARE_STATUSES_V0].sort());
    expect(Object.keys(TWIN_HUDDLE_MONEY_CONFLICT_COPY).sort()).toEqual([...TWIN_HUDDLE_MONEY_CONFLICT_CODES_V0].sort());
    for (const words of all) {
      expect(words.zh).toMatch(CJK);
      expect(words.en).not.toMatch(CJK);
      expect(words.en.length).toBeGreaterThan(1);
    }
  });

  it('never says that money was paid, received or arrived; the badge and both hints say nothing is charged', () => {
    for (const words of all) {
      expect(words.zh).not.toMatch(/已付|付款成功|到账|已扣|已收|转账/);
      expect(words.en).not.toMatch(/\bpaid\b|\breceived\b|\btransferred\b|\bpayment\b/i);
    }
    expect(TWIN_HUDDLE_MONEY_TEST_BADGE).toEqual({ en: 'Records only · no money moves', zh: '只记账 · 不会扣钱' });
    expect(TWIN_HUDDLE_BILL_STATUS_COPY.held.zh).toBe('都同意了 · 记上了');
    for (const role of ['initiator', 'invited'] as const) {
      expect(twinHuddleMoneyHintWords({ role, available: true }).zh).toMatch(/只记账.*不会扣/);
      expect(twinHuddleMoneyHintWords({ role, available: true }).en).toMatch(/only keeps a record/);
    }
  });

  it('checks a typed total and the people picked before anything is sent', () => {
    for (const ok of ['1', '300', '300.5', '300.50', '10000']) expect(twinHuddleMoneyAmountProblem(ok)).toBeNull();
    for (const bad of ['', '0.5', '10000.01', 'abc', '1,000', '300.505']) expect(twinHuddleMoneyAmountProblem(bad)?.zh).toMatch(/1\.00 到 10,000\.00/);
    expect(twinHuddleMoneyFormProblem('300', [BOB])).toBeNull();
    expect(twinHuddleMoneyFormProblem('abc', [])?.zh).toMatch(/金额/);
    expect(twinHuddleMoneyFormProblem('300', [])?.zh).toBe('至少要选一位一起分的人。');
  });

  it('previews each part with the organizer counted in, and both amounts when it does not divide evenly', () => {
    expect(twinHuddleMoneyPreviewWords('100', 3, 'USD')).toEqual({ en: '4 people, 25.00 USD each', zh: '4 个人，每人 25.00 USD' });
    expect(twinHuddleMoneyPreviewWords('100', 2, 'SGD')).toEqual({
      en: '3 people, 33.33 SGD or 33.34 SGD each (the odd cents start with you)',
      zh: '3 个人，每人 33.33 SGD 或 33.34 SGD（除不尽的几分从你开始）',
    });
    expect(twinHuddleMoneyPreviewWords('abc', 2, 'USD')).toBeNull();
    expect(twinHuddleMoneyPreviewWords('100', 0, 'USD')).toBeNull();
    expect(twinHuddleMoneyPreviewWords('100', 10, 'USD')).toBeNull();
  });

  it('words a sheet: what it is, how far along, my part, and whose part each row is', () => {
    expect(twinHuddleBillTitleWords(bill())).toEqual({ en: 'Booking deposit · 100.00 USD', zh: '订位定金 · 100.00 USD' });
    expect(twinHuddleBillTitleWords(bill({ kind: 'split', total: { amountMinor: '30050', currency: 'SGD', decimals: 2 } })).zh).toBe('AA 分摊 · 300.50 SGD');
    expect(twinHuddleBillProgressWords(bill())).toEqual({ en: '1 of 3 agreed', zh: '3 人里 1 人同意' });
    expect(twinHuddleBillProgressWords(bill({ confirmedCount: 2, declinedCount: 1 }))).toEqual({ en: '2 of 3 agreed, 1 said no', zh: '3 人里 2 人同意，1 人不同意' });
    expect(twinHuddleBillMineWords(bill({ mine: { amountMinor: '3333', status: 'pending' } }))).toEqual({ en: 'Your part: 33.33 USD · No answer yet', zh: '你那份：33.33 USD · 还没答' });
    expect(twinHuddleBillMineWords(bill({ mine: null }))).toBeNull();
    const people = [{ ref: BOB, label: '阿波', route: 'twin' as const }];
    expect(twinHuddleShareWhoWords({ ref: null }, people)).toEqual({ en: 'You', zh: '我' });
    expect(twinHuddleShareWhoWords({ ref: BOB }, people)).toEqual({ en: '阿波', zh: '阿波' });
    expect(twinHuddleShareWhoWords({ ref: CAROL }, people)).toEqual({ en: 'A friend', zh: '一位朋友' });
    expect(twinHuddleShareWhoWords({ ref: CAROL })).toEqual({ en: 'A friend', zh: '一位朋友' });
  });

  it('mentions the people who joined through a link only when there are any', () => {
    expect(twinHuddleMoneyGuestsWords(0)).toBeNull();
    expect(twinHuddleMoneyGuestsWords(1)?.en).toMatch(/^1 person who joined through a link is not/);
    expect(twinHuddleMoneyGuestsWords(2)?.zh).toBe('有 2 位走链接的朋友不在单上，需要你自己和他们算。');
  });

  it('toggles one person at a time and keeps the server\'s order', () => {
    expect(twinHuddleMoneyRefsToggled([BOB, CAROL], [BOB, CAROL], BOB)).toEqual([CAROL]);
    expect(twinHuddleMoneyRefsToggled([BOB, CAROL], [CAROL], BOB)).toEqual([BOB, CAROL]);
    expect(twinHuddleMoneyRefsToggled([BOB, CAROL], [], CAROL)).toEqual([CAROL]);
    expect(twinHuddleMoneyRefsToggled([BOB, CAROL], [BOB], 'rel:someone-else')).toEqual([BOB]);
  });

  it('words a failure by the rule that applied, else by the kind of failure', () => {
    expect(twinHuddleMoneyFailureWords(new TwinHuddleMoneyError('changed', { conflict: 'already_decided' }))).toBe(TWIN_HUDDLE_MONEY_CONFLICT_COPY.already_decided);
    expect(twinHuddleMoneyFailureWords(new TwinHuddleMoneyError('changed'))).toBe(TWIN_HUDDLE_FAILURE_COPY.changed);
    expect(twinHuddleMoneyFailureWords(new TwinHuddleMoneyError('invalid', { reason: { reasonCode: 'invalid_value', field: 'body.amount.amountMinor' } })).zh).toMatch(/金额/);
    expect(twinHuddleMoneyFailureWords(new TwinHuddleMoneyError('invalid', { reason: { reasonCode: 'invalid_value', field: 'body.refs' } })).zh).toMatch(/至少要选一位/);
    expect(twinHuddleMoneyFailureWords(new TwinHuddleMoneyError('invalid'))).toBe(TWIN_HUDDLE_FAILURE_COPY.invalid);
    expect(twinHuddleMoneyFailureWords(new TwinHuddleMoneyError('unavailable'))).toBe(TWIN_HUDDLE_FAILURE_COPY.unavailable);
    expect(twinHuddleMoneyFailureWords(new Error('boom'))).toBe(TWIN_HUDDLE_FAILURE_COPY.unavailable);
    expect(twinHuddleMoneyConflictOf({ conflict: 'bill_limit' })).toBe('bill_limit');
    expect(twinHuddleMoneyConflictOf({ conflict: 'nope' })).toBeNull();
    expect(twinHuddleMoneyConflictOf(null)).toBeNull();
  });
});

describe('the limit within which my twin agrees for me, on the phone', () => {
  const CAP_VIEW: TwinHuddleMoneyCapViewV0 = {
    schemaVersion: TWIN_HUDDLE_MONEY_CAP_SCHEMA_VERSION_V0,
    testMode: true,
    available: true,
    cap: { currency: 'SGD', perBillMinor: '5000', weeklyMinor: '8000' },
    usedMinor: '3000',
  };
  const NONE: TwinHuddleMoneyCapViewV0 = { ...CAP_VIEW, cap: null, usedMinor: '0' };

  function scriptedCap(...responses: Scripted[]) {
    const calls: HttpRequestV1[] = [];
    const transport: HttpTransportV1 = {
      async request(req) {
        calls.push(req);
        const next = responses.shift();
        if (next === undefined) throw new Error('no scripted response left');
        if (next instanceof Error) throw next;
        return { status: next.status, headers: {}, body: next.body };
      },
    };
    return { calls, client: createMobileTwinHuddleMoneyCapClient({ transport, baseUrl: `${BASE}/`, token: () => 'tok' }) };
  }

  it('reads, sets and turns off my own limit on one route, as a signed-in mobile request', async () => {
    const { calls, client } = scriptedCap({ status: 200, body: CAP_VIEW }, { status: 200, body: { data: CAP_VIEW } }, { status: 200, body: NONE });
    await expect(client.get()).resolves.toEqual(CAP_VIEW);
    await expect(client.set({ currency: 'SGD', perBill: ' 50 ', weekly: '80.5' })).resolves.toEqual(CAP_VIEW);
    await expect(client.clear()).resolves.toEqual(NONE);
    expect(calls).toEqual([
      { method: 'GET', path: `${BASE}/twin-huddle/money-cap`, headers: HEADERS },
      { method: 'PUT', path: `${BASE}/twin-huddle/money-cap`, headers: HEADERS, body: { currency: 'SGD', perBillMinor: '5000', weeklyMinor: '8050' } },
      { method: 'DELETE', path: `${BASE}/twin-huddle/money-cap`, headers: HEADERS },
    ]);
  });

  it('refuses before sending: no session, or a limit the server would refuse', async () => {
    const { calls, client } = scriptedCap();
    const drafts = [
      { currency: 'SGD', perBill: '0.5', weekly: '80' },
      { currency: 'SGD', perBill: '500.01', weekly: '800' },
      { currency: 'SGD', perBill: '50', weekly: '49.99' },
      { currency: 'SGD', perBill: '50', weekly: '2000.01' },
      { currency: 'SGD', perBill: 'abc', weekly: '80' },
      { currency: 'SGD', perBill: '50', weekly: '' },
    ] as const;
    for (const draft of drafts) expect((await failure(client.set(draft))).failure).toBe('invalid');
    const signedOut = createMobileTwinHuddleMoneyCapClient({ transport: { request: async () => ({ status: 200, headers: {}, body: CAP_VIEW }) }, baseUrl: BASE, token: () => null });
    expect((await failure(signedOut.get())).failure).toBe('no_session');
    expect(calls).toEqual([]);
  });

  it('turns each refusal into words: the field a 400 names, a switched-off server, a server that only allows test mode', async () => {
    const { client } = scriptedCap(
      { status: 400, body: { reasonCode: 'invalid_value', field: 'body.weeklyMinor' } },
      { status: 404 },
      { status: 503, body: { code: 'test_mode_only' } },
      new Error('offline'),
    );
    const draft = { currency: 'USD', perBill: '50', weekly: '80' } as const;
    const weekly = await failure(client.set(draft));
    expect(weekly.failure).toBe('invalid');
    expect(twinHuddleMoneyCapFailureWords(weekly).zh).toMatch(/每周上限/);
    expect((await failure(client.get())).failure).toBe('not_found');
    expect((await failure(client.set(draft))).failure).toBe('unavailable');
    expect((await failure(client.clear())).failure).toBe('unavailable');
    expect(twinHuddleMoneyCapFailureWords(new TwinHuddleMoneyError('invalid', { reason: { reasonCode: 'invalid_value', field: 'body.perBillMinor' } })).zh).toMatch(/每笔上限/);
    expect(twinHuddleMoneyCapFailureWords(new Error('x'))).toEqual(TWIN_HUDDLE_FAILURE_COPY.unavailable);
  });

  it('does not accept an answer it cannot read or one that is not marked test mode', async () => {
    const { client } = scriptedCap(
      { status: 200, body: 'ok' },
      { status: 200, body: { ...CAP_VIEW, testMode: false } },
      { status: 200, body: { ...CAP_VIEW, schemaVersion: TWIN_HUDDLE_MONEY_SCHEMA_VERSION_V0 } },
      { status: 200, body: { ...CAP_VIEW, cap: { currency: 'SGD', perBillMinor: '90000', weeklyMinor: '90000' } } },
    );
    for (let i = 0; i < 4; i += 1) expect((await failure(client.get())).failure).toBe('unreadable');
  });

  it('checks a typed limit by the rule the server applies, and puts a set limit back into the form', () => {
    expect(twinHuddleMoneyCapProblem({ currency: 'USD', perBill: '1', weekly: '1' })).toBeNull();
    expect(twinHuddleMoneyCapProblem({ currency: 'SGD', perBill: '500', weekly: '2000' })).toBeNull();
    expect(twinHuddleMoneyCapProblem({ currency: 'USD', perBill: '500.01', weekly: '2000' })?.zh).toMatch(/1\.00 到 500\.00/);
    expect(twinHuddleMoneyCapProblem({ currency: 'USD', perBill: '50', weekly: '49.99' })?.zh).toMatch(/不能低于每笔上限/);
    expect(twinHuddleMoneyCapProblem({ currency: 'USD', perBill: '50', weekly: '2000.01' })?.zh).toMatch(/2,000\.00/);
    // The two rules spell the limits out, so they have to move together with the contract.
    expect(TWIN_HUDDLE_MONEY_CAP_LIMITS_V0.perBillMinMinor).toBe(100);
    expect(TWIN_HUDDLE_MONEY_CAP_LIMITS_V0.perBillMaxMinor).toBe(50_000);
    expect(TWIN_HUDDLE_MONEY_CAP_LIMITS_V0.weeklyMaxMinor).toBe(200_000);
    expect(twinHuddleMoneyCapInput('5000')).toBe('50.00');
    expect(twinHuddleMoneyCapInput('8050')).toBe('80.50');
  });

  it('words the row, the rules and where my limit stands in both languages, never as a payment', () => {
    const all = [
      ...Object.values(TWIN_HUDDLE_MONEY_CAP_COPY),
      TWIN_HUDDLE_MONEY_CAP_RULES,
      twinHuddleMoneyCapStateWords(CAP_VIEW),
      twinHuddleMoneyCapStateWords(NONE),
      twinHuddleMoneyCapStateWords({ ...CAP_VIEW, available: false }),
      twinHuddleMoneyCapStateWords({ ...NONE, available: false }),
      twinHuddleMoneyCapProblem({ currency: 'SGD', perBill: '501', weekly: '600' })!,
      twinHuddleMoneyCapProblem({ currency: 'SGD', perBill: '50', weekly: '40' })!,
    ];
    for (const words of all) {
      expect(words.zh).toMatch(CJK);
      expect(words.en).not.toMatch(CJK);
      expect(words.zh).not.toMatch(/已付|付款|到账|已扣|已收|转账|代付/);
      expect(words.en).not.toMatch(/\bpaid\b|\bpays?\b|\breceived\b|\btransferred\b|\bpayment\b/i);
    }
    expect(TWIN_HUDDLE_MONEY_CAP_COPY.row.zh).toBe('上限内不用问我');
    expect(TWIN_HUDDLE_MONEY_CAP_COPY.byCap.zh).toBe('分身在上限内替你同意了');
    expect(TWIN_HUDDLE_MONEY_CAP_COPY.revoke.zh).toBe('改成不同意');
    expect(TWIN_HUDDLE_MONEY_CAP_RULES.zh).toMatch(/开单那一刻就记上了/);
    expect(TWIN_HUDDLE_MONEY_CAP_RULES.zh).toMatch(/只能改一次/);
    expect(TWIN_HUDDLE_MONEY_CAP_RULES.zh).toMatch(/只有你自己看得到/);
    expect(TWIN_HUDDLE_MONEY_CAP_RULES.zh).toMatch(/不会扣你的钱/);
    expect(twinHuddleMoneyCapStateWords(CAP_VIEW).zh).toBe('每笔不超过 50.00 SGD，每周不超过 80.00 SGD。这 7 天分身已经替你同意了 30.00 SGD。');
    expect(twinHuddleMoneyCapStateWords({ ...CAP_VIEW, available: false }).zh).toMatch(/只能关掉/);
  });
});
