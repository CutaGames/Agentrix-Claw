/**
 * Finding someone through friends, on the phone (`shared/types/twin-find.ts`): ask a few friends "who knows …". A friend
 * picks one person, from their own list or by writing a name. That person is asked first and writes the name the asker
 * will see; only then does the asker see anything about them, and the asker has the last word. The platform never
 * exchanges contact details: once all three agreed, the friend brings the two together.
 *
 * A person the friend's app cannot reach (not registered, has not tiered the friend back, blocked, asked too often today)
 * gets a web link (`/find#<code>`) that the friend forwards; what they agree to there is marked unverified.
 *
 * Only in builds with `EXPO_PUBLIC_TWIN_FIND=1`; the routes answer 404 while the server switch is off or the user is
 * outside the cohort. No React Native import: the transport and token are injected (twinFindSession.ts binds them).
 *
 * Two additions, each with its own build switch on top of that one. `EXPO_PUBLIC_TWIN_FIND_DATING=1`: looking for a
 * partner as a topic, and the person's own switch for being asked in the app about it (`profile`, `setDatingOpen`).
 * `EXPO_PUBLIC_TWIN_FIND_MEET=1`: after all three agreed, the friend who introduced them can set up a time for the three.
 * `EXPO_PUBLIC_TWIN_FIND_CARD=1` (inside a dating build): the person's own condition card (`card`, `setCard`), which the
 * server compares with the other side's before it asks anyone in the app. Nobody else ever sees it.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  TWIN_FIND_ID_PATTERN_V0,
  TWIN_FIND_LIMITS_V0,
  TWIN_FIND_REASON_CODES_V0,
  decodeTwinFindConsentOutcomeV0,
  decodeTwinFindFriendOptionsV0,
  decodeTwinFindIntroViewV0,
  decodeTwinFindListV0,
  decodeTwinFindPickOutcomeV0,
  decodeTwinFindProfileV0,
  decodeTwinFindRelinkV0,
  decodeTwinFindStartOutcomeV0,
  decodeTwinFindViewV0,
  twinFindGuestLinkV0,
  type TwinFindAskerViewV0,
  type TwinFindBridgeViewV0,
  type TwinFindConsentV0,
  type TwinFindFriendOptionV0,
  type TwinFindIntroViewV0,
  type TwinFindListItemV0,
  type TwinFindPickV0,
  type TwinFindProfileV0,
  type TwinFindReasonCodeV0,
  type TwinFindRefusalCodeV0,
  type TwinFindRequestV0,
  type TwinFindStartOutcomeV0,
} from '../../shared/types/twin-find';
import { decodeTwinFindCardViewV0, type TwinFindCardV0 } from '../../shared/types/twin-find-card';

const L = TWIN_FIND_LIMITS_V0;

export function isTwinFindMobileEnabled(value: string | undefined): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const TWIN_FIND_ENABLED = isTwinFindMobileEnabled(process.env.EXPO_PUBLIC_TWIN_FIND);
/** Looking for a partner as a topic, and the switch for being asked about it. Only inside a build that finds people at all. */
export const TWIN_FIND_DATING_ENABLED = TWIN_FIND_ENABLED && isTwinFindMobileEnabled(process.env.EXPO_PUBLIC_TWIN_FIND_DATING);
/** Setting up a time for the three after an introduction went through. The plan screens have their own switch as well. */
export const TWIN_FIND_MEET_ENABLED = TWIN_FIND_ENABLED && isTwinFindMobileEnabled(process.env.EXPO_PUBLIC_TWIN_FIND_MEET);
/** The condition card for dating. Only inside a build that has dating. */
export const TWIN_FIND_CARD_ENABLED = TWIN_FIND_DATING_ENABLED && isTwinFindMobileEnabled(process.env.EXPO_PUBLIC_TWIN_FIND_CARD);

