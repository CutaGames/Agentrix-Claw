/**
 * Money on a settled plan, on the phone (`shared/types/twin-huddle-money.ts`) — test mode only. The organizer opens a
 * deposit sheet or a split sheet, the total is split evenly, and each person answers for their own part. It only keeps
 * a record: nothing is charged, collected or moved. Only in builds with `EXPO_PUBLIC_TWIN_HUDDLE_MONEY=1` on top of
 * `EXPO_PUBLIC_TWIN_HUDDLE=1`; the routes answer 404 while either server switch is off. No React Native import: the
 * transport and token are injected (twinHuddleMoneySession.ts binds them).
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import { TWIN_HUDDLE_ID_PATTERN_V0, type TwinHuddlePersonV0 } from '../../shared/types/twin-huddle';
import {
  TWIN_HUDDLE_MONEY_CONFLICT_CODES_V0,
  decodeTwinHuddleBillCreateV0,
  decodeTwinHuddleMoneyCapV0,
  decodeTwinHuddleMoneyCapViewV0,
  decodeTwinHuddleMoneyViewV0,
  twinHuddleMoneyFormatV0,
  twinHuddleMoneyParseAmountV0,
  twinHuddleMoneySharesV0,
  type TwinHuddleBillShareV0,
  type TwinHuddleBillStatusV0,
  type TwinHuddleBillV0,
  type TwinHuddleMoneyCapViewV0,
  type TwinHuddleMoneyConflictCodeV0,
  type TwinHuddleMoneyCurrencyV0,
  type TwinHuddleMoneyDecisionV0,
  type TwinHuddleMoneyKindV0,
  type TwinHuddleMoneyViewV0,
  type TwinHuddleShareStatusV0,
} from '../../shared/types/twin-huddle-money';
import { TWIN_HUDDLE_ENABLED, TWIN_HUDDLE_FAILURE_COPY, TwinHuddleError, isTwinHuddleMobileEnabled, twinHuddleFailureOf, twinHuddleInvalidReason } from './twinHuddle';

// Read as a literal member expression so the Expo build inlines it.
export const TWIN_HUDDLE_MONEY_ENABLED = TWIN_HUDDLE_ENABLED && isTwinHuddleMobileEnabled(process.env.EXPO_PUBLIC_TWIN_HUDDLE_MONEY);

// Read as a literal member expression so the Expo build inlines it.
export const TWIN_HUDDLE_MONEY_CAP_ENABLED = TWIN_HUDDLE_MONEY_ENABLED && isTwinHuddleMobileEnabled(process.env.EXPO_PUBLIC_TWIN_HUDDLE_MONEY_CAP);

type Words = { en: string; zh: string };

/** Always shown next to the heading: this version keeps a record and moves no money. */
export const TWIN_HUDDLE_MONEY_TEST_BADGE: Words = { en: 'Records only · no money moves', zh: '只记账 · 不会扣钱' };

export const TWIN_HUDDLE_MONEY_KIND_COPY: Record<TwinHuddleMoneyKindV0, Words> = {
  deposit: { en: 'Booking deposit', zh: '订位定金' },
  split: { en: 'Split the bill', zh: 'AA 分摊' },
};

export const TWIN_HUDDLE_BILL_STATUS_COPY: Record<TwinHuddleBillStatusV0, Words> = {
  open: { en: 'Waiting for everyone', zh: '等大家确认' },
  held: { en: 'Everyone agreed · on record', zh: '都同意了 · 记上了' },
  cancelled: { en: 'Cancelled', zh: '已取消' },
  expired: { en: 'Ran out of time', zh: '已过期' },
};

export const TWIN_HUDDLE_SHARE_STATUS_COPY: Record<TwinHuddleShareStatusV0, Words> = {
  pending: { en: 'No answer yet', zh: '还没答' },
  confirmed: { en: 'Agreed', zh: '同意' },
  declined: { en: 'Said no', zh: '不同意' },
};

