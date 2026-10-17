/**
 * L6-3 "In progress" on the phone (`shared/types/owner-goals.ts`): goals the owner keeps, with a check-in time, and the
 * cards that come due. Off unless EXPO_PUBLIC_OWNER_GOALS=1; while the server switch is off the routes answer 404 and
 * the card renders nothing. v0 has one card kind (a goal reached its check-in time); nothing is pushed or sent.
 * No React Native import: the transport and token are injected.
 */
import type { HttpResponseV1, HttpTransportV1 } from '../../shared/client/transport';
import {
  OWNER_GOAL_STATUSES_V0,
  decodeOwnerFollowUpsV1,
  decodeOwnerGoalInputV0,
  type OwnerFollowUpCardV1,
  type OwnerFollowUpsV1,
  type OwnerGoalInputV0,
  type OwnerGoalViewV0,
  type OwnerGoalsListV0,
} from '../../shared/types/owner-goals';

type Copy = { zh: string; en: string };

export function ownerGoalsEnabled(value: unknown): boolean {
  return value === '1';
}

// Read as a literal member expression so the Expo build inlines it.
export const OWNER_GOALS_ENABLED = ownerGoalsEnabled(process.env.EXPO_PUBLIC_OWNER_GOALS);
/** L6-3 v1 follow-up cards (lead waiting two days, booking within 24 hours, unpaid deposit); also needs the goals card. */
export const OWNER_FOLLOW_UPS_ENABLED = ownerGoalsEnabled(process.env.EXPO_PUBLIC_OWNER_FOLLOW_UPS);

export type OwnerGoalsFailureV0 = 'closed' | 'invalid' | 'not_found' | 'no_session' | 'unreadable' | 'unavailable';

export class OwnerGoalsError extends Error {
  readonly failure: OwnerGoalsFailureV0;
  constructor(failure: OwnerGoalsFailureV0) {
    super(failure);
    this.name = 'OwnerGoalsError';
    this.failure = failure;
  }
}

const isIsoOrNull = (v: unknown) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));

function decodeGoal(value: unknown): OwnerGoalViewV0 | null {
  if (!value || typeof value !== 'object') return null;
  const g = value as Record<string, unknown>;
  const { goalId, title, note, status, checkInAt, createdAt, updatedAt } = g;
  if (typeof goalId !== 'string' || typeof title !== 'string' || !(note === null || typeof note === 'string')) return null;
  if (!(OWNER_GOAL_STATUSES_V0 as readonly unknown[]).includes(status) || !isIsoOrNull(checkInAt) || typeof createdAt !== 'string' || typeof updatedAt !== 'string') return null;
  return g as unknown as OwnerGoalViewV0;
}

function decodeList(value: unknown): OwnerGoalsListV0 | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const { goals, cards, quietNow } = v;
  if (!Array.isArray(goals) || !Array.isArray(cards) || typeof quietNow !== 'boolean') return null;
  const decoded = goals.map(decodeGoal);
  if (!decoded.every((goal): goal is OwnerGoalViewV0 => goal !== null)) return null;
  const kept = cards.filter((c): c is OwnerGoalsListV0['cards'][number] => {
    const card = c as Record<string, unknown> | null;
    return !!card && card.kind === 'goal_check_in' && typeof card.cardId === 'string' && typeof card.goalId === 'string' && typeof card.title === 'string' && typeof card.dueAt === 'string';
  });
  return kept.length === cards.length ? { goals: decoded, cards: kept, quietNow } : null;
}

function failureOf(response: HttpResponseV1, isUpdate: boolean): OwnerGoalsFailureV0 {
  if (response.status === 404) return isUpdate ? 'not_found' : 'closed';
  if (response.status === 400 || response.status === 409) return 'invalid';
  if (response.status === 401) return 'no_session';
  return 'unavailable';
}

