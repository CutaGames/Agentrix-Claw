/**
 * Short of people on a settled plan, on the phone (`shared/types/twin-huddle-fill.ts`). The organizer asks the friends who
 * confirmed whether they can bring someone; a friend picks one person from their own list (the platform asks them in the
 * app) or takes a one-time link to forward (`/huddle/bring#<code>`); the person brought says they would come and writes
 * a name for the organizer, and the organizer has the last word. The organizer sees nobody before they say they would
 * come; the person brought does not see who started it until they are in. Only in builds with
 * `EXPO_PUBLIC_TWIN_HUDDLE_FILL=1` on top of `EXPO_PUBLIC_TWIN_HUDDLE=1`; the routes answer 404 while either server switch
 * is off. No React Native import: the transport and token are injected (twinHuddleFillSession.ts binds them).
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import type { IntroductionNeedRegionV1 } from '../../shared/types/introduction';
import { TWIN_HUDDLE_ID_PATTERN_V0, TWIN_HUDDLE_KIND_LABELS_V0, type TwinHuddleReasonCodeV0 } from '../../shared/types/twin-huddle';
import {
  TWIN_HUDDLE_FILL_CONFLICT_CODES_V0,
  decodeTwinHuddleFillAnswerV0,
  decodeTwinHuddleFillBringOutcomeV0,
  decodeTwinHuddleFillBringV0,
  decodeTwinHuddleFillInviteListV0,
  decodeTwinHuddleFillInviteV0,
  decodeTwinHuddleFillLabelV0,
  decodeTwinHuddleFillStartV0,
  decodeTwinHuddleFillViewV0,
  twinHuddleFillGuestLinkV0,
  type TwinHuddleFillConflictCodeV0,
  type TwinHuddleFillDecisionV0,
  type TwinHuddleFillInviteItemV0,
  type TwinHuddleFillInviteStateV0,
  type TwinHuddleFillInviteV0,
  type TwinHuddleFillMineStateV0,
  type TwinHuddleFillSummaryV0,
  type TwinHuddleFillViewV0,
} from '../../shared/types/twin-huddle-fill';
import { TWIN_HUDDLE_ENABLED, TWIN_HUDDLE_FAILURE_COPY, TwinHuddleError, isTwinHuddleMobileEnabled, twinHuddleFailureOf, twinHuddleInvalidReason } from './twinHuddle';
import { twinHuddleDayWords, twinHuddleDeadlineWords } from './twinHuddleView';

// Read as a literal member expression so the Expo build inlines it.
export const TWIN_HUDDLE_FILL_ENABLED = TWIN_HUDDLE_ENABLED && isTwinHuddleMobileEnabled(process.env.EXPO_PUBLIC_TWIN_HUDDLE_FILL);

type Words = { en: string; zh: string };

/** What the server says when a change no longer fits (HTTP 409 with `{ code }`). */
export const TWIN_HUDDLE_FILL_CONFLICT_COPY: Record<TwinHuddleFillConflictCodeV0, Words> = {
  fill_closed: { en: 'This is over: the plan has started, or nobody more is wanted.', zh: '已经结束了：定的时间到了，或者已经不再缺人。' },
  fill_started: { en: 'You have already asked for more people on this plan.', zh: '这次商量已经问过缺人了。' },
  fill_daily_limit: { en: 'You have asked for more people as often as you can today. Try again tomorrow.', zh: '今天问缺人的次数到上限了，明天再来。' },
  no_bridge: { en: 'Nobody has confirmed in the app yet, so there is nobody to ask.', zh: '还没有在站内确认要来的朋友，没有人可以问。' },
  fill_full: { en: 'Enough people are in now.', zh: '人已经够了。' },
  bring_limit: { en: 'You have picked someone three times on this plan, which is the most.', zh: '这次你已经选过 3 次人了，不能再选。' },
  bring_waiting: { en: 'You are already bringing someone. Take them back first to bring someone else.', zh: '你已经带了一位，先撤回才能再带别人。' },
  answer_closed: { en: 'This can no longer be answered.', zh: '这一条现在不能再回答了。' },
  decide_closed: { en: 'This person can no longer be decided on.', zh: '这一位现在不能再拍板了。' },
};

/** How the friend who brought someone sees them: every "no", from whoever, is only "not this time". */
export const TWIN_HUDDLE_FILL_MINE_COPY: Record<TwinHuddleFillMineStateV0, Words> = {
  waiting: { en: 'Waiting for their answer', zh: '等对方回答' },
  agreed: { en: 'Would come · waiting for the organizer', zh: '愿意来 · 等发起人点头' },
  accepted: { en: 'In', zh: '加进来了' },
  not_this_time: { en: 'Not this time', zh: '这次不了' },
  withdrawn: { en: 'Taken back', zh: '已撤回' },
};

