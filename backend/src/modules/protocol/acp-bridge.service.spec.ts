import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { AcpBridgeService, AcpSessionStatus } from './acp-bridge.service';
import { AgentSession, SessionStatus } from '../../entities/agent-session.entity';
import { Skill } from '../../entities/skill.entity';

describe('AcpBridgeService', () => {
  let service: AcpBridgeService;

  const mockSessionRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockSkillRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcpBridgeService,
        { provide: getRepositoryToken(AgentSession), useValue: mockSessionRepo },
        { provide: getRepositoryToken(Skill), useValue: mockSkillRepo },
      ],
    }).compile();

    service = module.get<AcpBridgeService>(AcpBridgeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSession', () => {
    it('should create a new ACP session', async () => {
      const saved = {
        id: '1',
        sessionId: 'acp-123-abc',
        userId: 'u1',
        status: SessionStatus.ACTIVE,
        metadata: { source: 'acp-bridge', acpVersion: '0.15' },
        lastMessageAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockSessionRepo.create.mockReturnValue(saved);
      mockSessionRepo.save.mockResolvedValue(saved);

      const result = await service.createSession('u1', 'a1');

      expect(result.userId).toBe('u1');
      expect(result.status).toBe(AcpSessionStatus.ACTIVE);
      expect(mockSessionRepo.create).toHaveBeenCalled();
      expect(mockSessionRepo.save).toHaveBeenCalled();
    });
  });

  describe('loadSession', () => {
    it('should load an existing session', async () => {
      const session = {
        id: '1',
        sessionId: 'acp-123',
        userId: 'u1',
        status: SessionStatus.ACTIVE,
        metadata: { source: 'acp-bridge' },
        lastMessageAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockSessionRepo.findOne.mockResolvedValue(session);

      const result = await service.loadSession('acp-123');
      expect(result.sessionId).toBe('acp-123');
      expect(result.status).toBe(AcpSessionStatus.ACTIVE);
    });

    it('should throw NotFoundException for missing session', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);

      await expect(service.loadSession('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('steerSession', () => {
    it('should pause an active session', async () => {
      const session = {
        id: '1',
        sessionId: 'acp-123',
        userId: 'u1',
        status: SessionStatus.ACTIVE,
        metadata: { source: 'acp-bridge' },
        lastMessageAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockSessionRepo.findOne.mockResolvedValue(session);
      mockSessionRepo.save.mockResolvedValue({ ...session, metadata: { ...session.metadata, paused: true } });

      const result = await service.steerSession('acp-123', { type: 'pause' });
      expect(result.status).toBeDefined();
    });

    it('should cancel a session', async () => {
      const session = {
        id: '1',
        sessionId: 'acp-123',
        userId: 'u1',
        status: SessionStatus.ACTIVE,
        metadata: { source: 'acp-bridge' },
        lastMessageAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockSessionRepo.findOne.mockResolvedValue(session);
      mockSessionRepo.save.mockResolvedValue({ ...session, status: SessionStatus.EXPIRED });

      const result = await service.steerSession('acp-123', { type: 'cancel' });
      expect(result).toBeDefined();
    });
  });

  describe('killSession', () => {
    it('should kill a session and set status to expired', async () => {
      const session = {
        id: '1',
        sessionId: 'acp-123',
        userId: 'u1',
        status: SessionStatus.ACTIVE,
        metadata: {},
        lastMessageAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockSessionRepo.findOne.mockResolvedValue(session);
      mockSessionRepo.save.mockResolvedValue({ ...session, status: SessionStatus.EXPIRED });

      await service.killSession('acp-123', 'user requested');
      expect(mockSessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: SessionStatus.EXPIRED }),
      );
    });
  });

  describe('listSessions', () => {
    it('should list sessions for a user', async () => {
      const sessions = [
        {
          sessionId: 'acp-1', userId: 'u1', status: SessionStatus.ACTIVE,
          metadata: { source: 'acp-bridge' }, lastMessageAt: new Date(),
          createdAt: new Date(), updatedAt: new Date(),
        },
      ];
      mockSessionRepo.find.mockResolvedValue(sessions);

      const result = await service.listSessions('u1');
      expect(result).toHaveLength(1);
      expect(result[0].sessionId).toBe('acp-1');
    });
  });

  describe('listActions', () => {
    it('should return skills as ACP actions', async () => {
      const skills = [
        {
          id: 'sk1', name: 'Weather', description: 'Get weather',
          inputSchema: { type: 'object' }, pricing: { model: 'free' },
        },
      ];
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(skills),
      };
      mockSkillRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listActions();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Weather');
      expect(result[0].operationId).toBe('sk1');
    });
  });
});
