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

/**
 * Follow-up rules v1 (L6-3, parity task T21). More "In progress" cards, computed on read from what already exists:
 * - `lead_no_reply`: a consented twin lead still `new` or `accepted` 48 hours after it came in; carries a follow-up
 *   draft the owner can copy. Marking the lead contacted, converted, rejected or deleted ends the card.
 * - `booking_soon`: a confirmed visitor booking that starts within the next 24 hours.
 * - `deposit_unpaid`: a visitor holds a slot and has not paid the deposit yet (the hold has not expired).
 * Nothing is pushed or sent, and no new data is stored; `quietNow` still tells clients not to notify.
 *
 * Served on their own route so v0 clients, which refuse a list with an unknown card kind, never see them.
 * Server switch: `OWNER_FOLLOW_UP_RULES_V1_ENABLED` exactly `1` on top of `OWNER_GOALS_V0_ENABLED`; otherwise 404.
 * Web: `NEXT_PUBLIC_OWNER_FOLLOW_UPS_ENABLED` exactly `1`.
 */
export const OWNER_FOLLOW_UPS_FLAG_V1 = 'OWNER_FOLLOW_UP_RULES_V1_ENABLED';

export const OWNER_FOLLOW_UPS_ROUTES_V1 = {
  list: 'GET /api/owner-goals/follow-ups',
} as const;

export const OWNER_FOLLOW_UP_KINDS_V1 = ['lead_no_reply', 'booking_soon', 'deposit_unpaid'] as const;
export type OwnerFollowUpKindV1 = (typeof OWNER_FOLLOW_UP_KINDS_V1)[number];

export const OWNER_FOLLOW_UP_RULES_V1 = {
  leadNoReplyHours: 48,
  bookingSoonHours: 24,
  maxCardsPerKind: 20,
  titleMax: 80,
} as const;

export interface OwnerFollowUpCardV1 {
  /** `${kind}:${refId}`. */
  cardId: string;
  kind: OwnerFollowUpKindV1;
  /** The lead id or the booking ref. */
  refId: string;
  agentAccountId: string;
  /** When it became worth a look: the lead's 48-hour mark, the booking start, the deposit deadline. */
  dueAt: string;
  /** `lead_no_reply` only: the lead's message, cut to `titleMax`, as plain text. */
  title?: string;
  /** `lead_no_reply` only: a follow-up the owner can copy and send themselves. */
  draft?: { zh: string; en: string };
  /** `booking_soon` / `deposit_unpaid`: the booked slot's start. */
  startsAt?: string;
}

export interface OwnerFollowUpsV1 {
  cards: OwnerFollowUpCardV1[];
  quietNow: boolean;
}

/** What the rules read about a lead (from the twin's consented leads). */
export interface FollowUpLeadInputV1 {
  leadId: string;
  agentAccountId: string;
  state: string;
  createdAt: string;
  message?: string | null;
}

/** What the rules read about a visitor booking. */
export interface FollowUpBookingInputV1 {
  bookingRef: string;
  agentAccountId: string;
  status: string;
  startAt: string;
  holdExpiresAt: string | null;
}

function plainExcerpt(text: string | null | undefined, max: number): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/** A neutral follow-up the owner sends themselves; it quotes at most a short excerpt of the visitor's message. */
export function leadFollowUpDraftV1(message?: string | null): { zh: string; en: string } {
  const excerpt = plainExcerpt(message, 40);
  return excerpt
    ? {
        zh: `你好，谢谢你之前的留言（"${excerpt}"）。回复晚了，抱歉。方便的话，我们约个时间聊聊？`,
        en: `Hi, thanks for your message ("${excerpt}"). Sorry for the slow reply. Would you like to find a time to talk?`,
      }
    : {
        zh: '你好，谢谢你之前的留言。回复晚了，抱歉。方便的话，我们约个时间聊聊？',
        en: 'Hi, thanks for your message. Sorry for the slow reply. Would you like to find a time to talk?',
      };
}

