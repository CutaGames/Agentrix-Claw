import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MemorySlotService, MemorySlot } from './memory-slot.service';
import { AgentMemory, MemoryScope, MemoryType } from '../../entities/agent-memory.entity';
import { HookService } from '../hooks/hook.service';

describe('MemorySlotService', () => {
  let service: MemorySlotService;

  const mockMemoryRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockHookService = {
    executeHooks: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemorySlotService,
        { provide: getRepositoryToken(AgentMemory), useValue: mockMemoryRepo },
        { provide: HookService, useValue: mockHookService },
      ],
    }).compile();

    service = module.get<MemorySlotService>(MemorySlotService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('readSlot', () => {
    it('should find a memory by userId and key', async () => {
      const memory = { id: '1', userId: 'u1', key: 'pref', value: 'dark' };
      mockMemoryRepo.findOne.mockResolvedValue(memory);

      const result = await service.readSlot('u1', 'pref');
      expect(result).toEqual(memory);
      expect(mockMemoryRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'u1', key: 'pref' },
        order: { updatedAt: 'DESC' },
      });
    });

    it('should filter by scope when provided', async () => {
      mockMemoryRepo.findOne.mockResolvedValue(null);

      await service.readSlot('u1', 'pref', MemoryScope.SESSION);
      expect(mockMemoryRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'u1', key: 'pref', scope: MemoryScope.SESSION },
        order: { updatedAt: 'DESC' },
      });
    });
  });

  describe('writeSlot', () => {
    it('should update existing memory', async () => {
      const existing = { id: '1', userId: 'u1', key: 'pref', value: 'light', metadata: {} };
      mockMemoryRepo.findOne.mockResolvedValue(existing);
      mockMemoryRepo.save.mockResolvedValue({ ...existing, value: 'dark' });

      const slot: MemorySlot = {
        key: 'pref', value: 'dark',
        scope: MemoryScope.USER, type: MemoryType.STATE,
      };

      const result = await service.writeSlot('u1', slot);
      expect(existing.value).toBe('dark');
      expect(mockMemoryRepo.save).toHaveBeenCalledWith(existing);
    });

    it('should create new memory when not existing', async () => {
      mockMemoryRepo.findOne.mockResolvedValue(null);
      const created = { id: '2', userId: 'u1', key: 'lang', value: 'zh' };
      mockMemoryRepo.create.mockReturnValue(created);
      mockMemoryRepo.save.mockResolvedValue(created);

      const slot: MemorySlot = {
        key: 'lang', value: 'zh',
        scope: MemoryScope.USER, type: MemoryType.STATE,
      };

      const result = await service.writeSlot('u1', slot, 's1', 'a1');
      expect(mockMemoryRepo.create).toHaveBeenCalled();
      expect(mockMemoryRepo.save).toHaveBeenCalledWith(created);
    });
  });

  describe('deleteSlot', () => {
    it('should delete and return true when affected > 0', async () => {
      mockMemoryRepo.delete.mockResolvedValue({ affected: 1 });
      const result = await service.deleteSlot('u1', 'pref');
      expect(result).toBe(true);
    });

    it('should return false when nothing deleted', async () => {
      mockMemoryRepo.delete.mockResolvedValue({ affected: 0 });
      const result = await service.deleteSlot('u1', 'nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('flush plan', () => {
    it('should queue writes and flush them', async () => {
      const slot: MemorySlot = {
        key: 'ctx', value: 'test',
        scope: MemoryScope.SESSION, type: MemoryType.CONVERSATION,
      };

      service.queueWrite('u1', 's1', slot);

      // Mock writeSlot internals
      mockMemoryRepo.findOne.mockResolvedValue(null);
      const created = { id: '3', userId: 'u1', key: 'ctx', value: 'test' };
      mockMemoryRepo.create.mockReturnValue(created);
      mockMemoryRepo.save.mockResolvedValue(created);

      const count = await service.flushPendingWrites('u1', 's1');
      expect(count).toBe(1);
      expect(mockHookService.executeHooks).toHaveBeenCalled();
    });

    it('should return 0 when no pending ops', async () => {
      const count = await service.flushPendingWrites('u1', 'empty');
      expect(count).toBe(0);
    });

    it('should deduplicate queued writes by key', async () => {
      const slot1: MemorySlot = { key: 'k', value: 'v1', scope: MemoryScope.SESSION, type: MemoryType.CONVERSATION };
      const slot2: MemorySlot = { key: 'k', value: 'v2', scope: MemoryScope.SESSION, type: MemoryType.CONVERSATION };

      service.queueWrite('u1', 's1', slot1);
      service.queueWrite('u1', 's1', slot2);

      mockMemoryRepo.findOne.mockResolvedValue(null);
      mockMemoryRepo.create.mockReturnValue({ key: 'k', value: 'v2' });
      mockMemoryRepo.save.mockResolvedValue({ key: 'k', value: 'v2' });

      const count = await service.flushPendingWrites('u1', 's1');
      // Only 1 write because deduplication
      expect(count).toBe(1);
    });

    it('should handle queued deletes', async () => {
      service.queueDelete('u1', 's1', 'old-key');
      mockMemoryRepo.delete.mockResolvedValue({ affected: 1 });

      const count = await service.flushPendingWrites('u1', 's1');
      expect(count).toBe(1);
      expect(mockMemoryRepo.delete).toHaveBeenCalledWith({ userId: 'u1', key: 'old-key' });
    });
  });

  describe('buildCompactionReinject', () => {
    it('should return empty text when no memories', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockMemoryRepo.createQueryBuilder.mockReturnValue(qb);

      const { text, result } = await service.buildCompactionReinject('u1');
      expect(text).toBe('');
      expect(result.reinjectedCount).toBe(0);
    });

    it('should build reinject text from memories', async () => {
      const memories = [
        { scope: 'session', type: 'context', key: 'task', value: 'build app', updatedAt: new Date() },
      ];
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(memories),
      };
      mockMemoryRepo.createQueryBuilder.mockReturnValue(qb);

      const { text, result } = await service.buildCompactionReinject('u1');
      expect(text).toContain('Post-Compaction Memory Reinject');
      expect(text).toContain('task');
      expect(result.reinjectedCount).toBe(1);
    });
  });
});
