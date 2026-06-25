import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnifiedDeviceService } from './unified-device.service';
import { DevicePresence } from '../../entities/device-presence.entity';
import { DesktopDevicePresence } from '../../entities/desktop-sync.entity';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((dto) => ({ id: 'mock-id', ...dto })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'mock-id', ...entity })),
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('UnifiedDeviceService', () => {
  let service: UnifiedDeviceService;
  let presenceRepo: ReturnType<typeof mockRepo>;
  let desktopRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    presenceRepo = mockRepo();
    desktopRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedDeviceService,
        { provide: getRepositoryToken(DevicePresence), useValue: presenceRepo },
        { provide: getRepositoryToken(DesktopDevicePresence), useValue: desktopRepo },
      ],
    }).compile();

    service = module.get<UnifiedDeviceService>(UnifiedDeviceService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── getAllDevices ──────────────────────────────────────────────────────────

  describe('getAllDevices', () => {
    it('should return empty array when no devices', async () => {
      const result = await service.getAllDevices('user-1');
      expect(result).toEqual([]);
    });

    it('should return agent-presence devices', async () => {
      presenceRepo.find.mockResolvedValue([
        {
          id: 'dp-1',
          deviceId: 'phone-1',
          deviceType: 'mobile',
          deviceName: 'iPhone',
          platform: 'ios',
          appVersion: '2.0',
          lastSeenAt: new Date(),
          isOnline: true,
          capabilities: ['notification'],
          metadata: null,
        },
      ]);

      const result = await service.getAllDevices('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].deviceId).toBe('phone-1');
      expect(result[0].source).toBe('agent-presence');
      expect(result[0].isOnline).toBe(true);
    });

    it('should return desktop-sync devices', async () => {
      desktopRepo.find.mockResolvedValue([
        {
          id: 'dd-1',
          deviceId: 'desktop-1',
          platform: 'windows',
          appVersion: '1.5',
          context: { activeWindowTitle: 'VS Code' },
          lastSeenAt: new Date(), // just now = online
        },
      ]);

      const result = await service.getAllDevices('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].deviceId).toBe('desktop-1');
      expect(result[0].source).toBe('desktop-sync');
      expect(result[0].deviceType).toBe('desktop');
      expect(result[0].isOnline).toBe(true);
    });

    it('should deduplicate by deviceId, keeping the most recent', async () => {
      const oldDate = new Date(Date.now() - 120000);
      const newDate = new Date();

      presenceRepo.find.mockResolvedValue([
        {
          id: 'dp-1',
          deviceId: 'shared-device',
          deviceType: 'desktop',
          deviceName: 'My PC',
          platform: 'windows',
          lastSeenAt: oldDate,
          isOnline: false,
          capabilities: [],
          metadata: null,
        },
      ]);

      desktopRepo.find.mockResolvedValue([
        {
          id: 'dd-1',
          deviceId: 'shared-device',
          platform: 'windows',
          appVersion: '1.6',
          lastSeenAt: newDate,
        },
      ]);

      const result = await service.getAllDevices('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].deviceId).toBe('shared-device');
      // Desktop-sync is more recent, should take its source
      expect(result[0].source).toBe('desktop-sync');
      expect(result[0].isOnline).toBe(true);
    });

    it('should merge online status from both sources', async () => {
      const recentDate = new Date();

      presenceRepo.find.mockResolvedValue([
        {
          id: 'dp-1',
          deviceId: 'dev-x',
          deviceType: 'desktop',
          deviceName: 'PC',
          lastSeenAt: recentDate,
          isOnline: true,
          capabilities: [],
          metadata: null,
        },
      ]);

      desktopRepo.find.mockResolvedValue([
        {
          id: 'dd-1',
          deviceId: 'dev-x',
          platform: 'windows',
          lastSeenAt: new Date(Date.now() - 600000), // 10 min ago = offline
        },
      ]);

      const result = await service.getAllDevices('user-1');
      expect(result).toHaveLength(1);
      // Should be online because agent-presence says online (more recent)
      expect(result[0].isOnline).toBe(true);
    });

    it('should sort online devices first', async () => {
      presenceRepo.find.mockResolvedValue([
        {
          id: 'dp-1',
          deviceId: 'offline-phone',
          deviceType: 'mobile',
          lastSeenAt: new Date(Date.now() - 600000),
          isOnline: false,
          capabilities: [],
          metadata: null,
        },
        {
          id: 'dp-2',
          deviceId: 'online-phone',
          deviceType: 'mobile',
          lastSeenAt: new Date(),
          isOnline: true,
          capabilities: [],
          metadata: null,
        },
      ]);

      const result = await service.getAllDevices('user-1');
      expect(result).toHaveLength(2);
      expect(result[0].deviceId).toBe('online-phone');
      expect(result[1].deviceId).toBe('offline-phone');
    });
  });

  // ── getOnlineDevices ──────────────────────────────────────────────────────

  describe('getOnlineDevices', () => {
    it('should return only online devices', async () => {
      presenceRepo.find.mockResolvedValue([
        {
          id: 'dp-1',
          deviceId: 'online-dev',
          deviceType: 'mobile',
          lastSeenAt: new Date(),
          isOnline: true,
          capabilities: [],
          metadata: null,
        },
        {
          id: 'dp-2',
          deviceId: 'offline-dev',
          deviceType: 'mobile',
          lastSeenAt: new Date(Date.now() - 600000),
          isOnline: false,
          capabilities: [],
          metadata: null,
        },
      ]);

      const result = await service.getOnlineDevices('user-1');
      expect(result).toHaveLength(1);
      expect(result[0].deviceId).toBe('online-dev');
    });
  });

  // ── getDeviceStats ────────────────────────────────────────────────────────

  describe('getDeviceStats', () => {
    it('should return correct stats', async () => {
      presenceRepo.find.mockResolvedValue([
        { id: '1', deviceId: 'd1', deviceType: 'mobile', lastSeenAt: new Date(), isOnline: true, capabilities: [], metadata: null },
        { id: '2', deviceId: 'd2', deviceType: 'desktop', lastSeenAt: new Date(Date.now() - 600000), isOnline: false, capabilities: [], metadata: null },
      ]);
      desktopRepo.find.mockResolvedValue([
        { id: '3', deviceId: 'd3', platform: 'linux', lastSeenAt: new Date() },
      ]);

      const stats = await service.getDeviceStats('user-1');
      expect(stats.total).toBe(3);
      expect(stats.online).toBe(2); // d1 (presence) + d3 (desktop, recent)
      expect(stats.offline).toBe(1);
      expect(stats.byType.mobile).toBe(1);
      expect(stats.bySource['agent-presence']).toBe(2);
      expect(stats.bySource['desktop-sync']).toBe(1);
    });
  });

  // ── syncDesktopHeartbeat ──────────────────────────────────────────────────

  describe('syncDesktopHeartbeat', () => {
    it('should create new device in agent-presence registry', async () => {
      presenceRepo.findOne.mockResolvedValue(null);

      await service.syncDesktopHeartbeat('user-1', 'desktop-99', 'windows', '1.0');

      expect(presenceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          deviceId: 'desktop-99',
          deviceType: 'desktop',
          platform: 'windows',
          isOnline: true,
        }),
      );
      expect(presenceRepo.save).toHaveBeenCalled();
    });

    it('should update existing device', async () => {
      const existing = {
        id: 'dp-1',
        userId: 'user-1',
        deviceId: 'desktop-99',
        isOnline: false,
        lastSeenAt: new Date(Date.now() - 60000),
      };
      presenceRepo.findOne.mockResolvedValue(existing);

      await service.syncDesktopHeartbeat('user-1', 'desktop-99', 'windows', '2.0');

      expect(existing.isOnline).toBe(true);
      expect(existing.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 1000);
      expect(presenceRepo.save).toHaveBeenCalled();
    });

    it('should not throw on save error', async () => {
      presenceRepo.findOne.mockRejectedValue(new Error('DB error'));

      // Should not throw — just logs warning
      await expect(
        service.syncDesktopHeartbeat('user-1', 'dev', 'win'),
      ).resolves.toBeUndefined();
    });
  });
});
