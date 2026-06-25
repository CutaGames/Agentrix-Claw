import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PetDiaryService } from './pet-diary.service';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetDiaryEntry } from '../../entities/pet-diary-entry.entity';

/**
 * Phase C / C-7 — pet-diary contract tests.
 *
 * Verifies:
 *   - Same user + same date → same diary text (stable hash).
 *   - First call writes a row; second call hits cache.
 *   - Recent endpoint surfaces today's auto-generated entry.
 *   - Future date → null.
 */
describe('PetDiaryService', () => {
  const petStore = new Map<string, LivingPet>();
  const diaryStore: PetDiaryEntry[] = [];

  const petRepo = {
    findOne: jest.fn(async ({ where }: any) => petStore.get(where.userId) ?? null),
  };

  const diaryRepo = {
    findOne: jest.fn(async ({ where }: any) => {
      return (
        diaryStore.find(
          (e) => e.userId === where.userId && e.dateKey === where.dateKey,
        ) ?? null
      );
    }),
    create: jest.fn((p: Partial<PetDiaryEntry>) => ({ ...p }) as PetDiaryEntry),
    save: jest.fn(async (p: PetDiaryEntry) => {
      const saved = { ...p, id: p.id || `d-${diaryStore.length + 1}` } as PetDiaryEntry;
      diaryStore.push(saved);
      return saved;
    }),
    find: jest.fn(async ({ where, order, take }: any) => {
      const rows = diaryStore.filter((e) => e.userId === where.userId);
      rows.sort((a, b) => (order?.dateKey === 'DESC' ? b.dateKey.localeCompare(a.dateKey) : 0));
      return take ? rows.slice(0, take) : rows;
    }),
    delete: jest.fn(async (where: any) => {
      const before = diaryStore.length;
      for (let i = diaryStore.length - 1; i >= 0; i--) {
        const e = diaryStore[i];
        if (where.userId && e.userId !== where.userId) continue;
        if (where.dateKey && e.dateKey !== where.dateKey) continue;
        diaryStore.splice(i, 1);
      }
      return { affected: before - diaryStore.length } as any;
    }),
  };

  let service: PetDiaryService;

  beforeEach(async () => {
    petStore.clear();
    diaryStore.length = 0;
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PetDiaryService,
        { provide: getRepositoryToken(LivingPet), useValue: petRepo },
        { provide: getRepositoryToken(PetDiaryEntry), useValue: diaryRepo },
      ],
    }).compile();
    service = moduleRef.get<PetDiaryService>(PetDiaryService);
  });

  function seedPet(userId: string, overrides: Partial<LivingPet> = {}): LivingPet {
    const pet = {
      id: `pet-${userId}`,
      userId,
      name: 'Aira',
      species: 'aira',
      personality: {},
      emotion: 'happy',
      emotionIntensity: 1,
      emotionSince: '0',
      emotionDecayAt: '0',
      intimacyLevel: 3,
      intimacyXp: 100,
      recentMemorySnippets: [],
      unlockedSoulTemplateIds: ['claw'],
      personalityOverrides: {},
      engineSwitching: false,
      lastInteractionAt: String(Date.now()),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as unknown as LivingPet;
    petStore.set(userId, pet);
    return pet;
  }

  it('returns null for a future date', async () => {
    seedPet('u1');
    const future = new Date(Date.now() + 86_400_000 * 5);
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const r = await service.getEntry('u1', fmt.format(future));
    expect(r).toBeNull();
  });

  it('returns null when user has no pet', async () => {
    const r = await service.getEntry('ghost');
    expect(r).toBeNull();
  });

  it('first call writes, second call reads from cache', async () => {
    seedPet('u2', { emotion: 'love', intimacyLevel: 5 });
    const a = await service.getEntry('u2');
    expect(a).not.toBeNull();
    expect(a!.emotion).toBe('love');
    expect(a!.intimacy_level).toBe(5);
    expect(a!.text_zh.length).toBeGreaterThan(0);
    expect(diaryStore).toHaveLength(1);

    const b = await service.getEntry('u2');
    expect(b).not.toBeNull();
    expect(b!.text_zh).toBe(a!.text_zh); // stable
    expect(diaryStore).toHaveLength(1); // not duplicated
  });

  it('different users with same emotion get different lines (or same per stable hash)', async () => {
    seedPet('uA', { emotion: 'happy', intimacyLevel: 0 });
    seedPet('uB', { emotion: 'happy', intimacyLevel: 0 });
    const a = await service.getEntry('uA');
    const b = await service.getEntry('uB');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // We don't require them to differ (same template pool); we require they
    // are deterministic per user.
    const a2 = await service.getEntry('uA');
    expect(a2!.text_zh).toBe(a!.text_zh);
  });

  it('intimacy level adds a suffix', async () => {
    seedPet('uH', { emotion: 'love', intimacyLevel: 9 });
    const r = await service.getEntry('uH');
    expect(r!.text_zh).toContain('世界');
  });

  it('getRecent surfaces today after first call', async () => {
    seedPet('uR');
    const r = await service.getRecent('uR', 7);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].text_zh).toBeTruthy();
  });

  it('invalidateToday drops cache so a new emotion regenerates', async () => {
    const pet = seedPet('uI', { emotion: 'calm' });
    const a = await service.getEntry('uI');
    pet.emotion = 'sad';
    await service.invalidateToday('uI');
    const b = await service.getEntry('uI');
    expect(b!.emotion).toBe('sad');
    expect(b!.text_zh).not.toBe(a!.text_zh);
  });
});
