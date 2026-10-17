/**
 * D1 settings entry on the phone (contract `shared/types/spend-budget.ts` v0.2, E99): the owner sees and changes one
 * Agent's spending budget on the passport screen. Off unless the build sets `EXPO_PUBLIC_SPEND_BUDGET_CARD=1`; the
 * server routes have their own switches (404 while every spend path is off, or for an Agent that is not yours).
 *
 * - Read: `GET /spend-budgets/:agentAccountId`, decoded with `decodeSpendBudgetSettingsViewV0`, only for the Agent asked for.
 * - Save: `PUT` with the full settings and the revision read. Lowering lands at once; raising answers the standard
 *   403 `STEP_UP_REQUIRED`, which opens StepUpSheet and retries once; asked again → stop (same rule as the web card).
 * - 409: changed elsewhere first; nothing is overwritten, the budget is read again.
 * - Money is US cents end to end; the phone only turns typed dollars into cents and back.
 * No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { parseApiErrorBodyV1 } from '../../shared/types/api-error';
import {
  SPEND_BUDGET_MAX_CENTS_V0,
  SPEND_BUDGET_SETTINGS_ERROR_CODES_V0,
  decodeSpendBudgetSettingsViewV0,
  spendBudgetSettingsWideningV0,
  validateSpendBudgetSettingsV0,
  type SpendBudgetSettingsV0,
  type SpendBudgetSettingsViewV0,
} from '../../shared/types/spend-budget';
import { needsStepUp } from './stepUp';

type Copy = { zh: string; en: string };

/** Off by default; the card only appears when the build value is exactly `1`. */
export function spendBudgetCardEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const SPEND_BUDGET_CARD_ENABLED = spendBudgetCardEnabled(process.env.EXPO_PUBLIC_SPEND_BUDGET_CARD);

// ── Client ─────────────────────────────────────────────────────────────────────────────

export type SpendBudgetFailureV0 =
  | 'step_up_required'
  | 'sign_in_required'
  | 'not_found'
  | 'stale'
  | 'invalid'
  | 'rate_limited'
  | 'unreadable'
  | 'unavailable'
  | 'no_session';