/** How the person brought sees themselves: the organizer passing, a full plan and an ended one all read the same. */
export const TWIN_HUDDLE_FILL_INVITE_COPY: Record<TwinHuddleFillInviteStateV0, Words> = {
  waiting: { en: 'Waiting for your answer', zh: '等你回答' },
  agreed: { en: 'You said you would come · waiting for the organizer', zh: '你说了愿意来 · 等发起人点头' },
  accepted: { en: 'You are in. See you there.', zh: '定了，欢迎一起来。' },
  declined: { en: 'You said no', zh: '你说了不去' },
  not_this_time: { en: 'There are enough people this time', zh: '这次人已经够了' },
  withdrawn: { en: 'This invitation is off', zh: '这次的邀请取消了' },
};

export const TWIN_HUDDLE_FILL_REGION_COPY: Record<IntroductionNeedRegionV1, Words> = {
  sg_central: { zh: '新加坡中部', en: 'Central Singapore' },
  sg_east: { zh: '新加坡东部', en: 'East Singapore' },
  sg_west: { zh: '新加坡西部', en: 'West Singapore' },
  sg_south: { zh: '新加坡南部', en: 'South Singapore' },
  sg_north: { zh: '新加坡北部', en: 'North Singapore' },
  online: { zh: '线上', en: 'Online' },
};

/** Next to a person who came through a link: the platform never checked who they are. */
export const TWIN_HUDDLE_FILL_UNVERIFIED: Words = { en: 'Not verified', zh: '未验证' };

/** The invitation is gone, was never there, or the friend took it back before it was answered. */
export const TWIN_HUDDLE_FILL_INVITE_GONE: Words = { en: 'This invitation is no longer there.', zh: '这条邀请已经不在了。' };

const LABEL_RULE: Words = {
  en: 'Write a name for the organizer, 1 to 20 characters, without phone numbers, emails or links.',
  zh: '写一个给发起人看的称呼，1–20 个字，不要电话、邮箱、链接。',
};

/** A failed fill call. `conflict` says which rule a 409 applied; null when the server did not say, or for other failures. */
export class TwinHuddleFillError extends TwinHuddleError {
  readonly conflict: TwinHuddleFillConflictCodeV0 | null;
  constructor(failure: TwinHuddleError['failure'], options: { reason?: ConstructorParameters<typeof TwinHuddleError>[1]; conflict?: TwinHuddleFillConflictCodeV0 | null } = {}) {
    super(failure, options.reason);
    this.name = 'TwinHuddleFillError';
    this.conflict = options.conflict ?? null;
  }
}

function isConflict(value: unknown): value is TwinHuddleFillConflictCodeV0 {
  return typeof value === 'string' && (TWIN_HUDDLE_FILL_CONFLICT_CODES_V0 as readonly string[]).includes(value);
}

/** Reads the property rather than the class, so it also holds where `instanceof` on a subclass of Error does not. */
export function twinHuddleFillConflictOf(error: unknown): TwinHuddleFillConflictCodeV0 | null {
  const code = typeof error === 'object' && error !== null ? (error as { conflict?: unknown }).conflict : undefined;
  return isConflict(code) ? code : null;
}

/** What to say about a typed name before sending it; null when it would be accepted. The server applies the same rule. */
export function twinHuddleFillLabelProblem(text: string): Words | null {
  return decodeTwinHuddleFillLabelV0(text).ok ? null : LABEL_RULE;
}

export function twinHuddleFillFailureWords(error: unknown): Words {
  const conflict = twinHuddleFillConflictOf(error);
  if (conflict) return TWIN_HUDDLE_FILL_CONFLICT_COPY[conflict];
  if (!(error instanceof TwinHuddleError)) return TWIN_HUDDLE_FAILURE_COPY.unavailable;
  if (error.failure === 'invalid' && typeof error.field === 'string' && error.field.startsWith('body.label')) return LABEL_RULE;
  return TWIN_HUDDLE_FAILURE_COPY[error.failure];
}

/** "2 more wanted, 1 in so far", "Enough people", or "No longer asking". */
export function twinHuddleFillSummaryWords(fill: Pick<TwinHuddleFillSummaryV0, 'wanted' | 'accepted' | 'state'>): Words {
  if (fill.state === 'ended') return { en: 'No longer asking for more people.', zh: '已经不再缺人了。' };
  if (fill.state === 'full') return { en: `Enough people: all ${fill.wanted} are in. If someone drops out it opens again.`, zh: `人够了：${fill.wanted} 个都加进来了。有人退出会重新开。` };
  const left = fill.wanted - fill.accepted;
  return { en: `${left} more wanted, ${fill.accepted} in so far`, zh: `还缺 ${left} 个，已经加进 ${fill.accepted} 个` };
}

