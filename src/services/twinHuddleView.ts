/**
 * Pure helpers for the twin huddle screens (no React Native import, so jest runs them): the candidate times offered when
 * starting a plan, dates and times in the user's words, the start form turned into a request under the same rules the
 * server applies, words for statuses, problems and the links to forward, and for the detail and settings screens the
 * in-app reply, who can make each proposal and which settings changed.
 */
import {
  TWIN_HUDDLE_DIET_LABELS_V0,
  TWIN_HUDDLE_DIET_TAGS_V0,
  TWIN_HUDDLE_LIMITS_V0,
  decodeTwinHuddleRequestV0,
  twinHuddleCandidatesValidV0,
  twinHuddleGuestRefV0,
  type TwinHuddleAvailabilityV0,
  type TwinHuddleBudgetBandV0,
  type TwinHuddleDecodeResultV0,
  type TwinHuddleDietTagV0,
  type TwinHuddleFriendRouteV0,
  type TwinHuddleKindV0,
  type TwinHuddleListItemV0,
  type TwinHuddlePersonV0,
  type TwinHuddleProfileV0,
  type TwinHuddleProposalV0,
  type TwinHuddleReasonCodeV0,
  type TwinHuddleReplyV0,
  type TwinHuddleRequestV0,
  type TwinHuddleSlotAnswerV0,
} from '../../shared/types/twin-huddle';
import type { TwinPrechatSlotV0 } from '../../shared/types/twin-prechat';
import { TWIN_HUDDLE_FAILURE_COPY, TwinHuddleError } from './twinHuddle';

export type TwinHuddleWords = { en: string; zh: string };

const L = TWIN_HUDDLE_LIMITS_V0;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Times of day offered when starting a plan, in local time; each lasts between the contract's 30 minutes and 12 hours. */
export const TWIN_HUDDLE_DAY_PARTS = [
  { key: 'morning', start: [10, 0], end: [12, 0], words: { en: 'Morning', zh: '上午' } },
  { key: 'lunch', start: [12, 0], end: [13, 30], words: { en: 'Lunch', zh: '中午' } },
  { key: 'afternoon', start: [15, 0], end: [17, 0], words: { en: 'Afternoon', zh: '下午' } },
  { key: 'evening', start: [19, 0], end: [21, 0], words: { en: 'Evening', zh: '晚上' } },
] as const;

export type TwinHuddleDayPart = (typeof TWIN_HUDDLE_DAY_PARTS)[number]['key'];

export interface TwinHuddleSlotOption {
  slot: TwinPrechatSlotV0;
  /** 0 is today. */
  dayOffset: number;
  part: TwinHuddleDayPart;
}

/** The choices for today and the next days that start at least an hour from now. */
export function twinHuddleSlotOptions(now: Date, days = 7): TwinHuddleSlotOption[] {
  const options: TwinHuddleSlotOption[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    for (const part of TWIN_HUDDLE_DAY_PARTS) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, part.start[0], part.start[1]);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, part.end[0], part.end[1]);
      const lead = start.getTime() - now.getTime();
      if (lead < HOUR_MS || lead > L.horizonMs) continue;
      options.push({ slot: { startAt: start.toISOString(), endAt: end.toISOString() }, dayOffset: offset, part: part.key });
    }
  }
  return options;
}

const WEEKDAYS_ZH = '日一二三四五六';
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (value: number): string => String(value).padStart(2, '0');
const clock = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const midnight = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function twinHuddleDayWords(day: Date, now: Date): TwinHuddleWords {
  const offset = Math.round((midnight(day) - midnight(now)) / DAY_MS);
  if (offset === 0) return { en: 'Today', zh: '今天' };
  if (offset === 1) return { en: 'Tomorrow', zh: '明天' };
  return {
    en: `${WEEKDAYS_EN[day.getDay()]} ${day.getDate()} ${MONTHS_EN[day.getMonth()]}`,
    zh: `${day.getMonth() + 1}月${day.getDate()}日 周${WEEKDAYS_ZH[day.getDay()]}`,
  };
}

