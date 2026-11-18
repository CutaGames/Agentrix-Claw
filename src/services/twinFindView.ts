/**
 * What the finding-through-friends screens show (twinFind.ts), as plain functions: form → request, the words for every
 * state on each of the three sides, and what a refusal or a failure reads like. No React Native import.
 *
 * Three people, three views. The asker never sees who a friend picked until that person agreed; the person picked never
 * sees who else was asked. So every sentence here is written for exactly one side.
 */
import {
  TWIN_FIND_FIXED_PHRASES_V0,
  TWIN_FIND_LIMITS_V0,
  TWIN_FIND_UNVERIFIED_LABEL_V0,
  decodeTwinFindConsentV0,
  decodeTwinFindPickV0,
  decodeTwinFindRequestV0,
  type TwinFindBridgeStateV0,
  type TwinFindCloseReasonV0,
  type TwinFindConsentV0,
  type TwinFindDecodeResultV0,
  type TwinFindFriendOptionV0,
  type TwinFindFriendRouteV0,
  type TwinFindIntroStateV0,
  type TwinFindListItemV0,
  type TwinFindOfferV0,
  type TwinFindPersonV0,
  type TwinFindPickV0,
  type TwinFindPickedV0,
  type TwinFindReasonCodeV0,
  type TwinFindRequestV0,
  type TwinFindTopicV0,
} from '../../shared/types/twin-find';
import { TWIN_FIND_FAILURE_COPY, TwinFindError } from './twinFind';

export type TwinFindWords = { en: string; zh: string };

const L = TWIN_FIND_LIMITS_V0;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const OPEN_DAYS = Math.round(L.openMs / DAY_MS);
const BLOCKED_TEXT = 'phone numbers, addresses or links';
const BLOCKED_TEXT_ZH = '电话、地址或链接';

/** What every side is told before anything is sent. */
export const TWIN_FIND_HOW_WORDS: TwinFindWords = {
  en: `Your friends each get the question. A friend may ask one person they know; you only see that person after they agreed, and nothing happens until you agree too. No contact details are exchanged: your friend brings you together. Open for ${OPEN_DAYS} days.`,
  zh: `问题会发给你选的朋友。朋友可以去问一位自己认识的人；对方同意以后你才看得到，你也点头才算数。平台不交换联系方式，由朋友把你们拉到一起。${OPEN_DAYS} 天内有效。`,
};

/** 「还剩 2 天」 while the question is open; null once it has ended. */
export function twinFindTimeLeftWords(endsAt: string, now: Date): TwinFindWords | null {
  const left = Date.parse(endsAt) - now.getTime();
  if (!(left > 0)) return null;
  if (left < HOUR_MS) {
    const minutes = Math.max(1, Math.ceil(left / MINUTE_MS));
    return { en: `${minutes} min left`, zh: `还剩 ${minutes} 分钟` };
  }
  if (left < DAY_MS) {
    const hours = Math.floor(left / HOUR_MS);
    return { en: `${hours} h left`, zh: `还剩 ${hours} 小时` };
  }
  const days = Math.floor(left / DAY_MS);
  return { en: days === 1 ? '1 day left' : `${days} days left`, zh: `还剩 ${days} 天` };
}

// ── Forms ────────────────────────────────────────────────────────────────────────

export interface TwinFindStartForm {
  topic: TwinFindTopicV0 | null;
  question: string;
  friendRefs: readonly string[];
}

/** The same rules the server applies, so a bad form is caught before anything is sent. */
export function twinFindRequestFromForm(form: TwinFindStartForm): TwinFindDecodeResultV0<TwinFindRequestV0> {
  if (form.topic === null) return { ok: false, reasonCode: 'missing_field', field: 'request.topic' };
  return decodeTwinFindRequestV0({ topic: form.topic, question: form.question, friendRefs: [...form.friendRefs] });
}

export interface TwinFindPickForm {
  /** One of the friend's own friends (`friends()` or a suggestion), or null to write a name instead. */
  friendRef: string | null;
  guestLabel: string;
  note: string;
}

export function twinFindPickFromForm(form: TwinFindPickForm): TwinFindDecodeResultV0<TwinFindPickV0> {
  const person = form.friendRef === null ? { kind: 'guest', label: form.guestLabel } : { kind: 'friend', ref: form.friendRef };
  return decodeTwinFindPickV0(form.note.trim() === '' ? { person } : { person, note: form.note });
}

export function twinFindConsentFromForm(displayName: string, line: string): TwinFindDecodeResultV0<TwinFindConsentV0> {
  return decodeTwinFindConsentV0({ decision: 'agree', displayName, ...(line.trim() === '' ? {} : { line }) });
}

