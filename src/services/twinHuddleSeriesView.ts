/**
 * Pure helpers for the weekly plan screens (no React Native import, so jest runs them): the first times offered, the
 * request the start form sends, and the words for what a weekly plan is waiting for. Times are shown in the phone's own
 * time zone, like the twin huddle screens (twinHuddleView.ts).
 */
import {
  TWIN_HUDDLE_SERIES_LIMITS_V0,
  TWIN_HUDDLE_SERIES_SKIP_LABELS_V0,
  decodeTwinHuddleSeriesRequestV0,
  twinHuddleSeriesFirstValidV0,
  type TwinHuddleSeriesDecodeResultV0,
  type TwinHuddleSeriesFriendRouteV0,
  type TwinHuddleSeriesListItemV0,
  type TwinHuddleSeriesNextV0,
  type TwinHuddleSeriesRequestV0,
  type TwinHuddleSeriesRunV0,
} from '../../shared/types/twin-huddle-series';
import type { TwinHuddleBudgetBandV0, TwinHuddleKindV0, TwinHuddleReasonCodeV0 } from '../../shared/types/twin-huddle';
import type { TwinPrechatSlotV0 } from '../../shared/types/twin-prechat';
import { TWIN_HUDDLE_FAILURE_COPY, TwinHuddleError } from './twinHuddle';
import { twinHuddleDayWords, twinHuddleProblemWords, twinHuddleSlotOptions, twinHuddleSlotWords, type TwinHuddleSlotOption, type TwinHuddleWords } from './twinHuddleView';

const L = TWIN_HUDDLE_SERIES_LIMITS_V0;
const HOUR_MS = 60 * 60 * 1000;
const WEEKDAYS_ZH = '日一二三四五六';
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (value: number): string => String(value).padStart(2, '0');
const clock = (date: Date): string => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** First times to choose from: eight days, so every weekday and time of day is there once today's early ones drop out. */
export function twinHuddleSeriesSlotOptions(now: Date): TwinHuddleSlotOption[] {
  return twinHuddleSlotOptions(now, 8).filter((option) => twinHuddleSeriesFirstValidV0(option.slot, now.toISOString()));
}

/** 「每周三 19:00–21:00」. */
export function twinHuddleSeriesWeeklyWords(first: TwinPrechatSlotV0): TwinHuddleWords {
  const start = new Date(first.startAt);
  const hours = `${clock(start)}–${clock(new Date(first.endAt))}`;
  return { en: `Every ${WEEKDAYS_EN[start.getDay()]} ${hours}`, zh: `每周${WEEKDAYS_ZH[start.getDay()]} ${hours}` };
}

export interface TwinHuddleSeriesStartForm {
  kind: TwinHuddleKindV0;
  budget: TwinHuddleBudgetBandV0;
  first: TwinPrechatSlotV0 | null;
  friendRefs: string[];
  note: string;
  /** "When everyone can make it, don't ask me to pick the time." */
  auto: boolean;
}

/** The request the start form would send, checked with the server's rules plus "the first time is far enough ahead". */
export function twinHuddleSeriesRequestFromForm(form: TwinHuddleSeriesStartForm, now: Date): TwinHuddleSeriesDecodeResultV0<TwinHuddleSeriesRequestV0> {
  if (form.first === null) return { ok: false, reasonCode: 'missing_field', field: 'request.first' };
  const note = form.note.trim();
  const decoded = decodeTwinHuddleSeriesRequestV0({
    kind: form.kind,
    first: form.first,
    budget: form.budget,
    friendRefs: form.friendRefs,
    auto: form.auto,
    ...(note.length > 0 ? { note } : {}),
  });
  if (decoded.ok === false) return decoded;
  if (!twinHuddleSeriesFirstValidV0(decoded.value.first, now.toISOString())) return { ok: false, reasonCode: 'invalid_value', field: 'request.first' };
  return decoded;
}

/** What to tell the organizer when the form, or the server applying the same rules, says no. */
export function twinHuddleSeriesProblemWords(reasonCode: TwinHuddleReasonCodeV0 | null, field: string | null): TwinHuddleWords {
  const at = field === null ? '' : field;
  if (at.includes('first')) {
    const hours = L.minNoticeMs / HOUR_MS;
    return { en: `Pick the first time, at least ${hours} hours from now.`, zh: `选一个第一次的时间，至少在 ${hours} 小时以后。` };
  }
  if (at.includes('friendRefs')) {
    return { en: `Invite 1 to ${L.friendsMax} friends from your relationship book.`, zh: `要约 1 到 ${L.friendsMax} 位关系簿里的朋友。` };
  }
  return twinHuddleProblemWords(reasonCode, field);
}

