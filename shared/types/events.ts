/**
 * Events (L8 batch 2, R6). The smallest useful version: an owner makes an event, shares its link, people who are signed in
 * register, and the owner reads the list of who registered. Before and after the event the owner's public twin answers
 * questions about it through its existing public answer chain (nothing new decides what it may say). No tickets, no
 * payment, no charge of any kind.
 *
 * Behind `EVENTS_V1_ENABLED` (server, default off, exactly `'1'`); every route answers 404 while it is off. Web:
 * `NEXT_PUBLIC_EVENTS_ENABLED`.
 *
 * Owner routes (`/events`, signed in, the caller's own events only):
 * - `POST /`                 body `OwnerEventInputV1` → `OwnerEventViewV1`
 * - `GET  /`                 → `{ items: OwnerEventViewV1[] }`
 * - `GET  /:eventRef`        → `OwnerEventDetailV1` (with who registered)
 * - `PATCH /:eventRef`       body `OwnerEventPatchV1` → `OwnerEventViewV1`
 *
 * Public routes (`/events/public/:eventRef`; the link is unguessable and unlisted):
 * - `GET  /`                 → `PublicEventViewV1` (no owner id, no registrants)
 * - `POST /register`         signed in, body `EventRegisterInputV1` → `EventMyRegistrationV1`
 * - `DELETE /register`       signed in → `EventMyRegistrationV1` (the name and note are erased)
 * - `GET  /mine`             signed in → `EventMyRegistrationV1`
 * - `POST /ask`              anonymous, the public twin's ask command (`DigitalTwinPublicAskCommandV1`) → the twin's answer
 *
 * A registrant's name and note are kept only for the owner's list and are erased when they cancel and 90 days after the
 * event ends. A registration also adds the person to the owner's relationship book (source: event) when that is on.
 */
import { RELATIONSHIP_LIMITS_V1, cleanRelationshipTextV1 } from './relationship-book';

export const EVENTS_FLAG_V1 = 'EVENTS_V1_ENABLED';
export const EVENTS_WEB_FLAG_V1 = 'NEXT_PUBLIC_EVENTS_ENABLED';

export const EVENTS_PATH_V1 = '/events';
export const EVENT_REF_PATTERN_V1 = /^ev_[0-9a-f]{32}$/;
/** An event with no end time is treated as lasting this long. */
export const EVENT_DEFAULT_DURATION_MS_V1 = 3 * 60 * 60 * 1000;
export const EVENT_MAX_DURATION_MS_V1 = 14 * 24 * 60 * 60 * 1000;
/** Names and notes of registrants are erased this long after the event ends. */
export const EVENT_REGISTRANT_RETENTION_DAYS_V1 = 90;

export const EVENT_STATUSES_V1 = ['open', 'closed', 'cancelled'] as const;
export type EventStatusV1 = (typeof EVENT_STATUSES_V1)[number];
export const EVENT_REGISTRATION_STATES_V1 = ['registered', 'cancelled'] as const;
export type EventRegistrationStateV1 = (typeof EVENT_REGISTRATION_STATES_V1)[number];
export type EventPhaseV1 = 'before' | 'during' | 'after';

export const EVENT_LIMITS_V1 = {
  titleMax: 120,
  descriptionMax: 2000,
  locationMax: 200,
  noteMax: 300,
  nameMax: RELATIONSHIP_LIMITS_V1.displayNameMax,
  capacityMax: 10000,
  ownerActiveMax: 50,
  registrantListMax: 500,
} as const;

export interface OwnerEventInputV1 {
  title: string;
  /** ISO time. */
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  description?: string | null;
  /** `null` = no limit. */
  capacity?: number | null;
  /** The Agent whose twin answers questions about the event. Left out: the owner's only active Agent, if there is exactly one. */
  agentAccountId?: string | null;
}

