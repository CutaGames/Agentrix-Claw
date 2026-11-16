/**
 * Asking around on the phone (`shared/types/twin-ask.ts`): ask friends one question on one topic. A friend who lets
 * friends ask has their twin answer with one or two things they wrote down for friends, word for word; otherwise the
 * question goes to the friend. People without the app answer through a web link (`/ask#<code>`, marked unverified).
 * When asked: answer, say no, or take an answer back. Settings: whether friends may ask me, how often, what my twin may
 * tell them, and which relationship tiers it may tell. Only in builds with `EXPO_PUBLIC_TWIN_ASK=1`; the routes answer
 * 404 while the server switch is off or the user is outside the cohort. No React Native import: the transport and
 * token are injected (twinAskSession.ts binds them).
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  TWIN_ASK_ID_PATTERN_V0,
  TWIN_ASK_LIMITS_V0,
  TWIN_ASK_REASON_CODES_V0,
  decodeTwinAskFriendOptionsV0,
  decodeTwinAskListV0,
  decodeTwinAskProfileV0,
  decodeTwinAskRelinkV0,
  decodeTwinAskSharingPreviewV0,
  decodeTwinAskSharingV0,
  decodeTwinAskStartOutcomeV0,
  decodeTwinAskViewV0,
  decodeTwinFriendFactV0,
  decodeTwinFriendFactsV0,
  twinAskGuestLinkV0,
  type TwinAskAskerViewV0,
  type TwinAskFriendOptionV0,
  type TwinAskInvitedViewV0,
  type TwinAskListItemV0,
  type TwinAskProfileV0,
  type TwinAskPublicRouteV0,
  type TwinAskReasonCodeV0,
  type TwinAskRefusalCodeV0,
  type TwinAskReplyV0,
  type TwinAskRequestV0,
  type TwinAskSharingDraftV0,
  type TwinAskSharingPreviewV0,
  type TwinAskSharingV0,
  type TwinFriendFactInputV0,
  type TwinFriendFactV0,
} from '../../shared/types/twin-ask';
import { needsStepUp } from './stepUp';

const L = TWIN_ASK_LIMITS_V0;

export function isTwinAskMobileEnabled(value: string | undefined): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const TWIN_ASK_ENABLED = isTwinAskMobileEnabled(process.env.EXPO_PUBLIC_TWIN_ASK);

export type TwinAskFailure =
  | 'no_session'
  | 'not_found'
  | 'not_allowed'
  | 'step_up_required'
  | 'invalid'
  | 'changed'
  | 'too_many'
  | 'unavailable'
  | 'unreadable';

export const TWIN_ASK_FAILURE_COPY: Record<TwinAskFailure, { en: string; zh: string }> = {
  no_session: { en: 'Sign in first.', zh: '请先登录。' },
  not_found: { en: 'Asking around is not open yet, or this question is gone.', zh: '「问遍身边人」还没开放，或者这个提问已经不在了。' },
  not_allowed: { en: 'Not allowed.', zh: '没有权限。' },
  step_up_required: { en: 'Confirm it is you before your twin tells friends more.', zh: '要再确认一次是你本人，分身才能多告诉朋友一些。' },
  invalid: { en: 'Something in the form is not right. Check it and try again.', zh: '填的内容有不对的地方，请检查后再试。' },
  changed: { en: 'Things changed in the meantime. Refresh and try again.', zh: '情况刚有变化，请刷新后再试。' },
  too_many: { en: 'Too many tries. Wait a minute.', zh: '操作太频繁了，请过一分钟再试。' },
  unavailable: { en: 'Not available right now. Try again later.', zh: '现在用不了，请稍后再试。' },
  unreadable: { en: 'The answer could not be read.', zh: '读不出服务器的回答。' },
};

/** Why the server would not start a question (`{ started: false, code }`). Not an error: the form stays as it was. */
export const TWIN_ASK_REFUSAL_COPY: Record<TwinAskRefusalCodeV0, { en: string; zh: string }> = {
  asker_daily_limit: { en: `You can ask ${L.asksPerDayMax} questions a day. Try again tomorrow.`, zh: `每天最多发起 ${L.asksPerDayMax} 次提问，明天再来。` },
  people_count: { en: `Ask 1 to ${L.peopleMax} people.`, zh: `要问 1 到 ${L.peopleMax} 个人。` },
  duplicate_friend: { en: 'The same person is on the list twice.', zh: '同一个人选了两次。' },
  none_available: { en: 'None of the people you picked can be asked this time.', zh: '这次选的人都问不到。' },
};

export class TwinAskError extends Error {
  readonly failure: TwinAskFailure;
  /** Only for `invalid`: the rule the server applied and the field it applied to, so the form can point at it. */
  readonly reasonCode: TwinAskReasonCodeV0 | null;
  readonly field: string | null;
  constructor(failure: TwinAskFailure, reason?: { reasonCode: TwinAskReasonCodeV0; field: string }) {
    super(failure);
    this.name = 'TwinAskError';
    this.failure = failure;
    this.reasonCode = reason ? reason.reasonCode : null;
    this.field = reason ? reason.field : null;
  }
}

