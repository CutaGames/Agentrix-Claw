/**
 * Long-term goals and proactive follow-up, v0 (L6-3).
 *
 * The owner keeps goals with an optional check-in time. The "In progress" page shows one card per thing that needs
 * attention: in v0, an active goal whose check-in time has passed. Interruptions respect quiet hours: `quietNow`
 * tells clients not to notify; v0 sends no push and no message by itself.
 *
 * Server switch: `OWNER_GOALS_V0_ENABLED` exactly `1`; otherwise every route answers 404.
 * Web: `NEXT_PUBLIC_OWNER_GOALS_ENABLED` exactly `1`.
 */

export const OWNER_GOALS_ROUTES_V0 = {
  list: 'GET /api/owner-goals',
  create: 'POST /api/owner-goals',
  update: 'PUT /api/owner-goals/:goalId',
} as const;

export const OWNER_GOAL_STATUSES_V0 = ['active', 'done', 'archived'] as const;
export type OwnerGoalStatusV0 = (typeof OWNER_GOAL_STATUSES_V0)[number];

/** Allowed status moves; anything else is refused. */
export const OWNER_GOAL_TRANSITIONS_V0: Readonly<Record<OwnerGoalStatusV0, readonly OwnerGoalStatusV0[]>> = {
  active: ['done', 'archived'],
  done: ['active', 'archived'],
  archived: ['active'],
};

export const OWNER_GOALS_LIMITS_V0 = { titleMax: 120, noteMax: 2000, activeMax: 50 } as const;

export const OWNER_GOALS_ERROR_CODES_V0 = {
  invalid: 'OWNER_GOAL_INVALID',
  notFound: 'OWNER_GOAL_NOT_FOUND',
  transition: 'OWNER_GOAL_TRANSITION_NOT_ALLOWED',
  tooMany: 'OWNER_GOAL_TOO_MANY_ACTIVE',
  signInRequired: 'OWNER_GOAL_SIGN_IN_REQUIRED',
} as const;

export interface OwnerGoalViewV0 {
  goalId: string;
  title: string;
  note: string | null;
  status: OwnerGoalStatusV0;
  checkInAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerFollowUpCardV0 {
  cardId: string;
  kind: 'goal_check_in';
  goalId: string;
  title: string;
  dueAt: string;
}

export interface OwnerGoalsListV0 {
  goals: OwnerGoalViewV0[];
  cards: OwnerFollowUpCardV0[];
  quietNow: boolean;
}

export interface OwnerGoalInputV0 {
  title?: string;
  note?: string | null;
  checkInAt?: string | null;
  status?: OwnerGoalStatusV0;
}

/** Quiet hours in the owner's local time: [startHour, endHour) wrapping midnight when start > end. */
export interface QuietHoursV0 {
  startHour: number;
  endHour: number;
  utcOffsetMinutes: number;
}

export const DEFAULT_QUIET_HOURS_V0: QuietHoursV0 = { startHour: 22, endHour: 8, utcOffsetMinutes: 8 * 60 };

export function isQuietNowV0(now: Date, quiet: QuietHoursV0 = DEFAULT_QUIET_HOURS_V0): boolean {
  const { startHour, endHour, utcOffsetMinutes } = quiet;
  if (startHour === endHour) return false;
  const local = new Date(now.getTime() + utcOffsetMinutes * 60_000).getUTCHours();
  return startHour < endHour ? local >= startHour && local < endHour : local >= startHour || local < endHour;
}

export function canMoveOwnerGoalV0(from: OwnerGoalStatusV0, to: OwnerGoalStatusV0): boolean {
  return from === to || OWNER_GOAL_TRANSITIONS_V0[from].includes(to);
}

/** Cards for active goals whose check-in time has passed, oldest first. */
export function goalCheckInCardsV0(goals: readonly OwnerGoalViewV0[], now: Date): OwnerFollowUpCardV0[] {
  return goals
    .filter((g) => g.status === 'active' && g.checkInAt !== null && Date.parse(g.checkInAt) <= now.getTime())
    .sort((a, b) => Date.parse(a.checkInAt as string) - Date.parse(b.checkInAt as string))
    .map((g) => ({ cardId: `goal_check_in:${g.goalId}`, kind: 'goal_check_in' as const, goalId: g.goalId, title: g.title, dueAt: g.checkInAt as string }));
}

/** `create` needs a title; updates may carry any subset. Unknown fields are dropped; a bad field refuses the whole input. */
export function decodeOwnerGoalInputV0(value: unknown, mode: 'create' | 'update'): OwnerGoalInputV0 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: OwnerGoalInputV0 = {};
  if (raw.title !== undefined) {
    if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.trim().length > OWNER_GOALS_LIMITS_V0.titleMax) return null;
    out.title = raw.title.trim();
  } else if (mode === 'create') return null;
  if (raw.note !== undefined) {
    const note = raw.note;
    if (note === null) out.note = null;
    else if (typeof note === 'string' && note.length <= OWNER_GOALS_LIMITS_V0.noteMax) out.note = note.trim() ? note.trim() : null;
    else return null;
  }
  if (raw.checkInAt !== undefined) {
    const at = raw.checkInAt;
    if (at === null) out.checkInAt = null;
    else if (typeof at === 'string' && at.length <= 40 && !Number.isNaN(Date.parse(at))) out.checkInAt = new Date(at).toISOString();
    else return null;
  }
  if (raw.status !== undefined) {
    if (mode === 'create' || typeof raw.status !== 'string' || !(OWNER_GOAL_STATUSES_V0 as readonly string[]).includes(raw.status)) return null;
    out.status = raw.status as OwnerGoalStatusV0;
  }
  return mode === 'update' && Object.keys(out).length === 0 ? null : out;
}