export type TwinFindFailure =
  | 'no_session'
  | 'not_found'
  | 'not_allowed'
  | 'invalid'
  | 'closed'
  | 'pick_limit'
  | 'changed'
  | 'too_many'
  | 'unavailable'
  | 'unreadable';

export const TWIN_FIND_FAILURE_COPY: Record<TwinFindFailure, { en: string; zh: string }> = {
  no_session: { en: 'Sign in first.', zh: '请先登录。' },
  not_found: { en: 'Finding people through friends is not open yet, or this is gone.', zh: '「帮我找人」还没开放，或者这一条已经不在了。' },
  not_allowed: { en: 'Not allowed.', zh: '没有权限。' },
  invalid: { en: 'Something in the form is not right. Check it and try again.', zh: '填的内容有不对的地方，请检查后再试。' },
  closed: { en: 'This question has ended.', zh: '这次提问已经结束了。' },
  pick_limit: { en: `You can introduce up to ${L.picksPerBridgeMax} people for one question.`, zh: `同一个提问最多介绍 ${L.picksPerBridgeMax} 个人。` },
  changed: { en: 'Things changed in the meantime. Refresh and try again.', zh: '情况刚有变化，请刷新后再试。' },
  too_many: { en: 'Too many tries. Wait a minute.', zh: '操作太频繁了，请过一分钟再试。' },
  unavailable: { en: 'Not available right now. Try again later.', zh: '现在用不了，请稍后再试。' },
  unreadable: { en: 'The answer could not be read.', zh: '读不出服务器的回答。' },
};

/** Why the server would not start (`{ started: false, code }`). Not an error: the form stays as it was. */
export const TWIN_FIND_REFUSAL_COPY: Record<TwinFindRefusalCodeV0, { en: string; zh: string }> = {
  asker_daily_limit: { en: `You can ask ${L.findsPerDayMax} times a day. Try again tomorrow.`, zh: `每天最多发起 ${L.findsPerDayMax} 次，明天再来。` },
  people_count: { en: `Ask 1 to ${L.friendsMax} friends.`, zh: `要问 1 到 ${L.friendsMax} 位朋友。` },
  none_available: { en: 'None of the friends you picked can be asked this time.', zh: '这次选的朋友都问不到。' },
};

export class TwinFindError extends Error {
  readonly failure: TwinFindFailure;
  /** Only for `invalid`: the rule the server applied and the field it applied to, so the form can point at it. */
  readonly reasonCode: TwinFindReasonCodeV0 | null;
  readonly field: string | null;
  constructor(failure: TwinFindFailure, reason?: { reasonCode: TwinFindReasonCodeV0; field: string }) {
    super(failure);
    this.name = 'TwinFindError';
    this.failure = failure;
    this.reasonCode = reason ? reason.reasonCode : null;
    this.field = reason ? reason.field : null;
  }
}