/** The sentence under the field a rule was broken in (the client's own check and the server's 400 use the same codes). */
export function twinFindProblemWords(reasonCode: TwinFindReasonCodeV0 | null, field: string | null): TwinFindWords {
  const at = field === null ? '' : field;
  if (at.endsWith('topic')) return { en: 'Pick a topic first.', zh: '请先选一个话题。' };
  if (at.endsWith('question')) {
    if (reasonCode === 'too_long') return { en: `The question can be at most ${L.questionMax} characters.`, zh: `问题最多 ${L.questionMax} 个字。` };
    if (reasonCode === 'text_violation') return { en: `The question can't include ${BLOCKED_TEXT}. Please change it.`, zh: `问题里不能有${BLOCKED_TEXT_ZH}，请改一下。` };
    return { en: 'Please write who you are looking for first.', zh: '请先写下想找什么样的人。' };
  }
  if (at.includes('friendRefs')) return { en: `Pick 1 to ${L.friendsMax} friends to ask.`, zh: `请选 1 到 ${L.friendsMax} 位朋友来问。` };
  if (at.endsWith('person.label')) {
    if (reasonCode === 'too_long') return { en: `A name can be at most ${L.labelMax} characters.`, zh: `称呼最多 ${L.labelMax} 个字。` };
    if (reasonCode === 'text_violation') return { en: `A name can't include ${BLOCKED_TEXT}.`, zh: `称呼里不能有${BLOCKED_TEXT_ZH}。` };
    return { en: 'Pick someone from your list, or write a name for them.', zh: '请从名单里选一位，或者写一个称呼。' };
  }
  if (at.endsWith('person.ref')) {
    return { en: "That person can't be introduced for this question. Pick someone else.", zh: '这个问题不能介绍这位，请换一位。' };
  }
  if (at.endsWith('note')) {
    if (reasonCode === 'too_long') return { en: `The introduction can be at most ${L.noteMax} characters.`, zh: `介绍最多 ${L.noteMax} 个字。` };
    if (reasonCode === 'text_violation') return { en: `The introduction can't include ${BLOCKED_TEXT}. Please change it.`, zh: `介绍里不能有${BLOCKED_TEXT_ZH}，请改一下。` };
    return { en: "The introduction can't be read. Please rewrite it on one line.", zh: '介绍读不出来，请改成一行重新写。' };
  }
  if (at.endsWith('displayName')) {
    if (reasonCode === 'too_long') return { en: `The name can be at most ${L.displayNameMax} characters.`, zh: `称呼最多 ${L.displayNameMax} 个字。` };
    if (reasonCode === 'text_violation') return { en: `The name can't include ${BLOCKED_TEXT}.`, zh: `称呼里不能有${BLOCKED_TEXT_ZH}。` };
    return { en: 'Write the name they should see first.', zh: '请先写下给对方看的称呼。' };
  }
  if (at.endsWith('line')) {
    if (reasonCode === 'too_long') return { en: `The line can be at most ${L.lineMax} characters.`, zh: `这句话最多 ${L.lineMax} 个字。` };
    if (reasonCode === 'text_violation') return { en: `The line can't include ${BLOCKED_TEXT}. Please change it.`, zh: `这句话里不能有${BLOCKED_TEXT_ZH}，请改一下。` };
    return { en: "The line can't be read. Please rewrite it on one line.", zh: '这句话读不出来，请改成一行重新写。' };
  }
  return TWIN_FIND_FAILURE_COPY.invalid;
}

export function twinFindFailureWords(error: unknown): TwinFindWords {
  if (!(error instanceof TwinFindError)) return TWIN_FIND_FAILURE_COPY.unavailable;
  return error.failure === 'invalid' ? twinFindProblemWords(error.reasonCode, error.field) : TWIN_FIND_FAILURE_COPY[error.failure];
}

// ── After starting ───────────────────────────────────────────────────────────────

export const TWIN_FIND_ROUTE_WORDS: Readonly<Record<TwinFindFriendRouteV0, TwinFindWords>> = {
  app: { en: 'Asked in the app', zh: '已在站内问' },
  pair_weekly_limit: { en: `Not sent: already asked ${L.perPairPerWeekMax} times this week`, zh: `没发：这周已经问过 ${L.perPairPerWeekMax} 次` },
  unavailable: { en: 'Not sent: they cannot be asked now', zh: '没发：现在问不到' },
};

export interface TwinFindStartedPerson {
  ref: string;
  label: string;
  route: TwinFindFriendRouteV0;
}

