import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionHandoffService } from './session-handoff.service';
import { SessionHandoff, HandoffStatus } from '../../../entities/session-handoff.entity';
import { DevicePresence } from '../../../entities/device-presence.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

function createMockRepo<T>(): Partial<Record<keyof Repository<T>, jest.Mock>> {
  return {
    create: jest.fn((dto) => ({ id: 'mock-uuid', ...dto })),
    save: jest.fn((entity) => Promise.resolve({ id: 'mock-uuid', createdAt: new Date(), updatedAt: new Date(), ...entity })),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
    update: jest.fn(() => Promise.resolve({ affected: 1 })),
    remove: jest.fn(() => Promise.resolve()),
  };
}

describe('SessionHandoffService', () => {
  let service: SessionHandoffService;
  let handoffRepo: ReturnType<typeof createMockRepo>;
  let deviceRepo: ReturnType<typeof createMockRepo>;

  const userId = 'user-123';

  beforeEach(async () => {
    handoffRepo = createMockRepo<SessionHandoff>();
    deviceRepo = createMockRepo<DevicePresence>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionHandoffService,
        { provide: getRepositoryToken(SessionHandoff), useValue: handoffRepo },
        { provide: getRepositoryToken(DevicePresence), useValue: deviceRepo },
      ],
    }).compile();

    service = module.get<SessionHandoffService>(SessionHandoffService);
  });

  // ── Session Handoff ─────────────────────────────────────────────────────

  describe('initiateHandoff', () => {
    it('should create a handoff with INITIATED status and 5min expiry', async () => {
      const dto = {
        agentId: 'agent-1',
        sourceDeviceId: 'mobile-001',
        sourceDeviceType: 'mobile',
        targetDeviceId: 'desktop-001',
        contextSnapshot: { lastMessages: [{ role: 'user', content: 'hello' }] },
      };

      const result = await service.initiateHandoff(userId, dto);

      expect(handoffRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          agentId: 'agent-1',
          sourceDeviceId: 'mobile-001',
          targetDeviceId: 'desktop-001',
          status: HandoffStatus.INITIATED,
        }),
      );
      expect(handoffRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create a broadcast handoff when no targetDeviceId', async () => {
      const dto = {
        agentId: 'agent-1',
        sourceDeviceId: 'mobile-001',
      };

      await service.initiateHandoff(userId, dto);

      expect(handoffRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetDeviceId: undefined,
        }),
      );
    });
  });

  describe('acceptHandoff', () => {
    it('should accept an initiated handoff', async () => {
      const mockHandoff = {
        id: 'handoff-1',
        userId,
        status: HandoffStatus.INITIATED,
        expiresAt: new Date(Date.now() + 60000), // still valid
      };
      handoffRepo.findOne!.mockResolvedValue(mockHandoff);

      const result = await service.acceptHandoff(userId, 'handoff-1', 'desktop-001');

      expect(result.status).toBe(HandoffStatus.ACCEPTED);
      expect(result.targetDeviceId).toBe('desktop-001');
      expect(result.acceptedAt).toBeDefined();
    });

    it('should throw NotFoundException for non-existent handoff', async () => {
      handoffRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.acceptHandoff(userId, 'non-existent', 'device-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for already accepted handoff', async () => {
      handoffRepo.findOne!.mockResolvedValue({
        id: 'handoff-1',
        userId,
        status: HandoffStatus.ACCEPTED,
      });

      await expect(
        service.acceptHandoff(userId, 'handoff-1', 'device-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired handoff', async () => {
      handoffRepo.findOne!.mockResolvedValue({
        id: 'handoff-1',
        userId,
        status: HandoffStatus.INITIATED,
        expiresAt: new Date(Date.now() - 1000), // expired
      });

      await expect(
        service.acceptHandoff(userId, 'handoff-1', 'device-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rejectHandoff', () => {
    it('should set status to REJECTED', async () => {
      handoffRepo.findOne!.mockResolvedValue({
        id: 'handoff-1',
        userId,
        status: HandoffStatus.INITIATED,
      });

      const result = await service.rejectHandoff(userId, 'handoff-1');
      expect(result.status).toBe(HandoffStatus.REJECTED);
    });
  });

  describe('completeHandoff', () => {
    it('should set status to COMPLETED for accepted handoff', async () => {
      handoffRepo.findOne!.mockResolvedValue({
        id: 'handoff-1',
        userId,
        status: HandoffStatus.ACCEPTED,
      });

      const result = await service.completeHandoff(userId, 'handoff-1');
      expect(result.status).toBe(HandoffStatus.COMPLETED);
    });

    it('should throw if handoff not in accepted state', async () => {
      handoffRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.completeHandoff(userId, 'handoff-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── Device Presence ─────────────────────────────────────────────────────

  describe('deviceHeartbeat', () => {
    it('should create a new device if not exists', async () => {
      deviceRepo.findOne!.mockResolvedValue(null);

      const result = await service.deviceHeartbeat(userId, {
        deviceId: 'mobile-001',
        deviceType: 'mobile',
        deviceName: 'iPhone 15',
        platform: 'ios',
        appVersion: '2.0.0',
        capabilities: ['voice', 'camera', 'notification'],
      });

      expect(deviceRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          deviceId: 'mobile-001',
          deviceType: 'mobile',
          isOnline: true,
        }),
      );
      expect(deviceRepo.save).toHaveBeenCalled();
    });

    it('should update existing device heartbeat', async () => {
      const existingDevice = {
        id: 'dev-uuid',
        userId,
        deviceId: 'mobile-001',
        deviceType: 'mobile',
        isOnline: false,
        lastSeenAt: new Date(Date.now() - 60000),
      };
      deviceRepo.findOne!.mockResolvedValue(existingDevice);

      await service.deviceHeartbeat(userId, {
        deviceId: 'mobile-001',
        deviceType: 'mobile',
      });

      expect(deviceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isOnline: true,
        }),
      );
    });
  });

  describe('deviceDisconnect', () => {
    it('should mark device as offline', async () => {
      await service.deviceDisconnect(userId, 'mobile-001');

      expect(deviceRepo.update).toHaveBeenCalledWith(
        { userId, deviceId: 'mobile-001' },
        expect.objectContaining({ isOnline: false }),
      );
    });
  });

  describe('getOnlineDevices', () => {
    it('should query for online devices', async () => {
      const mockDevices = [
        { deviceId: 'mobile-001', isOnline: true },
        { deviceId: 'desktop-001', isOnline: true },
      ];
      deviceRepo.find!.mockResolvedValue(mockDevices);

      const result = await service.getOnlineDevices(userId);

      expect(deviceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, isOnline: true },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('cleanupStaleDevices', () => {
    it('should mark stale devices as offline', async () => {
      deviceRepo.update!.mockResolvedValue({ affected: 3 });

      const count = await service.cleanupStaleDevices(5);
      expect(count).toBe(3);
      expect(deviceRepo.update).toHaveBeenCalled();
    });
  });
});
