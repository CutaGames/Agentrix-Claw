import { DesktopAnalyticsService } from './desktop-analytics.service';

describe('DesktopAnalyticsService', () => {
  function makeService() {
    const insert = jest.fn(async () => ({ identifiers: [] }));
    const repo = { insert } as any;
    return { service: new DesktopAnalyticsService(repo), insert };
  }

  it('accepts allow-listed events and inserts in batch', async () => {
    const { service, insert } = makeService();
    const r = await service.ingest([
      {
        deviceId: 'd1',
        eventName: 'desktop_launch',
        appVersion: '0.2.0',
        occurredAt: Date.now(),
      },
      {
        deviceId: 'd1',
        eventName: 'desktop_login',
        eventProps: { method: 'email' },
        appVersion: '0.2.0',
        occurredAt: Date.now(),
      },
    ]);
    expect(r).toEqual({ accepted: 2, rejected: 0 });
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = (insert.mock.calls[0] as any)[0] as any[];
    expect(rows).toHaveLength(2);
    expect(rows[0].deviceIdHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[1].eventProps).toEqual({ method: 'email' });
  });

  it('rejects events outside the allow-list', async () => {
    const { service, insert } = makeService();
    const r = await service.ingest([
      {
        deviceId: 'd1',
        eventName: 'random_event',
        appVersion: '0.2.0',
        occurredAt: Date.now(),
      } as any,
    ]);
    expect(r).toEqual({ accepted: 0, rejected: 1 });
    expect(insert).not.toHaveBeenCalled();
  });

  it('strips non-whitelisted props', async () => {
    const { service, insert } = makeService();
    await service.ingest([
      {
        deviceId: 'd1',
        eventName: 'desktop_first_chat',
        eventProps: { mode: 'agent', user_email: 'evil@example.com', secret: 'abc' },
        appVersion: '0.2.0',
        occurredAt: Date.now(),
      },
    ]);
    const row = (insert.mock.calls[0] as any)[0][0];
    expect(row.eventProps).toEqual({ mode: 'agent' });
    expect(row.eventProps).not.toHaveProperty('user_email');
    expect(row.eventProps).not.toHaveProperty('secret');
  });

  it('rejects events missing required fields', async () => {
    const { service } = makeService();
    const r = await service.ingest([
      { eventName: 'desktop_launch', appVersion: '0.2.0', occurredAt: Date.now() } as any,
      { deviceId: 'd', appVersion: '0.2.0', occurredAt: Date.now() } as any,
      { deviceId: 'd', eventName: 'desktop_launch', occurredAt: Date.now() } as any,
      { deviceId: 'd', eventName: 'desktop_launch', appVersion: '0.2.0' } as any,
    ]);
    expect(r.accepted).toBe(0);
    expect(r.rejected).toBe(4);
  });

  it('caps batch size at 200', async () => {
    const { service, insert } = makeService();
    const events = Array.from({ length: 250 }, () => ({
      deviceId: 'd1',
      eventName: 'desktop_launch',
      appVersion: '0.2.0',
      occurredAt: Date.now(),
    }));
    const r = await service.ingest(events);
    expect(r.accepted).toBe(200);
    expect((insert.mock.calls[0] as any)[0]).toHaveLength(200);
  });
});