export interface MobileOwnerGoalsClientV0 {
  list(): Promise<OwnerGoalsListV0>;
  /** L6-3 v1, its own route so the v0 list never meets a card kind it does not know. */
  followUps(): Promise<OwnerFollowUpsV1>;
  create(input: OwnerGoalInputV0): Promise<OwnerGoalViewV0>;
  update(goalId: string, input: OwnerGoalInputV0): Promise<OwnerGoalViewV0>;
}

export function createMobileOwnerGoalsClient(deps: {
  transport: HttpTransportV1;
  baseUrl: string;
  token: () => string | null | undefined;
}): MobileOwnerGoalsClientV0 {
  const base = deps.baseUrl.replace(/\/+$/, '');
  const send = async <T>(method: 'GET' | 'POST' | 'PUT', path: string, decode: (b: unknown) => T | null, body?: unknown, isUpdate = false): Promise<T> => {
    const token = deps.token();
    if (!token) throw new OwnerGoalsError('no_session');
    let response: HttpResponseV1;
    try {
      response = await deps.transport.request({
        method,
        path: `${base}${path}`,
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' },
        ...(body === undefined ? {} : { body }),
      });
    } catch {
      throw new OwnerGoalsError('unavailable');
    }
    if (response.status !== 200 && response.status !== 201) throw new OwnerGoalsError(failureOf(response, isUpdate));
    const value = decode(response.body);
    if (value === null) throw new OwnerGoalsError('unreadable');
    return value;
  };
  return {
    list: () => send('GET', '/owner-goals', decodeList),
    followUps: () => send('GET', '/owner-goals/follow-ups', decodeOwnerFollowUpsV1),
    create: async (input) => {
      const checked = decodeOwnerGoalInputV0(input, 'create');
      if (!checked) throw new OwnerGoalsError('invalid');
      return send('POST', '/owner-goals', decodeGoal, checked);
    },
    update: async (goalId, input) => {
      const checked = decodeOwnerGoalInputV0(input, 'update');
      if (!checked || typeof goalId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(goalId)) throw new OwnerGoalsError('invalid');
      return send('PUT', `/owner-goals/${encodeURIComponent(goalId)}`, decodeGoal, checked, true);
    },
  };
}

/** Check-in presets for the phone, which has no date-time field: tomorrow at this time, or a week from now. */
export function ownerGoalCheckInAt(preset: 'tomorrow' | 'next_week', now: Date): string {
  return new Date(now.getTime() + (preset === 'tomorrow' ? 1 : 7) * 24 * 60 * 60 * 1000).toISOString();
}

/** What a follow-up card says; `time` formats an ISO time for the reader. */
export function ownerFollowUpCopy(card: OwnerFollowUpCardV1, time: (iso: string) => string): Copy {
  if (card.kind === 'lead_no_reply') {
    const title = card.title ?? '';
    return { zh: `线索两天没回：${title}`, en: `Lead waiting two days: ${title}` };
  }
  if (card.kind === 'booking_soon') {
    const at = time(card.startsAt ?? card.dueAt);
    return { zh: `24 小时内有预约：${at}`, en: `Booking within 24 hours: ${at}` };
  }
  return { zh: `定金还没付，期限 ${time(card.dueAt)}`, en: `Deposit not paid yet, due ${time(card.dueAt)}` };
}

export const OWNER_GOALS_FAILURE_COPY: Readonly<Record<OwnerGoalsFailureV0, Copy>> = {
  closed: { zh: '「进行中」还没开放。', en: '"In progress" is not open yet.' },
  invalid: { zh: '没保存成功：标题要填，最多 120 字。', en: 'Not saved: a title of up to 120 characters is required.' },
  not_found: { zh: '这个目标已经不在了。', en: 'This goal no longer exists.' },
  no_session: { zh: '请先登录。', en: 'Sign in first.' },
  unreadable: { zh: '暂时读不到目标。', en: 'Goals are unavailable right now.' },
  unavailable: { zh: '网络不稳，请稍后再试。', en: 'Network trouble. Please try again.' },
};
