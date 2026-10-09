import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import type { SpendBudgetSettingsV0, SpendBudgetSettingsViewV0 } from '../../../shared/types/spend-budget';
import {
  SPEND_BUDGET_AMOUNT_PROBLEM,
  SPEND_BUDGET_FAILURE_COPY,
  SpendBudgetError,
  centsToDollarsInput,
  createMobileSpendBudgetClient,
  parseDollarsToCents,
  runSpendBudgetSave,
  spendBudgetCardEnabled,
  spendBudgetDraft,
  spendBudgetFromDraft,
  spendBudgetProblem,
  spendBudgetWidens,
  type MobileSpendBudgetClientV0,
} from '../spendBudget';

/** D1 settings entry on the phone (contract v0.2): client, one save with at most one step-up, the form. */
const AGENT = '11111111-2222-4333-8444-555555555555';
const view: SpendBudgetSettingsViewV0 = {
  agentAccountId: AGENT,
  updatedAt: '2026-10-03T14:00:00.000Z',
  singleTxLimitCents: 5000,
  dailyLimitCents: 10000,
  monthlyLimitCents: 50000,
  freeApprovalCents: 500,
  stepUpCents: 2000,
  revision: 1,
};
const settings: SpendBudgetSettingsV0 = { singleTxLimitCents: 1000, dailyLimitCents: 10000, monthlyLimitCents: 50000, freeApprovalCents: 0, stepUpCents: 2000, revision: 1 };

function transport(answers: Array<{ status: number; body: unknown }>): { transport: HttpTransportV1; requests: HttpRequestV1[] } {
  const requests: HttpRequestV1[] = [];
  return {
    requests,
    transport: {
      request: async (request: HttpRequestV1): Promise<HttpResponseV1> => {
        requests.push(request);
        const answer = answers.shift() ?? { status: 500, body: {} };
        return { status: answer.status, body: answer.body, headers: {} } as unknown as HttpResponseV1;
      },
    },
  };
}

function client(answers: Array<{ status: number; body: unknown }>, token: string | null = 'tok') {
  const t = transport(answers);
  return { ...t, client: createMobileSpendBudgetClient({ transport: t.transport, baseUrl: 'https://api.example.test/api/', token: () => token }) };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof SpendBudgetError ? error.failure : `other:${String(error)}`;
  }
  return 'resolved';
}