/** Until when it stays open, while it is open. */
export function twinHuddleFillUntilWords(fill: Pick<TwinHuddleFillSummaryV0, 'endsAt' | 'state'>, now: Date): Words | null {
  return fill.state === 'open' ? twinHuddleDeadlineWords(fill.endsAt, now) : null;
}

/** The line under the heading: what this person can do here. */
export function twinHuddleFillHintWords(view: Pick<TwinHuddleFillViewV0, 'role' | 'fill'>): Words {
  if (view.role === 'initiator') {
    if (view.fill === null) {
      return {
        en: 'Short of people? Ask the friends who confirmed: each can bring one person. You only see someone once they say they would come, and they are in only when you say yes.',
        zh: '还缺人？问一下确认要来的朋友，每位可以带一个人。对方说愿意来以后你才看得到，你点「好」才算加进来。',
      };
    }
    return {
      en: 'People who would come show up here with the name they gave and the friend who brought them. "Not verified" means they came through a link.',
      zh: '愿意来的人会出现在这里，带着他自己写的称呼和带他来的朋友。标「未验证」的是走链接来的。',
    };
  }
  return {
    en: 'The plan is short of people. Bring one person from your own list, or take a link to forward yourself. Once they say they would come, the organizer decides.',
    zh: '定好的局还缺人。你可以从自己的名单里带一个人，或者拿一条链接自己转。对方说愿意来以后，由发起人拍板。',
  };
}

/** "You can pick 2 more times". */
export function twinHuddleFillTriesWords(triesLeft: number): Words {
  return { en: triesLeft === 1 ? 'You can pick 1 more time.' : `You can pick ${triesLeft} more times.`, zh: `这次还能选 ${triesLeft} 次。` };
}

/** The message that goes with a bring link. It names nobody: not the organizer, not the friends. */
export function twinHuddleFillShareWords(url: string): Words {
  return { en: `Some friends of mine have a plan and are short of people. Want to come along? Have a look: ${url}`, zh: `朋友约了个局还缺人，想带你一起去，点开看看：${url}` };
}

/** "Sam would like to bring you along: Meal". */
export function twinHuddleFillInviteTitleWords(invite: Pick<TwinHuddleFillInviteV0, 'bridgeName' | 'kind'>): Words {
  const kind = TWIN_HUDDLE_KIND_LABELS_V0[invite.kind];
  const name = invite.bridgeName.trim();
  if (!name) return { en: `A friend would like to bring you along: ${kind.en}`, zh: `一位朋友想带你一起去：${kind.zh}` };
  return { en: `${name} would like to bring you along: ${kind.en}`, zh: `${name}想带你一起去：${kind.zh}` };
}

/** When it starts, for the list: "Tomorrow 19:00". */
export function twinHuddleFillStartWords(startAt: string, now: Date): Words {
  const start = new Date(startAt);
  const day = twinHuddleDayWords(start, now);
  const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
  return { en: `${day.en} ${time}`, zh: `${day.zh} ${time}` };
}

export function twinHuddleFillHeadcountWords(headcount: number): Words {
  return { en: headcount === 1 ? '1 person is coming so far' : `${headcount} people are coming so far`, zh: `现在确定来的有 ${headcount} 个人` };
}

/** Only once they are in: who started it. */
export function twinHuddleFillOrganizerWords(invite: Pick<TwinHuddleFillInviteV0, 'initiatorName'>): Words | null {
  if (invite.initiatorName === null) return null;
  return { en: `Organized by ${invite.initiatorName}`, zh: `发起人：${invite.initiatorName}` };
}

export type TwinHuddleFillAnswerDraft = { decision: 'come'; label: string } | { decision: 'decline' };

export type TwinHuddleFillBringResult = { view: TwinHuddleFillViewV0; route: 'app' } | { view: TwinHuddleFillViewV0; route: 'link'; url: string };

export interface MobileTwinHuddleFillClient {
  get(huddleId: string): Promise<TwinHuddleFillViewV0>;
  start(huddleId: string, wanted: number): Promise<TwinHuddleFillViewV0>;
  end(huddleId: string): Promise<TwinHuddleFillViewV0>;
  decide(huddleId: string, personId: string, decision: TwinHuddleFillDecisionV0): Promise<TwinHuddleFillViewV0>;
  /** Someone from my own list (`rel:…`), or null for a link to forward myself. The link is never shown again. */
  bring(huddleId: string, friendRef: string | null): Promise<TwinHuddleFillBringResult>;
  withdraw(huddleId: string, personId: string): Promise<TwinHuddleFillViewV0>;
  /** Where someone wants to bring me, newest first. */
  invites(): Promise<TwinHuddleFillInviteItemV0[]>;
  invite(personId: string): Promise<TwinHuddleFillInviteV0>;
  /** My own answer. There is no call that answers for someone else. */
  answer(personId: string, answer: TwinHuddleFillAnswerDraft): Promise<TwinHuddleFillInviteV0>;
  /** I said I would come, and now I cannot. */
  leave(personId: string): Promise<TwinHuddleFillInviteV0>;
}

