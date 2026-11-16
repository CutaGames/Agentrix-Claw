/**
 * Pure helpers for the twin-ask screens (no React Native import, so jest runs them): the start form, the in-app answer and
 * the friend facts turned into requests under the same rules the server applies; words for problems, statuses, routes,
 * answers and times; who each person asked is; and for settings the daily limits, the facts by topic and what saving a
 * tier's topics would change.
 */
import {
  TWIN_ASK_ANSWERED_BY_LABELS_V0,
  TWIN_ASK_LIMITS_V0,
  TWIN_ASK_TOPIC_LABELS_V0,
  TWIN_ASK_TWIN_TOPICS_V0,
  decodeTwinAskReplyV0,
  decodeTwinAskRequestV0,
  decodeTwinFriendFactInputV0,
  twinAskGuestRefV0,
  type TwinAskCloseReasonV0,
  type TwinAskDecodeResultV0,
  type TwinAskFriendOptionV0,
  type TwinAskInvitedViewV0,
  type TwinAskListItemV0,
  type TwinAskPersonV0,
  type TwinAskProfileV0,
  type TwinAskPublicRouteV0,
  type TwinAskReasonCodeV0,
  type TwinAskReplyV0,
  type TwinAskRequestV0,
  type TwinAskSharingTierV0,
  type TwinAskStatusV0,
  type TwinAskTopicV0,
  type TwinAskTwinTopicV0,
  type TwinFriendFactInputV0,
  type TwinFriendFactV0,
} from '../../shared/types/twin-ask';
import type { StepUpReasonCopyV0 } from './stepUp';
import {
  TWIN_ASK_FAILURE_COPY,
  TWIN_ASK_STEP_UP_COPY,
  TwinAskError,
  type MobileTwinAskStartOutcome,
  type TwinAskSharingSaveResult,
} from './twinAsk';

export type TwinAskWords = { en: string; zh: string };

const L = TWIN_ASK_LIMITS_V0;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const OPEN_HOURS = Math.round(L.openMs / HOUR_MS);
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number): string => String(value).padStart(2, '0');
const clock = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const midnight = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** 「今天 09:30」「昨天 21:00」「11月14日 18:05」, in local time. */
export function twinAskWhenWords(at: Date, now: Date): TwinAskWords {
  const offset = Math.round((midnight(at) - midnight(now)) / DAY_MS);
  const time = clock(at);
  if (offset === 0) return { en: `Today ${time}`, zh: `今天 ${time}` };
  if (offset === -1) return { en: `Yesterday ${time}`, zh: `昨天 ${time}` };
  if (offset === 1) return { en: `Tomorrow ${time}`, zh: `明天 ${time}` };
  return { en: `${at.getDate()} ${MONTHS_EN[at.getMonth()]} ${time}`, zh: `${at.getMonth() + 1}月${at.getDate()}日 ${time}` };
}

/** 「还剩 5 小时」 while the question is open; null once it has ended. */
export function twinAskTimeLeftWords(endsAt: string, now: Date): TwinAskWords | null {
  const left = Date.parse(endsAt) - now.getTime();
  if (!(left > 0)) return null;
  if (left < HOUR_MS) {
    const minutes = Math.max(1, Math.ceil(left / MINUTE_MS));
    return { en: `${minutes} min left`, zh: `还剩 ${minutes} 分钟` };
  }
  const hours = Math.floor(left / HOUR_MS);
  return { en: `${hours} h left`, zh: `还剩 ${hours} 小时` };
}

export interface TwinAskStartForm {
  topic: TwinAskTopicV0;
  question: string;
  friendRefs: string[];
  /** Names typed for people who are not on Agentrix; each gets a link (`guest:1` is the first). */
  guestLabels: string[];
}

/** The request the start form would send, checked with the server's rules. */
export function twinAskRequestFromForm(form: TwinAskStartForm): TwinAskDecodeResultV0<TwinAskRequestV0> {
  const guestLabels = form.guestLabels.map((label) => label.trim()).filter((label) => label.length > 0);
  return decodeTwinAskRequestV0({
    topic: form.topic,
    question: form.question,
    friendRefs: form.friendRefs,
    ...(guestLabels.length > 0 ? { guestLabels } : {}),
  });
}

