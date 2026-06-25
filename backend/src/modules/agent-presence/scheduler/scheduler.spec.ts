import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentTaskSchedulerService } from './agent-task-scheduler.service';
import { OperationsDashboardService } from './operations-dashboard.service';
import {
  AgentScheduledTask,
  TaskTriggerType,
  TaskActionType,
  ScheduledTaskStatus,
} from '../../../entities/agent-scheduled-task.entity';
import { ConversationEvent } from '../../../entities/conversation-event.entity';
import { UserAgent } from '../../../entities/user-agent.entity';
import { DevicePresence } from '../../../entities/device-presence.entity';
import { ChannelRegistry } from '../channel/channel-registry';
import { NotFoundException } from '@nestjs/common';

function createMockRepo<T>(): Partial<Record<keyof Repository<T>, jest.Mock>> {
  return {
    create: jest.fn((dto) => ({ id: 'mock-uuid', ...dto })),
    save: jest.fn((entity) => Promise.resolve({ id: 'mock-uuid', createdAt: new Date(), updatedAt: new Date(), ...entity })),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
    count: jest.fn(() => Promise.resolve(0)),
    remove: jest.fn(() => Promise.resolve()),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({ total: 0, inbound: 0, outbound: 0 }),
    })),
  };
}

describe('AgentTaskSchedulerService', () => {
  let service: AgentTaskSchedulerService;
  let taskRepo: ReturnType<typeof createMockRepo>;
  let mockRegistry: Partial<ChannelRegistry>;

  const userId = 'user-123';

  beforeEach(async () => {
    taskRepo = createMockRepo<AgentScheduledTask>();
    mockRegistry = {
      get: jest.fn(),
      healthCheckAll: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentTaskSchedulerService,
        { provide: getRepositoryToken(AgentScheduledTask), useValue: taskRepo },
        { provide: ChannelRegistry, useValue: mockRegistry },
      ],
    }).compile();

    service = module.get<AgentTaskSchedulerService>(AgentTaskSchedulerService);
  });

  describe('createTask', () => {
    it('should create a scheduled task with ACTIVE status', async () => {
      const dto = {
        agentId: 'agent-1',
        name: 'Daily Digest',
        triggerType: TaskTriggerType.CRON,
        cronExpression: '0 9 * * *',
        actionType: TaskActionType.DIGEST_SUMMARY,
      };

      const result = await service.createTask(userId, dto);

      expect(taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          agentId: 'agent-1',
          name: 'Daily Digest',
          status: ScheduledTaskStatus.ACTIVE,
        }),
      );
      expect(taskRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create an interval task', async () => {
      const dto = {
        agentId: 'agent-2',
        name: 'Hourly Check',
        triggerType: TaskTriggerType.INTERVAL,
        intervalSeconds: 3600,
        actionType: TaskActionType.CHECK_CHANNEL,
      };

      await service.createTask(userId, dto);

      expect(taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          triggerType: TaskTriggerType.INTERVAL,
          intervalSeconds: 3600,
        }),
      );
    });
  });

  describe('getTasks', () => {
    it('should list tasks for a user', async () => {
      taskRepo.find!.mockResolvedValue([
        { id: 't1', name: 'Task 1' },
        { id: 't2', name: 'Task 2' },
      ]);

      const result = await service.getTasks(userId);
      expect(result).toHaveLength(2);
      expect(taskRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId } }),
      );
    });

    it('should filter by agentId', async () => {
      await service.getTasks(userId, 'agent-1');
      expect(taskRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId, agentId: 'agent-1' } }),
      );
    });
  });

  describe('getTask', () => {
    it('should return a task by ID', async () => {
      taskRepo.findOne!.mockResolvedValue({ id: 't1', userId, name: 'T1' });
      const result = await service.getTask(userId, 't1');
      expect(result.name).toBe('T1');
    });

    it('should throw NotFoundException for non-existent task', async () => {
      taskRepo.findOne!.mockResolvedValue(null);
      await expect(service.getTask(userId, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('pauseTask', () => {
    it('should set status to PAUSED', async () => {
      taskRepo.findOne!.mockResolvedValue({
        id: 't1',
        userId,
        status: ScheduledTaskStatus.ACTIVE,
      });

      const result = await service.pauseTask(userId, 't1');
      expect(result.status).toBe(ScheduledTaskStatus.PAUSED);
    });
  });

  describe('resumeTask', () => {
    it('should set status to ACTIVE and compute nextRunAt', async () => {
      taskRepo.findOne!.mockResolvedValue({
        id: 't1',
        userId,
        status: ScheduledTaskStatus.PAUSED,
        triggerType: TaskTriggerType.INTERVAL,
        intervalSeconds: 300,
      });

      const result = await service.resumeTask(userId, 't1');
      expect(result.status).toBe(ScheduledTaskStatus.ACTIVE);
      expect(result.nextRunAt).toBeDefined();
    });
  });

  describe('deleteTask', () => {
    it('should remove the task', async () => {
      const mockTask = { id: 't1', userId };
      taskRepo.findOne!.mockResolvedValue(mockTask);

      await service.deleteTask(userId, 't1');
      expect(taskRepo.remove).toHaveBeenCalledWith(mockTask);
    });
  });

  describe('dispatchDueTasks', () => {
    it('should skip when no due tasks', async () => {
      taskRepo.find!.mockResolvedValue([]);
      await service.dispatchDueTasks();
      // No error = pass
    });

    it('should execute and advance interval tasks', async () => {
      const task = {
        id: 't1',
        userId,
        name: 'Check',
        triggerType: TaskTriggerType.INTERVAL,
        intervalSeconds: 60,
        actionType: TaskActionType.CHECK_CHANNEL,
        actionConfig: {},
        status: ScheduledTaskStatus.ACTIVE,
        runCount: 0,
        failCount: 0,
        maxRuns: null,
        nextRunAt: new Date(Date.now() - 1000),
      };
      taskRepo.find!.mockResolvedValue([task]);

      await service.dispatchDueTasks();

      expect(taskRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          runCount: 1,
          status: ScheduledTaskStatus.ACTIVE,
        }),
      );
    });

    it('should mark one-time task as COMPLETED after run', async () => {
      const task = {
        id: 't2',
        userId,
        name: 'OneShot',
        triggerType: TaskTriggerType.ONE_TIME,
        actionType: TaskActionType.DIGEST_SUMMARY,
        actionConfig: {},
        status: ScheduledTaskStatus.ACTIVE,
        runCount: 0,
        failCount: 0,
        maxRuns: null,
        nextRunAt: new Date(Date.now() - 1000),
      };
      taskRepo.find!.mockResolvedValue([task]);

      await service.dispatchDueTasks();

      expect(taskRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ScheduledTaskStatus.COMPLETED,
        }),
      );
    });

    it('should mark task as FAILED after 5 failures', async () => {
      const task = {
        id: 't3',
        userId,
        name: 'BadTask',
        triggerType: TaskTriggerType.INTERVAL,
        intervalSeconds: 60,
        actionType: TaskActionType.SEND_MESSAGE,
        actionConfig: {}, // Missing required fields → will throw
        status: ScheduledTaskStatus.ACTIVE,
        runCount: 0,
        failCount: 4,
        maxRuns: null,
        nextRunAt: new Date(Date.now() - 1000),
      };
      taskRepo.find!.mockResolvedValue([task]);

      await service.dispatchDueTasks();

      expect(taskRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failCount: 5,
          status: ScheduledTaskStatus.FAILED,
        }),
      );
    });
  });
});