const HUDDLE_PATH = '/twin-huddle';

type FillDeps = {
  transport: HttpTransportV1;
  baseUrl: string;
  /** Web origin the bring links open on. */
  webOrigin: string;
  token: () => string | null | undefined;
};

export function createMobileTwinHuddleFillClient(deps: FillDeps): MobileTwinHuddleFillClient {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const request = async (method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> => {
    const token = deps.token();
    if (!token) throw new TwinHuddleFillError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${HUDDLE_PATH}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(method === 'GET' ? {} : { body: body ?? {} }),
      });
    } catch {
      throw new TwinHuddleFillError('unavailable');
    }
    if (response.status < 200 || response.status >= 300) {
      const failure = twinHuddleFailureOf(response.status);
      const code = typeof response.body === 'object' && response.body !== null ? (response.body as { code?: unknown }).code : undefined;
      throw new TwinHuddleFillError(failure, {
        reason: failure === 'invalid' ? twinHuddleInvalidReason(response.body) : undefined,
        conflict: failure === 'changed' && isConflict(code) ? code : null,
      });
    }
    return response.body;
  };
  const checked = (id: string): string => {
    if (!TWIN_HUDDLE_ID_PATTERN_V0.test(id)) throw new TwinHuddleFillError('not_found');
    return id;
  };
  const refused = (decoded: { reasonCode: TwinHuddleReasonCodeV0; field: string }): never => {
    throw new TwinHuddleFillError('invalid', { reason: { reasonCode: decoded.reasonCode, field: decoded.field } });
  };
  const view = async (huddleId: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<TwinHuddleFillViewV0> => {
    const id = checked(huddleId);
    const decoded = decodeTwinHuddleFillViewV0(await request(method, `/${id}/fill${path}`, body));
    if (decoded === null || decoded.huddleId !== id) throw new TwinHuddleFillError('unreadable');
    return decoded;
  };
  const invite = async (personId: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<TwinHuddleFillInviteV0> => {
    const id = checked(personId);
    const decoded = decodeTwinHuddleFillInviteV0(await request(method, `/fill/invites/${id}${path}`, body));
    if (decoded === null || decoded.id === null || decoded.id.toLowerCase() !== id.toLowerCase()) throw new TwinHuddleFillError('unreadable');
    return decoded;
  };

  return {
    get: (huddleId) => view(huddleId, 'GET', ''),
    async start(huddleId, wanted) {
      const decoded = decodeTwinHuddleFillStartV0({ wanted });
      if (decoded.ok === false) return refused(decoded);
      return view(huddleId, 'POST', '', decoded.value);
    },
    end: (huddleId) => view(huddleId, 'POST', '/end'),
    async decide(huddleId, personId, decision) {
      return view(huddleId, 'POST', '/decide', { personId: checked(personId), decision });
    },
    async bring(huddleId, friendRef) {
      const body = friendRef === null ? {} : { friendRef };
      const decoded = decodeTwinHuddleFillBringV0(body);
      if (decoded.ok === false) return refused(decoded);
      const id = checked(huddleId);
      const outcome = decodeTwinHuddleFillBringOutcomeV0(await request('POST', `/${id}/fill/bring`, body));
      if (outcome === null || outcome.view.huddleId !== id) throw new TwinHuddleFillError('unreadable');
      if (outcome.route === 'app') return { view: outcome.view, route: 'app' };
      return { view: outcome.view, route: 'link', url: twinHuddleFillGuestLinkV0(deps.webOrigin, outcome.code ?? '') };
    },
    async withdraw(huddleId, personId) {
      return view(huddleId, 'POST', '/withdraw', { personId: checked(personId) });
    },
    async invites() {
      const decoded = decodeTwinHuddleFillInviteListV0(await request('GET', '/fill/invites'));
      if (decoded === null) throw new TwinHuddleFillError('unreadable');
      return decoded;
    },
    invite: (personId) => invite(personId, 'GET', ''),
    async answer(personId, answer) {
      const body = answer.decision === 'come' ? { decision: 'come', label: answer.label } : { decision: 'decline' };
      const decoded = decodeTwinHuddleFillAnswerV0(body);
      if (decoded.ok === false) return refused(decoded);
      return invite(personId, 'POST', '/answer', decoded.value.label === null ? { decision: decoded.value.decision } : decoded.value);
    },
    leave: (personId) => invite(personId, 'POST', '/withdraw'),
  };
}