export type MobileTwinAskStartOutcome =
  | { started: true; askId: string; routes: { ref: string; route: TwinAskPublicRouteV0 }[]; links: { ref: string; url: string }[] }
  | { started: false; code: TwinAskRefusalCodeV0 };

export interface MobileTwinAskClient {
  profile(): Promise<TwinAskProfileV0>;
  updateProfile(patch: Partial<TwinAskProfileV0>): Promise<TwinAskProfileV0>;
  friends(): Promise<TwinAskFriendOptionV0[]>;
  facts(): Promise<TwinFriendFactV0[]>;
  addFact(input: TwinFriendFactInputV0): Promise<TwinFriendFactV0>;
  /** The whole entry is replaced. */
  replaceFact(id: string, input: TwinFriendFactInputV0): Promise<TwinFriendFactV0>;
  removeFact(id: string): Promise<void>;
  sharing(): Promise<TwinAskSharingV0>;
  previewSharing(draft: TwinAskSharingDraftV0): Promise<TwinAskSharingPreviewV0>;
  /** Use `saveTwinAskSharing`: opening a topic to a tier needs a recent sign-in. */
  commitSharing(preview: TwinAskSharingPreviewV0): Promise<TwinAskSharingV0>;
  /** The links are never shown again: offer them for sharing right away. */
  start(request: TwinAskRequestV0): Promise<MobileTwinAskStartOutcome>;
  /** Newest first. For older questions pass the last item's `createdAt` as `before`. */
  list(before?: string): Promise<TwinAskListItemV0[]>;
  get(id: string): Promise<TwinAskAskerViewV0 | TwinAskInvitedViewV0>;
  close(id: string): Promise<TwinAskAskerViewV0>;
  relink(id: string, ref: string): Promise<{ ref: string; url: string }>;
  answer(id: string, reply: TwinAskReplyV0): Promise<TwinAskInvitedViewV0>;
  decline(id: string): Promise<TwinAskInvitedViewV0>;
  withdraw(id: string): Promise<TwinAskInvitedViewV0>;
}

const ASK_PATH = '/twin-ask';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failureOf(status: number, body: unknown): TwinAskFailure {
  if (needsStepUp(status, body)) return 'step_up_required';
  if (status === 400 || status === 422) return 'invalid';
  if (status === 401 || status === 403) return 'not_allowed';
  if (status === 404) return 'not_found';
  if (status === 409 || status === 410) return 'changed';
  if (status === 429) return 'too_many';
  return 'unavailable';
}

function invalidReason(body: unknown): { reasonCode: TwinAskReasonCodeV0; field: string } | undefined {
  if (!isRecord(body)) return undefined;
  const { reasonCode, field } = body;
  const known = (TWIN_ASK_REASON_CODES_V0 as readonly unknown[]).includes(reasonCode);
  return known && typeof field === 'string' ? { reasonCode: reasonCode as TwinAskReasonCodeV0, field } : undefined;
}

function deleted(body: unknown): boolean {
  const value = isRecord(body) && isRecord(body.data) ? body.data : body;
  return isRecord(value) && value.deleted === true;
}

