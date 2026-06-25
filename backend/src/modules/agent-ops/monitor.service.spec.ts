import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { MonitorService } from './monitor.service';
import { MonitorSubscriptionEntity } from './entities/monitor-subscription.entity';

/**
 * MonitorService 单测 — 监控订阅增删改(crypto-native-agent-ops 任务 16 / 需求 9.4)。
 *
 * 覆盖:创建(默认 active + interval 规范化)、列出(排除已删除)、暂停/恢复、修改、
 * 软删除、到期查询(findDueMonitors)、回写检查结果(recordCheckResult)。
 *
 * 仓库测试约定:无测试数据库,getRepositoryToken 注入 mock Repository。
 */
describe('MonitorService — 监控订阅增删改 (需求 9.4)', () => {
  let service: MonitorService;

  const repo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const makeMonitor = (
    over: Partial<MonitorSubscriptionEntity> = {},
  ): MonitorSubscriptionEntity =>
    ({
      id: 'm1',
      ownerId: 'u1',
      agentId: 'a1',
      monitorType: 'price',
      condition: { url: 'https://x', extract: 'p', operator: 'gt', value: 1 },
      interval: 3600,
      lastCheckedAt: null,
      lastResult: null,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as MonitorSubscriptionEntity;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitorService,
        { provide: getRepositoryToken(MonitorSubscriptionEntity), useValue: repo },
      ],
    }).compile();
    service = module.get(MonitorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMonitor', () => {
    it('创建默认 active,interval 规范化(最小 30s)', async () => {
      repo.create.mockImplementation((x) => x);
      repo.save.mockImplementation(async (x) => ({ id: 'm9', ...x }));

      const result = await service.createMonitor('u1', {
        agentId: 'a1',
        monitorType: 'price',
        condition: { url: 'https://x', extract: 'p' },
        interval: 5, // < 30 → 提升到 30
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: 'u1',
          agentId: 'a1',
          monitorType: 'price',
          interval: 30,
          status: 'active',
          lastCheckedAt: null,
          lastResult: null,
        }),
      );
      expect(result.id).toBe('m9');
    });

    it('interval 缺省 → 3600s', async () => {
      repo.create.mockImplementation((x) => x);
      repo.save.mockImplementation(async (x) => x);
      await service.createMonitor('u1', {
        agentId: 'a1',
        monitorType: 'governance',
        condition: {},
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ interval: 3600 }),
      );
    });

    it('缺 agentId → BadRequest', async () => {
      await expect(
        service.createMonitor('u1', {
          agentId: '',
          monitorType: 'price',
          condition: {},
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getMonitor / listMonitors', () => {
    it('getMonitor 找不到 → NotFound', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getMonitor('u1', 'm1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('listMonitors 排除已删除(status != deleted)', async () => {
      repo.find.mockResolvedValue([makeMonitor()]);
      await service.listMonitors('u1');
      const arg = repo.find.mock.calls[0][0];
      expect(arg.where.ownerId).toBe('u1');
      // status: Not('deleted')
      expect(arg.where.status).toBeDefined();
    });
  });

  describe('pause / resume / update', () => {
    it('pauseMonitor → status=paused', async () => {
      repo.findOne.mockResolvedValue(makeMonitor());
      repo.save.mockImplementation(async (x) => x);
      const r = await service.pauseMonitor('u1', 'm1');
      expect(r.status).toBe('paused');
    });

    it('resumeMonitor → status=active', async () => {
      repo.findOne.mockResolvedValue(makeMonitor({ status: 'paused' }));
      repo.save.mockImplementation(async (x) => x);
      const r = await service.resumeMonitor('u1', 'm1');
      expect(r.status).toBe('active');
    });

    it('updateMonitor 修改 condition/interval/type', async () => {
      repo.findOne.mockResolvedValue(makeMonitor());
      repo.save.mockImplementation(async (x) => x);
      const r = await service.updateMonitor('u1', 'm1', {
        monitorType: 'depeg',
        interval: 120,
        condition: { url: 'https://y', extract: 'q', operator: 'lt', value: 0.98 },
      });
      expect(r.monitorType).toBe('depeg');
      expect(r.interval).toBe(120);
      expect(r.condition.operator).toBe('lt');
    });
  });

  describe('deleteMonitor — 软删除', () => {
    it('置 status=deleted 并保存', async () => {
      const m = makeMonitor();
      repo.findOne.mockResolvedValue(m);
      repo.save.mockImplementation(async (x) => x);
      await service.deleteMonitor('u1', 'm1');
      expect(m.status).toBe('deleted');
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'deleted' }),
      );
    });
  });

  describe('findDueMonitors', () => {
    it('合并「从未检查」与「周期已过」的 active 订阅', async () => {
      const never = makeMonitor({ id: 'never', lastCheckedAt: null });
      const overdue = makeMonitor({ id: 'overdue' });
      repo.find.mockResolvedValue([never]);
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([overdue]),
      };
      repo.createQueryBuilder.mockReturnValue(qb);

      const due = await service.findDueMonitors(new Date());
      expect(due.map((m) => m.id)).toEqual(['never', 'overdue']);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'active' }) }),
      );
    });
  });

  describe('recordCheckResult — 回写 lastCheckedAt/lastResult (需求 9.4)', () => {
    it('写入检查时间与结构化结果', async () => {
      repo.update.mockResolvedValue({ affected: 1 });
      const checkedAt = '2026-06-01T00:00:00.000Z';
      await service.recordCheckResult('m1', {
        triggered: true,
        summary: '命中',
        observations: { price: 2 },
        observedValue: 2,
        checkedAt,
      });
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'm1' },
        expect.objectContaining({
          lastCheckedAt: new Date(checkedAt),
          lastResult: expect.objectContaining({
            triggered: true,
            summary: '命中',
            observedValue: 2,
          }),
        }),
      );
    });
  });
});
