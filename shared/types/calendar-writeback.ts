/**
 * G-09 calendar write-back.
 *
 * Connector Beta v1 connections stay contractually read-only
 * (`scope.readOnly === true`). Write-back is a separate consent surface:
 * flag + confirmation + calendar.events write scope. When those hold, the
 * service may insert and read the event back.
 */

export const CALENDAR_WRITEBACK_SCHEMA_VERSION = 1 as const;
export const CALENDAR_WRITEBACK_CONFIRMATION = 'write_calendar_event' as const;
export const GOOGLE_CALENDAR_EVENTS_WRITE_SCOPE =
  'https://www.googleapis.com/auth/calendar.events';

export const CALENDAR_WRITEBACK_REASON_CODES = [
  'writeback_flag_off',
  'beta_connection_read_only',
  'write_scope_missing',
  'confirmation_required',
  'connection_missing',
  'invalid_event_window',
  'provider_insert_failed',
  'provider_readback_failed',
] as const;

/** A single writeback event may not last more than a week. */
export const CALENDAR_WRITEBACK_MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
/** Start must fall within two years of now. Catches year typos such as 2926. */
export const CALENDAR_WRITEBACK_MAX_START_OFFSET_MS = 2 * 365 * 24 * 60 * 60 * 1000;
export type CalendarWritebackReasonCodeV1 =
  (typeof CALENDAR_WRITEBACK_REASON_CODES)[number];

export interface CalendarWritebackEventInputV1 {
  summary: string;
  startIso: string;
  endIso: string;
}

export type CalendarWritebackDecisionV1 =
  | {
      status: 'refused';
      reasonCode: CalendarWritebackReasonCodeV1;
      writePerformed: false;
    }
  | {
      status: 'allowed';
      writePerformed: false;
    }
  | {
      status: 'written';
      writePerformed: true;
      eventId: string;
      readBack: true;
    };

export function evaluateCalendarWritebackV1(input: {
  flagEnabled: boolean;
  confirmation: unknown;
  connection:
    | {
        present: boolean;
        readOnly: boolean;
        grantedScopes: readonly string[];
      }
    | null;
  writeConsent:
    | {
        present: boolean;
        grantedScopes: readonly string[];
      }
    | null;
}):
  | Extract<CalendarWritebackDecisionV1, { status: 'refused' }>
  | Extract<CalendarWritebackDecisionV1, { status: 'allowed' }> {
  if (!input.flagEnabled) {
    return { status: 'refused', reasonCode: 'writeback_flag_off', writePerformed: false };
  }
  if (input.confirmation !== CALENDAR_WRITEBACK_CONFIRMATION) {
    return { status: 'refused', reasonCode: 'confirmation_required', writePerformed: false };
  }
  if (!input.connection || input.connection.present !== true) {
    return { status: 'refused', reasonCode: 'connection_missing', writePerformed: false };
  }
  const writeScopes = input.writeConsent?.present
    ? input.writeConsent.grantedScopes
    : [];
  if (!writeScopes.includes(GOOGLE_CALENDAR_EVENTS_WRITE_SCOPE)) {
    if (input.connection.readOnly === true) {
      return { status: 'refused', reasonCode: 'beta_connection_read_only', writePerformed: false };
    }
    return { status: 'refused', reasonCode: 'write_scope_missing', writePerformed: false };
  }
  return { status: 'allowed', writePerformed: false };
}

export function evaluateCalendarWritebackEventWindowV1(
  event: { startIso: string; endIso: string },
  nowMs: number = Date.now(),
): { status: 'ok' } | { status: 'invalid'; reasonCode: 'invalid_event_window' } {
  const start = Date.parse(event.startIso);
  const end = Date.parse(event.endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { status: 'invalid', reasonCode: 'invalid_event_window' };
  }
  if (end <= start) {
    return { status: 'invalid', reasonCode: 'invalid_event_window' };
  }
  if (end - start > CALENDAR_WRITEBACK_MAX_DURATION_MS) {
    return { status: 'invalid', reasonCode: 'invalid_event_window' };
  }
  if (Math.abs(start - nowMs) > CALENDAR_WRITEBACK_MAX_START_OFFSET_MS) {
    return { status: 'invalid', reasonCode: 'invalid_event_window' };
  }
  return { status: 'ok' };
}