/** Shown on the start form while the question is one only the friends themselves may answer. */
export const TWIN_ASK_OWNER_ONLY_WORDS: TwinAskWords = {
  en: "Twins don't answer this kind of question. Each friend is asked in person.",
  zh: '这类问题分身不代答，会直接请朋友本人回答。',
};

const BLOCKED_TEXT = "contact details, links, addresses or children's names";
const BLOCKED_TEXT_ZH = '联系方式、链接、地址或孩子的名字';

/**
 * What to tell the user when a form, or the server applying the same rules, says no. Answers are checked as `reply.*`
 * on the phone and `body.*` on the server.
 */
export function twinAskProblemWords(reasonCode: TwinAskReasonCodeV0 | null, field: string | null): TwinAskWords {
  const at = field === null ? '' : field;
  if (at.endsWith('question')) {
    if (reasonCode === 'too_long') return { en: `The question can be at most ${L.questionMax} characters.`, zh: `问题最多 ${L.questionMax} 个字。` };
    if (reasonCode === 'text_violation') return { en: `The question can't include ${BLOCKED_TEXT}. Please change it.`, zh: `问题里不能有${BLOCKED_TEXT_ZH}，请改一下。` };
    return { en: 'Please write your question first.', zh: '请先写下要问的问题。' };
  }
  if (at.endsWith('saveAsFact')) {
    return {
      en: "An answer kept for your twin can't mention money. Untick keeping it, or change the answer.",
      zh: '要留给分身用的回答不能提到钱。可以不勾「以后让分身用这句」，或者改一下回答。',
    };
  }
  if (at === 'reply.text' || at === 'body.text') {
    if (reasonCode === 'too_long') return { en: `An answer can be at most ${L.replyMax} characters.`, zh: `回答最多 ${L.replyMax} 个字。` };
    if (reasonCode === 'text_violation') return { en: `An answer can't include ${BLOCKED_TEXT}. Please change it.`, zh: `回答里不能有${BLOCKED_TEXT_ZH}，请改一下。` };
    return { en: 'Please write your answer first.', zh: '请先写下回答。' };
  }
  if (at.startsWith('fact')) {
    if (at.endsWith('topic')) return { en: 'Pick a topic first.', zh: '请先选一个话题。' };
    if (reasonCode === 'too_long') return { en: `An entry can be at most ${L.factMax} characters.`, zh: `一条最多 ${L.factMax} 个字。` };
    if (reasonCode === 'text_violation') return { en: `An entry can't include money, ${BLOCKED_TEXT}.`, zh: `条目里不能有钱数、${BLOCKED_TEXT_ZH}。` };
    return { en: 'Please write the entry first.', zh: '请先写下要告诉朋友的话。' };
  }
  if (at.includes('guestLabels') && reasonCode === 'text_violation') {
    return { en: `A name can't include ${BLOCKED_TEXT}.`, zh: `称呼里不能有${BLOCKED_TEXT_ZH}。` };
  }
  if (at.includes('friendRefs') || at.includes('guestLabels')) {
    return {
      en: `Ask 1 to ${L.peopleMax} people. For someone not on Agentrix a name is enough, up to ${L.guestLabelMax} characters.`,
      zh: `要问 1 到 ${L.peopleMax} 个人。没注册的朋友填个称呼就行，最多 ${L.guestLabelMax} 个字。`,
    };
  }
  if (at.includes('dailyCap')) return { en: `Pick 0 to ${L.perFriendPerDayMax} a day.`, zh: `每天 0 到 ${L.perFriendPerDayMax} 次。` };
  return TWIN_ASK_FAILURE_COPY.invalid;
}

/** Words for any error from the twin-ask client; a field problem says what to fix. */
export function twinAskFailureWords(error: unknown): TwinAskWords {
  if (!(error instanceof TwinAskError)) return TWIN_ASK_FAILURE_COPY.unavailable;
  return error.failure === 'invalid' ? twinAskProblemWords(error.reasonCode, error.field) : TWIN_ASK_FAILURE_COPY[error.failure];
}