export class SpendBudgetError extends Error {
  readonly failure: SpendBudgetFailureV0;
  constructor(failure: SpendBudgetFailureV0) {
    super(failure);
    this.name = 'SpendBudgetError';
    this.failure = failure;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function payloadOf(response: HttpResponseV1): unknown {
  const body = response.body as Record<string, unknown> | undefined;
  return body && typeof body === 'object' && body.data && typeof body.data === 'object' && !('agentAccountId' in body) ? body.data : body;
}

function failureOf(status: number, body: unknown): SpendBudgetFailureV0 {
  if (needsStepUp(status, body)) return 'step_up_required';
  const { code } = parseApiErrorBodyV1(body);
  if (status === 403 && code === SPEND_BUDGET_SETTINGS_ERROR_CODES_V0.signInRequired) return 'sign_in_required';
  if (status === 404) return 'not_found';
  if (status === 409) return 'stale';
  if (status === 400) return 'invalid';
  if (status === 429) return 'rate_limited';
  // Any other 401 / 403 is not this card's to fix; it is never read as "saved".
  return 'unavailable';
}

export interface MobileSpendBudgetClientV0 {
  read(agentAccountId: string): Promise<SpendBudgetSettingsViewV0>;
  update(agentAccountId: string, settings: SpendBudgetSettingsV0): Promise<SpendBudgetSettingsViewV0>;
}

export function createMobileSpendBudgetClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileSpendBudgetClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (agentAccountId: string, settings?: SpendBudgetSettingsV0): Promise<SpendBudgetSettingsViewV0> => {
    // Checked before sending: the id goes into the path.
    if (typeof agentAccountId !== 'string' || !UUID.test(agentAccountId)) throw new SpendBudgetError('not_found');
    const token = deps.token();
    if (!token) throw new SpendBudgetError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method: settings ? 'PUT' : 'GET',
        path: `${base}/spend-budgets/${agentAccountId}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(settings ? { body: settings } : {}),
      });
    } catch {
      throw new SpendBudgetError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) throw new SpendBudgetError(failureOf(response.status, payloadOf(response)));
    const view = decodeSpendBudgetSettingsViewV0(payloadOf(response));
    if (!view || view.agentAccountId.toLowerCase() !== agentAccountId.toLowerCase()) throw new SpendBudgetError('unreadable');
    return view;
  };
  return {
    read: (agentAccountId) => call(agentAccountId),
    update: (agentAccountId, settings) => call(agentAccountId, settings),
  };
}

// ── One save, with at most one step-up ──────────────────────────────────────────────────

export type SpendBudgetSaveFailureV0 = SpendBudgetFailureV0 | 'step_up_cancelled' | 'step_up_again';

export type SpendBudgetSaveOutcomeV0 =
  | { kind: 'done'; view: SpendBudgetSettingsViewV0 }
  /** Nothing was saved; `view` is the budget as read again after a 409, when that worked. */
  | { kind: 'failed'; failure: SpendBudgetSaveFailureV0; view: SpendBudgetSettingsViewV0 | null };

/**
 * Save once. A step-up request opens `confirmStepUp` (StepUpSheet); after it confirms, the same change is sent once
 * more; a second step-up request stops there. A 409 reads the budget again so the card shows what it is now.
 */
export async function runSpendBudgetSave(input: {
  client: MobileSpendBudgetClientV0;
  agentAccountId: string;
  settings: SpendBudgetSettingsV0;
  confirmStepUp: () => Promise<boolean>;
}): Promise<SpendBudgetSaveOutcomeV0> {
  const { client, agentAccountId, settings } = input;
  const fail = async (error: unknown): Promise<SpendBudgetSaveOutcomeV0> => {
    const failure: SpendBudgetFailureV0 = error instanceof SpendBudgetError ? error.failure : 'unavailable';
    if (failure !== 'stale') return { kind: 'failed', failure, view: null };
    try {
      return { kind: 'failed', failure, view: await client.read(agentAccountId) };
    } catch {
      return { kind: 'failed', failure, view: null };
    }
  };
  try {
    return { kind: 'done', view: await client.update(agentAccountId, settings) };
  } catch (error) {
    if (!(error instanceof SpendBudgetError) || error.failure !== 'step_up_required') return fail(error);
  }
  let confirmed = false;
  try {
    confirmed = await input.confirmStepUp();
  } catch {
    confirmed = false;
  }
  if (!confirmed) return { kind: 'failed', failure: 'step_up_cancelled', view: null };
  try {
    return { kind: 'done', view: await client.update(agentAccountId, settings) };
  } catch (error) {
    if (error instanceof SpendBudgetError && error.failure === 'step_up_required') return { kind: 'failed', failure: 'step_up_again', view: null };
    return fail(error);
  }
}

// ── The form ────────────────────────────────────────────────────────────────────────────

export type SpendBudgetField = Exclude<keyof SpendBudgetSettingsV0, 'revision'>;
export type SpendBudgetDraft = Record<SpendBudgetField, string>;

export const SPEND_BUDGET_FIELDS: ReadonlyArray<{ key: SpendBudgetField; label: Copy; hint?: Copy }> = [
  { key: 'singleTxLimitCents', label: { zh: '单笔上限', en: 'Per payment' } },
  { key: 'dailyLimitCents', label: { zh: '每天上限', en: 'Per day' } },
  { key: 'monthlyLimitCents', label: { zh: '每月上限', en: 'Per month' } },
  {
    key: 'freeApprovalCents',
    label: { zh: '免批准额度', en: 'No approval needed up to' },
    hint: { zh: '不超过这个数的付款不用逐笔批准；0 表示每笔都要你批准。', en: 'Payments up to this need no approval; 0 means you approve every one.' },
  },
  {
    key: 'stepUpCents',
    label: { zh: '大额确认门槛', en: 'Confirm identity above' },
    hint: { zh: '批准超过这个数的付款时，要再确认一次是你本人。', en: 'Approving more than this asks you to confirm it is you.' },
  },
];

/** What the owner typed, in US dollars ("12", "12.5", "$1,200.50"), as cents; anything else (negative, three decimals, over the cap) is null. */
export function parseDollarsToCents(input: string): number | null {
  const text = input.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= SPEND_BUDGET_MAX_CENTS_V0 ? cents : null;
}

/** Cents as the editable dollar text: whole dollars without decimals, otherwise two decimals. */
export function centsToDollarsInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function spendBudgetDraft(view: SpendBudgetSettingsV0): SpendBudgetDraft {
  const draft = {} as SpendBudgetDraft;
  for (const { key } of SPEND_BUDGET_FIELDS) draft[key] = centsToDollarsInput(view[key]);
  return draft;
}

/** The draft as settings at `revision`; null when any amount is not a valid dollar figure. */
export function spendBudgetFromDraft(draft: SpendBudgetDraft, revision: number): SpendBudgetSettingsV0 | null {
  const settings = { revision } as SpendBudgetSettingsV0;
  for (const { key } of SPEND_BUDGET_FIELDS) {
    const cents = parseDollarsToCents(draft[key]);
    if (cents === null) return null;
    settings[key] = cents;
  }
  return settings;
}

export const SPEND_BUDGET_AMOUNT_PROBLEM: Copy = {
  zh: '金额请填 0 到 1000000 之间的美元数，最多两位小数。',
  en: 'Enter US dollars from 0 to 1,000,000, with at most two decimals.',
};

const ORDER_PROBLEMS: Array<[string, Copy]> = [
  ['freeApprovalCents: must not exceed', { zh: '免批准额度不能超过大额确认门槛。', en: 'The no-approval amount cannot exceed the confirm-identity threshold.' }],
  ['stepUpCents: must not exceed', { zh: '大额确认门槛不能超过每天上限。', en: 'The confirm-identity threshold cannot exceed the daily limit.' }],
  ['singleTxLimitCents: must not exceed', { zh: '单笔上限不能超过每天上限。', en: 'The per-payment limit cannot exceed the daily limit.' }],
  ['dailyLimitCents: must not exceed', { zh: '每天上限不能超过每月上限。', en: 'The daily limit cannot exceed the monthly limit.' }],
];

/** The contract validator's first complaint, in words; null when the settings are acceptable. */
export function spendBudgetProblem(settings: SpendBudgetSettingsV0): Copy | null {
  const { errors } = validateSpendBudgetSettingsV0(settings);
  if (errors.length === 0) return null;
  const match = ORDER_PROBLEMS.find(([prefix]) => errors[0].startsWith(prefix));
  return match ? match[1] : SPEND_BUDGET_AMOUNT_PROBLEM;
}

/** Whether saving these settings raises anything (the server will ask for a recent sign-in). */
export function spendBudgetWidens(previous: SpendBudgetSettingsV0, next: SpendBudgetSettingsV0): boolean {
  return spendBudgetSettingsWideningV0(previous, next).length > 0;
}

export const SPEND_BUDGET_FAILURE_COPY: Readonly<Record<SpendBudgetSaveFailureV0, Copy>> = {
  step_up_required: { zh: '要再确认一次是你本人才能提高预算。', en: 'Confirm it is you to raise the budget.' },
  step_up_cancelled: { zh: '没有确认身份，预算没有改。', en: 'Identity not confirmed; the budget is unchanged.' },
  step_up_again: { zh: '还是需要确认是你本人。请重新登录后再保存。', en: 'Your identity still needs confirming. Sign in again, then save.' },
  sign_in_required: { zh: '只能用你自己的账号改预算。请重新登录后再试。', en: 'Only your own account can change this budget. Sign in again and retry.' },
  not_found: { zh: '这只 Agent 的预算现在不能改。', en: "This Agent's budget cannot be changed right now." },
  stale: { zh: '预算刚在别处改过，下面是现在的设置。请看一眼再调整。', en: 'The budget was just changed elsewhere; below is what it is now. Check it, then adjust again.' },
  invalid: { zh: '这组数字不合预算规则，没有保存。', en: 'These numbers break the budget rules, so nothing was saved.' },
  rate_limited: { zh: '操作太频繁了，请稍后再试。', en: 'Too many tries; wait a moment and retry.' },
  unreadable: { zh: '暂时读不到预算设置。', en: 'The budget cannot be read right now.' },
  unavailable: { zh: '没有保存成功，预算没有变。请稍后再试。', en: 'That did not save; the budget is unchanged. Try again later.' },
  no_session: { zh: '请先登录。', en: 'Sign in first.' },
};
