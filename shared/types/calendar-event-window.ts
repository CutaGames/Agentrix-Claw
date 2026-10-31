/**
 * G-09 · read-only calendar event window.
 *
 * The warehouse stores only title / start / end / all-day. Attendees, body,
 * location, hangout links, and any other provider field are stripped at the
 * mapping boundary and must never be persisted or prompted. This is a
 * connection, not two-way sync, and never writes back to the provider.
 */

export const CALENDAR_EVENT_WINDOW_SCHEMA_VERSION = 1 as const;
export const CALENDAR_EVENT_WINDOW_DAYS = 7 as const;
export const CALENDAR_EVENT_WINDOW_RETENTION_MS = 24 * 60 * 60 * 1000;
export const CALENDAR_EVENT_WINDOW_FAILURE_RETENTION_MS = 15 * 60 * 1000;
export const CALENDAR_EVENT_WINDOW_MAX_EVENTS = 40 as const;
export const CALENDAR_EVENT_WINDOW_TITLE_MAX = 160 as const;

export const CALENDAR_EVENT_WINDOW_STATUSES_V1 = [
  'ready',
  'unauthorized',
  'unavailable',
  'revoked',
  'expired',
] as const;

export type CalendarEventWindowStatusV1 = (typeof CALENDAR_EVENT_WINDOW_STATUSES_V1)[number];

export interface CalendarEventWindowSummaryV1 {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
}

export type CalendarWindowForChatV1 =
  | {
      status: 'ready';
      events: CalendarEventWindowSummaryV1[];
      windowStart: string;
      windowEnd: string;
      fetchedAt: string;
      omitted: number;
    }
  | {
      status: 'unauthorized' | 'unavailable';
      windowStart: string;
      windowEnd: string;
    };

export interface CalendarWindowMetaV1 {
  status: 'ready' | 'unauthorized' | 'unavailable';
  events: number;
  omitted: number;
}

export interface CalendarEventWindowViewV1 {
  schemaVersion: typeof CALENDAR_EVENT_WINDOW_SCHEMA_VERSION;
  connectionId: string;
  status: CalendarEventWindowStatusV1;
  eventCount: number;
  windowStart: string;
  windowEnd: string;
  fetchedAt: string | null;
  expiresAt: string;
  events: CalendarEventWindowSummaryV1[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clipTitle(value: string): string {
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '(untitled)';
  return cleaned.length <= CALENDAR_EVENT_WINDOW_TITLE_MAX
    ? cleaned
    : `${cleaned.slice(0, CALENDAR_EVENT_WINDOW_TITLE_MAX - 1)}…`;
}

function asIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

function asDateOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? `${match[1]}T00:00:00.000Z` : null;
}

/**
 * Keep title / start / end / allDay only. Extra provider fields (attendees,
 * description, location, hangoutLink, …) are dropped even if the provider
 * sent them.
 */
export function minimizeCalendarEvent(raw: unknown): CalendarEventWindowSummaryV1 | null {
  if (!isRecord(raw)) return null;
  const start = isRecord(raw.start) ? raw.start : {};
  const end = isRecord(raw.end) ? raw.end : {};
  const allDay = typeof start.date === 'string' && typeof start.dateTime !== 'string';
  const startIso = allDay ? asDateOnly(start.date) : asIso(start.dateTime ?? start.date);
  const endIso = allDay ? asDateOnly(end.date) ?? startIso : asIso(end.dateTime ?? end.date) ?? startIso;
  if (!startIso || !endIso) return null;
  const title = typeof raw.summary === 'string' ? raw.summary : '';
  return {
    title: clipTitle(title),
    start: startIso,
    end: endIso,
    allDay,
  };
}

export function acceptCalendarEventSummary(raw: unknown): CalendarEventWindowSummaryV1 | null {
  const fromProvider = minimizeCalendarEvent(raw);
  if (fromProvider) return fromProvider;
  if (!isRecord(raw)) return null;
  if (typeof raw.title !== 'string' || typeof raw.start !== 'string' || typeof raw.end !== 'string') {
    return null;
  }
  const start = asIso(raw.start) ?? asDateOnly(raw.start);
  const end = asIso(raw.end) ?? asDateOnly(raw.end) ?? start;
  if (!start || !end) return null;
  return {
    title: clipTitle(raw.title),
    start,
    end,
    allDay: raw.allDay === true,
  };
}

export function minimizeCalendarEvents(raw: unknown): CalendarEventWindowSummaryV1[] {
  if (!Array.isArray(raw)) return [];
  const events: CalendarEventWindowSummaryV1[] = [];
  for (const item of raw) {
    const minimized = acceptCalendarEventSummary(item);
    if (minimized) events.push(minimized);
    if (events.length >= CALENDAR_EVENT_WINDOW_MAX_EVENTS) break;
  }
  return events;
}

export function computeCalendarWindowBounds(
  now: Date,
  tzOffsetMinutes: number,
  days: number = CALENDAR_EVENT_WINDOW_DAYS,
): { start: Date; end: Date } {
  const offsetMs = (Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0) * 60 * 1000;
  const localNow = new Date(now.getTime() + offsetMs);
  const localMidnight = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
  );
  const start = new Date(localMidnight - offsetMs);
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  return { start, end };
}

function formatEventLine(event: CalendarEventWindowSummaryV1): string {
  if (event.allDay) {
    return `- all-day ${event.start.slice(0, 10)} · ${event.title}`;
  }
  return `- ${event.start} – ${event.end} · ${event.title}`;
}

export function formatCalendarWindowLayer(input: CalendarWindowForChatV1): string {
  const header = [
    '',
    '## Connected calendar window (read-only)',
    'The owner connected Google Calendar as a read-only source. This is a connection, not two-way sync. Do not create, edit, or delete events. Use titles and times only to plan around the owner. Do not treat them as memories or preferences.',
  ];
  if (input.status !== 'ready') {
    const note = input.status === 'unauthorized'
      ? 'The calendar connection needs reauthorization. Do not assume the owner has no events.'
      : 'The calendar window could not be read this turn. Do not assume the owner has no events.';
    return `${header.join('\n')}\n${note}\n`;
  }
  const lines = input.events.map(formatEventLine);
  const body = lines.length > 0 ? lines.join('\n') : 'No events in this window.';
  const omitted = input.omitted > 0
    ? `\n${input.omitted} more event(s) were left out to stay within the window budget.`
    : '';
  return `${header.join('\n')}\nWindow: ${input.windowStart} → ${input.windowEnd}\n${body}${omitted}\n`;
}

export function countCalendarWindowMeta(input: CalendarWindowForChatV1): CalendarWindowMetaV1 {
  if (input.status !== 'ready') {
    return { status: input.status, events: 0, omitted: 0 };
  }
  return { status: 'ready', events: input.events.length, omitted: input.omitted };
}