/** 「明天 19:00–21:00」. The end names its own day only when the slot runs past midnight. */
export function twinHuddleSlotWords(slot: TwinPrechatSlotV0, now: Date): TwinHuddleWords {
  const start = new Date(slot.startAt);
  const end = new Date(slot.endAt);
  const day = twinHuddleDayWords(start, now);
  const endDay = midnight(start) === midnight(end) ? null : twinHuddleDayWords(end, now);
  return {
    en: `${day.en} ${clock(start)}–${endDay ? `${endDay.en} ` : ''}${clock(end)}`,
    zh: `${day.zh} ${clock(start)}–${endDay ? `${endDay.zh} ` : ''}${clock(end)}`,
  };
}

export interface TwinHuddleStartForm {
  kind: TwinHuddleKindV0;
  budget: TwinHuddleBudgetBandV0;
  slots: TwinPrechatSlotV0[];
  friendRefs: string[];
  /** Names typed for people who are not on Agentrix; each gets a link (`guest:1` is the first). */
  guestLabels: string[];
  note: string;
}

/** The request the start form would send, checked with the server's rules plus "every time is still ahead". */
export function twinHuddleRequestFromForm(form: TwinHuddleStartForm, now: Date): TwinHuddleDecodeResultV0<TwinHuddleRequestV0> {
  const candidates = [...form.slots].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const guestLabels = form.guestLabels.map((label) => label.trim()).filter((label) => label.length > 0);
  const note = form.note.trim();
  const decoded = decodeTwinHuddleRequestV0({
    kind: form.kind,
    candidates,
    budget: form.budget,
    friendRefs: form.friendRefs,
    ...(guestLabels.length > 0 ? { guestLabels } : {}),
    ...(note.length > 0 ? { note } : {}),
  });
  if (decoded.ok === false) return decoded;
  if (!twinHuddleCandidatesValidV0(decoded.value.candidates, now.toISOString())) return { ok: false, reasonCode: 'invalid_value', field: 'request.candidates' };
  return decoded;
}

/** What to tell the organizer when the form, or the server applying the same rules, says no. */
export function twinHuddleProblemWords(reasonCode: TwinHuddleReasonCodeV0 | null, field: string | null): TwinHuddleWords {
  const at = field === null ? '' : field;
  if (at.endsWith('note') && reasonCode === 'text_violation') {
    return { en: 'The note cannot contain money, contact details, an address or a link. Please change it.', zh: '备注里不能有钱数、联系方式、地址或链接，请改一下。' };
  }
  if (at.endsWith('note') && reasonCode === 'too_long') return { en: `The note can be at most ${L.noteMax} characters.`, zh: `备注最多 ${L.noteMax} 个字。` };
  if (at.includes('candidates')) {
    const days = Math.round(L.horizonMs / DAY_MS);
    return { en: `Pick 1 to ${L.candidatesMax} times, all within the next ${days} days.`, zh: `候选时间要选 1 到 ${L.candidatesMax} 个，都在今后 ${days} 天内。` };
  }
  if (at.includes('friendRefs') || at.includes('guestLabels')) {
    return {
      en: `Invite 1 to ${L.friendsMax} people. For someone not on Agentrix a name is enough: up to ${L.guestLabelMax} characters, no repeats.`,
      zh: `要约 1 到 ${L.friendsMax} 个人。没注册的朋友填个称呼就行：最多 ${L.guestLabelMax} 个字，不要重复。`,
    };
  }
  return TWIN_HUDDLE_FAILURE_COPY.invalid;
}

export interface TwinHuddleLabelledLink {
  ref: string;
  url: string;
  label: string;
}

/** Who each returned link is for: friends by their label, link seats by the name typed in. */
export function twinHuddleLinkLabels(
  links: readonly { ref: string; url: string }[],
  friends: readonly { friendRef: string; label: string }[],
  guestLabels: readonly string[],
): TwinHuddleLabelledLink[] {
  return links.map((link) => {
    const friend = friends.find((item) => item.friendRef === link.ref);
    if (friend) return { ...link, label: friend.label };
    const seat = guestLabels.findIndex((_, index) => twinHuddleGuestRefV0(index) === link.ref);
    return { ...link, label: seat >= 0 ? guestLabels[seat] : link.ref };
  });
}

/**
 * People fixed before the form opens: the two a friend brought together (twinFindView.ts `twinFindMeetOffer`). The form
 * shows them and does not let them be changed; what and when is still picked by hand.
 */
export interface TwinHuddleStartPreset {
  from: 'find';
  friends: { ref: string; label: string }[];
  guestLabels: string[];
}