export interface MobileTwinFindClient {
  /** The caller's own friends: whom to ask, and (as the friend asked) whom to introduce. */
  friends(): Promise<TwinFindFriendOptionV0[]>;
  start(request: TwinFindRequestV0): Promise<TwinFindStartOutcomeV0>;
  /** Newest first. For older ones pass the last item's `createdAt` as `before`. */
  list(before?: string): Promise<TwinFindListItemV0[]>;
  /** The asker's or the asked friend's view. The person introduced uses `intro`. */
  get(id: string): Promise<TwinFindAskerViewV0 | TwinFindBridgeViewV0>;
  close(id: string): Promise<TwinFindAskerViewV0>;
  /** `ref` is the friend's row (`people[].ref`). The third and last agreement. */
  accept(id: string, ref: string): Promise<TwinFindAskerViewV0>;
  pass(id: string, ref: string): Promise<TwinFindAskerViewV0>;
  /** `url` is set when the person has to be reached by link. It is never shown again: offer it for forwarding right away. */
  pick(id: string, pick: TwinFindPickV0): Promise<{ view: TwinFindBridgeViewV0; url: string | null }>;
  decline(id: string): Promise<TwinFindBridgeViewV0>;
  withdraw(id: string): Promise<TwinFindBridgeViewV0>;
  /** A fresh link for the person picked; the old one stops working. */
  relink(id: string): Promise<{ url: string }>;
  intro(bridgeId: string): Promise<TwinFindIntroViewV0>;
  /** `null` after saying no: the introduction is no longer theirs to see. */
  consent(bridgeId: string, consent: TwinFindConsentV0): Promise<TwinFindIntroViewV0 | null>;
  revoke(bridgeId: string): Promise<void>;
  /** The caller's own switch: may the platform ask them in the app when a friend picks them for someone looking for a partner. */
  profile(): Promise<TwinFindProfileV0>;
  /** Turning it off always works. Turning it on fails with `not_found` while the server has dating switched off. */
  setDatingOpen(open: boolean): Promise<TwinFindProfileV0>;
  /** The caller's own condition card for dating; `null` when they have none. */
  card(): Promise<TwinFindCardV0 | null>;
  /** `null` clears it, which always works. Saving one fails with `not_found` while the server has the card switched off. */
  setCard(card: TwinFindCardV0 | null): Promise<TwinFindCardV0 | null>;
}

const FIND_PATH = '/twin-find';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failureOf(status: number, body: unknown): TwinFindFailure {
  if (status === 400 || status === 422) return 'invalid';
  if (status === 401 || status === 403) return 'not_allowed';
  if (status === 404) return 'not_found';
  if (status === 409 && isRecord(body) && body.code === 'closed') return 'closed';
  if (status === 409 && isRecord(body) && body.code === 'pick_limit') return 'pick_limit';
  if (status === 409 || status === 410) return 'changed';
  if (status === 429) return 'too_many';
  return 'unavailable';
}

function invalidReason(body: unknown): { reasonCode: TwinFindReasonCodeV0; field: string } | undefined {
  if (!isRecord(body)) return undefined;
  const { reasonCode, field } = body;
  const known = (TWIN_FIND_REASON_CODES_V0 as readonly unknown[]).includes(reasonCode);
  return known && typeof field === 'string' ? { reasonCode: reasonCode as TwinFindReasonCodeV0, field } : undefined;
}