describe('OperationsDashboardService', () => {
  let service: OperationsDashboardService;
  let eventRepo: ReturnType<typeof createMockRepo>;
  let agentRepo: ReturnType<typeof createMockRepo>;
  let deviceRepo: ReturnType<typeof createMockRepo>;
  let taskRepo: ReturnType<typeof createMockRepo>;

  const userId = 'user-456';

  beforeEach(async () => {
    eventRepo = createMockRepo<ConversationEvent>();
    agentRepo = createMockRepo<UserAgent>();
    deviceRepo = createMockRepo<DevicePresence>();
    taskRepo = createMockRepo<AgentScheduledTask>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationsDashboardService,
        { provide: getRepositoryToken(ConversationEvent), useValue: eventRepo },
        { provide: getRepositoryToken(UserAgent), useValue: agentRepo },
        { provide: getRepositoryToken(DevicePresence), useValue: deviceRepo },
        { provide: getRepositoryToken(AgentScheduledTask), useValue: taskRepo },
      ],
    }).compile();

    service = module.get<OperationsDashboardService>(OperationsDashboardService);
  });

  describe('getDashboardOverview', () => {
    it('should return all dashboard metrics', async () => {
      agentRepo.count!.mockResolvedValue(3);
      eventRepo.count!.mockResolvedValue(100);
      deviceRepo.count!.mockResolvedValue(2);
      taskRepo.count!.mockResolvedValue(5);
      agentRepo.find!.mockResolvedValue([]);

      const result = await service.getDashboardOverview(userId);

      expect(result).toHaveProperty('totalAgents');
      expect(result).toHaveProperty('activeAgents');
      expect(result).toHaveProperty('totalMessages24h');
      expect(result).toHaveProperty('onlineDevices');
      expect(result).toHaveProperty('activeScheduledTasks');
      expect(result).toHaveProperty('channelVolume');
      expect(result).toHaveProperty('agentActivity');
    });
  });

  describe('getChannelVolume', () => {
    it('should return channel breakdown', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { channel: 'telegram', totalMessages: '50', inbound: '30', outbound: '20', failedDeliveries: '1' },
          { channel: 'discord', totalMessages: '20', inbound: '12', outbound: '8', failedDeliveries: '0' },
        ]),
      };
      eventRepo.createQueryBuilder!.mockReturnValue(mockQb);

      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const result = await service.getChannelVolume(userId, since);

      expect(result).toHaveLength(2);
      expect(result[0].channel).toBe('telegram');
      expect(result[0].totalMessages).toBe(50);
      expect(result[0].inbound).toBe(30);
    });
  });

  describe('getResponseTimeStats', () => {
    it('should return zero stats when no events', async () => {
      eventRepo.find!.mockResolvedValue([]);

      const result = await service.getResponseTimeStats(userId, 'agent-1', 7);
      expect(result.avgMs).toBe(0);
      expect(result.count).toBe(0);
    });

    it('should compute avg and p95 from inbound/outbound pairs', async () => {
      const now = Date.now();
      const events = [
        { direction: 'inbound', createdAt: new Date(now) },
        { direction: 'outbound', createdAt: new Date(now + 500) },
        { direction: 'inbound', createdAt: new Date(now + 1000) },
        { direction: 'outbound', createdAt: new Date(now + 2000) },
        { direction: 'inbound', createdAt: new Date(now + 3000) },
        { direction: 'outbound', createdAt: new Date(now + 3200) },
      ];
      eventRepo.find!.mockResolvedValue(events);

      const result = await service.getResponseTimeStats(userId, 'agent-1', 7);
      expect(result.count).toBe(3);
      expect(result.avgMs).toBeGreaterThan(0);
      expect(result.p95Ms).toBeGreaterThan(0);
    });
  });
});