export type OwnerEventPatchV1 = Partial<Omit<OwnerEventInputV1, 'agentAccountId'>> & { status?: EventStatusV1 };

export interface OwnerEventViewV1 {
  eventRef: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  description: string | null;
  capacity: number | null;
  status: EventStatusV1;
  registeredCount: number;
  twinAnswers: boolean;
  createdAt: string;
}

export interface EventRegistrantRowV1 {
  registrationRef: string;
  displayName: string | null;
  note: string | null;
  registeredAt: string;
}

export interface OwnerEventDetailV1 extends OwnerEventViewV1 {
  registrants: EventRegistrantRowV1[];
}

export interface PublicEventViewV1 {
  eventRef: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  description: string | null;
  status: EventStatusV1;
  phase: EventPhaseV1;
  /** `null` when there is no limit. */
  spotsLeft: number | null;
  /** Whether the owner's twin can be asked about the event. */
  twinAnswers: boolean;
}

export interface EventRegisterInputV1 {
  displayName?: string | null;
  note?: string | null;
}

export interface EventMyRegistrationV1 {
  registered: boolean;
  displayName: string | null;
  registeredAt: string | null;
}

export function eventPhaseV1(startsAt: Date | string, endsAt: Date | string, now: Date): EventPhaseV1 {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now.getTime() < start) return 'before';
  return now.getTime() < end ? 'during' : 'after';
}

export function eventPathV1(eventRef: string): string {
  return `${EVENTS_PATH_V1}/${encodeURIComponent(eventRef)}`;
}
export function eventPublicPathV1(eventRef: string, action?: 'register' | 'mine' | 'ask'): string {
  return `${EVENTS_PATH_V1}/public/${encodeURIComponent(eventRef)}${action ? `/${action}` : ''}`;
}
/** The page people open from the shared link. */
export function eventShareLinkV1(origin: string, eventRef: string): string {
  return `${origin.replace(/\/+$/, '')}/events/${eventRef}`;
}

export function isEventsClientEnabledV1(value: string | undefined): boolean {
  return value === '1';
}

// ── decoding ──────────────────────────────────────────────────────────────────────────────────