/** How each person was asked, from the asker's side: whether a twin or the person answers is not shown. */
export const TWIN_ASK_ROUTE_WORDS: Readonly<Record<TwinAskPublicRouteV0, TwinAskWords>> = {
  app: { en: 'Asked in the app', zh: '站内问' },
  link: { en: 'By link, which you forward', zh: '用链接问，你来转发' },
  pair_weekly_limit: { en: `Not sent: already asked ${L.perPairPerWeekMax} times this week`, zh: `没发：这周已经问过 ${L.perPairPerWeekMax} 次` },
  unavailable: { en: 'Not sent: they cannot be asked now', zh: '没发：现在问不到' },
};

export interface TwinAskStartedPerson {
  ref: string;
  label: string;
  route: TwinAskPublicRouteV0;
  /** The link to forward, for people reached by link; it is shown only this once. */
  url: string | null;
}

/** Friends by their label, link seats by the name typed in, anything else by its ref. */
export function twinAskRefLabel(
  ref: string,
  friends: readonly Pick<TwinAskFriendOptionV0, 'friendRef' | 'label'>[],
  guestLabels: readonly string[],
): string {
  const friend = friends.find((item) => item.friendRef === ref);
  if (friend) return friend.label;
  const seat = guestLabels.findIndex((_, index) => twinAskGuestRefV0(index) === ref);
  return seat >= 0 ? guestLabels[seat] : ref;
}

/** Everyone the question went to, in the server's order, each with how they were asked and the link to forward if any. */
export function twinAskStartedPeople(
  outcome: Extract<MobileTwinAskStartOutcome, { started: true }>,
  friends: readonly Pick<TwinAskFriendOptionV0, 'friendRef' | 'label'>[],
  guestLabels: readonly string[],
): TwinAskStartedPerson[] {
  return outcome.routes.map((item) => {
    const link = outcome.links.find((entry) => entry.ref === item.ref);
    return { ref: item.ref, label: twinAskRefLabel(item.ref, friends, guestLabels), route: item.route, url: link ? link.url : null };
  });
}

/** The message that goes out with a forwarded link. */
export function twinAskShareWords(url: string): TwinAskWords {
  return { en: `I have a quick question for you. Open this to answer, no sign-up needed: ${url}`, zh: `想问你个事，点开就能回答，不用注册：${url}` };
}

export function twinAskSideWords(role: TwinAskListItemV0['role']): TwinAskWords {
  return role === 'asker' ? { en: 'You asked', zh: '我问的' } : { en: 'Asked you', zh: '问我的' };
}

/** One line for a question in the list: answers so far for the asker, whether it waits on me for the person asked. */
export function twinAskStatusWords(item: Pick<TwinAskListItemV0, 'role' | 'status' | 'answered' | 'people' | 'needsMe'>): TwinAskWords {
  if (item.role === 'asker') {
    const count =
      item.answered !== null && item.people !== null
        ? { en: `${item.answered} of ${item.people} answered`, zh: `${item.answered}/${item.people} 人回答了` }
        : null;
    if (item.status === 'open') return count ?? { en: 'Waiting for answers', zh: '在等回答' };
    return count ? { en: `Ended · ${count.en}`, zh: `结束了 · ${count.zh}` } : { en: 'Ended', zh: '结束了' };
  }
  if (item.status === 'closed') return { en: 'Ended', zh: '结束了' };
  return item.needsMe ? { en: 'Waiting for your answer', zh: '等你回答' } : { en: 'Open', zh: '进行中' };
}

// ── The summary card (asker) ──

/** One person's line on the summary card: who answered, or that no answer came. */
export function twinAskPersonWords(person: Pick<TwinAskPersonV0, 'state' | 'answeredBy'>): TwinAskWords {
  if (person.state === 'answered') return person.answeredBy ? TWIN_ASK_ANSWERED_BY_LABELS_V0[person.answeredBy] : { en: 'Answered', zh: '已回答' };
  return person.state === 'waiting' ? { en: 'Not answered yet', zh: '还没回答' } : { en: 'No answer', zh: '没有回答' };
}

export interface TwinAskTally {
  answered: number;
  total: number;
  twin: number;
  owner: number;
  guest: number;
}

