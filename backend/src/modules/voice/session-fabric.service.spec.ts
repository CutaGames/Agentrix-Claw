import { SessionFabricService } from './session-fabric.service';

describe('SessionFabricService', () => {
  let service: SessionFabricService;
  let repo: any;

  beforeEach(() => {
    const store: any[] = [];
    let idCounter = 0;

    repo = {
      findOne: jest.fn(({ where }: any) => {
        return Promise.resolve(
          store.find((s) =>
            (where.userId === undefined || s.userId === where.userId)
            && (where.deviceId === undefined || s.deviceId === where.deviceId)
            && (where.sessionId === undefined || s.sessionId === where.sessionId)
            && (where.isPrimary === undefined || s.isPrimary === where.isPrimary)
          ) || null,
        );
      }),
      find: jest.fn(({ where, order }: any) => {
        const results = store.filter((s) =>
          (where.sessionId === undefined || s.sessionId === where.sessionId)
        );
        return Promise.resolve(results);
      }),
      count: jest.fn(({ where }: any) => {
        const c = store.filter((s) =>
          (where.sessionId === undefined || s.sessionId === where.sessionId)
          && (where.isPrimary === undefined || s.isPrimary === where.isPrimary)
        ).length;
        return Promise.resolve(c);
      }),
      create: jest.fn((data: any) => ({ id: `id-${++idCounter}`, ...data })),
      save: jest.fn((entity: any) => {
        const idx = store.findIndex((s) => s.id === entity.id);
        if (idx >= 0) {
          store[idx] = entity;
        } else {
          if (!entity.id) entity.id = `id-${++idCounter}`;
          store.push(entity);
        }
        return Promise.resolve(entity);
      }),
      remove: jest.fn((entity: any) => {
        const idx = store.findIndex((s) => s.id === entity.id);
        if (idx >= 0) store.splice(idx, 1);
        return Promise.resolve(entity);
      }),
      update: jest.fn((criteria: any, updates: any) => {
        let affected = 0;
        for (const s of store) {
          const match = Object.entries(criteria).every(([k, v]) => (s as any)[k] === v);
          if (match) {
            Object.assign(s, updates);
            affected++;
          }
        }
        return Promise.resolve({ affected });
      }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      })),
    };

    service = new SessionFabricService(repo);
  });

  it('joins a device to a session and auto-elects primary', async () => {
    const ds = await service.joinSession({
      userId: 'user-1',
      sessionId: 'sess-1',
      deviceId: 'phone-1',
      deviceType: 'phone',
      socketId: 'sock-1',
    });

    expect(ds.deviceId).toBe('phone-1');
    expect(repo.save).toHaveBeenCalled();
    // Auto-elect should have been triggered (count returns 0)
    expect(repo.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sessionId: 'sess-1', isPrimary: true } }),
    );
  });

  it('upserts existing device on rejoin', async () => {
    // First join
    await service.joinSession({
      userId: 'user-1',
      sessionId: 'sess-1',
      deviceId: 'phone-1',
      deviceType: 'phone',
      socketId: 'sock-1',
    });

    // Second join (reconnect)
    const ds = await service.joinSession({
      userId: 'user-1',
      sessionId: 'sess-1',
      deviceId: 'phone-1',
      deviceType: 'phone',
      socketId: 'sock-2',
    });

    expect(ds.socketId).toBe('sock-2');
  });

  it('leaves session and re-elects primary if the leaving device was primary', async () => {
    const ds = await service.joinSession({
      userId: 'user-1',
      sessionId: 'sess-1',
      deviceId: 'phone-1',
      deviceType: 'phone',
      socketId: 'sock-1',
    });
    ds.isPrimary = true;

    await service.leaveSession('user-1', 'phone-1');

    expect(repo.remove).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: 'phone-1' }),
    );
  });

  it('switches primary device', async () => {
    await service.switchPrimary('sess-1', 'desktop-1');

    // Should demote all first, then promote target
    expect(repo.update).toHaveBeenCalledWith(
      { sessionId: 'sess-1', isPrimary: true },
      { isPrimary: false },
    );
    expect(repo.update).toHaveBeenCalledWith(
      { sessionId: 'sess-1', deviceId: 'desktop-1' },
      { isPrimary: true, lastActiveAt: expect.any(Date) },
    );
  });
});
