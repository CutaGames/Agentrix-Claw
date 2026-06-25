/**
 * Unified Marketplace Service Tests
 * 
 * V2.0: 统一市场服务单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnifiedMarketplaceService, UnifiedSearchParams } from './unified-marketplace.service';
import { Skill, SkillStatus, SkillLayer, SkillCategory, SkillSource } from '../../entities/skill.entity';
import { ExternalSkillMapping } from '../../entities/external-skill-mapping.entity';
import { SkillAnalytics, CallerType, CallPlatform } from '../../entities/skill-analytics.entity';

describe('UnifiedMarketplaceService', () => {
  let service: UnifiedMarketplaceService;
  let skillRepository: Repository<Skill>;
  let externalMappingRepository: Repository<ExternalSkillMapping>;
  let analyticsRepository: Repository<SkillAnalytics>;

  const mockSkill: Partial<Skill> = {
    id: 'test-skill-id',
    name: 'test_skill',
    displayName: 'Test Skill',
    description: 'A test skill for unit testing',
    layer: SkillLayer.LOGIC,
    category: SkillCategory.UTILITY,
    source: SkillSource.NATIVE,
    status: SkillStatus.PUBLISHED,
    callCount: 100,
    rating: 4.5,
    humanAccessible: true,
    tags: ['test', 'utility'],
  };

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[mockSkill], 1]),
    getMany: jest.fn().mockResolvedValue([mockSkill]),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedMarketplaceService,
        {
          provide: getRepositoryToken(Skill),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
            findOne: jest.fn().mockResolvedValue(mockSkill),
            findByIds: jest.fn().mockResolvedValue([mockSkill]),
            find: jest.fn().mockResolvedValue([mockSkill]),
            increment: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getRepositoryToken(ExternalSkillMapping),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(SkillAnalytics),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
            create: jest.fn().mockImplementation((data) => data),
            save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'analytics-id', ...data })),
          },
        },
      ],
    }).compile();

    service = module.get<UnifiedMarketplaceService>(UnifiedMarketplaceService);
    skillRepository = module.get<Repository<Skill>>(getRepositoryToken(Skill));
    externalMappingRepository = module.get<Repository<ExternalSkillMapping>>(getRepositoryToken(ExternalSkillMapping));
    analyticsRepository = module.get<Repository<SkillAnalytics>>(getRepositoryToken(SkillAnalytics));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('search', () => {
    it('should return search results with default parameters', async () => {
      const params: UnifiedSearchParams = {};
      const result = await service.search(params);

      expect(result).toBeDefined();
      expect(result.items).toBeDefined();
      expect(result.total).toBeDefined();
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.facets).toBeDefined();
    });

    it('should apply text query filter', async () => {
      const params: UnifiedSearchParams = { query: 'test' };
      await service.search(params);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });

    it('should apply layer filter', async () => {
      const params: UnifiedSearchParams = { layer: [SkillLayer.LOGIC] };
      await service.search(params);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });

    it('should apply category filter', async () => {
      const params: UnifiedSearchParams = { category: [SkillCategory.UTILITY] };
      await service.search(params);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });

    it('should apply source filter', async () => {
      const params: UnifiedSearchParams = { source: [SkillSource.NATIVE] };
      await service.search(params);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });

    it('should apply price range filter', async () => {
      const params: UnifiedSearchParams = { priceMin: 0, priceMax: 100 };
      await service.search(params);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });

    it('should apply rating filter', async () => {
      const params: UnifiedSearchParams = { rating: 4 };
      await service.search(params);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });

    it('should apply humanAccessible filter', async () => {
      const params: UnifiedSearchParams = { humanAccessible: true };
      await service.search(params);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });

    it('should apply pagination', async () => {
      const params: UnifiedSearchParams = { page: 2, limit: 10 };
      await service.search(params);

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should apply sorting', async () => {
      const params: UnifiedSearchParams = { sortBy: 'rating', sortOrder: 'DESC' };
      await service.search(params);

      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalled();
    });
  });

  describe('getTrending', () => {
    it('should return trending skills', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { skillId: 'test-skill-id', callCount24h: '50', revenueGenerated: '100' }
      ]);

      const result = await service.getTrending(10);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getCategories', () => {
    it('should return category list', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { category: SkillCategory.UTILITY, layer: SkillLayer.LOGIC, count: '10' }
      ]);

      const result = await service.getCategories();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getSkillDetail', () => {
    it('should return skill detail with analytics', async () => {
      const result = await service.getSkillDetail('test-skill-id');

      expect(result).toBeDefined();
      expect(result.id).toBe('test-skill-id');
    });

    it('should return null for non-existent skill', async () => {
      jest.spyOn(skillRepository, 'findOne').mockResolvedValueOnce(null);

      const result = await service.getSkillDetail('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('getSkillAnalytics', () => {
    it('should return analytics summary', async () => {
      mockQueryBuilder.getRawOne.mockResolvedValueOnce({
        totalCalls: '100',
        successRate: '0.95',
        avgExecutionTime: '150',
        revenueGenerated: '500',
      });

      const result = await service.getSkillAnalytics('test-skill-id', 30);

      expect(result).toBeDefined();
      expect(result.totalCalls).toBeDefined();
      expect(result.successRate).toBeDefined();
    });
  });

  describe('recordSkillCall', () => {
    it('should record skill call and increment counter', async () => {
      const callData = {
        skillId: 'test-skill-id',
        callerType: CallerType.AGENT,
        platform: CallPlatform.AGENTRIX_API,
        success: true,
      };

      const result = await service.recordSkillCall(callData);

      expect(result).toBeDefined();
      expect(analyticsRepository.create).toHaveBeenCalledWith(callData);
      expect(analyticsRepository.save).toHaveBeenCalled();
      expect(skillRepository.increment).toHaveBeenCalledWith(
        { id: 'test-skill-id' },
        'callCount',
        1
      );
    });
  });

  describe('getStatsByLayer', () => {
    it('should return layer statistics', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { layer: SkillLayer.LOGIC, count: '50', totalCalls: '1000' },
        { layer: SkillLayer.RESOURCE, count: '30', totalCalls: '500' },
      ]);

      const result = await service.getStatsByLayer();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getPlatformSchema', () => {
    it('should return platform-specific schemas', async () => {
      jest.spyOn(skillRepository, 'find').mockResolvedValueOnce([
        {
          ...mockSkill,
          platformSchemas: {
            openai: { type: 'function', function: { name: 'test' } },
          },
        } as Skill,
      ]);

      const result = await service.getPlatformSchema('openai');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getExternalMappings', () => {
    it('should return external mappings', async () => {
      mockQueryBuilder.getMany.mockResolvedValueOnce([]);

      const result = await service.getExternalMappings();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter by platform', async () => {
      mockQueryBuilder.getMany.mockResolvedValueOnce([]);

      await service.getExternalMappings('claude');

      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });
  });
});
