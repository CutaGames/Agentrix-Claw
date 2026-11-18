/**
 * Twin huddle on the phone (`shared/types/twin-huddle.ts`): start a plan (what, candidate times, friends and link
 * seats), follow it, pick a time or cancel; when invited, answer and confirm. Link seats come back once as web links
 * (`/huddle#<code>`) for the organizer to forward; a lost link can only be replaced, which retires the old one. Only in
 * builds with `EXPO_PUBLIC_TWIN_HUDDLE=1`; the routes answer 404 while the server switch is off or the user is outside
 * the cohort. No React Native import: the transport and token are injected (twinHuddleSession.ts binds them).
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  TWIN_HUDDLE_ID_PATTERN_V0,
  TWIN_HUDDLE_REASON_CODES_V0,
  decodeTwinHuddleFriendOptionsV0,
  decodeTwinHuddleListV0,
  decodeTwinHuddleProfileV0,
  decodeTwinHuddleRelinkV0,
  decodeTwinHuddleStartOutcomeV0,
  decodeTwinHuddleViewV0,
  twinHuddleGuestLinkV0,
  type TwinHuddleConfirmationV0,
  type TwinHuddleFriendOptionV0,
  type TwinHuddleFriendRouteV0,
  type TwinHuddleInitiatorViewV0,
  type TwinHuddleInvitedViewV0,
  type TwinHuddleListItemV0,
  type TwinHuddleProfileV0,
  type TwinHuddleReasonCodeV0,
  type TwinHuddleRefusalCodeV0,
  type TwinHuddleReplyV0,
  type TwinHuddleRequestV0,
} from '../../shared/types/twin-huddle';

export function isTwinHuddleMobileEnabled(value: string | undefined): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const TWIN_HUDDLE_ENABLED = isTwinHuddleMobileEnabled(process.env.EXPO_PUBLIC_TWIN_HUDDLE);

export type TwinHuddleFailure = 'no_session' | 'not_found' | 'not_allowed' | 'invalid' | 'changed' | 'too_many' | 'unavailable' | 'unreadable';

export const TWIN_HUDDLE_FAILURE_COPY: Record<TwinHuddleFailure, { en: string; zh: string }> = {
  no_session: { en: 'Sign in first.', zh: '请先登录。' },
  not_found: { en: 'Planning with twins is not open yet, or this plan is gone.', zh: '约时间还没开放，或者这次商量已经不在了。' },
  not_allowed: { en: 'Not allowed.', zh: '没有权限。' },
  invalid: { en: 'Something in the form is not right. Check it and try again.', zh: '填的内容有不对的地方，请检查后再试。' },
  changed: { en: 'Things changed in the meantime. Refresh and try again.', zh: '情况刚有变化，请刷新后再试。' },
  too_many: { en: 'Too many tries. Wait a minute.', zh: '操作太频繁了，请过一分钟再试。' },
  unavailable: { en: 'Not available right now. Try again later.', zh: '现在用不了，请稍后再试。' },
  unreadable: { en: 'The answer could not be read.', zh: '读不出服务器的回答。' },
};

/** Why the server would not start a plan (`{ started: false, code }`). Not an error: the form stays as it was. */
export const TWIN_HUDDLE_REFUSAL_COPY: Record<TwinHuddleRefusalCodeV0, { en: string; zh: string }> = {
  initiator_not_opted_in: { en: 'First turn on "Let my twin plan for me" in settings.', zh: '先在设置里打开「让分身替我商量」。' },
  initiator_daily_limit: { en: 'You have started as many plans as you can today. Try again tomorrow.', zh: '今天发起的商量已经到上限了，明天再来。' },
  friend_count: { en: 'Invite 1 to 9 people.', zh: '要约 1 到 9 个人。' },
  duplicate_friend: { en: 'The same person is on the list twice.', zh: '同一个人选了两次。' },
  none_available: { en: 'None of the people you picked can be asked this time.', zh: '这次选的人都约不到。' },
};

export class TwinHuddleError extends Error {
  readonly failure: TwinHuddleFailure;
  /** Only for `invalid`: the rule the server applied and the field it applied to, so the form can point at it. */
  readonly reasonCode: TwinHuddleReasonCodeV0 | null;
  readonly field: string | null;
  constructor(failure: TwinHuddleFailure, reason?: { reasonCode: TwinHuddleReasonCodeV0; field: string }) {
    super(failure);
    this.name = 'TwinHuddleError';
    this.failure = failure;
    this.reasonCode = reason ? reason.reasonCode : null;
    this.field = reason ? reason.field : null;
  }
}

export type MobileTwinHuddleStartOutcome =
  | { started: true; huddleId: string; routes: { ref: string; route: TwinHuddleFriendRouteV0 }[]; links: { ref: string; url: string }[] }
  | { started: false; code: TwinHuddleRefusalCodeV0 };