describe('spend budget on the phone (D1 settings entry, contract v0.2)', () => {
  it('is off unless the build value is exactly 1', () => {
    expect(spendBudgetCardEnabled(undefined)).toBe(false);
    expect(spendBudgetCardEnabled('true')).toBe(false);
    expect(spendBudgetCardEnabled('1')).toBe(true);
  });

  it('reads and saves over the contract routes with the owner token, and accepts only a readable budget for that Agent', async () => {
    const ok = client([
      { status: 200, body: view },
      { status: 200, body: { data: { ...view, ...settings, revision: 2 } } },
    ]);
    await expect(ok.client.read(AGENT)).resolves.toEqual(view);
    await expect(ok.client.update(AGENT, settings)).resolves.toMatchObject({ singleTxLimitCents: 1000, revision: 2 });
    expect(ok.requests.map((r) => [r.method, r.path, (r.headers ?? {}).Authorization])).toEqual([
      ['GET', `https://api.example.test/api/spend-budgets/${AGENT}`, 'Bearer tok'],
      ['PUT', `https://api.example.test/api/spend-budgets/${AGENT}`, 'Bearer tok'],
    ]);
    expect(ok.requests[1].body).toEqual(settings);
    expect(await failure(client([{ status: 200, body: { ...view, agentAccountId: '99999999-2222-4333-8444-555555555555' } }]).client.read(AGENT))).toBe('unreadable');
    expect(await failure(client([{ status: 200, body: { ...view, dailyLimitCents: 60000 } }]).client.read(AGENT))).toBe('unreadable');
    const none = client([], null);
    expect(await failure(none.client.read(AGENT))).toBe('no_session');
    expect(await failure(none.client.read('not-an-agent'))).toBe('not_found');
    expect(none.requests).toHaveLength(0);
  });

  it('maps refusals: step-up, not the owner, not found, stale, invalid, too many, anything else', async () => {
    const cases: Array<[number, unknown, string]> = [
      [403, { code: 'STEP_UP_REQUIRED', reasonCode: 'recent_sign_in_required' }, 'step_up_required'],
      [403, { code: 'SPEND_BUDGET_SIGN_IN_REQUIRED' }, 'sign_in_required'],
      [404, { code: 'SPEND_BUDGET_NOT_FOUND' }, 'not_found'],
      [409, { code: 'SPEND_BUDGET_SETTINGS_STALE' }, 'stale'],
      [400, { code: 'SPEND_BUDGET_SETTINGS_INVALID', errors: ['x'] }, 'invalid'],
      [429, {}, 'rate_limited'],
      [401, {}, 'unavailable'],
      [500, {}, 'unavailable'],
    ];
    for (const [status, body, expected] of cases) expect(await failure(client([{ status, body }]).client.update(AGENT, settings))).toBe(expected);
  });

  it('one save: lowering lands at once; a step-up is confirmed once, then the same change is sent again', async () => {
    const lowered = client([{ status: 200, body: { ...view, ...settings, revision: 2 } }]);
    await expect(runSpendBudgetSave({ client: lowered.client, agentAccountId: AGENT, settings, confirmStepUp: async () => false })).resolves.toMatchObject({ kind: 'done' });

    const raised = client([
      { status: 403, body: { code: 'STEP_UP_REQUIRED', reasonCode: 'recent_sign_in_required' } },
      { status: 200, body: { ...view, dailyLimitCents: 20000, revision: 2 } },
    ]);
    let asked = 0;
    const raise = { ...settings, dailyLimitCents: 20000 };
    const outcome = await runSpendBudgetSave({ client: raised.client, agentAccountId: AGENT, settings: raise, confirmStepUp: async () => { asked += 1; return true; } });
    expect(outcome).toMatchObject({ kind: 'done', view: { dailyLimitCents: 20000, revision: 2 } });
    expect(asked).toBe(1);
    expect(raised.requests.map((r) => r.body)).toEqual([raise, raise]);
  });

  it('a cancelled confirmation and a second step-up request stop without saving', async () => {
    const stepUp = { status: 403, body: { code: 'STEP_UP_REQUIRED', reasonCode: 'recent_sign_in_required' } };
    const cancelled = client([stepUp]);
    await expect(runSpendBudgetSave({ client: cancelled.client, agentAccountId: AGENT, settings, confirmStepUp: async () => false })).resolves.toEqual({ kind: 'failed', failure: 'step_up_cancelled', view: null });
    expect(cancelled.requests).toHaveLength(1);
    const again = client([stepUp, stepUp]);
    await expect(runSpendBudgetSave({ client: again.client, agentAccountId: AGENT, settings, confirmStepUp: async () => true })).resolves.toEqual({ kind: 'failed', failure: 'step_up_again', view: null });
    expect(again.requests).toHaveLength(2);
    const thrown = client([stepUp]);
    await expect(runSpendBudgetSave({ client: thrown.client, agentAccountId: AGENT, settings, confirmStepUp: async () => { throw new Error('sheet'); } })).resolves.toMatchObject({ failure: 'step_up_cancelled' });
  });

  it('a change made elsewhere first is not overwritten: the budget is read again', async () => {
    const newer = { ...view, singleTxLimitCents: 100, revision: 2 };
    const stale = client([{ status: 409, body: { code: 'SPEND_BUDGET_SETTINGS_STALE' } }, { status: 200, body: newer }]);
    await expect(runSpendBudgetSave({ client: stale.client, agentAccountId: AGENT, settings, confirmStepUp: async () => true })).resolves.toEqual({ kind: 'failed', failure: 'stale', view: newer });
    expect(stale.requests.map((r) => r.method)).toEqual(['PUT', 'GET']);
    const fake: MobileSpendBudgetClientV0 = { read: async () => { throw new SpendBudgetError('unavailable'); }, update: async () => { throw new SpendBudgetError('stale'); } };
    await expect(runSpendBudgetSave({ client: fake, agentAccountId: AGENT, settings, confirmStepUp: async () => true })).resolves.toEqual({ kind: 'failed', failure: 'stale', view: null });
  });

  it('the form: dollars in, cents out; broken combinations explained in words; raising is spotted', () => {
    expect(parseDollarsToCents('12')).toBe(1200);
    expect(parseDollarsToCents(' $1,200.05 ')).toBe(120005);
    for (const bad of ['', '-1', '1.234', 'abc', '1000000.01']) expect(parseDollarsToCents(bad)).toBeNull();
    expect(centsToDollarsInput(1250)).toBe('12.50');
    const draft = spendBudgetDraft(view);
    expect(draft).toEqual({ singleTxLimitCents: '50', dailyLimitCents: '100', monthlyLimitCents: '500', freeApprovalCents: '5', stepUpCents: '20' });
    expect(spendBudgetFromDraft(draft, 1)).toEqual({ singleTxLimitCents: 5000, dailyLimitCents: 10000, monthlyLimitCents: 50000, freeApprovalCents: 500, stepUpCents: 2000, revision: 1 });
    expect(spendBudgetFromDraft({ ...draft, stepUpCents: '1.234' }, 1)).toBeNull();
    expect(spendBudgetProblem({ ...settings, dailyLimitCents: 60000 })?.zh).toBe('每天上限不能超过每月上限。');
    expect(spendBudgetProblem({ ...settings, freeApprovalCents: 3000 })?.zh).toBe('免批准额度不能超过大额确认门槛。');
    expect(spendBudgetProblem({ ...settings, singleTxLimitCents: 20000 })?.zh).toBe('单笔上限不能超过每天上限。');
    expect(spendBudgetProblem({ ...settings, stepUpCents: 12000 })?.zh).toBe('大额确认门槛不能超过每天上限。');
    expect(spendBudgetProblem({ ...settings, singleTxLimitCents: -1 })).toBe(SPEND_BUDGET_AMOUNT_PROBLEM);
    expect(spendBudgetProblem(settings)).toBeNull();
    expect(spendBudgetWidens(view, settings)).toBe(false);
    expect(spendBudgetWidens(view, { ...settings, stepUpCents: 2001 })).toBe(true);
    for (const copy of Object.values(SPEND_BUDGET_FAILURE_COPY)) expect(copy.zh.length > 0 && copy.en.length > 0).toBe(true);
  });
});