export interface TwinHuddlePresetPerson {
  key: string;
  label: string;
  /** False when this person was not asked this time: the plan went ahead without them. */
  asked: boolean;
  words: TwinHuddleWords;
}

const PRESET_ROUTE_WORDS: Readonly<Record<TwinHuddleFriendRouteV0, TwinHuddleWords>> = {
  twin: { en: 'Their twin answers from their calendar', zh: '对方的分身按日历回答' },
  owner: { en: 'Asked in the app', zh: '已在 App 里请本人选' },
  link: { en: 'Picks by the link you forward', zh: '要你把链接转给对方' },
  pair_weekly_limit: { en: 'Not asked: the two of you have reached this week’s limit', zh: '没有去问：你和这位本周已经约满了' },
  unavailable: { en: 'Not asked: they cannot be reached right now', zh: '没有去问：这位现在约不到' },
};

/**
 * After starting with fixed people: what happened for each of them. A plan goes ahead even when one friend cannot be
 * asked, so the page has to say who that was instead of only 「分身去商量了」.
 */
export function twinHuddlePresetPeople(preset: TwinHuddleStartPreset, routes: readonly { ref: string; route: TwinHuddleFriendRouteV0 }[]): TwinHuddlePresetPerson[] {
  const friends = preset.friends.map((friend): TwinHuddlePresetPerson => {
    const found = routes.find((item) => item.ref === friend.ref);
    const route = found ? found.route : 'unavailable';
    return { key: friend.ref, label: friend.label, asked: route === 'twin' || route === 'owner' || route === 'link', words: PRESET_ROUTE_WORDS[route] };
  });
  const guests = preset.guestLabels.map((label, index): TwinHuddlePresetPerson => ({ key: twinHuddleGuestRefV0(index), label, asked: true, words: PRESET_ROUTE_WORDS.link }));
  return [...friends, ...guests];
}

/** The message that goes out with a forwarded link. */
export function twinHuddleShareWords(url: string): TwinHuddleWords {
  return { en: `I'm making plans. Open this and pick the times that work for you: ${url}`, zh: `我在约时间，点开选一下哪个时间你行：${url}` };
}

export function twinHuddleStatusWords(item: Pick<TwinHuddleListItemV0, 'role' | 'status' | 'needsMe'>): TwinHuddleWords {
  switch (item.status) {
    case 'collecting':
      if (item.role === 'initiator') return { en: 'Collecting times', zh: '在收大家的时间' };
      return item.needsMe ? { en: 'Pick your times', zh: '等你选时间' } : { en: 'Waiting for the others', zh: '等其他人' };
    case 'choosing':
      return item.role === 'initiator' ? { en: 'Answers are in. Pick a time', zh: '时间收齐了，等你选' } : { en: 'Waiting for the organizer to pick', zh: '等发起人选时间' };
    case 'confirming':
      return item.needsMe ? { en: 'Are you coming?', zh: '等你确认来不来' } : { en: 'Waiting for everyone to confirm', zh: '等大家确认' };
    case 'settled':
      return { en: 'Settled', zh: '定了' };
    case 'cancelled':
      return { en: 'Cancelled', zh: '取消了' };
    case 'expired':
      return { en: 'Ended without a time', zh: '没定下来' };
    default:
      return { en: 'Draft', zh: '草稿' };
  }
}

/** Words for any error from the twin huddle client; a field problem says what to fix. */
export function twinHuddleFailureWords(error: unknown): TwinHuddleWords {
  if (!(error instanceof TwinHuddleError)) return TWIN_HUDDLE_FAILURE_COPY.unavailable;
  return error.failure === 'invalid' ? twinHuddleProblemWords(error.reasonCode, error.field) : TWIN_HUDDLE_FAILURE_COPY[error.failure];
}

/** When the current stage closes: 「明天 19:00 前」. Null once the plan is over. */
export function twinHuddleDeadlineWords(stageEndsAt: string | null, now: Date): TwinHuddleWords | null {
  if (!stageEndsAt) return null;
  const end = new Date(stageEndsAt);
  const day = twinHuddleDayWords(end, now);
  return { en: `Until ${day.en} ${clock(end)}`, zh: `${day.zh} ${clock(end)} 前` };
}