/** The friends just asked, with the names the asker picked them by (the server answers with refs only). */
export function twinFindStartedPeople(
  routes: readonly { ref: string; route: TwinFindFriendRouteV0 }[],
  friends: readonly Pick<TwinFindFriendOptionV0, 'friendRef' | 'label'>[],
): TwinFindStartedPerson[] {
  return routes.map(({ ref, route }) => ({ ref, route, label: friends.find((friend) => friend.friendRef === ref)?.label ?? '' }));
}

// ── The list ─────────────────────────────────────────────────────────────────────

export function twinFindSideWords(role: TwinFindListItemV0['role']): TwinFindWords {
  if (role === 'asker') return { en: 'I asked', zh: '我发起的' };
  if (role === 'bridge') return { en: 'A friend asked me', zh: '朋友问我的' };
  return { en: 'About introducing me', zh: '想介绍我的' };
}

export function twinFindStatusWords(item: Pick<TwinFindListItemV0, 'role' | 'status' | 'needsMe' | 'offers' | 'connected'>): TwinFindWords {
  const connected = item.connected ?? 0;
  if (item.role === 'asker') {
    const offers = item.offers ?? 0;
    if (item.status === 'open' && offers > 0) return { en: offers === 1 ? '1 person is waiting for your answer' : `${offers} people are waiting for your answer`, zh: `${offers} 位等你点头` };
    if (connected > 0) return { en: connected === 1 ? 'Introduced to 1 person' : `Introduced to ${connected} people`, zh: `已牵上 ${connected} 位` };
    return item.status === 'open' ? { en: 'Waiting for your friends', zh: '等朋友回话' } : { en: 'Ended', zh: '已结束' };
  }
  if (item.status !== 'open') return { en: 'Ended', zh: '已结束' };
  if (item.needsMe) return item.role === 'bridge' ? { en: 'Waiting for you', zh: '等你回话' } : { en: 'It is up to you', zh: '等你决定' };
  return { en: 'In progress', zh: '进行中' };
}

/** Which screen opens a list item: the person introduced has their own page, keyed by the friend's row. */
export function twinFindOpenTarget(item: Pick<TwinFindListItemV0, 'role' | 'id' | 'bridgeId'>): { screen: 'detail'; id: string } | { screen: 'intro'; bridgeId: string } | null {
  if (item.role !== 'candidate') return { screen: 'detail', id: item.id };
  return item.bridgeId === null ? null : { screen: 'intro', bridgeId: item.bridgeId };
}

// ── The asker's side ─────────────────────────────────────────────────────────────

export const TWIN_FIND_CLOSED_WORDS: Readonly<Record<TwinFindCloseReasonV0, TwinFindWords>> = {
  asker_closed: { en: 'You ended this question.', zh: '你结束了这次提问。' },
  expired: { en: `Ended after ${OPEN_DAYS} days.`, zh: `满 ${OPEN_DAYS} 天，已自动结束。` },
};

/** One friend's row as the asker sees it. Whom a friend asked, and who said no, is never shown. */
export function twinFindPersonWords(person: Pick<TwinFindPersonV0, 'state'>): TwinFindWords {
  switch (person.state) {
    case 'offered':
      return { en: 'Can introduce you to someone. It is up to you.', zh: '愿意帮你牵线，等你点头。' };
    case 'connected':
      return { en: 'All three of you agreed. Your friend will bring you together.', zh: '三方都同意了，朋友会把你们拉到一起。' };
    case 'passed':
      return { en: 'You said not this time.', zh: '你说了先不用。' };
    case 'none':
      return { en: 'No introduction this time.', zh: '这次没有介绍。' };
    default:
      return { en: 'Waiting for an answer', zh: '等回话' };
  }
}

/** 「阿 May（未验证）」: someone who agreed through a link has no account behind the name. */
export function twinFindOfferNameWords(offer: Pick<TwinFindOfferV0, 'displayName' | 'verified'>): TwinFindWords {
  if (offer.verified) return { en: offer.displayName, zh: offer.displayName };
  return { en: `${offer.displayName} (${TWIN_FIND_UNVERIFIED_LABEL_V0.en})`, zh: `${offer.displayName}（${TWIN_FIND_UNVERIFIED_LABEL_V0.zh}）` };
}

export const TWIN_FIND_UNVERIFIED_WORDS: TwinFindWords = {
  en: 'They agreed through a link your friend forwarded, so the name is what they typed there.',
  zh: '对方是在朋友转发的链接里同意的，称呼是对方自己填的。',
};

export interface TwinFindTally {
  asked: number;
  offered: number;
  connected: number;
}

