/**
 * Unified Marketplace Controller Tests
 * 
 * V2.0: 统一市场控制器单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedMarketplaceController } from './unified-marketplace.controller';
import { UnifiedMarketplaceService } from './unified-marketplace.service';
import { ProductSkillConverterService } from '../skill/product-skill-converter.service';
import { SkillLayer, SkillCategory, SkillSource } from '../../entities/skill.entity';
import { CallerType, CallPlatform } from '../../entities/skill-analytics.entity';

describe('UnifiedMarketplaceController', () => {
  let controller: UnifiedMarketplaceController;
  let marketplaceService: UnifiedMarketplaceService;
  let converterService: ProductSkillConverterService;

  const mockSearchResult = {
    items: [
      {
        id: 'test-skill-id',
        name: 'test_skill',
        displayName: 'Test Skill',
        description: 'A test skill',
        layer: SkillLayer.LOGIC,
        category: SkillCategory.UTILITY,
        source: SkillSource.NATIVE,
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
    facets: {
      layers: [],
      categories: [],
      resourceTypes: [],
      sources: [],
    },
  };

  const mockTrending = [
    {
      skill: mockSearchResult.items[0],
      callCount24h: 100,
      callCountGrowth: 50,
      revenueGenerated: 200,
    },
  ];

  const mockCategories = [
    { category: SkillCategory.UTILITY, layer: SkillLayer.LOGIC, count: 10 },
  ];

  const mockLayerStats = [
    { layer: SkillLayer.LOGIC, count: 50, totalCalls: 1000 },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnifiedMarketplaceController],
      providers: [
        {
          provide: UnifiedMarketplaceService,
          useValue: {
            search: jest.fn().mockResolvedValue(mockSearchResult),
            getTrending: jest.fn().mockResolvedValue(mockTrending),
            getCategories: jest.fn().mockResolvedValue(mockCategories),
            getStatsByLayer: jest.fn().mockResolvedValue(mockLayerStats),
            getSkillDetail: jest.fn().mockResolvedValue(mockSearchResult.items[0]),
            getSkillAnalytics: jest.fn().mockResolvedValue({
              totalCalls: 100,
              successRate: 0.95,
              avgExecutionTime: 150,
              revenueGenerated: 500,
              topCallers: [],
              callsByPlatform: [],
              callsByDay: [],
            }),
            getPlatformSchema: jest.fn().mockResolvedValue([]),
            getExternalMappings: jest.fn().mockResolvedValue([]),
            recordSkillCall: jest.fn().mockResolvedValue({ id: 'analytics-id' }),
          },
        },
        {
          provide: ProductSkillConverterService,
          useValue: {
            convertProductToSkill: jest.fn().mockResolvedValue(mockSearchResult.items[0]),
            batchConvertProducts: jest.fn().mockResolvedValue({
              success: ['product-1'],
              failed: [],
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<UnifiedMarketplaceController>(UnifiedMarketplaceController);
    marketplaceService = module.get<UnifiedMarketplaceService>(UnifiedMarketplaceService);
    converterService = module.get<ProductSkillConverterService>(ProductSkillConverterService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('search', () => {
    it('should return search results', async () => {
      const result = await controller.search();

      expect(result).toEqual(mockSearchResult);
      expect(marketplaceService.search).toHaveBeenCalled();
    });

    it('should pass query parameters', async () => {
      await controller.search(
        'test',
        SkillLayer.LOGIC,
        SkillCategory.UTILITY,
        undefined,
        SkillSource.NATIVE,
        undefined,
        0,
        100,
        4,
        true,
        'agent',
        undefined,
        1,
        20,
        'callCount',
        'DESC'
      );

      expect(marketplaceService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'test',
          layer: [SkillLayer.LOGIC],
          category: [SkillCategory.UTILITY],
          source: [SkillSource.NATIVE],
          priceMax: 100,
          rating: 4,
          humanAccessible: true,
          callerType: 'agent',
          page: 1,
          limit: 20,
          sortBy: 'callCount',
          sortOrder: 'DESC',
        })
      );
    });

    it('should handle array parameters', async () => {
      await controller.search(
        undefined,
        [SkillLayer.LOGIC, SkillLayer.RESOURCE],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        20
      );

      expect(marketplaceService.search).toHaveBeenCalledWith(
        expect.objectContaining({
          layer: [SkillLayer.LOGIC, SkillLayer.RESOURCE],
        })
      );
    });
  });

  describe('getTrending', () => {
    it('should return trending skills', async () => {
      const result = await controller.getTrending(10);

      expect(result).toEqual(mockTrending);
      expect(marketplaceService.getTrending).toHaveBeenCalledWith(10);
    });

    it('should limit to max 50', async () => {
      await controller.getTrending(100);

      expect(marketplaceService.getTrending).toHaveBeenCalledWith(50);
    });
  });

  describe('getCategories', () => {
    it('should return categories', async () => {
      const result = await controller.getCategories();

      expect(result).toEqual(mockCategories);
      expect(marketplaceService.getCategories).toHaveBeenCalled();
    });
  });

  describe('getStatsByLayer', () => {
    it('should return layer statistics', async () => {
      const result = await controller.getStatsByLayer();

      expect(result).toEqual(mockLayerStats);
      expect(marketplaceService.getStatsByLayer).toHaveBeenCalled();
    });
  });

  describe('getSkillDetail', () => {
    it('should return skill detail', async () => {
      const result = await controller.getSkillDetail('test-skill-id');

      expect(result).toEqual(mockSearchResult.items[0]);
      expect(marketplaceService.getSkillDetail).toHaveBeenCalledWith('test-skill-id');
    });
  });

  describe('getSkillAnalytics', () => {
    it('should return skill analytics', async () => {
      const result = await controller.getSkillAnalytics('test-skill-id', 30);

      expect(result).toBeDefined();
      expect(marketplaceService.getSkillAnalytics).toHaveBeenCalledWith('test-skill-id', 30);
    });
  });

  describe('convertProduct', () => {
    it('should convert product to skill', async () => {
      const result = await controller.convertProduct({
        productId: 'product-id',
        config: { useLLMDescription: true },
      });

      expect(result.success).toBe(true);
      expect(result.skill).toBeDefined();
      expect(converterService.convertProductToSkill).toHaveBeenCalledWith(
        'product-id',
        { useLLMDescription: true }
      );
    });
  });

  describe('batchConvertProducts', () => {
    it('should batch convert products', async () => {
      const result = await controller.batchConvertProducts({
        productIds: ['product-1', 'product-2'],
        config: { autoSync: true },
      });

      expect(result).toBeDefined();
      expect(converterService.batchConvertProducts).toHaveBeenCalledWith(
        ['product-1', 'product-2'],
        { autoSync: true }
      );
    });
  });

  describe('getPlatformSchema', () => {
    it('should return platform schema', async () => {
      const result = await controller.getPlatformSchema('openai');

      expect(result).toBeDefined();
      expect(marketplaceService.getPlatformSchema).toHaveBeenCalledWith('openai');
    });
  });

  describe('getExternalMappings', () => {
    it('should return external mappings', async () => {
      const result = await controller.getExternalMappings();

      expect(result).toBeDefined();
      expect(marketplaceService.getExternalMappings).toHaveBeenCalled();
    });

    it('should filter by platform', async () => {
      await controller.getExternalMappings('claude');

      expect(marketplaceService.getExternalMappings).toHaveBeenCalledWith('claude');
    });
  });

  describe('recordSkillCall', () => {
    it('should record skill call', async () => {
      const callData = {
        skillId: 'test-skill-id',
        callerType: CallerType.AGENT,
        platform: CallPlatform.AGENTRIX_API,
        success: true,
      };

      const result = await controller.recordSkillCall(callData);

      expect(result).toBeDefined();
      expect(marketplaceService.recordSkillCall).toHaveBeenCalledWith(callData);
    });
  });
});