const NOT_FOUND: TwinHuddleWords = { en: 'Weekly plans are not open yet, or this one is gone.', zh: '每周固定还没开放，或者这一件已经不在了。' };

/** Words for any error from the weekly plan client; a field problem says what to fix. */
export function twinHuddleSeriesFailureWords(error: unknown): TwinHuddleWords {
  if (!(error instanceof TwinHuddleError)) return TWIN_HUDDLE_FAILURE_COPY.unavailable;
  if (error.failure === 'invalid') return twinHuddleSeriesProblemWords(error.reasonCode, error.field);
  return error.failure === 'not_found' ? NOT_FOUND : TWIN_HUDDLE_FAILURE_COPY[error.failure];
}

/** One line for the list: what this weekly plan is waiting for. */
export function twinHuddleSeriesStatusWords(item: Pick<TwinHuddleSeriesListItemV0, 'role' | 'status' | 'needsMe' | 'nextStartAt'>, now: Date): TwinHuddleWords {
  if (item.role === 'member' && item.needsMe) return { en: 'Join or not?', zh: '等你决定加不加入' };
  if (item.status === 'ended') return item.needsMe ? { en: 'The term is over. Renew?', zh: '这一期开完了，要不要续' } : { en: 'Ended', zh: '已结束' };
  if (item.nextStartAt === null) return { en: 'No next time', zh: '没有下一次了' };
  const day = twinHuddleDayWords(new Date(item.nextStartAt), now);
  return { en: `Next: ${day.en}`, zh: `下一次：${day.zh}` };
}

/** The next time and when that week's plan opens. Once open, the plan itself is in the plans list. */
export function twinHuddleSeriesNextWords(next: TwinHuddleSeriesNextV0 | null, now: Date): TwinHuddleWords {
  if (next === null) return { en: 'There is no next time.', zh: '没有下一次了。' };
  const slot = twinHuddleSlotWords(next.slot, now);
  const opens = new Date(next.openAt);
  if (opens.getTime() <= now.getTime()) return { en: `Next: ${slot.en}. That week's plan opens soon.`, zh: `下一次：${slot.zh}。那一周的商量就快开了。` };
  const day = twinHuddleDayWords(opens, now);
  return { en: `Next: ${slot.en}. That week's plan opens ${day.en}.`, zh: `下一次：${slot.zh}。那一周的商量${day.zh}开。` };
}

/** One past week: the plan was opened, or why it was not. */
export function twinHuddleSeriesRunWords(run: Pick<TwinHuddleSeriesRunV0, 'startAt' | 'outcome' | 'skipCode'>, now: Date): TwinHuddleWords {
  const day = twinHuddleDayWords(new Date(run.startAt), now);
  if (run.outcome === 'opened') return { en: `${day.en}: plan opened`, zh: `${day.zh}：开了商量` };
  const why = run.skipCode === null ? null : TWIN_HUDDLE_SERIES_SKIP_LABELS_V0[run.skipCode];
  return { en: `${day.en}: skipped${why ? ` (${why.en})` : ''}`, zh: `${day.zh}：没开成${why ? `（${why.zh}）` : ''}` };
}

/** Right after starting: how many invitations went out. Nobody is asked each week until they join. */
export function twinHuddleSeriesStartedWords(routes: readonly { route: TwinHuddleSeriesFriendRouteV0 }[]): TwinHuddleWords {
  const invited = routes.filter((item) => item.route === 'invite').length;
  const missed = routes.length - invited;
  return {
    en: `${invited} invited${missed > 0 ? `, ${missed} could not be invited right now` : ''}. A friend is asked each week only after joining.`,
    zh: `已邀请 ${invited} 位${missed > 0 ? `，${missed} 位现在邀请不了` : ''}。朋友点了加入，每周才会约他。`,
  };
}

/** Until when an invitation can still be accepted. Null when there is nothing to decide. */
export function twinHuddleSeriesInviteWords(inviteEndsAt: string | null, now: Date): TwinHuddleWords | null {
  if (inviteEndsAt === null) return null;
  const day = twinHuddleDayWords(new Date(inviteEndsAt), now);
  return { en: `The invitation lapses ${day.en}.`, zh: `${day.zh}前不决定，邀请就作废。` };
}
