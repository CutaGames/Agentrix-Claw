import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PetSoulTemplateService } from './pet-soul-template.service';
import { PetSoulTemplate } from '../../entities/pet-soul-template.entity';

/**
 * BE-T1.1: pet-soul-template.service.ts CRUD（mock repo）
 * BE-T1.5: seed 数据契约 — toDto 字段完整
 * BE-T1.6: get 不存在 / disabled 模板 → NotFoundException
 */
describe('PetSoulTemplateService', () => {
  let service: PetSoulTemplateService;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const makeQb = (result: any[] = []) => {
    const qb: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(result),
    };
    return qb;
  };

  const sample: Partial<PetSoulTemplate> = {
    id: 'claw',
    clan: 'A_office',
    displayName: '小爪',
    displayNameEn: 'Claw',
    tagline: '一爪夹住所有事',
    archetype: 'Office Buddy',
    toneKeywords: ['friendly', 'precise'],
    forbiddenTone: [],
    systemPromptTemplate: 'You are Claw...',
    defaultSkillTags: ['summary', 'todo'],
    toolWhitelist: [],
    budgetDailyUSD: '1.00' as any,
    budgetPerTaskUSD: '0.10' as any,
    defaultIdleEmotion: 'calm',
    emotionTendency: { joy: 0.5 },
    recommendedSkinTags: ['cute'],
    marketingHook: '免费 7 天',
    tier: 'free',
    ageRating: 'all',
    complianceFlags: [],
    enabled: true,
    version: 1,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PetSoulTemplateService,
        { provide: getRepositoryToken(PetSoulTemplate), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<PetSoulTemplateService>(PetSoulTemplateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('list', () => {
    it('returns enabled-only when no clan', async () => {
      const qb = makeQb([sample]);
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      const out = await service.list();
      expect(out).toHaveLength(1);
      expect(qb.where).toHaveBeenCalledWith('s.enabled = :enabled', { enabled: true });
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('filters by clan when provided', async () => {
      const qb = makeQb([sample]);
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      await service.list({ clan: 'A_office' });
      expect(qb.andWhere).toHaveBeenCalledWith('s.clan = :clan', { clan: 'A_office' });
    });

    it('filters free plan down to claw only', async () => {
      const qb = makeQb([
        sample,
        { ...sample, id: 'tinker', displayName: '叮当', displayNameEn: 'Tinker' },
      ]);
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      const out = await service.list({ planLevel: 'free' });
      expect(out.map((item) => item.id)).toEqual(['claw']);
    });

    it('keeps paid plans unfiltered', async () => {
      const qb = makeQb([
        sample,
        { ...sample, id: 'tinker', displayName: '叮当', displayNameEn: 'Tinker' },
      ]);
      mockRepo.createQueryBuilder.mockReturnValue(qb);
      const out = await service.list({ planLevel: 'pro' });
      expect(out.map((item) => item.id)).toEqual(['claw', 'tinker']);
    });
  });

  describe('get', () => {
    it('returns the template when found and enabled', async () => {
      mockRepo.findOne.mockResolvedValue(sample);
      const out = await service.get('claw');
      expect(out).toBe(sample);
    });

    it('throws NotFoundException when missing', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.get('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when disabled', async () => {
      mockRepo.findOne.mockResolvedValue({ ...sample, enabled: false });
      await expect(service.get('claw')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('toDto', () => {
    it('exposes snake_case shape with all key fields', () => {
      const dto = service.toDto(sample as PetSoulTemplate);
      expect(dto).toMatchObject({
        id: 'claw',
        clan: 'A_office',
        display_name: '小爪',
        display_name_en: 'Claw',
        tagline: expect.any(String),
        archetype: expect.any(String),
        tier: 'free',
        required_plan: 'free',
        age_rating: 'all',
        marketing_hook: expect.any(String),
        recommended_skin_tags: expect.any(Array),
        default_idle_emotion: 'calm',
      });
    });
  });

  describe('findById', () => {
    it('returns null when missing', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const out = await service.findById('ghost');
      expect(out).toBeNull();
    });
  });
});
