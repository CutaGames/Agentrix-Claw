import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DesktopSyncService } from './desktop-sync.service';
import { NotificationService } from '../notification/notification.service';
import {
  DesktopDevicePresence,
  DesktopSession,
  DesktopTask,
  DesktopApproval,
  DesktopCommand,
} from '../../entities/desktop-sync.entity';
import {
  SharedWorkspace,
  SharedWorkspaceMember,
  SharedWorkspaceSession,
  DeviceMediaTransfer,
} from '../../entities/shared-workspace.entity';
import {
  DesktopApprovalDecision,
  DesktopApprovalRiskLevel,
  DesktopCommandKind,
  DesktopCommandStatus,
  DesktopSessionDeviceType,
  DesktopTaskStatus,
} from './dto/desktop-sync.dto';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation((dto) => ({ id: 'mock-id', createdAt: new Date(), updatedAt: new Date(), ...dto })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'mock-id', createdAt: new Date(), updatedAt: new Date(), ...entity })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
  };
}

const mockNotificationService = {
  createNotification: jest.fn().mockResolvedValue({}),
  sendPushNotification: jest.fn().mockResolvedValue(undefined),
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('DesktopSyncService', () => {
  let service: DesktopSyncService;
  let devicePresenceRepo: ReturnType<typeof mockRepo>;
  let sessionRepo: ReturnType<typeof mockRepo>;
  let taskRepo: ReturnType<typeof mockRepo>;
  let approvalRepo: ReturnType<typeof mockRepo>;
  let commandRepo: ReturnType<typeof mockRepo>;
  let workspaceRepo: ReturnType<typeof mockRepo>;
  let workspaceMemberRepo: ReturnType<typeof mockRepo>;
  let workspaceSessionRepo: ReturnType<typeof mockRepo>;
  let mediaTransferRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    devicePresenceRepo = mockRepo();
    sessionRepo = mockRepo();
    taskRepo = mockRepo();
    approvalRepo = mockRepo();
    commandRepo = mockRepo();
    workspaceRepo = mockRepo();
    workspaceMemberRepo = mockRepo();
    workspaceSessionRepo = mockRepo();
    mediaTransferRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DesktopSyncService,
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: getRepositoryToken(DesktopDevicePresence), useValue: devicePresenceRepo },
        { provide: getRepositoryToken(DesktopSession), useValue: sessionRepo },
        { provide: getRepositoryToken(DesktopTask), useValue: taskRepo },
        { provide: getRepositoryToken(DesktopApproval), useValue: approvalRepo },
        { provide: getRepositoryToken(DesktopCommand), useValue: commandRepo },
        { provide: getRepositoryToken(SharedWorkspace), useValue: workspaceRepo },
        { provide: getRepositoryToken(SharedWorkspaceMember), useValue: workspaceMemberRepo },
        { provide: getRepositoryToken(SharedWorkspaceSession), useValue: workspaceSessionRepo },
        { provide: getRepositoryToken(DeviceMediaTransfer), useValue: mediaTransferRepo },
      ],
    }).compile();

    service = module.get<DesktopSyncService>(DesktopSyncService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  describe('heartbeat', () => {
    it('should create new device presence on first heartbeat', async () => {
      devicePresenceRepo.findOne.mockResolvedValue(null);

      const result = await service.heartbeat('user-1', {
        deviceId: 'dev-1',
        platform: 'windows',
        appVersion: '1.0.0',
      });

      expect(result.ok).toBe(true);
      expect(result.device).toBeDefined();
      expect(result.device.deviceId).toBe('dev-1');
      expect(result.device.isOnline).toBe(true);
      expect(devicePresenceRepo.save).toHaveBeenCalled();
    });

    it('should update existing device presence', async () => {
      const existing = {
        id: 'dp-1',
        userId: 'user-1',
        deviceId: 'dev-1',
        platform: 'windows',
        lastSeenAt: new Date(Date.now() - 60000),
      };
      devicePresenceRepo.findOne.mockResolvedValue(existing);

      const result = await service.heartbeat('user-1', {
        deviceId: 'dev-1',
        platform: 'windows',
        appVersion: '1.1.0',
      });

      expect(result.ok).toBe(true);
      expect(devicePresenceRepo.save).toHaveBeenCalled();
    });

    it('should include context in heartbeat', async () => {
      devicePresenceRepo.findOne.mockResolvedValue(null);

      await service.heartbeat('user-1', {
        deviceId: 'dev-1',
        platform: 'macos',
        context: { activeWindowTitle: 'VS Code', processName: 'code' },
      });

      const savedArg = devicePresenceRepo.save.mock.calls[0][0];
      expect(savedArg.context).toBeDefined();
    });
  });

  // ── Tasks ─────────────────────────────────────────────────────────────────

  describe('upsertTask', () => {
    it('should create a new task', async () => {
      taskRepo.findOne.mockResolvedValue(null);

      const result = await service.upsertTask('user-1', {
        taskId: 'task-1',
        deviceId: 'dev-1',
        title: 'Test Task',
        summary: 'A test task',
        status: DesktopTaskStatus.EXECUTING,
        timeline: [],
      });

      expect(result.ok).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.task.taskId).toBe('task-1');
      expect(taskRepo.save).toHaveBeenCalled();
    });

    it('should update existing task', async () => {
      const existing = {
        id: 't-1',
        userId: 'user-1',
        taskId: 'task-1',
        timeline: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      taskRepo.findOne.mockResolvedValue(existing);

      const result = await service.upsertTask('user-1', {
        taskId: 'task-1',
        deviceId: 'dev-1',
        title: 'Updated Task',
        summary: 'Updated',
        status: DesktopTaskStatus.COMPLETED,
        timeline: [],
      });

      expect(result.ok).toBe(true);
      expect(taskRepo.save).toHaveBeenCalled();
    });
  });

  // ── Approvals ─────────────────────────────────────────────────────────────

  describe('createApproval', () => {
    it('should create approval and send notification', async () => {
      taskRepo.findOne.mockResolvedValue({
        id: 't-1',
        userId: 'user-1',
        taskId: 'task-1',
        status: DesktopTaskStatus.EXECUTING,
        timeline: [],
        updatedAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.createApproval('user-1', {
        deviceId: 'dev-1',
        taskId: 'task-1',
        title: 'Delete file?',
        description: 'Agent wants to delete important.txt',
        riskLevel: DesktopApprovalRiskLevel.L2,
      });

      expect(result.ok).toBe(true);
      expect(result.approval).toBeDefined();
      expect(result.approval.status).toBe('pending');
      expect(mockNotificationService.createNotification).toHaveBeenCalled();
      expect(mockNotificationService.sendPushNotification).toHaveBeenCalled();
    });
  });

  describe('respondToApproval', () => {
    it('should approve a pending approval', async () => {
      approvalRepo.findOne.mockResolvedValue({
        id: 'a-1',
        userId: 'user-1',
        deviceId: 'dev-1',
        taskId: 'task-1',
        title: 'Test',
        description: 'Test desc',
        riskLevel: 'L1',
        status: 'pending',
        createdAt: new Date(),
      });
      taskRepo.findOne.mockResolvedValue({
        id: 't-1',
        userId: 'user-1',
        taskId: 'task-1',
        timeline: [],
        updatedAt: new Date(),
      });

      const result = await service.respondToApproval('user-1', 'a-1', {
        decision: DesktopApprovalDecision.APPROVED,
        deviceId: 'dev-mobile',
      });

      expect(result.ok).toBe(true);
      expect(result.approval.status).toBe('approved');
    });

    it('should reject a pending approval', async () => {
      approvalRepo.findOne.mockResolvedValue({
        id: 'a-2',
        userId: 'user-1',
        deviceId: 'dev-1',
        taskId: 'task-2',
        title: 'Test',
        description: 'Test desc',
        riskLevel: 'L2',
        status: 'pending',
        createdAt: new Date(),
      });
      taskRepo.findOne.mockResolvedValue({
        id: 't-2',
        userId: 'user-1',
        taskId: 'task-2',
        timeline: [],
        updatedAt: new Date(),
      });

      const result = await service.respondToApproval('user-1', 'a-2', {
        decision: DesktopApprovalDecision.REJECTED,
        deviceId: 'dev-mobile',
      });

      expect(result.ok).toBe(true);
      expect(result.approval.status).toBe('rejected');
    });

    it('should throw if approval not found', async () => {
      approvalRepo.findOne.mockResolvedValue(null);

      await expect(
        service.respondToApproval('user-1', 'nope', {
          decision: DesktopApprovalDecision.APPROVED,
          deviceId: 'dev-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── Sessions ──────────────────────────────────────────────────────────────

  describe('upsertSession', () => {
    it('should create a new session', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      const result = await service.upsertSession('user-1', {
        sessionId: 'sess-1',
        title: 'My Chat',
        deviceId: 'dev-1',
        deviceType: DesktopSessionDeviceType.DESKTOP,
        messages: [{ role: 'user', content: 'hello' }],
      });

      expect(result.ok).toBe(true);
      expect(sessionRepo.save).toHaveBeenCalled();
    });

    it('should update existing session', async () => {
      const existing = {
        id: 's-1',
        userId: 'user-1',
        sessionId: 'sess-1',
        title: 'Old',
        messages: [],
        updatedAt: new Date(),
      };
      sessionRepo.findOne.mockResolvedValue(existing);

      const result = await service.upsertSession('user-1', {
        sessionId: 'sess-1',
        title: 'Updated Chat',
        deviceId: 'dev-1',
        deviceType: DesktopSessionDeviceType.MOBILE,
        messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hey' }],
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('getSession', () => {
    it('should return session if found', async () => {
      sessionRepo.findOne.mockResolvedValue({
        sessionId: 'sess-1',
        messages: [{ role: 'user', content: 'hello' }],
        title: 'Test',
        messageCount: 1,
        updatedAt: new Date(),
        deviceId: 'dev-1',
        deviceType: 'desktop',
      });

      const result = await service.getSession('user-1', 'sess-1');
      expect(result.sessionId).toBe('sess-1');
      expect(result.messages.length).toBe(1);
    });

    it('should throw if session not found', async () => {
      sessionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getSession('user-1', 'nope'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── Commands ──────────────────────────────────────────────────────────────

  describe('createCommand', () => {
    it('should create a remote command', async () => {
      const result = await service.createCommand('user-1', {
        title: 'List windows',
        kind: DesktopCommandKind.LIST_WINDOWS,
        targetDeviceId: 'dev-1',
        requesterDeviceId: 'dev-mobile',
      });

      expect(result.ok).toBe(true);
      expect(result.command).toBeDefined();
      expect(commandRepo.save).toHaveBeenCalled();
    });
  });

  describe('claimCommand', () => {
    it('should claim a pending command', async () => {
      commandRepo.findOne.mockResolvedValue({
        id: 'cmd-1',
        userId: 'user-1',
        status: DesktopCommandStatus.PENDING,
        targetDeviceId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.claimCommand('user-1', 'cmd-1', { deviceId: 'dev-1' });
      expect(result.ok).toBe(true);
      expect(commandRepo.save).toHaveBeenCalled();
    });

    it('should throw if command not found', async () => {
      commandRepo.findOne.mockResolvedValue(null);

      await expect(
        service.claimCommand('user-1', 'nope', { deviceId: 'dev-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject if targeted to different device', async () => {
      commandRepo.findOne.mockResolvedValue({
        id: 'cmd-2',
        userId: 'user-1',
        status: DesktopCommandStatus.PENDING,
        targetDeviceId: 'dev-A',
      });

      await expect(
        service.claimCommand('user-1', 'cmd-2', { deviceId: 'dev-B' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('completeCommand', () => {
    it('should complete a command with result', async () => {
      commandRepo.findOne.mockResolvedValue({
        id: 'cmd-1',
        userId: 'user-1',
        status: DesktopCommandStatus.CLAIMED,
        claimedByDeviceId: 'dev-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.completeCommand('user-1', 'cmd-1', {
        status: DesktopCommandStatus.COMPLETED,
        deviceId: 'dev-1',
        result: { windows: ['window1', 'window2'] },
      });

      expect(result.ok).toBe(true);
      expect(commandRepo.save).toHaveBeenCalled();
    });

    it('should throw if command not found', async () => {
      commandRepo.findOne.mockResolvedValue(null);

      await expect(
        service.completeCommand('user-1', 'nope', {
          status: DesktopCommandStatus.COMPLETED,
          deviceId: 'dev-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── getState ──────────────────────────────────────────────────────────────

  describe('getState', () => {
    it('should return aggregated state', async () => {
      const result = await service.getState('user-1');

      expect(result.devices).toBeDefined();
      expect(result.tasks).toBeDefined();
      expect(result.approvals).toBeDefined();
      expect(result.sessions).toBeDefined();
      expect(result.commands).toBeDefined();
      expect(result.pendingApprovalCount).toBe(0);
      expect(result.serverTime).toBeDefined();
    });
  });
});