export function twinFindTally(people: readonly Pick<TwinFindPersonV0, 'state'>[]): TwinFindTally {
  return {
    asked: people.length,
    offered: people.filter((person) => person.state === 'offered').length,
    connected: people.filter((person) => person.state === 'connected').length,
  };
}

export function twinFindTallyWords(tally: TwinFindTally): TwinFindWords {
  return {
    en: `Asked ${tally.asked} · ${tally.offered} waiting for you · ${tally.connected} introduced`,
    zh: `问了 ${tally.asked} 位 · ${tally.offered} 位等你点头 · 已牵上 ${tally.connected} 位`,
  };
}

// ── The friend's side ────────────────────────────────────────────────────────────

export function twinFindBridgeStateWords(state: TwinFindBridgeStateV0, status: 'open' | 'closed'): TwinFindWords {
  switch (state) {
    case 'connected':
      return TWIN_FIND_FIXED_PHRASES_V0.bridgeNext;
    case 'passed':
      return { en: 'The asker said not this time.', zh: '提问的人说这次先不用。' };
    case 'expired':
      return { en: 'This question ended before the introduction was settled.', zh: '还没定下来，提问就结束了。' };
    case 'offered':
      return { en: 'They agreed. Waiting for the asker.', zh: '对方同意了，等提问的人点头。' };
    case 'picked':
      return status === 'open' ? { en: 'Waiting for the person you picked to agree.', zh: '等你选的人点头。' } : { en: 'This question has ended.', zh: '这次提问已经结束了。' };
    case 'c_declined':
      return { en: 'They would rather not this time. You can pick someone else.', zh: '对方这次不方便。可以换一位。' };
    case 'withdrawn':
      return { en: 'You took your introduction back.', zh: '你撤回了这次介绍。' };
    case 'declined':
      return { en: "You said you can't help with this one.", zh: '你说了这次帮不上。' };
    default:
      return status === 'open' ? { en: 'Do you know someone? Pick one person to ask, or say you cannot help.', zh: '有合适的人吗？选一位去问问，或者说这次帮不上。' } : { en: 'This question has ended.', zh: '这次提问已经结束了。' };
  }
}

/** How the person picked is being asked, in the friend's own words for them. */
export function twinFindPickedWords(picked: Pick<TwinFindPickedV0, 'route' | 'label'>): TwinFindWords {
  return picked.route === 'app'
    ? { en: `${picked.label} · asked in the app`, zh: `${picked.label} · 已在站内问` }
    : { en: `${picked.label} · by link, which you forward`, zh: `${picked.label} · 用链接问，你来转发` };
}

export function twinFindPicksLeftWords(picksLeft: number): TwinFindWords {
  return { en: picksLeft === 1 ? 'You can ask 1 more person.' : `You can ask ${picksLeft} more people.`, zh: `还可以再问 ${picksLeft} 位。` };
}

/** What the friend forwards. Only the link: the page itself shows who is asking and what about. */
export function twinFindShareWords(url: string): TwinFindWords {
  return {
    en: `A friend of mine is looking for someone and I thought of you. Whether to be introduced is up to you. Have a look (valid for ${OPEN_DAYS} days): ${url}`,
    zh: `我有位朋友在找人，我想到了你。愿不愿意被介绍由你决定，点开看看（${OPEN_DAYS} 天内有效）：${url}`,
  };
}

export const TWIN_FIND_LINK_ONCE_WORDS: TwinFindWords = {
  en: 'This link is shown once. Forward it to them yourself; if it gets lost, make a new one and the old one stops working.',
  zh: '链接只显示这一次，请你自己转发给对方；弄丢了可以重新生成，旧链接随即失效。',
};

// ── The side of the person introduced ────────────────────────────────────────────

export function twinFindIntroStateWords(state: TwinFindIntroStateV0, status: 'open' | 'closed'): TwinFindWords {
  if (state === 'connected') return { en: 'All three of you agreed. Your friend will bring you together.', zh: '三方都同意了，朋友会把你们拉到一起。' };
  if (state === 'agreed') return { en: 'You agreed. Waiting for the asker. You can take it back until then.', zh: '你同意了，等提问的人点头。在那之前可以撤回。' };
  return status === 'open'
    ? { en: 'It is up to you. If you say no, the asker is not told it was you.', zh: '由你决定。你说不，提问的人不会知道是你。' }
    : { en: 'This question has ended.', zh: '这次提问已经结束了。' };
}

export const TWIN_FIND_CONSENT_WORDS: TwinFindWords = {
  en: 'If you agree, the asker sees the name and the line you write here, nothing else. No contact details are exchanged.',
  zh: '你同意以后，提问的人只看得到你在这里写的称呼和这句话。平台不交换联系方式。',
};
