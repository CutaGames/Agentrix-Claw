/**
 * PresenceController 单元测试(task 2.2 / Requirement 8)。
 *
 * 覆盖:
 *  - heartbeat / getPresence 的 JwtAuthGuard 用户解析(id ?? sub)
 *  - 「仅限本人 instance」归属校验:非本人实例 → 403
 *  - 请求体校验:缺 instanceId / 非法 device → 400
 *  - 正常路径调用 PresenceService.report/query 并回传快照
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PresenceController } from './presence.controller';
import { PresenceService, DevicePresence } from './presence.service';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';

describe('PresenceController', () => {
  let controller: PresenceController;
  let presenceService: jest.Mocked<Pick<PresenceService, 'report' | 'query'>>;
  let instanceRepo: { findOne: jest.Mock };

  const USER_ID = 'user-1';
  const INSTANCE_ID = 'inst-1';
  const reqOf = (user: any) => ({ user });

  const snapshot: DevicePresence[] = [
    { device: 'desktop', online: false, lastSeen: 1000 },
    { device: 'mobile', online: true, lastSeen: 2000 },
  ];

  beforeEach(async () => {
    instanceRepo = { findOne: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PresenceController],
      providers: [
        {
          provide: PresenceService,
          useValue: {
            report: jest.fn(),
            query: jest.fn().mockReturnValue(snapshot),
          },
        },
        {
          provide: getRepositoryToken(OpenClawInstance),
          useValue: instanceRepo,
        },
      ],
    }).compile();

    controller = module.get(PresenceController);
    presenceService = module.get(PresenceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('heartbeat', () => {
    it('records heartbeat for an owned instance and returns the snapshot', async () => {
      instanceRepo.findOne.mockResolvedValue({ id: INSTANCE_ID });

      const result = await controller.heartbeat(reqOf({ id: USER_ID }), {
        instanceId: INSTANCE_ID,
        device: 'mobile',
      });

      expect(instanceRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INSTANCE_ID, userId: USER_ID } }),
      );
      expect(presenceService.report).toHaveBeenCalledWith(USER_ID, INSTANCE_ID, 'mobile', undefined);
      expect(result).toEqual({ instanceId: INSTANCE_ID, presences: snapshot });
    });

    it('resolves userId from sub when id is absent', async () => {
      instanceRepo.findOne.mockResolvedValue({ id: INSTANCE_ID });

      await controller.heartbeat(reqOf({ sub: USER_ID }), {
        instanceId: INSTANCE_ID,
        device: 'desktop',
      });

      expect(instanceRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INSTANCE_ID, userId: USER_ID } }),
      );
      expect(presenceService.report).toHaveBeenCalledWith(USER_ID, INSTANCE_ID, 'desktop', undefined);
    });

    it('forwards a custom ttlSec to the service', async () => {
      instanceRepo.findOne.mockResolvedValue({ id: INSTANCE_ID });

      await controller.heartbeat(reqOf({ id: USER_ID }), {
        instanceId: INSTANCE_ID,
        device: 'mobile',
        ttlSec: 60,
      });

      expect(presenceService.report).toHaveBeenCalledWith(USER_ID, INSTANCE_ID, 'mobile', 60);
    });

    it('rejects an instance not owned by the user (403) and does not report', async () => {
      instanceRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.heartbeat(reqOf({ id: USER_ID }), { instanceId: INSTANCE_ID, device: 'mobile' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(presenceService.report).not.toHaveBeenCalled();
    });

    it('rejects a missing instanceId (400)', async () => {
      await expect(
        controller.heartbeat(reqOf({ id: USER_ID }), { device: 'mobile' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(instanceRepo.findOne).not.toHaveBeenCalled();
    });

    it('rejects an invalid device (400)', async () => {
      await expect(
        controller.heartbeat(reqOf({ id: USER_ID }), { instanceId: INSTANCE_ID, device: 'watch' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(instanceRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('getPresence', () => {
    it('returns the device list for an owned instance', async () => {
      instanceRepo.findOne.mockResolvedValue({ id: INSTANCE_ID });

      const result = await controller.getPresence(reqOf({ id: USER_ID }), INSTANCE_ID);

      expect(instanceRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INSTANCE_ID, userId: USER_ID } }),
      );
      expect(presenceService.query).toHaveBeenCalledWith(USER_ID, INSTANCE_ID);
      expect(result).toEqual({ instanceId: INSTANCE_ID, presences: snapshot });
    });

    it('rejects an instance not owned by the user (403)', async () => {
      instanceRepo.findOne.mockResolvedValue(null);

      await expect(
        controller.getPresence(reqOf({ id: USER_ID }), INSTANCE_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(presenceService.query).not.toHaveBeenCalled();
    });
  });
});
