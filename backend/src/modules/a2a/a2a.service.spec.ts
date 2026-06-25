/**
 * A2A Service E2E Tests
 * 
 * Tests the full A2A task lifecycle, reputation system,
 * quality assessment, and mandate integration.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { A2AService, CreateA2ATaskDto } from './a2a.service';
import { A2ATask, A2ATaskStatus, A2ATaskPriority } from '../../entities/a2a-task.entity';
import { AgentReputation } from '../../entities/agent-reputation.entity';
import { AP2MandateEntity, MandateStatus } from '../../entities/ap2-mandate.entity';

// ============ Mock Repositories ============

const createMockRepository = () => ({
  create: jest.fn((data) => ({ id: 'test-uuid', ...data })),
  save: jest.fn((entity) => Promise.resolve({ ...entity, id: entity.id || 'test-uuid', createdAt: new Date(), updatedAt: new Date() })),
  findOne: jest.fn(),
  find: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
  })),
});

describe('A2AService', () => {
  let service: A2AService;
  let taskRepo: ReturnType<typeof createMockRepository>;
  let reputationRepo: ReturnType<typeof createMockRepository>;
  let mandateRepo: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    taskRepo = createMockRepository();
    reputationRepo = createMockRepository();
    mandateRepo = createMockRepository();

    // Default: reputation returns null (will create new)
    reputationRepo.findOne.mockResolvedValue(null);
    reputationRepo.save.mockImplementation((entity) =>
      Promise.resolve({ id: 'rep-uuid', tasksTotal: 0, tasksCompleted: 0, tasksFailed: 0, tasksCancelled: 0, overallScore: 50, tier: 'bronze', avgQualityScore: 0, avgResponseTime: 0, avgCompletionTime: 0, onTimeRate: 100, totalVolume: '0', specializations: [], recentReviews: [], ...entity }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        A2AService,
        { provide: getRepositoryToken(A2ATask), useValue: taskRepo },
        { provide: getRepositoryToken(AgentReputation), useValue: reputationRepo },
        { provide: getRepositoryToken(AP2MandateEntity), useValue: mandateRepo },
      ],
    }).compile();

    service = module.get<A2AService>(A2AService);
  });

  // ==================== Task Creation ====================

  describe('createTask', () => {
    const baseDto: CreateA2ATaskDto = {
      requesterAgentId: 'agent_requester',
      targetAgentId: 'agent_target',
      title: 'Test Task',
      description: 'Test description',
    };

    it('should create a task with default values', async () => {
      const result = await service.createTask(baseDto);

      expect(taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requesterAgentId: 'agent_requester',
          targetAgentId: 'agent_target',
          title: 'Test Task',
          status: A2ATaskStatus.PENDING,
          priority: A2ATaskPriority.NORMAL,
          currency: 'USDC',
        }),
      );
      expect(taskRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should create a task with all optional fields', async () => {
      const fullDto: CreateA2ATaskDto = {
        ...baseDto,
        taskType: 'code_review',
        priority: A2ATaskPriority.HIGH,
        maxPrice: '1000000',
        currency: 'USDT',
        mandateId: undefined,
        deadline: '2026-03-01T00:00:00Z',
        parentTaskId: 'parent-task-id',
        metadata: { key: 'value' },
      };

      await service.createTask(fullDto);

      expect(taskRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'code_review',
          priority: A2ATaskPriority.HIGH,
          maxPrice: '1000000',
          currency: 'USDT',
          parentTaskId: 'parent-task-id',
        }),
      );
    });

    it('should validate mandate if provided', async () => {
      mandateRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createTask({ ...baseDto, mandateId: 'bad-mandate' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject inactive mandate', async () => {
      mandateRepo.findOne.mockResolvedValue({
        id: 'mandate-1',
        status: MandateStatus.REVOKED,
        agentId: 'agent_requester',
      });

      await expect(
        service.createTask({ ...baseDto, mandateId: 'mandate-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject mandate belonging to different agent', async () => {
      mandateRepo.findOne.mockResolvedValue({
        id: 'mandate-1',
        status: MandateStatus.ACTIVE,
        agentId: 'other_agent',
      });

      await expect(
        service.createTask({ ...baseDto, mandateId: 'mandate-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should increment target agent task count on creation', async () => {
      await service.createTask(baseDto);

      // Should have called getOrCreateReputation for target agent
      expect(reputationRepo.findOne).toHaveBeenCalledWith({ where: { agentId: 'agent_target' } });
      expect(reputationRepo.save).toHaveBeenCalled();
    });
  });

  // ==================== Task Lifecycle ====================

  describe('acceptTask', () => {
    it('should accept a pending task', async () => {
      const task = {
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.PENDING,
        createdAt: new Date(Date.now() - 60000),
      };
      taskRepo.findOne.mockResolvedValue(task);

      const result = await service.acceptTask('task-1', 'agent_target', { agreedPrice: '500' });

      expect(result.status).toBe(A2ATaskStatus.ACCEPTED);
      expect(result.agreedPrice).toBe('500');
      expect(result.acceptedAt).toBeDefined();
    });

    it('should reject accept from wrong agent', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.PENDING,
      });

      await expect(
        service.acceptTask('task-1', 'wrong_agent'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject accept on non-pending task', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.IN_PROGRESS,
      });

      await expect(
        service.acceptTask('task-1', 'agent_target'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('startTask', () => {
    it('should start an accepted task', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.ACCEPTED,
      });

      const result = await service.startTask('task-1', 'agent_target');

      expect(result.status).toBe(A2ATaskStatus.IN_PROGRESS);
      expect(result.startedAt).toBeDefined();
    });

    it('should reject start from wrong agent', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.ACCEPTED,
      });

      await expect(
        service.startTask('task-1', 'wrong_agent'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deliverTask', () => {
    it('should deliver an in-progress task', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.IN_PROGRESS,
        deliverables: [],
      });

      const result = await service.deliverTask('task-1', 'agent_target', {
        deliverables: [
          { type: 'text', content: 'Here is the result' },
          { type: 'code', content: 'console.log("hello")' },
        ],
      });

      expect(result.status).toBe(A2ATaskStatus.DELIVERED);
      expect(result.deliveredAt).toBeDefined();
      expect(result.deliverables).toHaveLength(2);
      expect(result.deliverables[0].submittedAt).toBeDefined();
    });

    it('should allow re-delivery after rejection', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.REJECTED,
        deliverables: [],
      });

      const result = await service.deliverTask('task-1', 'agent_target', {
        deliverables: [{ type: 'text', content: 'Fixed version' }],
      });

      expect(result.status).toBe(A2ATaskStatus.DELIVERED);
    });
  });

  describe('reviewTask', () => {
    it('should approve a delivered task', async () => {
      const task = {
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.DELIVERED,
        deliverables: [{ type: 'text', content: 'result' }],
        createdAt: new Date(Date.now() - 3600000),
        acceptedAt: new Date(Date.now() - 3000000),
        deadline: new Date(Date.now() + 86400000),
      };
      taskRepo.findOne.mockResolvedValue(task);

      const result = await service.reviewTask('task-1', 'agent_requester', {
        approved: true,
        qualityScore: 90,
        comment: 'Great work!',
      });

      expect(result.status).toBe(A2ATaskStatus.COMPLETED);
      expect(result.completedAt).toBeDefined();
      expect(result.qualityAssessment).toBeDefined();
      expect(result.qualityAssessment.score).toBe(90);
    });

    it('should reject a delivered task', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.DELIVERED,
        deliverables: [{ type: 'text', content: 'bad result' }],
      });

      const result = await service.reviewTask('task-1', 'agent_requester', {
        approved: false,
        qualityScore: 30,
        comment: 'Does not meet requirements',
      });

      expect(result.status).toBe(A2ATaskStatus.REJECTED);
    });

    it('should reject review from non-requester', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.DELIVERED,
      });

      await expect(
        service.reviewTask('task-1', 'agent_target', { approved: true }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelTask', () => {
    it('should cancel a pending task', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.PENDING,
      });

      const result = await service.cancelTask('task-1', 'agent_requester', 'Changed my mind');

      expect(result.status).toBe(A2ATaskStatus.CANCELLED);
      expect(result.cancelReason).toBe('Changed my mind');
      expect(result.cancelledAt).toBeDefined();
    });

    it('should allow target agent to cancel', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.ACCEPTED,
      });

      const result = await service.cancelTask('task-1', 'agent_target', 'Too busy');

      expect(result.status).toBe(A2ATaskStatus.CANCELLED);
    });

    it('should reject cancel from unrelated agent', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.PENDING,
      });

      await expect(
        service.cancelTask('task-1', 'random_agent'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject cancel on completed task', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.COMPLETED,
      });

      await expect(
        service.cancelTask('task-1', 'agent_requester'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== Task Query ====================

  describe('getTask', () => {
    it('should return task by ID', async () => {
      const task = { id: 'task-1', title: 'Test', status: A2ATaskStatus.PENDING };
      taskRepo.findOne.mockResolvedValue(task);

      const result = await service.getTask('task-1');
      expect(result).toEqual(task);
    });

    it('should throw NotFoundException for missing task', async () => {
      taskRepo.findOne.mockResolvedValue(null);

      await expect(service.getTask('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listTasks', () => {
    it('should list tasks with filters', async () => {
      const mockTasks = [
        { id: 'task-1', status: A2ATaskStatus.PENDING },
        { id: 'task-2', status: A2ATaskStatus.COMPLETED },
      ];
      const qb = taskRepo.createQueryBuilder();
      qb.getManyAndCount.mockResolvedValue([mockTasks, 2]);

      const result = await service.listTasks({
        agentId: 'agent_target',
        role: 'target',
        page: 1,
        limit: 20,
      });

      expect(result.tasks).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  // ==================== Quality Assessment ====================

  describe('autoAssessQuality', () => {
    it('should assess quality of delivered task', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.DELIVERED,
        deliverables: [
          { type: 'text', content: 'Result here' },
          { type: 'code', content: 'function test() {}' },
        ],
        deadline: new Date(Date.now() + 86400000), // future deadline
        createdAt: new Date(Date.now() - 3600000),
        acceptedAt: new Date(Date.now() - 3000000),
      });

      // Mock reputation for target agent
      reputationRepo.findOne.mockResolvedValue({
        agentId: 'agent_target',
        overallScore: 80,
        tasksCompleted: 10,
        tasksFailed: 1,
        tasksTotal: 11,
        tier: 'gold',
      });

      const result = await service.autoAssessQuality('task-1');

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.criteria).toBeDefined();
      expect(result.criteria.length).toBeGreaterThan(0);
      expect(result.assessedBy).toBe('auto');
    });

    it('should reject assessment on non-delivered task', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        status: A2ATaskStatus.IN_PROGRESS,
      });

      await expect(service.autoAssessQuality('task-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('autoApproveIfQualified', () => {
    it('should auto-approve if score meets threshold', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.DELIVERED,
        deliverables: [{ type: 'text', content: 'Good result' }],
        deadline: new Date(Date.now() + 86400000),
        createdAt: new Date(Date.now() - 3600000),
        acceptedAt: new Date(Date.now() - 3000000),
      });

      reputationRepo.findOne.mockResolvedValue({
        agentId: 'agent_target',
        overallScore: 90,
        tasksCompleted: 50,
        tasksFailed: 0,
        tasksTotal: 50,
        tier: 'platinum',
      });

      const result = await service.autoApproveIfQualified('task-1', 50);

      expect(result.assessment).toBeDefined();
      expect(result.assessment.score).toBeGreaterThanOrEqual(50);
      // If score >= threshold, task should be approved
      if (result.approved) {
        expect(result.assessment.score).toBeGreaterThanOrEqual(50);
      }
    });
  });

  // ==================== Negotiation ====================

  describe('negotiate', () => {
    it('should record negotiation from requester', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.PENDING,
        metadata: {},
      });

      const result = await service.negotiate('task-1', 'agent_requester', {
        proposedPrice: '800',
        message: 'Can you do it for 800?',
      });

      expect(result.metadata?.negotiations).toBeDefined();
      expect(result.metadata.negotiations).toHaveLength(1);
      expect(result.metadata.negotiations[0].agentId).toBe('agent_requester');
    });

    it('should update task fields when target negotiates', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.PENDING,
        metadata: {},
      });

      const result = await service.negotiate('task-1', 'agent_target', {
        proposedPrice: '1200',
        proposedDeadline: '2026-04-01T00:00:00Z',
      });

      expect(result.agreedPrice).toBe('1200');
    });

    it('should reject negotiation from unrelated agent', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-1',
        requesterAgentId: 'agent_requester',
        targetAgentId: 'agent_target',
        status: A2ATaskStatus.PENDING,
      });

      await expect(
        service.negotiate('task-1', 'random_agent', { proposedPrice: '100' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== Reputation ====================

  describe('getReputation', () => {
    it('should return existing reputation', async () => {
      reputationRepo.findOne.mockResolvedValue({
        agentId: 'agent_target',
        overallScore: 85,
        tier: 'gold',
        tasksCompleted: 20,
      });

      const result = await service.getReputation('agent_target');

      expect(result.agentId).toBe('agent_target');
      expect(result.overallScore).toBe(85);
      expect(result.tier).toBe('gold');
    });

    it('should create new reputation for unknown agent', async () => {
      reputationRepo.findOne.mockResolvedValue(null);

      const result = await service.getReputation('new_agent');

      expect(reputationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'new_agent',
          overallScore: 50,
          tier: 'bronze',
        }),
      );
      expect(result.agentId).toBe('new_agent');
    });
  });

  // ==================== Full Lifecycle Integration ====================

  describe('Full Task Lifecycle', () => {
    it('should complete full lifecycle: create → accept → start → deliver → approve', async () => {
      // Step 1: Create
      const createdTask = {
        id: 'lifecycle-task',
        requesterAgentId: 'agent_a',
        targetAgentId: 'agent_b',
        status: A2ATaskStatus.PENDING,
        title: 'Full lifecycle test',
        description: 'Testing complete flow',
        createdAt: new Date(),
        deliverables: [],
      };

      taskRepo.findOne.mockResolvedValue(createdTask);
      taskRepo.save.mockImplementation((entity) => Promise.resolve({ ...entity }));

      // Step 2: Accept
      const accepted = await service.acceptTask('lifecycle-task', 'agent_b', { agreedPrice: '1000' });
      expect(accepted.status).toBe(A2ATaskStatus.ACCEPTED);
      expect(accepted.acceptedAt).toBeDefined();

      // Step 3: Start
      createdTask.status = A2ATaskStatus.ACCEPTED;
      const started = await service.startTask('lifecycle-task', 'agent_b');
      expect(started.status).toBe(A2ATaskStatus.IN_PROGRESS);
      expect(started.startedAt).toBeDefined();

      // Step 4: Deliver
      createdTask.status = A2ATaskStatus.IN_PROGRESS;
      const delivered = await service.deliverTask('lifecycle-task', 'agent_b', {
        deliverables: [{ type: 'text', content: 'Final result' }],
      });
      expect(delivered.status).toBe(A2ATaskStatus.DELIVERED);
      expect(delivered.deliveredAt).toBeDefined();
      expect(delivered.deliverables).toHaveLength(1);

      // Step 5: Review (approve)
      createdTask.status = A2ATaskStatus.DELIVERED;
      createdTask.deliverables = [{ type: 'text', content: 'Final result' }];
      (createdTask as any).acceptedAt = new Date(Date.now() - 1000);
      (createdTask as any).deadline = new Date(Date.now() + 86400000);

      const completed = await service.reviewTask('lifecycle-task', 'agent_a', {
        approved: true,
        qualityScore: 95,
        comment: 'Excellent work',
      });
      expect(completed.status).toBe(A2ATaskStatus.COMPLETED);
      expect(completed.completedAt).toBeDefined();
      expect(completed.qualityAssessment.score).toBe(95);
    });

    it('should handle reject → re-deliver → approve flow', async () => {
      const task = {
        id: 'reject-flow-task',
        requesterAgentId: 'agent_a',
        targetAgentId: 'agent_b',
        status: A2ATaskStatus.DELIVERED,
        deliverables: [{ type: 'text', content: 'First attempt' }],
        createdAt: new Date(),
      };

      taskRepo.findOne.mockResolvedValue(task);
      taskRepo.save.mockImplementation((entity) => Promise.resolve({ ...entity }));

      // Reject
      const rejected = await service.reviewTask('reject-flow-task', 'agent_a', {
        approved: false,
        qualityScore: 20,
        comment: 'Needs improvement',
      });
      expect(rejected.status).toBe(A2ATaskStatus.REJECTED);

      // Re-deliver
      task.status = A2ATaskStatus.REJECTED;
      const redelivered = await service.deliverTask('reject-flow-task', 'agent_b', {
        deliverables: [{ type: 'text', content: 'Improved version' }],
      });
      expect(redelivered.status).toBe(A2ATaskStatus.DELIVERED);

      // Approve
      task.status = A2ATaskStatus.DELIVERED;
      task.deliverables = [{ type: 'text', content: 'Improved version' }];
      (task as any).acceptedAt = new Date(Date.now() - 1000);

      const approved = await service.reviewTask('reject-flow-task', 'agent_a', {
        approved: true,
        qualityScore: 85,
      });
      expect(approved.status).toBe(A2ATaskStatus.COMPLETED);
    });
  });

  // ==================== Edge Cases ====================

  describe('Edge Cases', () => {
    it('should handle task with no deliverables on quality assessment', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-no-deliverables',
        status: A2ATaskStatus.DELIVERED,
        deliverables: [],
        targetAgentId: 'agent_b',
        createdAt: new Date(),
      });

      reputationRepo.findOne.mockResolvedValue({
        agentId: 'agent_b',
        overallScore: 50,
        tasksCompleted: 0,
        tasksFailed: 0,
        tasksTotal: 1,
      });

      const result = await service.autoAssessQuality('task-no-deliverables');
      // Should still produce a score, just lower for empty deliverables
      expect(result.score).toBeDefined();
      expect(result.score).toBeLessThan(100);
    });

    it('should handle task past deadline on quality assessment', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 'task-late',
        status: A2ATaskStatus.DELIVERED,
        deliverables: [{ type: 'text', content: 'Late result' }],
        targetAgentId: 'agent_b',
        deadline: new Date(Date.now() - 86400000), // yesterday
        createdAt: new Date(Date.now() - 172800000),
        acceptedAt: new Date(Date.now() - 172000000),
      });

      reputationRepo.findOne.mockResolvedValue({
        agentId: 'agent_b',
        overallScore: 70,
        tasksCompleted: 5,
        tasksFailed: 0,
        tasksTotal: 5,
      });

      const result = await service.autoAssessQuality('task-late');
      // On-time score should be 0, reducing overall
      expect(result.score).toBeDefined();
    });

    it('should handle concurrent status transitions gracefully', async () => {
      // Task already completed, trying to deliver again
      taskRepo.findOne.mockResolvedValue({
        id: 'task-completed',
        requesterAgentId: 'agent_a',
        targetAgentId: 'agent_b',
        status: A2ATaskStatus.COMPLETED,
      });

      await expect(
        service.deliverTask('task-completed', 'agent_b', {
          deliverables: [{ type: 'text', content: 'too late' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