export function createMobileTwinFindClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  /** Web origin the consent links open on. */
  webOrigin: string;
  token: () => string | null | undefined;
}): MobileTwinFindClient {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new TwinFindError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${FIND_PATH}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(method === 'GET' ? {} : { body: body ?? {} }),
      });
    } catch {
      throw new TwinFindError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) {
      const failure = failureOf(response.status, response.body);
      throw new TwinFindError(failure, failure === 'invalid' ? invalidReason(response.body) : undefined);
    }
    return response.body;
  };
  const read = <T>(decoded: T | null): T => {
    if (decoded === null) throw new TwinFindError('unreadable');
    return decoded;
  };
  const checked = (id: string): string => {
    if (!TWIN_FIND_ID_PATTERN_V0.test(id)) throw new TwinFindError('not_found');
    return id;
  };
  const view = async (id: string, action?: 'close' | 'accept' | 'pass' | 'decline' | 'withdraw', body?: unknown): Promise<TwinFindAskerViewV0 | TwinFindBridgeViewV0> => {
    const path = action === undefined ? `/${checked(id)}` : `/${checked(id)}/${action}`;
    const decoded = read(decodeTwinFindViewV0(await call(action === undefined ? 'GET' : 'POST', path, body)));
    if (decoded.id !== id) throw new TwinFindError('unreadable');
    return decoded;
  };
  const asAsker = (decoded: TwinFindAskerViewV0 | TwinFindBridgeViewV0): TwinFindAskerViewV0 => {
    if (decoded.role !== 'asker') throw new TwinFindError('unreadable');
    return decoded;
  };
  const asBridge = (decoded: TwinFindAskerViewV0 | TwinFindBridgeViewV0): TwinFindBridgeViewV0 => {
    if (decoded.role !== 'bridge') throw new TwinFindError('unreadable');
    return decoded;
  };
  const mine = (bridgeId: string, decoded: TwinFindIntroViewV0): TwinFindIntroViewV0 => {
    if (decoded.bridgeId !== bridgeId) throw new TwinFindError('unreadable');
    return decoded;
  };
  return {
    async friends() {
      return read(decodeTwinFindFriendOptionsV0(await call('GET', '/friends')));
    },
    async start(request) {
      const adult = request.adult === true ? { adult: true } : {};
      const body = { topic: request.topic, question: request.question, friendRefs: request.friendRefs, ...adult };
      return read(decodeTwinFindStartOutcomeV0(await call('POST', '', body)));
    },
    async list(before) {
      return read(decodeTwinFindListV0(await call('GET', before === undefined ? '' : `?before=${encodeURIComponent(before)}`)));
    },
    get: (id) => view(id),
    async close(id) {
      return asAsker(await view(id, 'close'));
    },
    async accept(id, ref) {
      return asAsker(await view(id, 'accept', { ref }));
    },
    async pass(id, ref) {
      return asAsker(await view(id, 'pass', { ref }));
    },
    async pick(id, pick) {
      const person = pick.person.kind === 'friend' ? { kind: 'friend', ref: pick.person.ref } : { kind: 'guest', label: pick.person.label };
      const outcome = read(decodeTwinFindPickOutcomeV0(await call('POST', `/${checked(id)}/pick`, { person, ...(pick.note === undefined ? {} : { note: pick.note }) })));
      if (outcome.view.id !== id) throw new TwinFindError('unreadable');
      return { view: outcome.view, url: outcome.link ? twinFindGuestLinkV0(deps.webOrigin, outcome.link.code) : null };
    },
    async decline(id) {
      return asBridge(await view(id, 'decline'));
    },
    async withdraw(id) {
      return asBridge(await view(id, 'withdraw'));
    },
    async relink(id) {
      const relinked = read(decodeTwinFindRelinkV0(await call('POST', `/${checked(id)}/relink`)));
      return { url: twinFindGuestLinkV0(deps.webOrigin, relinked.code) };
    },
    async intro(bridgeId) {
      return mine(bridgeId, read(decodeTwinFindIntroViewV0(await call('GET', `/intro/${checked(bridgeId)}`))));
    },
    async consent(bridgeId, consent) {
      const body =
        consent.decision === 'agree'
          ? { decision: 'agree', displayName: consent.displayName, ...(consent.line === null ? {} : { line: consent.line }), ...(consent.adult === true ? { adult: true } : {}) }
          : { decision: 'decline' };
      const outcome = read(decodeTwinFindConsentOutcomeV0(await call('POST', `/intro/${checked(bridgeId)}/consent`, body)));
      return outcome.view === null ? null : mine(bridgeId, outcome.view);
    },
    async revoke(bridgeId) {
      read(decodeTwinFindConsentOutcomeV0(await call('POST', `/intro/${checked(bridgeId)}/revoke`)));
    },
    async profile() {
      return read(decodeTwinFindProfileV0(await call('GET', '/profile')));
    },
    async setDatingOpen(open) {
      const saved = read(decodeTwinFindProfileV0(await call('PUT', '/profile', { datingOpen: open })));
      if (saved.datingOpen !== open) throw new TwinFindError('unreadable');
      return saved;
    },
    async card() {
      return read(decodeTwinFindCardViewV0(await call('GET', '/card'))).card;
    },
    async setCard(card) {
      const saved = read(decodeTwinFindCardViewV0(await call('PUT', '/card', { card })));
      if ((saved.card === null) !== (card === null)) throw new TwinFindError('unreadable');
      return saved.card;
    },
  };
}