/** The v1 cards, oldest due first, at most `maxCardsPerKind` of each kind. Malformed inputs are skipped. */
export function followUpCardsV1(
  input: { leads?: readonly FollowUpLeadInputV1[]; bookings?: readonly FollowUpBookingInputV1[] },
  now: Date,
): OwnerFollowUpCardV1[] {
  const R = OWNER_FOLLOW_UP_RULES_V1;
  const nowMs = now.getTime();
  const out: OwnerFollowUpCardV1[] = [];
  for (const lead of input.leads ?? []) {
    const created = Date.parse(lead.createdAt);
    if (!Number.isFinite(created) || (lead.state !== 'new' && lead.state !== 'accepted')) continue;
    const due = created + R.leadNoReplyHours * 3_600_000;
    if (due > nowMs) continue;
    const title = plainExcerpt(lead.message, R.titleMax);
    out.push({
      cardId: `lead_no_reply:${lead.leadId}`,
      kind: 'lead_no_reply',
      refId: lead.leadId,
      agentAccountId: lead.agentAccountId,
      dueAt: new Date(due).toISOString(),
      ...(title ? { title } : {}),
      draft: leadFollowUpDraftV1(lead.message),
    });
  }
  for (const booking of input.bookings ?? []) {
    const start = Date.parse(booking.startAt);
    if (!Number.isFinite(start)) continue;
    if (booking.status === 'confirmed' && start >= nowMs && start <= nowMs + R.bookingSoonHours * 3_600_000) {
      const startsAt = new Date(start).toISOString();
      out.push({ cardId: `booking_soon:${booking.bookingRef}`, kind: 'booking_soon', refId: booking.bookingRef, agentAccountId: booking.agentAccountId, dueAt: startsAt, startsAt });
    } else if (booking.status === 'held' && booking.holdExpiresAt !== null) {
      const deadline = Date.parse(booking.holdExpiresAt);
      if (!Number.isFinite(deadline) || deadline <= nowMs) continue;
      out.push({
        cardId: `deposit_unpaid:${booking.bookingRef}`,
        kind: 'deposit_unpaid',
        refId: booking.bookingRef,
        agentAccountId: booking.agentAccountId,
        dueAt: new Date(deadline).toISOString(),
        startsAt: new Date(start).toISOString(),
      });
    }
  }
  out.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const perKind = new Map<OwnerFollowUpKindV1, number>();
  return out.filter((card) => {
    const n = (perKind.get(card.kind) ?? 0) + 1;
    perKind.set(card.kind, n);
    return n <= R.maxCardsPerKind;
  });
}

function decodeFollowUpCardV1(value: unknown): OwnerFollowUpCardV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.kind !== 'string' || !(OWNER_FOLLOW_UP_KINDS_V1 as readonly string[]).includes(c.kind)) return null;
  const iso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
  if (typeof c.refId !== 'string' || !c.refId || c.refId.length > 128 || typeof c.cardId !== 'string' || c.cardId !== `${c.kind}:${c.refId}`) return null;
  if (typeof c.agentAccountId !== 'string' || !c.agentAccountId || c.agentAccountId.length > 64 || !iso(c.dueAt)) return null;
  const card: OwnerFollowUpCardV1 = { cardId: c.cardId, kind: c.kind as OwnerFollowUpKindV1, refId: c.refId, agentAccountId: c.agentAccountId, dueAt: c.dueAt };
  if (c.title !== undefined) {
    if (typeof c.title !== 'string' || c.title.length > OWNER_FOLLOW_UP_RULES_V1.titleMax) return null;
    card.title = c.title;
  }
  if (c.draft !== undefined) {
    const d = c.draft as Record<string, unknown> | null;
    if (!d || typeof d.zh !== 'string' || typeof d.en !== 'string' || d.zh.length > 400 || d.en.length > 400) return null;
    card.draft = { zh: d.zh, en: d.en };
  }
  if (c.startsAt !== undefined) {
    if (!iso(c.startsAt)) return null;
    card.startsAt = c.startsAt;
  }
  return card;
}

/** Clients: a card of a kind this build does not know is skipped, never failing the whole list. */
export function decodeOwnerFollowUpsV1(value: unknown): OwnerFollowUpsV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.cards) || typeof v.quietNow !== 'boolean') return null;
  const cards: OwnerFollowUpCardV1[] = [];
  for (const raw of v.cards) {
    const kind = (raw as { kind?: unknown } | null)?.kind;
    if (typeof kind === 'string' && !(OWNER_FOLLOW_UP_KINDS_V1 as readonly string[]).includes(kind)) continue;
    const card = decodeFollowUpCardV1(raw);
    if (!card) return null;
    cards.push(card);
  }
  return { cards, quietNow: v.quietNow };
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