export function createMobileTwinAskClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  /** Web origin the link answers open on. */
  webOrigin: string;
  token: () => string | null | undefined;
}): MobileTwinAskClient {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new TwinAskError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${ASK_PATH}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(method === 'POST' || method === 'PUT' ? { body: body ?? {} } : {}),
      });
    } catch {
      throw new TwinAskError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) {
      const failure = failureOf(response.status, response.body);
      throw new TwinAskError(failure, failure === 'invalid' ? invalidReason(response.body) : undefined);
    }
    return response.body;
  };
  const read = <T>(decoded: T | null): T => {
    if (decoded === null) throw new TwinAskError('unreadable');
    return decoded;
  };
  const checked = (id: string): string => {
    if (!TWIN_ASK_ID_PATTERN_V0.test(id)) throw new TwinAskError('not_found');
    return id;
  };
  const view = async (id: string, action?: 'close' | 'answer' | 'decline' | 'withdraw', body?: unknown): Promise<TwinAskAskerViewV0 | TwinAskInvitedViewV0> => {
    const path = action === undefined ? `/${checked(id)}` : `/${checked(id)}/${action}`;
    const decoded = read(decodeTwinAskViewV0(await call(action === undefined ? 'GET' : 'POST', path, body)));
    if (decoded.id !== id) throw new TwinAskError('unreadable');
    return decoded;
  };
  const asAsker = (decoded: TwinAskAskerViewV0 | TwinAskInvitedViewV0): TwinAskAskerViewV0 => {
    if (decoded.role !== 'asker') throw new TwinAskError('unreadable');
    return decoded;
  };
  const asInvited = (decoded: TwinAskAskerViewV0 | TwinAskInvitedViewV0): TwinAskInvitedViewV0 => {
    if (decoded.role !== 'invited') throw new TwinAskError('unreadable');
    return decoded;
  };
  const linkOf = (ref: string, code: string): { ref: string; url: string } => ({ ref, url: twinAskGuestLinkV0(deps.webOrigin, code) });
  return {
    async profile() {
      return read(decodeTwinAskProfileV0(await call('GET', '/profile')));
    },
    async updateProfile(patch) {
      return read(decodeTwinAskProfileV0(await call('PUT', '/profile', patch)));
    },
    async friends() {
      return read(decodeTwinAskFriendOptionsV0(await call('GET', '/friends')));
    },
    async facts() {
      return read(decodeTwinFriendFactsV0(await call('GET', '/facts')));
    },
    async addFact(input) {
      return read(decodeTwinFriendFactV0(await call('POST', '/facts', { topic: input.topic, text: input.text })));
    },
    async replaceFact(id, input) {
      const fact = read(decodeTwinFriendFactV0(await call('PUT', `/facts/${checked(id)}`, { topic: input.topic, text: input.text })));
      if (fact.id !== id) throw new TwinAskError('unreadable');
      return fact;
    },
    async removeFact(id) {
      if (!deleted(await call('DELETE', `/facts/${checked(id)}`))) throw new TwinAskError('unreadable');
    },
    async sharing() {
      return read(decodeTwinAskSharingV0(await call('GET', '/sharing')));
    },
    async previewSharing(draft) {
      const preview = read(decodeTwinAskSharingPreviewV0(await call('POST', '/sharing/preview', { tier: draft.tier, topics: draft.topics })));
      if (preview.tier !== draft.tier) throw new TwinAskError('unreadable');
      return preview;
    },
    async commitSharing(preview) {
      const { tier, topics, expectedVersion, previewDigest } = preview;
      return read(decodeTwinAskSharingV0(await call('PUT', '/sharing', { tier, topics, expectedVersion, previewDigest })));
    },
    async start(request) {
      const outcome = read(decodeTwinAskStartOutcomeV0(await call('POST', '', request)));
      if (outcome.started === false) return outcome;
      return { started: true, askId: outcome.askId, routes: outcome.routes, links: outcome.links.map((link) => linkOf(link.ref, link.code)) };
    },
    async list(before) {
      return read(decodeTwinAskListV0(await call('GET', before === undefined ? '' : `?before=${encodeURIComponent(before)}`)));
    },
    get: (id) => view(id),
    async close(id) {
      return asAsker(await view(id, 'close'));
    },
    async relink(id, ref) {
      const relinked = read(decodeTwinAskRelinkV0(await call('POST', `/${checked(id)}/relink`, { ref })));
      if (relinked.ref !== ref) throw new TwinAskError('unreadable');
      return linkOf(relinked.ref, relinked.code);
    },
    async answer(id, reply) {
      return asInvited(await view(id, 'answer', reply.saveAsFact === true ? { text: reply.text, saveAsFact: true } : { text: reply.text }));
    },
    async decline(id) {
      return asInvited(await view(id, 'decline'));
    },
    async withdraw(id) {
      return asInvited(await view(id, 'withdraw'));
    },
  };
}

export type TwinAskSharingSaveFailure = TwinAskFailure | 'step_up_cancelled' | 'step_up_again';

export type TwinAskSharingSaveResult = { kind: 'saved'; sharing: TwinAskSharingV0 } | { kind: 'failed'; failure: TwinAskSharingSaveFailure };

export const TWIN_ASK_STEP_UP_COPY: Record<'step_up_cancelled' | 'step_up_again', { en: string; zh: string }> = {
  step_up_cancelled: { en: 'Identity not confirmed; what your twin tells friends is unchanged.', zh: '没有确认身份，分身能告诉朋友的没有改。' },
  step_up_again: { en: 'Your identity still needs confirming. Sign in again, then save.', zh: '还是需要确认是你本人。请重新登录后再保存。' },
};

/**
 * Commit a previewed change to one tier. Opening a topic needs a recent sign-in: on `step_up_required` the screen
 * confirms it is the owner (`confirmStepUp`, the e-mail code sheet, which renews the session token) and the same
 * preview is committed once more. Closing topics goes through at once.
 */
export async function saveTwinAskSharing(
  client: Pick<MobileTwinAskClient, 'commitSharing'>,
  preview: TwinAskSharingPreviewV0,
  confirmStepUp: () => Promise<boolean>,
): Promise<TwinAskSharingSaveResult> {
  const failureIn = (error: unknown): TwinAskFailure => (error instanceof TwinAskError ? error.failure : 'unavailable');
  try {
    return { kind: 'saved', sharing: await client.commitSharing(preview) };
  } catch (error) {
    if (failureIn(error) !== 'step_up_required') return { kind: 'failed', failure: failureIn(error) };
  }
  let confirmed = false;
  try {
    confirmed = await confirmStepUp();
  } catch {
    confirmed = false;
  }
  if (!confirmed) return { kind: 'failed', failure: 'step_up_cancelled' };
  try {
    return { kind: 'saved', sharing: await client.commitSharing(preview) };
  } catch (error) {
    const failure = failureIn(error);
    return { kind: 'failed', failure: failure === 'step_up_required' ? 'step_up_again' : failure };
  }
}
