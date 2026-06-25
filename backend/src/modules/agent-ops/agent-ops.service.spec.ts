import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { AgentOpsService } from './agent-ops.service';
import { AgentOpsTaskEntity } from './entities/agent-ops-task.entity';
import { AgentOpsDeliverableEntity } from './entities/agent-ops-deliverable.entity';
import { AgentOpsActionLogEntity } from './entities/agent-ops-action-log.entity';
import { ApprovalGrantEntity } from './entities/approval-grant.entity';
import { MonitorSubscriptionEntity } from './entities/monitor-subscription.entity';

/**
 * AgentOpsService 单测(crypto-native-agent-ops 任务 1)。
 *
 * 仓库测试约定:无测试数据库,使用 getRepositoryToken 注入 mock Repository,
 * 验证实体仓库的基本 CRUD 透传(create/save/find/findOne)与归属隔离。
 */
describe('AgentOpsService', () => {
  let service: AgentOpsService;

  const mockTaskRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const mockDeliverableRepo = { find: jest.fn() };
  const mockActionLogRepo = {};
  const mockApprovalGrantRepo = {};
  const mockMonitorRepo = { find: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentOpsService,
        { provide: getRepositoryToken(AgentOpsTaskEntity), useValue: mockTaskRepo },
        {
          provide: getRepositoryToken(AgentOpsDeliverableEntity),
          useValue: mockDeliverableRepo,
        },
        {
          provide: getRepositoryToken(AgentOpsActionLogEntity),
          useValue: mockActionLogRepo,
        },
        {
          provide: getRepositoryToken(ApprovalGrantEntity),
          useValue: mockApprovalGrantRepo,
        },
        {
          provide: getRepositoryToken(MonitorSubscriptionEntity),
          useValue: mockMonitorRepo,
        },
      ],
    }).compile();

    service = module.get<AgentOpsService>(AgentOpsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTask', () => {
    it('creates a task with owner + defaults and persists it', async () => {
      const built = {
        ownerId: 'u1',
        agentId: 'a1',
        type: 'due_diligence',
        input: { target: '0xabc' },
        riskTier: 'read',
      };
      mockTaskRepo.create.mockReturnValue(built);
      mockTaskRepo.save.mockResolvedValue({ id: 't1', ...built });

      const result = await service.createTask('u1', {
        agentId: 'a1',
        type: 'due_diligence',
        input: { target: '0xabc' },
      });

      expect(mockTaskRepo.create).toHaveBeenCalledWith({
        ownerId: 'u1',
        agentId: 'a1',
        type: 'due_diligence',
        input: { target: '0xabc' },
        riskTier: 'read',
      });
      expect(mockTaskRepo.save).toHaveBeenCalledWith(built);
      expect(result).toEqual({ id: 't1', ...built });
    });

    it('defaults input to {} and riskTier to read when omitted', async () => {
      mockTaskRepo.create.mockImplementation((x) => x);
      mockTaskRepo.save.mockImplementation(async (x) => ({ id: 't2', ...x }));

      await service.createTask('u1', { agentId: 'a1', type: 'monitor' });

      expect(mockTaskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ input: {}, riskTier: 'read' }),
      );
    });
  });

  describe('getTask', () => {
    it('returns the task scoped to the owner', async () => {
      const task = { id: 't1', ownerId: 'u1', agentId: 'a1' };
      mockTaskRepo.findOne.mockResolvedValue(task);

      const result = await service.getTask('u1', 't1');

      expect(mockTaskRepo.findOne).toHaveBeenCalledWith({
        where: { id: 't1', ownerId: 'u1' },
      });
      expect(result).toEqual(task);
    });

    it('throws NotFoundException when task is missing / not owned', async () => {
      mockTaskRepo.findOne.mockResolvedValue(null);

      await expect(service.getTask('u1', 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('listTasks', () => {
    it('lists owner tasks ordered by createdAt desc', async () => {
      const tasks = [{ id: 't1' }, { id: 't2' }];
      mockTaskRepo.find.mockResolvedValue(tasks);

      const result = await service.listTasks('u1');

      expect(mockTaskRepo.find).toHaveBeenCalledWith({
        where: { ownerId: 'u1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(tasks);
    });
  });

  describe('listDeliverables', () => {
    it('lists deliverables for a task ordered by createdAt desc', async () => {
      const items = [{ id: 'd1' }];
      mockDeliverableRepo.find.mockResolvedValue(items);

      const result = await service.listDeliverables('t1');

      expect(mockDeliverableRepo.find).toHaveBeenCalledWith({
        where: { taskId: 't1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(items);
    });
  });

  describe('listMonitors', () => {
    it('lists owner monitor subscriptions ordered by createdAt desc', async () => {
      const items = [{ id: 'm1' }];
      mockMonitorRepo.find.mockResolvedValue(items);

      const result = await service.listMonitors('u1');

      expect(mockMonitorRepo.find).toHaveBeenCalledWith({
        where: { ownerId: 'u1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(items);
    });
  });
});