/** What the server says when a change no longer fits (HTTP 409 with `{ code }`). */
export const TWIN_HUDDLE_MONEY_CONFLICT_COPY: Record<TwinHuddleMoneyConflictCodeV0, Words> = {
  not_settled: { en: 'The plan is not settled, so a sheet cannot be opened.', zh: '商量还没定下来，现在不能开单。' },
  nobody_to_split: { en: 'Nobody with an account has confirmed they are coming, so there is no one to split with.', zh: '还没有在站内确认要来的朋友，没有人可以一起分。' },
  unknown_ref: { en: 'Someone you picked cannot be on this sheet. Refresh and pick again.', zh: '选的人里有人上不了这张单，请刷新后重选。' },
  bill_exists: { en: 'There is already a sheet of this kind in progress.', zh: '这一种单已经有一张在进行了。' },
  bill_limit: { en: 'This plan has as many sheets as it can have.', zh: '这次商量能开的单已经到上限了。' },
  bill_closed: { en: 'This sheet is already closed.', zh: '这张单已经结束了。' },
  already_decided: { en: 'You have already answered.', zh: '你已经答过了。' },
};

const AMOUNT_RULE: Words = { en: 'Enter an amount from 1.00 to 10,000.00, with at most two decimals.', zh: '金额要在 1.00 到 10,000.00 之间，最多两位小数。' };
const PICK_SOMEONE: Words = { en: 'Pick at least one person to share with.', zh: '至少要选一位一起分的人。' };

/** A failed money call. `conflict` says which rule a 409 applied; null when the server did not say, or for other failures. */
export class TwinHuddleMoneyError extends TwinHuddleError {
  readonly conflict: TwinHuddleMoneyConflictCodeV0 | null;
  constructor(failure: TwinHuddleError['failure'], options: { reason?: ConstructorParameters<typeof TwinHuddleError>[1]; conflict?: TwinHuddleMoneyConflictCodeV0 | null } = {}) {
    super(failure, options.reason);
    this.name = 'TwinHuddleMoneyError';
    this.conflict = options.conflict ?? null;
  }
}

function isConflict(value: unknown): value is TwinHuddleMoneyConflictCodeV0 {
  return typeof value === 'string' && (TWIN_HUDDLE_MONEY_CONFLICT_CODES_V0 as readonly string[]).includes(value);
}

/** Reads the property rather than the class, so it also holds where `instanceof` on a subclass of Error does not. */
export function twinHuddleMoneyConflictOf(error: unknown): TwinHuddleMoneyConflictCodeV0 | null {
  const code = typeof error === 'object' && error !== null ? (error as { conflict?: unknown }).conflict : undefined;
  return isConflict(code) ? code : null;
}

/** What to say about a typed total before sending it; null when it would be accepted. The server applies the same rule. */
export function twinHuddleMoneyAmountProblem(text: string): Words | null {
  return twinHuddleMoneyParseAmountV0(text) === null ? AMOUNT_RULE : null;
}

/** What to say before opening a sheet; null when the form can be sent. */
export function twinHuddleMoneyFormProblem(text: string, refs: readonly string[]): Words | null {
  return twinHuddleMoneyAmountProblem(text) ?? (refs.length === 0 ? PICK_SOMEONE : null);
}

export function twinHuddleMoneyFailureWords(error: unknown): Words {
  const conflict = twinHuddleMoneyConflictOf(error);
  if (conflict) return TWIN_HUDDLE_MONEY_CONFLICT_COPY[conflict];
  if (!(error instanceof TwinHuddleError)) return TWIN_HUDDLE_FAILURE_COPY.unavailable;
  if (error.failure === 'invalid' && typeof error.field === 'string' && error.field.startsWith('body.amount')) return AMOUNT_RULE;
  if (error.failure === 'invalid' && typeof error.field === 'string' && error.field.startsWith('body.refs')) return PICK_SOMEONE;
  return TWIN_HUDDLE_FAILURE_COPY[error.failure];
}