/** How the initiator's twin reaches each person asked. */
export const TWIN_HUDDLE_ROUTE_WORDS: Readonly<Record<TwinHuddlePersonV0['route'], TwinHuddleWords>> = {
  twin: { en: 'Their twin answers from their calendar', zh: '对方的分身按日历回答' },
  owner: { en: 'Picks in the app', zh: '本人在 App 里选' },
  link: { en: 'Picks by link', zh: '用链接选' },
};

/** One time in an invited person's answer, from their own side. */
export const TWIN_HUDDLE_ANSWER_WORDS: Readonly<Record<TwinHuddleAvailabilityV0, TwinHuddleWords>> = {
  yes: { en: 'Works', zh: '行' },
  no: { en: "Doesn't work", zh: '不行' },
  needs_owner: { en: 'Your twin left this to you', zh: '分身没答，等你来选' },
};

/** The initiator's names for these refs, in the same order; refs no longer in the plan are left out. */
export function twinHuddlePeopleLabels(refs: readonly string[], people: readonly TwinHuddlePersonV0[]): string[] {
  const labels: string[] = [];
  for (const ref of refs) {
    const person = people.find((item) => item.ref === ref);
    if (person) labels.push(person.label);
  }
  return labels;
}

/** Who can make one proposed time. */
export function twinHuddleProposalWords(proposal: TwinHuddleProposalV0, people: readonly TwinHuddlePersonV0[]): TwinHuddleWords {
  if (proposal.everyone) return { en: 'Everyone can come', zh: '大家都行' };
  const names = twinHuddlePeopleLabels(proposal.attendees, people);
  return { en: `${names.length} can come: ${names.join(', ')}`, zh: `${names.length} 人能来：${names.join('、')}` };
}

export function twinHuddleDietWords(tags: readonly TwinHuddleDietTagV0[]): TwinHuddleWords {
  return {
    en: `Diet: ${tags.map((tag) => TWIN_HUDDLE_DIET_LABELS_V0[tag].en).join(', ')}`,
    zh: `忌口：${tags.map((tag) => TWIN_HUDDLE_DIET_LABELS_V0[tag].zh).join('、')}`,
  };
}

export type TwinHuddlePicks = Readonly<Record<number, 'yes' | 'no'>>;

/** Where an in-app answer starts: every time already answered yes or no, by the person or their twin. */
export function twinHuddlePicksFromAnswer(answer: readonly TwinHuddleSlotAnswerV0[] | null): TwinHuddlePicks {
  const picks: Record<number, 'yes' | 'no'> = {};
  for (const slot of answer ?? []) if (slot.value === 'yes' || slot.value === 'no') picks[slot.candidate] = slot.value;
  return picks;
}

/** The in-app reply: a yes or no for every candidate, or null while any is still open. */
export function twinHuddleReplyFromPicks(candidateCount: number, picks: TwinHuddlePicks): TwinHuddleReplyV0['slots'] | null {
  const slots: TwinHuddleReplyV0['slots'] = [];
  for (let candidate = 0; candidate < candidateCount; candidate += 1) {
    const value = picks[candidate];
    if (value !== 'yes' && value !== 'no') return null;
    slots.push({ candidate, value });
  }
  return slots;
}

/** Daily limits offered in settings; 0 pauses invitations and the top one is the contract's ceiling. */
export const TWIN_HUDDLE_DAILY_CAP_CHOICES = [0, 1, 3, 5, L.perFriendPerDayMax] as const;

export function twinHuddleDailyCapWords(cap: number): TwinHuddleWords {
  return cap === 0 ? { en: 'Pause', zh: '先不接' } : { en: `${cap} a day`, zh: `${cap} 次` };
}

/** Only the settings that changed, diet tags in the contract's order; null when nothing changed. */
export function twinHuddleProfilePatch(before: TwinHuddleProfileV0, after: TwinHuddleProfileV0): Partial<TwinHuddleProfileV0> | null {
  const patch: Partial<TwinHuddleProfileV0> = {};
  if (after.optIn !== before.optIn) patch.optIn = after.optIn;
  if (after.dailyCap !== before.dailyCap) patch.dailyCap = after.dailyCap;
  if (after.budgetMax !== before.budgetMax) patch.budgetMax = after.budgetMax;
  const tags = TWIN_HUDDLE_DIET_TAGS_V0.filter((tag) => after.dietTags.includes(tag));
  if (tags.join(',') !== before.dietTags.join(',')) patch.dietTags = tags;
  return Object.keys(patch).length > 0 ? patch : null;
}
