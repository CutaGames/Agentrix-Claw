import { AxpExpiryService } from './axp-expiry.service';

describe('AxpExpiryService', () => {
  let service: AxpExpiryService;
  const ledger = {
    find: jest.fn(),
    update: jest.fn(),
  } as any;
  const axp = {
    expireOldEarnRows: jest.fn().mockResolvedValue(3),
  } as any;
  const notifications = {
    sendPushNotification: jest.fn().mockResolvedValue(undefined),
  } as any;

  beforeEach(() => {
    ledger.find.mockReset();
    ledger.update.mockReset();
    axp.expireOldEarnRows.mockClear();
    notifications.sendPushNotification.mockClear();
    service = new AxpExpiryService(ledger, axp, notifications);
  });

  it('runDailyExpiry calls AxpService.expireOldEarnRows', async () => {
    await service.runDailyExpiry();
    expect(axp.expireOldEarnRows).toHaveBeenCalledWith(2000);
  });

  it('runDailyExpiryWarning groups rows by user and stamps metadata', async () => {
    const now = Date.now();
    const fiveDaysOut = new Date(now + 28 * 86_400_000);
    ledger.find.mockResolvedValue([
      { id: 'a', userId: 'u1', amount: '500', expiresAt: fiveDaysOut, metadata: {} },
      { id: 'b', userId: 'u1', amount: '300', expiresAt: fiveDaysOut, metadata: {} },
      { id: 'c', userId: 'u2', amount: '200', expiresAt: fiveDaysOut, metadata: {} },
      // already warned -> should be skipped
      {
        id: 'd',
        userId: 'u3',
        amount: '100',
        expiresAt: fiveDaysOut,
        metadata: { expiryWarningSentAt: '2026-05-01' },
      },
    ]);
    await service.runDailyExpiryWarning();
    // u1 + u2 only (one push each); u3 skipped because already warned
    expect(notifications.sendPushNotification).toHaveBeenCalledTimes(2);
    expect(ledger.update).toHaveBeenCalledTimes(2);
    const userIds = (notifications.sendPushNotification as jest.Mock).mock.calls.map(
      (call: any[]) => call[0],
    );
    expect(userIds).toEqual(expect.arrayContaining(['u1', 'u2']));
  });

  it('triggerNow proxies to AxpService.expireOldEarnRows', async () => {
    const result = await service.triggerNow();
    expect(result).toEqual({ affected: 3 });
    expect(axp.expireOldEarnRows).toHaveBeenCalledWith(500);
  });
});