export type EventDecodeResultV1<T> = { ok: true; value: T } | { ok: false; field: string };
type Failure = { ok: false; field: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function fail(field: string): Failure {
  return { ok: false, field };
}
function parseIso(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const INPUT_KEYS = ['title', 'startsAt', 'endsAt', 'location', 'description', 'capacity', 'agentAccountId'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Shared by create and edit. On edit (`partial`) every field is optional and `status` is allowed; unknown fields are refused. */
function decodeEvent(value: unknown, partial: boolean): EventDecodeResultV1<OwnerEventPatchV1 & { agentAccountId?: string | null }> {
  if (!isRecord(value)) return fail('$');
  const allowed: readonly string[] = partial ? [...INPUT_KEYS.filter((key) => key !== 'agentAccountId'), 'status'] : INPUT_KEYS;
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail(key);
  const out: OwnerEventPatchV1 & { agentAccountId?: string | null } = {};

  if (value.title !== undefined) {
    const title = cleanRelationshipTextV1(value.title, EVENT_LIMITS_V1.titleMax);
    if (title === null) return fail('title');
    out.title = title;
  } else if (!partial) return fail('title');

  if (value.startsAt !== undefined) {
    const start = parseIso(value.startsAt);
    if (!start) return fail('startsAt');
    out.startsAt = start.toISOString();
  } else if (!partial) return fail('startsAt');

  if (value.endsAt !== undefined) {
    if (value.endsAt === null) out.endsAt = null;
    else {
      const end = parseIso(value.endsAt);
      if (!end) return fail('endsAt');
      out.endsAt = end.toISOString();
    }
  }
  for (const [key, max, multiline] of [
    ['location', EVENT_LIMITS_V1.locationMax, false],
    ['description', EVENT_LIMITS_V1.descriptionMax, true],
  ] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (raw === null) {
      out[key] = null;
      continue;
    }
    const cleaned = cleanRelationshipTextV1(raw, max, { multiline });
    if (cleaned === null) return fail(key);
    out[key] = cleaned;
  }
  if (value.capacity !== undefined) {
    if (value.capacity === null) out.capacity = null;
    else if (typeof value.capacity !== 'number' || !Number.isInteger(value.capacity) || value.capacity < 1 || value.capacity > EVENT_LIMITS_V1.capacityMax) return fail('capacity');
    else out.capacity = value.capacity;
  }
  if (value.agentAccountId !== undefined) {
    if (value.agentAccountId === null) out.agentAccountId = null;
    else if (typeof value.agentAccountId !== 'string' || !UUID.test(value.agentAccountId)) return fail('agentAccountId');
    else out.agentAccountId = value.agentAccountId.toLowerCase();
  }
  if (value.status !== undefined) {
    if (typeof value.status !== 'string' || !(EVENT_STATUSES_V1 as readonly string[]).includes(value.status)) return fail('status');
    out.status = value.status as EventStatusV1;
  }
  return { ok: true, value: out };
}

export function decodeOwnerEventInputV1(value: unknown): EventDecodeResultV1<OwnerEventInputV1> {
  const decoded = decodeEvent(value, false);
  if (decoded.ok === false) return decoded;
  return { ok: true, value: decoded.value as OwnerEventInputV1 };
}

export function decodeOwnerEventPatchV1(value: unknown): EventDecodeResultV1<OwnerEventPatchV1> {
  const decoded = decodeEvent(value, true);
  if (decoded.ok === false) return decoded;
  if (Object.keys(decoded.value).length === 0) return fail('$');
  return { ok: true, value: decoded.value };
}

export function decodeEventRegisterInputV1(value: unknown): EventDecodeResultV1<EventRegisterInputV1> {
  if (value === undefined || value === null) return { ok: true, value: {} };
  if (!isRecord(value)) return fail('$');
  for (const key of Object.keys(value)) if (key !== 'displayName' && key !== 'note') return fail(key);
  const out: EventRegisterInputV1 = {};
  for (const [key, max] of [
    ['displayName', EVENT_LIMITS_V1.nameMax],
    ['note', EVENT_LIMITS_V1.noteMax],
  ] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (raw === null) {
      out[key] = null;
      continue;
    }
    const cleaned = cleanRelationshipTextV1(raw, max);
    if (cleaned === null) return fail(key);
    out[key] = cleaned;
  }
  return { ok: true, value: out };
}

/** Whether the end is after the start and within the longest event we take. */
export function eventTimesValidV1(startsAt: Date, endsAt: Date): boolean {
  const span = endsAt.getTime() - startsAt.getTime();
  return span > 0 && span <= EVENT_MAX_DURATION_MS_V1;
}

function unwrap(body: unknown): unknown {
  return isRecord(body) && isRecord(body.data) && body.eventRef === undefined && body.items === undefined && body.registered === undefined ? body.data : body;
}
function isIso(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}
function nullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function decodeOwnerView(value: unknown): OwnerEventViewV1 | null {
  if (!isRecord(value)) return null;
  if (typeof value.eventRef !== 'string' || !EVENT_REF_PATTERN_V1.test(value.eventRef)) return null;
  if (typeof value.title !== 'string' || !isIso(value.startsAt) || !isIso(value.endsAt) || !isIso(value.createdAt)) return null;
  if (!nullableText(value.location) || !nullableText(value.description)) return null;
  if (value.capacity !== null && typeof value.capacity !== 'number') return null;
  if (typeof value.status !== 'string' || !(EVENT_STATUSES_V1 as readonly string[]).includes(value.status)) return null;
  if (typeof value.registeredCount !== 'number' || typeof value.twinAnswers !== 'boolean') return null;
  return {
    eventRef: value.eventRef,
    title: value.title,
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    location: value.location,
    description: value.description,
    // The backend build runs without strictNullChecks, where `!== null && typeof …` does not narrow `unknown`: cast what was checked.
    capacity: value.capacity as number | null,
    status: value.status as EventStatusV1,
    registeredCount: value.registeredCount,
    twinAnswers: value.twinAnswers,
    createdAt: value.createdAt,
  };
}

export function decodeOwnerEventViewV1(body: unknown): OwnerEventViewV1 | null {
  return decodeOwnerView(unwrap(body));
}

export function decodeOwnerEventListV1(body: unknown): OwnerEventViewV1[] | null {
  const outer = unwrap(body);
  if (!isRecord(outer) || !Array.isArray(outer.items)) return null;
  const out: OwnerEventViewV1[] = [];
  for (const item of outer.items) {
    const view = decodeOwnerView(item);
    if (!view) return null;
    out.push(view);
  }
  return out;
}

export function decodeOwnerEventDetailV1(body: unknown): OwnerEventDetailV1 | null {
  const value = unwrap(body);
  const view = decodeOwnerView(value);
  if (!view || !isRecord(value) || !Array.isArray(value.registrants)) return null;
  const registrants: EventRegistrantRowV1[] = [];
  for (const row of value.registrants) {
    if (!isRecord(row) || typeof row.registrationRef !== 'string' || !nullableText(row.displayName) || !nullableText(row.note) || !isIso(row.registeredAt)) return null;
    registrants.push({ registrationRef: row.registrationRef, displayName: row.displayName, note: row.note, registeredAt: row.registeredAt });
  }
  return { ...view, registrants };
}

export function decodePublicEventViewV1(body: unknown): PublicEventViewV1 | null {
  const value = unwrap(body);
  if (!isRecord(value)) return null;
  if (typeof value.eventRef !== 'string' || !EVENT_REF_PATTERN_V1.test(value.eventRef)) return null;
  if (typeof value.title !== 'string' || !isIso(value.startsAt) || !isIso(value.endsAt)) return null;
  if (!nullableText(value.location) || !nullableText(value.description)) return null;
  if (typeof value.status !== 'string' || !(EVENT_STATUSES_V1 as readonly string[]).includes(value.status)) return null;
  if (value.phase !== 'before' && value.phase !== 'during' && value.phase !== 'after') return null;
  if (value.spotsLeft !== null && typeof value.spotsLeft !== 'number') return null;
  if (typeof value.twinAnswers !== 'boolean') return null;
  return {
    eventRef: value.eventRef,
    title: value.title,
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    location: value.location,
    description: value.description,
    status: value.status as EventStatusV1,
    phase: value.phase,
    spotsLeft: value.spotsLeft as number | null,
    twinAnswers: value.twinAnswers,
  };
}

export function decodeEventMyRegistrationV1(body: unknown): EventMyRegistrationV1 | null {
  const value = unwrap(body);
  if (!isRecord(value) || typeof value.registered !== 'boolean' || !nullableText(value.displayName)) return null;
  if (value.registeredAt !== null && !isIso(value.registeredAt)) return null;
  return { registered: value.registered, displayName: value.displayName, registeredAt: value.registeredAt as string | null };
}

// ── words for the screens ─────────────────────────────────────────────────────────────────────

export const EVENT_STATUS_COPY_V1: Readonly<Record<EventStatusV1, { zh: string; en: string }>> = {
  open: { zh: '开放报名', en: 'Open for sign-up' },
  closed: { zh: '已停止报名', en: 'Sign-up closed' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
};

export const EVENT_PHASE_COPY_V1: Readonly<Record<EventPhaseV1, { zh: string; en: string }>> = {
  before: { zh: '还没开始', en: 'Not started yet' },
  during: { zh: '正在进行', en: 'Happening now' },
  after: { zh: '已经结束', en: 'Over' },
};