/**
 * What each person's part would be for a typed total, the organizer included: "25.00 USD each", or the two amounts
 * when it does not divide evenly. Null while the total is not a valid amount or nobody else is picked.
 */
export function twinHuddleMoneyPreviewWords(text: string, others: number, currency: TwinHuddleMoneyCurrencyV0): Words | null {
  const minor = twinHuddleMoneyParseAmountV0(text);
  if (minor === null || others < 1) return null;
  const parts = twinHuddleMoneySharesV0(Number(minor), others + 1);
  if (parts.length === 0) return null;
  const most = twinHuddleMoneyFormatV0(parts[0], currency);
  const least = twinHuddleMoneyFormatV0(parts[parts.length - 1], currency);
  const people = others + 1;
  if (most === least) return { en: `${people} people, ${most} each`, zh: `${people} 个人，每人 ${most}` };
  return { en: `${people} people, ${least} or ${most} each (the odd cents start with you)`, zh: `${people} 个人，每人 ${least} 或 ${most}（除不尽的几分从你开始）` };
}

/** "Booking deposit · 300.00 USD". */
export function twinHuddleBillTitleWords(bill: Pick<TwinHuddleBillV0, 'kind' | 'total'>): Words {
  const total = twinHuddleMoneyFormatV0(bill.total.amountMinor, bill.total.currency);
  const kind = TWIN_HUDDLE_MONEY_KIND_COPY[bill.kind];
  return { en: `${kind.en} · ${total}`, zh: `${kind.zh} · ${total}` };
}

/** "2 of 3 agreed", and how many said no when anyone did. */
export function twinHuddleBillProgressWords(bill: Pick<TwinHuddleBillV0, 'headcount' | 'confirmedCount' | 'declinedCount'>): Words {
  const base: Words = { en: `${bill.confirmedCount} of ${bill.headcount} agreed`, zh: `${bill.headcount} 人里 ${bill.confirmedCount} 人同意` };
  if (bill.declinedCount <= 0) return base;
  return { en: `${base.en}, ${bill.declinedCount} said no`, zh: `${base.zh}，${bill.declinedCount} 人不同意` };
}

/** My own part on a sheet: the amount and where my answer stands. Null when I have no part on it. */
export function twinHuddleBillMineWords(bill: Pick<TwinHuddleBillV0, 'mine' | 'total'>): Words | null {
  if (bill.mine === null) return null;
  const amount = twinHuddleMoneyFormatV0(bill.mine.amountMinor, bill.total.currency);
  const status = TWIN_HUDDLE_SHARE_STATUS_COPY[bill.mine.status];
  return { en: `Your part: ${amount} · ${status.en}`, zh: `你那份：${amount} · ${status.zh}` };
}

/** Whose part a row is, for the organizer: themselves, or their own name for the friend. */
export function twinHuddleShareWhoWords(share: Pick<TwinHuddleBillShareV0, 'ref'>, people: readonly TwinHuddlePersonV0[] = []): Words {
  if (share.ref === null) return { en: 'You', zh: '我' };
  const person = people.find((item) => item.ref === share.ref);
  return person ? { en: person.label, zh: person.label } : { en: 'A friend', zh: '一位朋友' };
}

/** The line under the heading: what this person can do here, in words that never suggest money changed hands. */
export function twinHuddleMoneyHintWords(view: Pick<TwinHuddleMoneyViewV0, 'role' | 'available'>): Words {
  if (!view.available) return { en: 'This is switched off for now. Nothing here can be changed.', zh: '这个功能现在停用了，这里的内容暂时不能改。' };
  if (view.role === 'initiator') {
    return {
      en: 'Open a sheet and the total is split evenly; each person agrees to their own part. This version only keeps a record: nobody is charged and no money is collected.',
      zh: '开一张单，总额按人头平分，每个人确认自己那份。这一版只记账：不会扣任何人的钱，也不会替你收钱。',
    };
  }
  return {
    en: 'When the organizer opens a sheet, you answer for your own part only. Your answer is final. This version only keeps a record: you are not charged.',
    zh: '发起人开了单以后，你只需要答自己那一份，答了不能改。这一版只记账：不会扣你的钱。',
  };
}

