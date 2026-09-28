import {
  CALENDAR_WRITEBACK_CONFIRMATION,
  evaluateCalendarWritebackEventWindowV1,
  evaluateCalendarWritebackV1,
  GOOGLE_CALENDAR_EVENTS_WRITE_SCOPE,
} from '../calendar-writeback';

describe('calendar writeback (G-09)', () => {
  it('refuses when the writeback flag is off, even with confirmation', () => {
    expect(
      evaluateCalendarWritebackV1({
        flagEnabled: false,
        confirmation: CALENDAR_WRITEBACK_CONFIRMATION,
        connection: {
          present: true,
          readOnly: true,
          grantedScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        },
        writeConsent: null,
      }),
    ).toEqual({
      status: 'refused',
      reasonCode: 'writeback_flag_off',
      writePerformed: false,
    });
  });

  it('refuses Connector Beta v1 read-only connections without write consent', () => {
    const decision = evaluateCalendarWritebackV1({
      flagEnabled: true,
      confirmation: CALENDAR_WRITEBACK_CONFIRMATION,
      connection: {
        present: true,
        readOnly: true,
        grantedScopes: [
          'https://www.googleapis.com/auth/calendar.readonly',
          GOOGLE_CALENDAR_EVENTS_WRITE_SCOPE,
        ],
      },
      writeConsent: null,
    });
    expect(decision.writePerformed).toBe(false);
    expect(decision.reasonCode).toBe('beta_connection_read_only');
  });

  it('allows write when flag, confirmation, and write consent are present', () => {
    expect(
      evaluateCalendarWritebackV1({
        flagEnabled: true,
        confirmation: CALENDAR_WRITEBACK_CONFIRMATION,
        connection: {
          present: true,
          readOnly: true,
          grantedScopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        },
        writeConsent: {
          present: true,
          grantedScopes: [GOOGLE_CALENDAR_EVENTS_WRITE_SCOPE],
        },
      }),
    ).toEqual({ status: 'allowed', writePerformed: false });
  });

  it('rejects a 2926-style end year and inverted ranges', () => {
    const now = Date.parse('2026-09-13T04:45:00.000Z');
    expect(
      evaluateCalendarWritebackEventWindowV1(
        {
          startIso: '2026-09-13T04:45:00.000Z',
          endIso: '2926-09-13T04:50:00.000Z',
        },
        now,
      ),
    ).toEqual({ status: 'invalid', reasonCode: 'invalid_event_window' });
    expect(
      evaluateCalendarWritebackEventWindowV1(
        {
          startIso: '2026-09-13T04:50:00.000Z',
          endIso: '2026-09-13T04:45:00.000Z',
        },
        now,
      ),
    ).toEqual({ status: 'invalid', reasonCode: 'invalid_event_window' });
    expect(
      evaluateCalendarWritebackEventWindowV1(
        {
          startIso: '2026-09-13T04:45:00.000Z',
          endIso: '2026-09-13T05:15:00.000Z',
        },
        now,
      ),
    ).toEqual({ status: 'ok' });
  });
});
