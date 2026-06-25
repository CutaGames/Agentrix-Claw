import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentPresenceService } from './agent-presence.service';
import { UserAgent, UserAgentStatus, DelegationLevel } from '../../entities/user-agent.entity';
import { ConversationEvent } from '../../entities/conversation-event.entity';
import { AgentSharePolicy } from '../../entities/agent-share-policy.entity';
import { AgentMemory, MemoryScope } from '../../entities/agent-memory.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

// ── Mock Repositories ───────────────────────────────────────────────────────

function createMockRepo<T>(): Partial<Record<keyof Repository<T>, jest.Mock>> {
  return {
    create: jest.fn((dto) => ({ id: 'mock-uuid', ...dto })),
    save: jest.fn((entity) => Promise.resolve({ id: 'mock-uuid', createdAt: new Date(), updatedAt: new Date(), ...entity })),
    find: jest.fn(() => Promise.resolve([])),
    findOne: jest.fn(() => Promise.resolve(null)),
    count: jest.fn(() => Promise.resolve(0)),
    remove: jest.fn(() => Promise.resolve()),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(() => Promise.resolve(null)),
      getMany: jest.fn(() => Promise.resolve([])),
      getRawMany: jest.fn(() => Promise.resolve([])),
    })),
  };
}

describe('AgentPresenceService', () => {
  let service: AgentPresenceService;
  let agentRepo: ReturnType<typeof createMockRepo>;
  let eventRepo: ReturnType<typeof createMockRepo>;
  let sharePolicyRepo: ReturnType<typeof createMockRepo>;
  let memoryRepo: ReturnType<typeof createMockRepo>;

  const userId = 'user-123';

  beforeEach(async () => {
    agentRepo = createMockRepo<UserAgent>();
    eventRepo = createMockRepo<ConversationEvent>();
    sharePolicyRepo = createMockRepo<AgentSharePolicy>();
    memoryRepo = createMockRepo<AgentMemory>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentPresenceService,
        { provide: getRepositoryToken(UserAgent), useValue: agentRepo },
        { provide: getRepositoryToken(ConversationEvent), useValue: eventRepo },
        { provide: getRepositoryToken(AgentSharePolicy), useValue: sharePolicyRepo },
        { provide: getRepositoryToken(AgentMemory), useValue: memoryRepo },
      ],
    }).compile();

    service = module.get<AgentPresenceService>(AgentPresenceService);
  });

  // ── Agent CRUD ──────────────────────────────────────────────────────────

  describe('createAgent', () => {
    it('should create an agent with default delegation level', async () => {
      const dto = { name: 'Test Agent', personality: 'Friendly assistant' };

      const result = await service.createAgent(userId, dto);

      expect(agentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          name: 'Test Agent',
          personality: 'Friendly assistant',
          status: UserAgentStatus.ACTIVE,
          delegationLevel: DelegationLevel.ASSISTANT,
          channelBindings: [],
        }),
      );
      expect(agentRepo.save).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.name).toBe('Test Agent');
    });

    it('should create an agent with custom delegation level', async () => {
      const dto = {
        name: 'Autonomous Bot',
        delegationLevel: DelegationLevel.AUTONOMOUS,
        capabilities: ['voice', 'social'],
      };

      await service.createAgent(userId, dto);

      expect(agentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          delegationLevel: DelegationLevel.AUTONOMOUS,
          capabilities: ['voice', 'social'],
        }),
      );
    });
  });

  describe('getAgent', () => {
    it('should return agent when found', async () => {
      const mockAgent = { id: 'agent-1', userId, name: 'My Agent' };
      agentRepo.findOne!.mockResolvedValue(mockAgent);

      const result = await service.getAgent(userId, 'agent-1');
      expect(result).toEqual(mockAgent);
    });

    it('should throw NotFoundException when agent not found', async () => {
      agentRepo.findOne!.mockResolvedValue(null);

      await expect(service.getAgent(userId, 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateAgent', () => {
    it('should update only provided fields', async () => {
      const mockAgent = {
        id: 'agent-1',
        userId,
        name: 'Old Name',
        personality: 'Old',
        delegationLevel: DelegationLevel.ASSISTANT,
      };
      agentRepo.findOne!.mockResolvedValue(mockAgent);

      await service.updateAgent(userId, 'agent-1', {
        name: 'New Name',
        delegationLevel: DelegationLevel.REPRESENTATIVE,
      });

      expect(agentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Name',
          personality: 'Old',
          delegationLevel: DelegationLevel.REPRESENTATIVE,
        }),
      );
    });

    it('should update status and merge metadata fields', async () => {
      const mockAgent = {
        id: 'agent-1',
        userId,
        status: UserAgentStatus.ACTIVE,
        metadata: { existing: true },
        settings: { theme: 'light' },
      };
      agentRepo.findOne!.mockResolvedValue(mockAgent);

      await service.updateAgent(userId, 'agent-1', {
        status: UserAgentStatus.PAUSED,
        metadata: { riskLevel: 'medium' },
        settings: { theme: 'dark' },
      });

      expect(agentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UserAgentStatus.PAUSED,
          metadata: { existing: true, riskLevel: 'medium' },
          settings: { theme: 'dark' },
        }),
      );
    });
  });

  describe('archiveAgent', () => {
    it('should set status to ARCHIVED', async () => {
      const mockAgent = { id: 'agent-1', userId, status: UserAgentStatus.ACTIVE };
      agentRepo.findOne!.mockResolvedValue(mockAgent);

      await service.archiveAgent(userId, 'agent-1');

      expect(agentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserAgentStatus.ARCHIVED }),
      );
    });
  });

  // ── Channel Binding ─────────────────────────────────────────────────────

  describe('bindChannel', () => {
    it('should add channel binding to agent', async () => {
      const mockAgent = {
        id: 'agent-1',
        userId,
        channelBindings: [],
      };
      agentRepo.findOne!.mockResolvedValue(mockAgent);

      // Mock createQueryBuilder to return null (no conflict)
      const mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      agentRepo.createQueryBuilder!.mockReturnValue(mockQb);

      await service.bindChannel(userId, 'agent-1', {
        platform: 'telegram',
        channelId: '123456',
        channelName: 'My Telegram',
      });

      expect(agentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          channelBindings: expect.arrayContaining([
            expect.objectContaining({
              platform: 'telegram',
              channelId: '123456',
              channelName: 'My Telegram',
            }),
          ]),
        }),
      );
    });

    it('should throw if channel already bound to same agent', async () => {
      const mockAgent = {
        id: 'agent-1',
        userId,
        channelBindings: [{ platform: 'telegram', channelId: '123456', boundAt: '2026-01-01' }],
      };
      agentRepo.findOne!.mockResolvedValue(mockAgent);

      await expect(
        service.bindChannel(userId, 'agent-1', {
          platform: 'telegram',
          channelId: '123456',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('unbindChannel', () => {
    it('should remove channel binding', async () => {
      const mockAgent = {
        id: 'agent-1',
        userId,
        channelBindings: [
          { platform: 'telegram', channelId: '123', boundAt: '2026-01-01' },
          { platform: 'discord', channelId: '456', boundAt: '2026-01-01' },
        ],
      };
      agentRepo.findOne!.mockResolvedValue(mockAgent);

      await service.unbindChannel(userId, 'agent-1', 'telegram');

      expect(agentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          channelBindings: [
            expect.objectContaining({ platform: 'discord' }),
          ],
        }),
      );
    });
  });

  // ── Conversation Events ─────────────────────────────────────────────────

  describe('createEvent', () => {
    it('should create a conversation event', async () => {
      // Mock getAgent to succeed
      agentRepo.findOne!.mockResolvedValue({ id: 'agent-1', userId });

      const dto = {
        agentId: 'agent-1',
        channel: 'mobile',
        direction: 'inbound',
        role: 'user',
        content: 'Hello agent!',
      };

      await service.createEvent(userId, dto);

      expect(eventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          agentId: 'agent-1',
          channel: 'mobile',
          direction: 'inbound',
          role: 'user',
          content: 'Hello agent!',
          contentType: 'text',
          deliveryStatus: 'delivered',
        }),
      );
      expect(eventRepo.save).toHaveBeenCalled();
    });

    it('should reject event for non-owned agent', async () => {
      agentRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.createEvent(userId, {
          agentId: 'not-my-agent',
          channel: 'mobile',
          direction: 'inbound',
          role: 'user',
          content: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── Share Policies ────────────────────────────────────────────────────────

  describe('createSharePolicy', () => {
    it('should create a new share policy', async () => {
      // Mock both agents exist
      agentRepo.findOne!
        .mockResolvedValueOnce({ id: 'agent-a', userId })
        .mockResolvedValueOnce({ id: 'agent-b', userId });

      sharePolicyRepo.findOne!.mockResolvedValue(null);

      await service.createSharePolicy(userId, {
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        shareType: 'memory',
        shareMode: 'summary_only',
      });

      expect(sharePolicyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          sourceAgentId: 'agent-a',
          targetAgentId: 'agent-b',
          shareType: 'memory',
          shareMode: 'summary_only',
        }),
      );
    });

    it('should update existing share policy', async () => {
      agentRepo.findOne!
        .mockResolvedValueOnce({ id: 'agent-a', userId })
        .mockResolvedValueOnce({ id: 'agent-b', userId });

      const existing = {
        id: 'policy-1',
        userId,
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        shareType: 'memory',
        shareMode: 'blocked',
      };
      sharePolicyRepo.findOne!.mockResolvedValue(existing);

      await service.createSharePolicy(userId, {
        sourceAgentId: 'agent-a',
        targetAgentId: 'agent-b',
        shareType: 'memory',
        shareMode: 'full',
      });

      expect(sharePolicyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ shareMode: 'full' }),
      );
    });
  });

  // ── Memory Promotion ──────────────────────────────────────────────────────

  describe('promoteMemoryToAgent', () => {
    it('should promote session memory to agent scope', async () => {
      agentRepo.findOne!.mockResolvedValue({ id: 'agent-1', userId });
      const mockMemory = { id: 'mem-1', sessionId: 'sess-1', scope: MemoryScope.SESSION };
      memoryRepo.findOne!.mockResolvedValue(mockMemory);

      await service.promoteMemoryToAgent(userId, 'agent-1', 'mem-1');

      expect(memoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          scope: MemoryScope.AGENT,
        }),
      );
    });

    it('should throw if memory not found', async () => {
      agentRepo.findOne!.mockResolvedValue({ id: 'agent-1', userId });
      memoryRepo.findOne!.mockResolvedValue(null);

      await expect(
        service.promoteMemoryToAgent(userId, 'agent-1', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