/** People who answered through a link have no account and are not on any sheet. Null when there are none. */
export function twinHuddleMoneyGuestsWords(guestsLeftOut: number): Words | null {
  if (guestsLeftOut <= 0) return null;
  return {
    en: guestsLeftOut === 1 ? '1 person who joined through a link is not on the sheet. Settle with them yourself.' : `${guestsLeftOut} people who joined through a link are not on the sheet. Settle with them yourself.`,
    zh: `有 ${guestsLeftOut} 位走链接的朋友不在单上，需要你自己和他们算。`,
  };
}

/** The people picked after tapping one name, kept in the order the server listed them. */
export function twinHuddleMoneyRefsToggled(eligible: readonly string[], picked: readonly string[], ref: string): string[] {
  return eligible.filter((item) => (item === ref ? !picked.includes(item) : picked.includes(item)));
}

export interface TwinHuddleBillDraft {
  kind: TwinHuddleMoneyKindV0;
  /** The total as typed, for example "300" or "300.50". */
  amount: string;
  currency: TwinHuddleMoneyCurrencyV0;
  /** The people who share it with the organizer, exactly as shown on screen. */
  refs: readonly string[];
}

export interface MobileTwinHuddleMoneyClient {
  get(huddleId: string): Promise<TwinHuddleMoneyViewV0>;
  create(huddleId: string, draft: TwinHuddleBillDraft): Promise<TwinHuddleMoneyViewV0>;
  /** My answer for my own part. There is no call that answers for someone else. */
  decide(huddleId: string, billId: string, decision: TwinHuddleMoneyDecisionV0): Promise<TwinHuddleMoneyViewV0>;
  cancel(huddleId: string, billId: string): Promise<TwinHuddleMoneyViewV0>;
}

const HUDDLE_PATH = '/twin-huddle';

type MoneyDeps = {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
};

