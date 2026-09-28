import {
  computeCalendarWindowBounds,
  countCalendarWindowMeta,
  formatCalendarWindowLayer,
  minimizeCalendarEvent,
  minimizeCalendarEvents,
} from '../calendar-event-window';

describe('calendar event window (G-09)', () => {
  it('keeps only title, time, and all-day, and drops attendees and body', () => {
    const timed = minimizeCalendarEvent({
      summary: 'Standup',
      start: { dateTime: '2026-09-10T09:00:00+08:00' },
      end: { dateTime: '2026-09-10T09:30:00+08:00' },
      description: 'secret agenda',
      attendees: [{ email: 'a@example.com' }],
      location: 'Room 1',
      hangoutLink: 'https://meet.example.test/abc',
    });
    expect(timed).toEqual({
      title: 'Standup',
      start: '2026-09-10T01:00:00.000Z',
      end: '2026-09-10T01:30:00.000Z',
      allDay: false,
    });
    expect(JSON.stringify(timed)).not.toMatch(/secret|attendee|Room|meet\.example/i);

    const allDay = minimizeCalendarEvent({
      summary: 'Holiday',
      start: { date: '2026-09-12' },
      end: { date: '2026-09-13' },
      description: 'do not persist',
    });
    expect(allDay).toEqual({
      title: 'Holiday',
      start: '2026-09-12T00:00:00.000Z',
      end: '2026-09-13T00:00:00.000Z',
      allDay: true,
    });
  });

  it('uses (untitled) when the provider sent no title, and never invents events from junk', () => {
    expect(minimizeCalendarEvent({ start: { dateTime: '2026-09-10T00:00:00.000Z' }, end: { dateTime: '2026-09-10T01:00:00.000Z' } })?.title)
      .toBe('(untitled)');
    expect(minimizeCalendarEvent({ summary: 'x' })).toBeNull();
    expect(minimizeCalendarEvents(null)).toEqual([]);
    expect(minimizeCalendarEvents([{
      title: 'Standup',
      start: '2026-09-10T01:00:00.000Z',
      end: '2026-09-10T01:30:00.000Z',
      allDay: false,
    }])).toEqual([{
      title: 'Standup',
      start: '2026-09-10T01:00:00.000Z',
      end: '2026-09-10T01:30:00.000Z',
      allDay: false,
    }]);
  });

  it('computes a local-midnight window without guessing a timezone', () => {
    const { start, end } = computeCalendarWindowBounds(new Date('2026-09-10T10:00:00.000Z'), 480, 7);
    expect(start.toISOString()).toBe('2026-09-09T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-16T16:00:00.000Z');
  });

  it('renders an honest layer: events when ready, never “no events” on failure', () => {
    const ready = formatCalendarWindowLayer({
      status: 'ready',
      events: [{ title: 'Standup', start: '2026-09-10T01:00:00.000Z', end: '2026-09-10T01:30:00.000Z', allDay: false }],
      windowStart: '2026-09-09T16:00:00.000Z',
      windowEnd: '2026-09-16T16:00:00.000Z',
      fetchedAt: '2026-09-10T01:00:00.000Z',
      omitted: 0,
    });
    expect(ready).toContain('connection, not two-way sync');
    expect(ready).toContain('Standup');
    expect(ready).not.toContain('Do not assume the owner has no events');

    const unauthorized = formatCalendarWindowLayer({
      status: 'unauthorized',
      windowStart: '2026-09-09T16:00:00.000Z',
      windowEnd: '2026-09-16T16:00:00.000Z',
    });
    expect(unauthorized).toContain('needs reauthorization');
    expect(unauthorized).toContain('Do not assume the owner has no events');
    expect(unauthorized).not.toContain('No events in this window');
    expect(countCalendarWindowMeta({
      status: 'unavailable',
      windowStart: '2026-09-09T16:00:00.000Z',
      windowEnd: '2026-09-16T16:00:00.000Z',
    })).toEqual({ status: 'unavailable', events: 0, omitted: 0 });
  });
});
