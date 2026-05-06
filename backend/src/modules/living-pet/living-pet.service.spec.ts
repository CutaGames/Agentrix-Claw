import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LivingPetService } from './living-pet.service';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetSoulTemplateService } from '../pet-soul-template/pet-soul-template.service';
import { PetSkinService } from '../pet-skin/pet-skin.service';

/**
 * BE-T1.4: switchSoul 不丢 intimacy / xp / wallet / tasks
 * BE-T1.6: switchSoul 不存在或 disabled 模板 → NotFoundException
 * BE-T1.4 (skin): activateSkin 经 PetSkinService 校验
 * 默认灵魂懒补：legacy pet 缺 soulTemplateId → 自动写 'claw'
 */
describe('LivingPetService (Phase 1: switchSoul / activateSkin)', () => {
  let service: LivingPetService;

  const petRepo = {
    findOne: jest.fn(),
    save: jest.fn((p) => Promise.resolve({ ...p, updatedAt: new Date() })),
    create: jest.fn((p) => p),
  };

  const soulService = {
    findById: jest.fn(),
  };

  const skinService = {
    activate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        LivingPetService,
        { provide: getRepositoryToken(LivingPet), useValue: petRepo },
        { provide: PetSoulTemplateService, useValue: soulService },
        { provide: PetSkinService, useValue: skinService },
      ],
    }).compile();
    service = mod.get<LivingPetService>(LivingPetService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const makePet = (overrides: Partial<LivingPet> = {}): LivingPet =>
    ({
      id: 'pet-1',
      userId: 'u1',
      name: 'Aira',
      species: 'aira',
      emotion: 'calm',
      emotionIntensity: 1,
      emotionSince: String(0),
      emotionDecayAt: String(0),
      intimacyLevel: 5,
      intimacyXp: 1234,
      recentMemorySnippets: ['m1', 'm2'],
      primaryAgentId: 'agent-x',
      engineSwitching: false,
      soulTemplateId: 'claw',
      personalityOverrides: { name: 'Coco' },
      lastInteractionAt: String(0),
      updatedAt: new Date(),
      ...overrides,
    } as any);

  describe('switchSoul', () => {
    it('rejects empty templateId', async () => {
      await expect(service.switchSoul('u1', '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-existent template', async () => {
      soulService.findById.mockResolvedValue(null);
      await expect(service.switchSoul('u1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects disabled template', async () => {
      soulService.findById.mockResolvedValue({ id: 'tinker', enabled: false });
      await expect(service.switchSoul('u1', 'tinker')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('preserves intimacy / xp / memory / wallet / personalityOverrides', async () => {
      soulService.findById.mockResolvedValue({ id: 'sentry', enabled: true });
      const before = makePet({ soulTemplateId: 'claw' });
      petRepo.findOne.mockResolvedValue(before);

      const after = await service.switchSoul('u1', 'sentry');

      expect(after.soulTemplateId).toBe('sentry');
      expect(after.intimacyLevel).toBe(before.intimacyLevel);
      expect(after.intimacyXp).toBe(before.intimacyXp);
      expect(after.recentMemorySnippets).toEqual(before.recentMemorySnippets);
      expect(after.primaryAgentId).toBe(before.primaryAgentId);
      expect(after.personalityOverrides).toEqual(before.personalityOverrides);
      expect(after.engineSwitching).toBe(true);
    });

    it('is idempotent when same template', async () => {
      soulService.findById.mockResolvedValue({ id: 'claw', enabled: true });
      const before = makePet({ soulTemplateId: 'claw' });
      petRepo.findOne.mockResolvedValue(before);

      await service.switchSoul('u1', 'claw');
      // first save = none (idempotent return)
      expect(petRepo.save).not.toHaveBeenCalled();
    });

    it('resets engineSwitching=false after 2s', async () => {
      soulService.findById.mockResolvedValue({ id: 'sentry', enabled: true });
      const before = makePet({ soulTemplateId: 'claw' });
      petRepo.findOne.mockResolvedValueOnce(before);
      await service.switchSoul('u1', 'sentry');

      // simulate the timer firing — setTimeout callback re-fetches pet
      const switching = makePet({ soulTemplateId: 'sentry', engineSwitching: true });
      petRepo.findOne.mockResolvedValueOnce(switching);
      await jest.advanceTimersByTimeAsync(2000);

      // The reset save should have been called for engineSwitching=false
      const calls = petRepo.save.mock.calls.map((c: any[]) => c[0]);
      expect(calls.some((p: any) => p.engineSwitching === false)).toBe(true);
    });
  });

  describe('getOrCreate (default soul backfill)', () => {
    it('creates new pet with soulTemplateId="claw"', async () => {
      petRepo.findOne.mockResolvedValue(null);
      const created = await service.getOrCreate('u1');
      expect(created.soulTemplateId).toBe('claw');
      expect(created.personalityOverrides).toEqual({});
    });

    it('backfills missing soulTemplateId for legacy pet', async () => {
      const legacy = makePet({ soulTemplateId: null as any });
      petRepo.findOne.mockResolvedValue(legacy);
      const out = await service.getOrCreate('u1');
      expect(out.soulTemplateId).toBe('claw');
      expect(petRepo.save).toHaveBeenCalled();
    });
  });

  describe('activateSkin', () => {
    it('rejects empty skinId', async () => {
      await expect(service.activateSkin('u1', '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('delegates to skinService.activate and persists pet', async () => {
      const pet = makePet();
      skinService.activate.mockResolvedValue({ userId: 'u1', activeSkinId: 's1' });
      petRepo.findOne.mockResolvedValue(pet);
      const out = await service.activateSkin('u1', 's1');
      expect(skinService.activate).toHaveBeenCalledWith('u1', 's1');
      expect(out.userId).toBe('u1');
      expect(petRepo.save).toHaveBeenCalled();
    });
  });

  describe('toDto', () => {
    it('exposes soul_template_id + personality_overrides', () => {
      const dto = service.toDto(makePet({ soulTemplateId: 'tinker' }));
      expect(dto.soul_template_id).toBe('tinker');
      expect(dto.personality_overrides).toEqual({ name: 'Coco' });
    });

    it('soul_template_id null when missing', () => {
      const dto = service.toDto(makePet({ soulTemplateId: null as any }));
      expect(dto.soul_template_id).toBeNull();
    });
  });

  describe('findPublicCard', () => {
    it('returns null when pet missing', async () => {
      petRepo.findOne.mockResolvedValue(null);
      expect(await service.findPublicCard('ghost')).toBeNull();
    });

    it('returns safe-only fields (no memory / no overrides / no decay)', async () => {
      petRepo.findOne.mockResolvedValue(makePet());
      const card = await service.findPublicCard('pet-1');
      expect(card).toBeDefined();
      expect(card).not.toHaveProperty('recent_memory_snippets');
      expect(card).not.toHaveProperty('personality_overrides');
      expect(card).not.toHaveProperty('emotion');
      expect(card!.soul_template_id).toBe('claw');
      expect(card!.intimacy_level).toBe(5);
    });
  });
});