/** One signed-in call under `/twin-huddle`: the body of a 2xx answer, or the failure the screen words. */
async function moneyRequest(deps: MoneyDeps, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<unknown> {
  const token = deps.token();
  if (!token) throw new TwinHuddleMoneyError('no_session');
  let response: HttpResponseV1;
  try {
    response = await deps.transport.request({
      method,
      path: `${deps.baseUrl.replace(/\/+$/, '')}${HUDDLE_PATH}${path}`,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
      ...(method === 'GET' || method === 'DELETE' ? {} : { body: body ?? {} }),
    });
  } catch {
    throw new TwinHuddleMoneyError('unavailable');
  }
  if (response.status < 200 || response.status >= 300) {
    const failure = twinHuddleFailureOf(response.status);
    const code = typeof response.body === 'object' && response.body !== null ? (response.body as { code?: unknown }).code : undefined;
    throw new TwinHuddleMoneyError(failure, {
      reason: failure === 'invalid' ? twinHuddleInvalidReason(response.body) : undefined,
      conflict: failure === 'changed' && isConflict(code) ? code : null,
    });
  }
  return response.body;
}

export function createMobileTwinHuddleMoneyClient(deps: MoneyDeps): MobileTwinHuddleMoneyClient {
  const checked = (id: string): string => {
    if (!TWIN_HUDDLE_ID_PATTERN_V0.test(id)) throw new TwinHuddleMoneyError('not_found');
    return id;
  };
  const call = async (huddleId: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<TwinHuddleMoneyViewV0> => {
    const id = checked(huddleId);
    const answer = await moneyRequest(deps, method, `/${id}/money${path}`, body);
    // The reader refuses any answer that is not marked test mode.
    const view = decodeTwinHuddleMoneyViewV0(answer);
    if (view === null || view.huddleId !== id) throw new TwinHuddleMoneyError('unreadable');
    return view;
  };

  return {
    get: (huddleId) => call(huddleId, 'GET', ''),
    async create(huddleId, draft) {
      const amountMinor = twinHuddleMoneyParseAmountV0(draft.amount);
      if (amountMinor === null) throw new TwinHuddleMoneyError('invalid', { reason: { reasonCode: 'invalid_value', field: 'body.amount.amountMinor' } });
      const body = { kind: draft.kind, amount: { amountMinor, currency: draft.currency, decimals: 2 }, refs: [...draft.refs] };
      const decoded = decodeTwinHuddleBillCreateV0(body);
      if (decoded.ok === false) throw new TwinHuddleMoneyError('invalid', { reason: { reasonCode: decoded.reasonCode, field: decoded.field } });
      return call(huddleId, 'POST', '', body);
    },
    async decide(huddleId, billId, decision) {
      return call(huddleId, 'PUT', `/${checked(billId)}/mine`, { decision });
    },
    async cancel(huddleId, billId) {
      return call(huddleId, 'DELETE', `/${checked(billId)}`);
    },
  };
}

/** The limit row at the bottom of the card, and what a sheet says once the twin agreed within the limit. */
export const TWIN_HUDDLE_MONEY_CAP_COPY: Record<'row' | 'byCap' | 'revoke' | 'perBill' | 'weekly' | 'save' | 'clear', Words> = {
  row: { en: "Within my limit, don't ask me", zh: '上限内不用问我' },
  byCap: { en: 'Your twin agreed within your limit', zh: '分身在上限内替你同意了' },
  revoke: { en: 'Change to no', zh: '改成不同意' },
  perBill: { en: 'Up to, for one sheet', zh: '每笔不超过' },
  weekly: { en: 'Up to, in 7 days', zh: '每周不超过' },
  save: { en: 'Save my limit', zh: '存好上限' },
  clear: { en: 'Turn it off', zh: '关掉' },
};

/**
 * On the limit form, in so many words: what the twin will do, until when it can be taken back, that a sheet where
 * everyone has a limit is on record the moment it is opened, and that nothing is charged.
 */
export const TWIN_HUDDLE_MONEY_CAP_RULES: Words = {
  en: 'When a friend opens a sheet and your part is within your limit for one sheet, and within your limit for 7 days together with what your twin agreed to for you in the last 7 days, your twin agrees for you without asking. Until the sheet is on record you can change that to no, once. If everyone on a sheet has a limit, it is on record the moment it is opened and cannot be changed. Only you can see your limit. This version only keeps a record: you are not charged.',
  zh: '朋友开的记账单里，你那份不超过每笔上限，加上这 7 天分身替你同意的也不超过每周上限，分身就直接替你同意，不用再问你。记上之前你可以改成不同意，只能改一次。单上每个人都设了上限时，开单那一刻就记上了，没有改的机会。上限只有你自己看得到。这一版只记账，不会扣你的钱。',
};

const CAP_PER_BILL_RULE: Words = { en: 'The limit for one sheet is from 1.00 to 500.00, with at most two decimals.', zh: '每笔上限要在 1.00 到 500.00 之间，最多两位小数。' };
const CAP_WEEKLY_RULE: Words = { en: 'The limit for 7 days is at least the limit for one sheet and at most 2,000.00.', zh: '每周上限不能低于每笔上限，最多 2,000.00。' };

export interface TwinHuddleMoneyCapDraft {
  currency: TwinHuddleMoneyCurrencyV0;
  /** As typed, for example "50" or "49.50". */
  perBill: string;
  weekly: string;
}

/** The request for a typed limit, checked by the rule the server applies. */
function twinHuddleMoneyCapRequest(draft: TwinHuddleMoneyCapDraft): ReturnType<typeof decodeTwinHuddleMoneyCapV0> {
  const perBillMinor = twinHuddleMoneyParseAmountV0(draft.perBill);
  if (perBillMinor === null) return { ok: false, reasonCode: 'invalid_value', field: 'body.perBillMinor' };
  const weeklyMinor = twinHuddleMoneyParseAmountV0(draft.weekly);
  if (weeklyMinor === null) return { ok: false, reasonCode: 'invalid_value', field: 'body.weeklyMinor' };
  return decodeTwinHuddleMoneyCapV0({ currency: draft.currency, perBillMinor, weeklyMinor });
}

function capRuleOf(field: string | null): Words | null {
  if (field?.startsWith('body.perBillMinor')) return CAP_PER_BILL_RULE;
  if (field?.startsWith('body.weeklyMinor')) return CAP_WEEKLY_RULE;
  return null;
}

/** What to say about a typed limit before sending it; null when it would be accepted. */
export function twinHuddleMoneyCapProblem(draft: TwinHuddleMoneyCapDraft): Words | null {
  const request = twinHuddleMoneyCapRequest(draft);
  if (request.ok === false) return capRuleOf(request.field) ?? TWIN_HUDDLE_FAILURE_COPY.invalid;
  return null;
}

export function twinHuddleMoneyCapFailureWords(error: unknown): Words {
  if (error instanceof TwinHuddleError && error.failure === 'invalid') {
    const rule = capRuleOf(error.field);
    if (rule) return rule;
  }
  return twinHuddleMoneyFailureWords(error);
}

/** Where my limit stands: none, or both limits and what the twin agreed to for me in the last 7 days. */
export function twinHuddleMoneyCapStateWords(view: Pick<TwinHuddleMoneyCapViewV0, 'available' | 'cap' | 'usedMinor'>): Words {
  if (view.cap === null) {
    if (!view.available) return { en: 'No limit set. A limit cannot be set right now.', zh: '还没设上限。现在不能设。' };
    return { en: 'No limit set: every sheet waits for your own answer.', zh: '还没设上限：每张单都等你自己答。' };
  }
  const { currency } = view.cap;
  const perBill = twinHuddleMoneyFormatV0(view.cap.perBillMinor, currency);
  const weekly = twinHuddleMoneyFormatV0(view.cap.weeklyMinor, currency);
  const used = twinHuddleMoneyFormatV0(view.usedMinor, currency);
  const words: Words = {
    en: `Up to ${perBill} for one sheet and ${weekly} in 7 days. In the last 7 days your twin agreed to ${used} for you.`,
    zh: `每笔不超过 ${perBill}，每周不超过 ${weekly}。这 7 天分身已经替你同意了 ${used}。`,
  };
  if (view.available) return words;
  return { en: `${words.en} It cannot be changed right now, only turned off.`, zh: `${words.zh}现在不能改，只能关掉。` };
}

/** A limit as it goes back into the form: "50.00". */
export function twinHuddleMoneyCapInput(minor: string): string {
  return twinHuddleMoneyFormatV0(minor, '').trim();
}

export interface MobileTwinHuddleMoneyCapClient {
  get(): Promise<TwinHuddleMoneyCapViewV0>;
  /** Sets or changes my own limit. There is no call that reads or sets anyone else's. */
  set(draft: TwinHuddleMoneyCapDraft): Promise<TwinHuddleMoneyCapViewV0>;
  clear(): Promise<TwinHuddleMoneyCapViewV0>;
}

export function createMobileTwinHuddleMoneyCapClient(deps: MoneyDeps): MobileTwinHuddleMoneyCapClient {
  const call = async (method: 'GET' | 'PUT' | 'DELETE', body?: unknown): Promise<TwinHuddleMoneyCapViewV0> => {
    // Like the sheets, the reader refuses any answer that is not marked test mode.
    const view = decodeTwinHuddleMoneyCapViewV0(await moneyRequest(deps, method, '/money-cap', body));
    if (view === null) throw new TwinHuddleMoneyError('unreadable');
    return view;
  };
  return {
    get: () => call('GET'),
    async set(draft) {
      const request = twinHuddleMoneyCapRequest(draft);
      if (request.ok === false) throw new TwinHuddleMoneyError('invalid', { reason: { reasonCode: request.reasonCode, field: request.field } });
      return call('PUT', request.value);
    },
    clear: () => call('DELETE'),
  };
}