export function twinAskTally(people: readonly Pick<TwinAskPersonV0, 'state' | 'answeredBy'>[]): TwinAskTally {
  const tally: TwinAskTally = { answered: 0, total: people.length, twin: 0, owner: 0, guest: 0 };
  for (const person of people) {
    if (person.state !== 'answered') continue;
    tally.answered += 1;
    if (person.answeredBy) tally[person.answeredBy] += 1;
  }
  return tally;
}

/** 「3/5 人回答了 · 分身转述 1 · 本人回答 1 · 未验证 1」, leaving out kinds nobody used. */
export function twinAskTallyWords(tally: TwinAskTally): TwinAskWords {
  const kinds = (['twin', 'owner', 'guest'] as const).filter((kind) => tally[kind] > 0);
  return {
    en: [`${tally.answered} of ${tally.total} answered`, ...kinds.map((kind) => `${TWIN_ASK_ANSWERED_BY_LABELS_V0[kind].en} ${tally[kind]}`)].join(' · '),
    zh: [`${tally.answered}/${tally.total} 人回答了`, ...kinds.map((kind) => `${TWIN_ASK_ANSWERED_BY_LABELS_V0[kind].zh} ${tally[kind]}`)].join(' · '),
  };
}

export const TWIN_ASK_CLOSED_WORDS: Readonly<Record<TwinAskCloseReasonV0, TwinAskWords>> = {
  all_answered: { en: 'Ended: everyone answered', zh: '结束了：大家都回答了' },
  asker_closed: { en: 'Ended early by you', zh: '结束了：你提前结束了' },
  expired: { en: `Ended after ${OPEN_HOURS} hours`, zh: `结束了：${OPEN_HOURS} 小时到了` },
};

/** The platform's signed receipt, once the question has ended; null while it is open. */
export function twinAskReceiptWords(view: { status: TwinAskStatusV0; receiptSigned: boolean }): TwinAskWords | null {
  if (view.status !== 'closed') return null;
  return view.receiptSigned
    ? { en: 'The platform has signed a receipt for these answers.', zh: '平台已为这些回答签发回执。' }
    : { en: 'The platform receipt is not signed yet; it is retried daily.', zh: '平台回执还没签上，每天会补签。' };
}

/** The asker's name for a ref, or the ref itself when the person is no longer listed. */
export function twinAskPersonLabel(ref: string, people: readonly Pick<TwinAskPersonV0, 'ref' | 'label'>[]): string {
  const person = people.find((item) => item.ref === ref);
  return person ? person.label : ref;
}

/** A fresh link can replace a lost one only for someone asked by link who has not answered, while the question is open. */
export function twinAskCanRelink(
  view: { status: TwinAskStatusV0; endsAt: string },
  person: Pick<TwinAskPersonV0, 'via' | 'state'>,
  now: Date,
): boolean {
  return view.status === 'open' && Date.parse(view.endsAt) > now.getTime() && person.via === 'link' && person.state === 'waiting';
}

// ── The person asked ──

export function twinAskMyStateWords(view: Pick<TwinAskInvitedViewV0, 'myState' | 'answeredBy'>): TwinAskWords {
  switch (view.myState) {
    case 'twin_pending':
      return { en: 'Your twin is checking whether what you wrote answers it', zh: '分身在看你写好的话能不能回答' };
    case 'needs_me':
      return { en: 'Waiting for your answer', zh: '等你回答' };
    case 'answered':
      return view.answeredBy === 'twin' ? { en: 'Your twin answered with what you wrote', zh: '分身用你写好的话替你答了' } : { en: 'You answered', zh: '你回答了' };
    case 'declined':
      return { en: 'You chose not to answer', zh: '你选了不回答' };
    default:
      return { en: 'You withdrew the answer', zh: '你撤回了回答' };
  }
}

/** The in-app answer; keeping it for the twin is only sent when ticked and allowed for this topic. */
export function twinAskReplyFromForm(text: string, keep: boolean, canKeep: boolean): TwinAskDecodeResultV0<TwinAskReplyV0> {
  return decodeTwinAskReplyV0(keep && canKeep ? { text, saveAsFact: true } : { text }, canKeep);
}

// ── Settings ──

