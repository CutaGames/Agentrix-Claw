import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LivingPetService } from './living-pet.service';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetSoulTemplateService } from '../pet-soul-template/pet-soul-template.service';
import { PetSkinService } from '../pet-skin/pet-skin.service';
import { desktopSyncEventBus, DESKTOP_SYNC_EVENT } from '../desktop-sync/desktop-sync.events';

/**
 * BE-I1.1 / BE-I1.2 / BE-I1.3 — switch/activate broadcast event integration.
 *
 * 走 desktopSyncEventBus 验证 PresenceGateway 转发契约：
 *   switchSoul    → presence:pet.soul.changed + presence:pet.state
 *   activateSkin  → presence:pet.skin.changed + presence:pet.state
 */
describe('LivingPetService — broadcast integration (BE-I1.1 / I1.2 / I1.3)', () => {
  let service: LivingPetService;

  const petRepo = {
    findOne: jest.fn(),
    save: jest.fn((p) => Promise.resolve({ ...p, updatedAt: new Date() })),
    create: jest.fn((p) => p),
  };
  const soulService = { findById: jest.fn() };
  const skinService = { activate: jest.fn() };

  const makePet = (overrides: Partial<LivingPet> = {}): LivingPet =>
    ({
      id: 'pet-1',
      userId: 'u1',
      name: 'Aira',
      species: 'aira',
      emotion: 'calm',
      emotionIntensity: 1,
      emotionSince: '0',
      emotionDecayAt: '0',
      intimacyLevel: 3,
      intimacyXp: 100,
      recentMemorySnippets: [],
      primaryAgentId: null,
      engineSwitching: false,
      soulTemplateId: 'claw',
      personalityOverrides: {},
      lastInteractionAt: '0',
      updatedAt: new Date(),
      ...overrides,
    } as any);

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        LivingPetService,
        { provide: getRepositoryToken(LivingPet), useValue: petRepo },
        { provide: PetSoulTemplateService, useValue: soulService },
        { provide: PetSkinService, useValue: skinService },
        {
          provide: require('../pet-gen-quota/user-plan-resolver.service').UserPlanResolverService,
          useValue: {
            resolve: jest.fn().mockResolvedValue('pro_plus'),
            getPlan: jest.fn().mockResolvedValue('pro_plus'),
          },
        },
        {
          provide: require('../pet-achievement/pet-achievement.service').PetAchievementService,
          useValue: { tryUnlock: jest.fn().mockResolvedValue({ newlyUnlocked: [] }) },
        },
      ],
    }).compile();
    service = mod.get(LivingPetService);
  });

  afterEach(() => {
    desktopSyncEventBus.removeAllListeners(DESKTOP_SYNC_EVENT);
  });

  function captureEvents() {
    const events: Array<{ userId: string; event: string; payload: any }> = [];
    desktopSyncEventBus.on(DESKTOP_SYNC_EVENT, (e: any) => events.push(e));
    return events;
  }

  it('BE-I1.1: switchSoul broadcasts presence:pet.soul.changed + presence:pet.state to user room', async () => {
    soulService.findById.mockResolvedValue({ id: 'owl', enabled: true });
    petRepo.findOne.mockResolvedValue(makePet({ soulTemplateId: 'claw' }));
    const events = captureEvents();

    await service.switchSoul('u1', 'owl');

    const types = events.map((e) => e.event);
    expect(types).toContain('presence:pet.soul.changed');
    expect(types).toContain('presence:pet.state');

    const soulEvt = events.find((e) => e.event === 'presence:pet.soul.changed')!;
    expect(soulEvt.userId).toBe('u1');
    expect(soulEvt.payload.soul_template_id).toBe('owl');
    expect(soulEvt.payload.pet_id).toBe('pet-1');
    expect(typeof soulEvt.payload.updated_at).toBe('number');

    const stateEvt = events.find((e) => e.event === 'presence:pet.state')!;
    expect(stateEvt.userId).toBe('u1');
    expect(stateEvt.payload.pet_id).toBe('pet-1');
  });

  it('BE-I1.2: activateSkin broadcasts presence:pet.skin.changed + presence:pet.state', async () => {
    skinService.activate.mockResolvedValue({ id: 'active-1', userId: 'u1', activeSkinId: 'skin-99' });
    petRepo.findOne.mockResolvedValue(makePet());
    const events = captureEvents();

    await service.activateSkin('u1', 'skin-99');

    const types = events.map((e) => e.event);
    expect(types).toContain('presence:pet.skin.changed');
    expect(types).toContain('presence:pet.state');

    const skinEvt = events.find((e) => e.event === 'presence:pet.skin.changed')!;
    expect(skinEvt.userId).toBe('u1');
    expect(skinEvt.payload.active_skin_id).toBe('skin-99');
    expect(skinEvt.payload.user_id).toBe('u1');

    expect(skinService.activate).toHaveBeenCalledWith('u1', 'skin-99');
  });

  it('BE-I1.3: events are scoped to the owning user (no cross-user leakage)', async () => {
    soulService.findById.mockResolvedValue({ id: 'tinker', enabled: true });
    petRepo.findOne.mockResolvedValue(makePet({ userId: 'alice' }));
    const events = captureEvents();

    await service.switchSoul('alice', 'tinker');

    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(e.userId).toBe('alice');
    }
  });
});
