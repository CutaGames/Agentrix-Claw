import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PetNftService, MIN_INTIMACY_LEVEL } from './pet-nft.service';
import { PetNftIntent } from '../../entities/pet-nft-intent.entity';
import { LivingPet } from '../../entities/living-pet.entity';

/**
 * Phase 6 M3 — pet-nft unit tests.
 * In-memory repos. The partial unique index is enforced manually in the mock.
 */

function makeIntentRepo() {
  const store = new Map<string, PetNftIntent>();
  let seq = 0;
  return {
    store,
    create(p: Partial<PetNftIntent>) { return { ...p } as PetNftIntent; },
    async save(row: PetNftIntent) {
      if (!row.id) row.id = `intent-${++seq}`;
      if (!row.createdAt) row.createdAt = new Date();
      row.updatedAt = new Date();
      store.set(row.id, { ...row });
      return store.get(row.id)!;
    },
    async findOne({ where }: { where: any }) {
      for (const r of store.values()) {
        let m = true;
        for (const k of Object.keys(where)) if ((r as any)[k] !== where[k]) { m = false; break; }
        if (m) return r;
      }
      return undefined;
    },
    async find({ where, order, take }: { where: any; order?: any; take?: number }) {
      const out: PetNftIntent[] = [];
      for (const r of store.values()) {
        let m = true;
        for (const k of Object.keys(where)) if ((r as any)[k] !== where[k]) { m = false; break; }
        if (m) out.push(r);
      }
      if (order?.createdAt === 'DESC') out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return take ? out.slice(0, take) : out;
    },
    createQueryBuilder() {
      const filters: any = {};
      const qb: any = {
        where(_sql: string, p: any) { Object.assign(filters, p); return qb; },
        async getOne() {
          for (const r of store.values()) {
            if (
              r.livingPetId === filters.p &&
              r.chain === filters.c &&
              !filters.closed.includes(r.status)
            ) return r;
          }
          return null;
        },
      };
      return qb;
    },
  };
}

function makePetRepo(pets: Partial<LivingPet>[]) {
  const map = new Map<string, LivingPet>();
  for (const p of pets) map.set(p.id!, p as LivingPet);
  return {
    async findOne({ where }: { where: any }) {
      return map.get(where.id);
    },
  };
}

describe('PetNftService — Phase 6 M3', () => {
  let service: PetNftService;
  let intentRepo: ReturnType<typeof makeIntentRepo>;
  const USER = 'user-1';
  const PET_OK = { id: 'pet-1', userId: USER, intimacyLevel: 6, soulTemplateId: 'claw', species: 'aira' } as Partial<LivingPet>;
  const PET_LOW = { id: 'pet-2', userId: USER, intimacyLevel: 1, soulTemplateId: 'claw', species: 'aira' } as Partial<LivingPet>;
  const PET_OTHER = { id: 'pet-3', userId: 'someone-else', intimacyLevel: 9, soulTemplateId: 'claw', species: 'aira' } as Partial<LivingPet>;

  beforeEach(async () => {
    intentRepo = makeIntentRepo();
    const petRepo = makePetRepo([PET_OK, PET_LOW, PET_OTHER]);
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PetNftService,
        { provide: getRepositoryToken(PetNftIntent), useValue: intentRepo },
        { provide: getRepositoryToken(LivingPet), useValue: petRepo },
      ],
    }).compile();
    service = mod.get(PetNftService);
  });

  it('creates a pending intent for an eligible pet', async () => {
    const i = await service.create(USER, 'pet-1', {
      chain: 'base',
      recipientAddress: '0x' + 'a'.repeat(40),
    });
    expect(i.status).toBe('pending');
    expect(i.intimacySnapshot).toBe(6);
    expect(i.chain).toBe('base');
    expect(i.metadata).toMatchObject({ schema: 'agentrix.pet-nft.v1' });
  });

  it('blocks mint when intimacy below threshold', async () => {
    await expect(
      service.create(USER, 'pet-2', { chain: 'base', recipientAddress: '0x' + 'b'.repeat(40) }),
    ).rejects.toThrow(new RegExp(`< ${MIN_INTIMACY_LEVEL}`));
  });

  it('blocks unsupported chain', async () => {
    await expect(
      service.create(USER, 'pet-1', { chain: 'doge' as any, recipientAddress: '0x' + 'c'.repeat(40) }),
    ).rejects.toThrow(/chain must be one of/);
  });

  it('blocks cross-user pet', async () => {
    await expect(
      service.create(USER, 'pet-3', { chain: 'base', recipientAddress: '0x' + 'd'.repeat(40) }),
    ).rejects.toThrow(/does not belong/);
  });

  it('blocks duplicate open intent on same pet+chain', async () => {
    await service.create(USER, 'pet-1', { chain: 'base', recipientAddress: '0x' + 'a'.repeat(40) });
    await expect(
      service.create(USER, 'pet-1', { chain: 'base', recipientAddress: '0x' + 'a'.repeat(40) }),
    ).rejects.toThrow(/existing/);
  });

  it('runs the full state machine', async () => {
    const i = await service.create(USER, 'pet-1', {
      chain: 'base',
      recipientAddress: '0x' + 'a'.repeat(40),
    });
    const r = await service.markReady(i.id, 'ipfs://Qm...');
    expect(r.status).toBe('ready');
    const s = await service.markSubmitted(i.id, '0x' + 'f'.repeat(64), '0x' + 'C'.repeat(40));
    expect(s.status).toBe('submitted');
    expect(s.contractAddress).toBe('0x' + 'c'.repeat(40)); // lower-cased
    const m = await service.markMinted(i.id, '42');
    expect(m.status).toBe('minted');
    expect(m.tokenId).toBe('42');
  });

  it('cancel transitions pending → cancelled', async () => {
    const i = await service.create(USER, 'pet-1', {
      chain: 'eth',
      recipientAddress: '0x' + 'a'.repeat(40),
    });
    const c = await service.cancel(USER, i.id);
    expect(c.status).toBe('cancelled');
  });

  it('markFailed sets reason', async () => {
    const i = await service.create(USER, 'pet-1', {
      chain: 'eth',
      recipientAddress: '0x' + 'a'.repeat(40),
    });
    const f = await service.markFailed(i.id, 'gas estimation reverted');
    expect(f.status).toBe('failed');
    expect(f.errorMessage).toBe('gas estimation reverted');
  });
});