/** Daily limits offered in settings; 0 pauses questions and the top one is the platform's ceiling. */
export const TWIN_ASK_DAILY_CAP_CHOICES = [0, 1, 3, 5, L.perFriendPerDayMax] as const;

export function twinAskDailyCapWords(cap: number): TwinAskWords {
  return cap === 0 ? { en: 'Pause', zh: '先不接' } : { en: `${cap} a day`, zh: `${cap} 次` };
}

/** Only the settings that changed; null when nothing did. */
export function twinAskProfilePatch(before: TwinAskProfileV0, after: TwinAskProfileV0): Partial<TwinAskProfileV0> | null {
  const patch: Partial<TwinAskProfileV0> = {};
  if (after.optIn !== before.optIn) patch.optIn = after.optIn;
  if (after.dailyCap !== before.dailyCap) patch.dailyCap = after.dailyCap;
  return Object.keys(patch).length > 0 ? patch : null;
}

export function twinAskFactFromForm(topic: TwinAskTwinTopicV0 | null, text: string): TwinAskDecodeResultV0<TwinFriendFactInputV0> {
  return decodeTwinFriendFactInputV0({ topic, text });
}

/** Facts grouped by topic in the contract's order; topics without facts are left out. */
export function twinAskFactsByTopic(facts: readonly TwinFriendFactV0[]): { topic: TwinAskTwinTopicV0; facts: TwinFriendFactV0[] }[] {
  return TWIN_ASK_TWIN_TOPICS_V0.map((topic) => ({ topic, facts: facts.filter((fact) => fact.topic === topic) })).filter((group) => group.facts.length > 0);
}

/** Whether one more fact on this topic fits under both limits (leave out the one being edited). */
export function twinAskFactFits(facts: readonly Pick<TwinFriendFactV0, 'topic'>[], topic: TwinAskTwinTopicV0): boolean {
  return facts.length < L.factsMax && facts.filter((fact) => fact.topic === topic).length < L.factsPerTopicMax;
}

export interface TwinAskSharingChange {
  added: TwinAskTwinTopicV0[];
  removed: TwinAskTwinTopicV0[];
}

/** What a tier's picked topics change against what is saved, in topic order; null when nothing does. */
export function twinAskSharingChange(saved: Pick<TwinAskSharingTierV0, 'topics'>, picked: readonly TwinAskTwinTopicV0[]): TwinAskSharingChange | null {
  const added = TWIN_ASK_TWIN_TOPICS_V0.filter((topic) => picked.includes(topic) && !saved.topics.includes(topic));
  const removed = TWIN_ASK_TWIN_TOPICS_V0.filter((topic) => !picked.includes(topic) && saved.topics.includes(topic));
  return added.length > 0 || removed.length > 0 ? { added, removed } : null;
}

/** Asked before a tier is widened: which topics its friends may now get your entries on. */
export function twinAskWidenWords(tier: TwinAskWords, added: readonly TwinAskTwinTopicV0[]): TwinAskWords {
  const en = added.map((topic) => TWIN_ASK_TOPIC_LABELS_V0[topic].en).join(', ');
  const zh = added.map((topic) => TWIN_ASK_TOPIC_LABELS_V0[topic].zh).join('、');
  return {
    en: `When friends in "${tier.en}" ask about ${en}, your twin may pass on what you wrote on those topics.`,
    zh: `「${tier.zh}」这一档的朋友问到${zh}时，分身可以转述你写的相关条目。`,
  };
}

/** The reason shown in the sign-in check before a tier is widened. */
export const TWIN_ASK_SHARING_STEP_UP_REASON: StepUpReasonCopyV0 = {
  title: { en: 'Confirm sharing more', zh: '确认多告诉朋友一些' },
  why: { en: 'Once saved, your twin may pass on what you wrote to more friends.', zh: '保存以后，分身可以把你写的条目转述给更多朋友。' },
};

export function twinAskSharingSaveWords(result: TwinAskSharingSaveResult): TwinAskWords {
  if (result.kind === 'saved') return { en: 'Saved.', zh: '已保存。' };
  const failure = result.failure;
  if (failure === 'step_up_cancelled' || failure === 'step_up_again') return TWIN_ASK_STEP_UP_COPY[failure];
  return TWIN_ASK_FAILURE_COPY[failure];
}