export interface MobileTwinHuddleClient {
  profile(): Promise<TwinHuddleProfileV0>;
  updateProfile(patch: Partial<TwinHuddleProfileV0>): Promise<TwinHuddleProfileV0>;
  friends(): Promise<TwinHuddleFriendOptionV0[]>;
  /** The links are never shown again: offer them for sharing right away. */
  start(request: TwinHuddleRequestV0): Promise<MobileTwinHuddleStartOutcome>;
  /** Newest first. For older plans pass the last item's `createdAt` as `before`. */
  list(before?: string): Promise<TwinHuddleListItemV0[]>;
  get(id: string): Promise<TwinHuddleInitiatorViewV0 | TwinHuddleInvitedViewV0>;
  answer(id: string, slots: TwinHuddleReplyV0['slots']): Promise<TwinHuddleInvitedViewV0>;
  choose(id: string, candidate: number): Promise<TwinHuddleInitiatorViewV0>;
  confirm(id: string, confirmation: TwinHuddleConfirmationV0): Promise<TwinHuddleInvitedViewV0>;
  cancel(id: string): Promise<TwinHuddleInitiatorViewV0>;
  relink(id: string, ref: string): Promise<{ ref: string; url: string }>;
}

const HUDDLE_PATH = '/twin-huddle';

/** Shared with the weekly plan client (twinHuddleSeries.ts): the same routes family answers with the same statuses. */
export function twinHuddleFailureOf(status: number): TwinHuddleFailure {
  if (status === 400 || status === 422) return 'invalid';
  if (status === 401 || status === 403) return 'not_allowed';
  if (status === 404) return 'not_found';
  if (status === 409 || status === 410) return 'changed';
  if (status === 429) return 'too_many';
  return 'unavailable';
}

export function twinHuddleInvalidReason(body: unknown): { reasonCode: TwinHuddleReasonCodeV0; field: string } | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { reasonCode, field } = body as Record<string, unknown>;
  const known = (TWIN_HUDDLE_REASON_CODES_V0 as readonly unknown[]).includes(reasonCode);
  return known && typeof field === 'string' ? { reasonCode: reasonCode as TwinHuddleReasonCodeV0, field } : undefined;
}

export function createMobileTwinHuddleClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  /** Web origin the link-seat links open on. */
  webOrigin: string;
  token: () => string | null | undefined;
}): MobileTwinHuddleClient {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const call = async (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new TwinHuddleError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${HUDDLE_PATH}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(method === 'GET' ? {} : { body: body ?? {} }),
      });
    } catch {
      throw new TwinHuddleError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) {
      const failure = twinHuddleFailureOf(response.status);
      throw new TwinHuddleError(failure, failure === 'invalid' ? twinHuddleInvalidReason(response.body) : undefined);
    }
    return response.body;
  };
  const read = <T>(decoded: T | null): T => {
    if (decoded === null) throw new TwinHuddleError('unreadable');
    return decoded;
  };
  const checked = (id: string): string => {
    if (!TWIN_HUDDLE_ID_PATTERN_V0.test(id)) throw new TwinHuddleError('not_found');
    return id;
  };
  const view = async (id: string, action?: 'answer' | 'choose' | 'confirm' | 'cancel', body?: unknown): Promise<TwinHuddleInitiatorViewV0 | TwinHuddleInvitedViewV0> => {
    const path = action === undefined ? `/${checked(id)}` : `/${checked(id)}/${action}`;
    const decoded = read(decodeTwinHuddleViewV0(await call(action === undefined ? 'GET' : 'POST', path, body)));
    if (decoded.id !== id) throw new TwinHuddleError('unreadable');
    return decoded;
  };
  const asInitiator = (decoded: TwinHuddleInitiatorViewV0 | TwinHuddleInvitedViewV0): TwinHuddleInitiatorViewV0 => {
    if (decoded.role !== 'initiator') throw new TwinHuddleError('unreadable');
    return decoded;
  };
  const asInvited = (decoded: TwinHuddleInitiatorViewV0 | TwinHuddleInvitedViewV0): TwinHuddleInvitedViewV0 => {
    if (decoded.role !== 'invited') throw new TwinHuddleError('unreadable');
    return decoded;
  };
  const linkOf = (ref: string, code: string): { ref: string; url: string } => ({ ref, url: twinHuddleGuestLinkV0(deps.webOrigin, code) });
  return {
    async profile() {
      return read(decodeTwinHuddleProfileV0(await call('GET', '/profile')));
    },
    async updateProfile(patch) {
      return read(decodeTwinHuddleProfileV0(await call('PUT', '/profile', patch)));
    },
    async friends() {
      return read(decodeTwinHuddleFriendOptionsV0(await call('GET', '/friends')));
    },
    async start(request) {
      const outcome = read(decodeTwinHuddleStartOutcomeV0(await call('POST', '', request)));
      if (outcome.started === false) return outcome;
      return { started: true, huddleId: outcome.huddleId, routes: outcome.routes, links: outcome.links.map((link) => linkOf(link.ref, link.code)) };
    },
    async list(before) {
      return read(decodeTwinHuddleListV0(await call('GET', before === undefined ? '' : `?before=${encodeURIComponent(before)}`)));
    },
    get: (id) => view(id),
    async answer(id, slots) {
      return asInvited(await view(id, 'answer', { slots }));
    },
    async choose(id, candidate) {
      return asInitiator(await view(id, 'choose', { candidate }));
    },
    async confirm(id, confirmation) {
      return asInvited(await view(id, 'confirm', { confirmation }));
    },
    async cancel(id) {
      return asInitiator(await view(id, 'cancel'));
    },
    async relink(id, ref) {
      const relinked = read(decodeTwinHuddleRelinkV0(await call('POST', `/${checked(id)}/relink`, { ref })));
      if (relinked.ref !== ref) throw new TwinHuddleError('unreadable');
      return linkOf(relinked.ref, relinked.code);
    },
  };
}
