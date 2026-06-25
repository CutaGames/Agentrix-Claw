import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  PetSovereignService,
  MIN_SOVEREIGN_INTIMACY,
} from './pet-sovereign.service';
import { PetSovereignProfile } from '../../entities/pet-sovereign-profile.entity';
import { LivingPet } from '../../entities/living-pet.entity';

function makeRepo<T extends { id?: string; createdAt?: Date; updatedAt?: Date }>(prefix: string) {
  const store = new Map<string, T>();
  let seq = 0;
  return {
    store,
    create(p: Partial<T>) { return { ...p } as T; },
    async save(row: T) {
      if (!row.id) (row as any).id = `${prefix}-${++seq}`;
      if (!row.createdAt) (row as any).createdAt = new Date();
      (row as any).updatedAt = new Date();
      store.set(row.id!, { ...row });
      return store.get(row.id!)!;
    },
    async findOne({ where }: { where: any }) {
      for (const r of store.values()) {
        let m = true;
        for (const k of Object.keys(where)) if ((r as any)[k] !== where[k]) { m = false; break; }
        if (m) return r;
      }
      return undefined;
    },
  };
}

describe('PetSovereignService — Phase 6 M6', () => {
  let service: PetSovereignService;
  const USER = 'user-1';
  const PET_OK_ID = 'pet-1';
  const PET_LOW_ID = 'pet-2';
  const PET_OTHER_ID = 'pet-3';

  beforeEach(async () => {
    const profileRepo = makeRepo<PetSovereignProfile>('sov');
    const petRepo = makeRepo<LivingPet>('pet');
    await petRepo.save({ id: PET_OK_ID, userId: USER, intimacyLevel: 9, soulTemplateId: 'claw' } as any);
    await petRepo.save({ id: PET_LOW_ID, userId: USER, intimacyLevel: 2, soulTemplateId: 'claw' } as any);
    await petRepo.save({ id: PET_OTHER_ID, userId: 'someone-else', intimacyLevel: 9, soulTemplateId: 'claw' } as any);

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PetSovereignService,
        { provide: getRepositoryToken(PetSovereignProfile), useValue: profileRepo },
        { provide: getRepositoryToken(LivingPet), useValue: petRepo },
      ],
    }).compile();
    service = mod.get(PetSovereignService);
  });

  it('getOrInit returns a default platform profile', async () => {
    const p = await service.getOrInit(USER, PET_OK_ID);
    expect(p.custodyMode).toBe('platform');
    expect(p.memoryStorage).toBe('platform');
    expect(p.supportedChains).toEqual(['base']);
    expect(p.status).toBe('active');
  });

  it('blocks cross-user access', async () => {
    await expect(service.getOrInit(USER, PET_OTHER_ID)).rejects.toThrow(/not your/);
  });

  it('blocks enable-mpc when intimacy is below threshold', async () => {
    await expect(
      service.enableMpc(USER, PET_LOW_ID, {
        mpcUserShareCommitment: 'A'.repeat(64),
        mpcDeviceFingerprint: 'fp-' + 'x'.repeat(40),
        mpcServerKmsKeyId: 'kms-' + 'k'.repeat(20),
      }),
    ).rejects.toThrow(new RegExp(`< ${MIN_SOVEREIGN_INTIMACY}`));
  });

  it('enables MPC custody and stores commitments', async () => {
    const p = await service.enableMpc(USER, PET_OK_ID, {
      mpcUserShareCommitment: 'A'.repeat(64),
      mpcDeviceFingerprint: 'fp-' + 'x'.repeat(40),
      mpcServerKmsKeyId: 'kms-' + 'k'.repeat(20),
      walletAddress: '0x' + 'a'.repeat(40),
      supportedChains: ['ethereum', 'base', 'solana'],
    });
    expect(p.custodyMode).toBe('mpc');
    expect(p.mpcUserShareCommitment).toBe('A'.repeat(64));
    expect(p.walletAddress).toBe('0x' + 'a'.repeat(40));
    expect(p.supportedChains).toEqual(['ethereum', 'base', 'solana']);
  });

  it('enable-self requires walletAddress + clears mpc fields', async () => {
    await service.enableMpc(USER, PET_OK_ID, {
      mpcUserShareCommitment: 'A'.repeat(64),
      mpcDeviceFingerprint: 'fp1',
      mpcServerKmsKeyId: 'kms1',
    });
    const p = await service.enableSelf(USER, PET_OK_ID, {
      walletAddress: '0x' + 'b'.repeat(40),
      supportedChains: ['base'],
    });
    expect(p.custodyMode).toBe('self');
    expect(p.mpcUserShareCommitment).toBeNull();
    expect(p.walletAddress).toBe('0x' + 'b'.repeat(40));
  });

  it('rejects unsupported chain', async () => {
    await expect(
      service.enableSelf(USER, PET_OK_ID, {
        walletAddress: '0x' + 'a'.repeat(40),
        supportedChains: ['doge' as any],
      }),
    ).rejects.toThrow(/unsupported chain/);
  });

  it('setMemoryUri validates ipfs / arweave / hash', async () => {
    await expect(
      service.setMemoryUri(USER, PET_OK_ID, { memoryStorage: 'ipfs', memoryUri: 'http://no' }),
    ).rejects.toThrow(/ipfs:/);
    await expect(
      service.setMemoryUri(USER, PET_OK_ID, { memoryStorage: 'arweave', memoryUri: 'ar://' }),
    ).rejects.toThrow(/ar:/);

    const cid = 'ipfs://' + 'Q'.repeat(40);
    const hash = 'a'.repeat(64);
    const ok = await service.setMemoryUri(USER, PET_OK_ID, {
      memoryStorage: 'ipfs', memoryUri: cid, memoryHash: hash,
    });
    expect(ok.memoryStorage).toBe('ipfs');
    expect(ok.memoryUri).toBe(cid);
    expect(ok.memoryHash).toBe(hash);
  });

  it('revertToPlatform clears mpc fields', async () => {
    await service.enableMpc(USER, PET_OK_ID, {
      mpcUserShareCommitment: 'A'.repeat(64),
      mpcDeviceFingerprint: 'fp1',
      mpcServerKmsKeyId: 'kms1',
    });
    const p = await service.revertToPlatform(USER, PET_OK_ID);
    expect(p.custodyMode).toBe('platform');
    expect(p.mpcUserShareCommitment).toBeNull();
  });

  it('hashMemorySnapshot is deterministic sha-256', () => {
    const h = service.hashMemorySnapshot('hello world');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).toBe(service.hashMemorySnapshot('hello world'));
  });
});
