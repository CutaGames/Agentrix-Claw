import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { SoulLinkageService } from './soul-linkage.service';
import { WorldAsset } from '../entities/world-asset.entity';
import { LivingPet } from '../../../entities/living-pet.entity';

/**
 * Phase C — 统一灵魂(化身主宠)单测。
 *
 * 验证: 化身写 linkedSoulId + 主宠 overrides;灵魂连续(intimacy/emotion 不动);
 *       配额上限;解绑;交易转移解链;幂等。
 */
describe('SoulLinkageService (Phase C soul incarnation)', () => {
  let service: SoulLinkageService;
  let assets: Map<string, WorldAsset>;
  let pets: Map<string, LivingPet>;

  function mkAsset(over: Partial<WorldAsset> = {}): WorldAsset {
    return {
      id: 'asset-1', ownerId: 'user-1', originalCreatorId: 'user-1', name: '灵狐',
      category: 'character', linkedSoulId: null, ...over,
    } as WorldAsset;
  }

  function mkPet(over: Partial<LivingPet> = {}): LivingPet {
    return {
      id: 'pet-1', userId: 'user-1', name: '阿狐', intimacyLevel: 0,
      emotion: 'calm', personalityOverrides: {}, ...over,
    } as unknown as LivingPet;
  }

  beforeEach(async () => {
    assets = new Map();
    pets = new Map();

    const assetRepo = {
      findOne: jest.fn(async ({ where }: any) => {
        const a = assets.get(where.id);
        if (!a) return null;
        if (where.ownerId && a.ownerId !== where.ownerId) return null;
        return a;
      }),
      save: jest.fn(async (a: WorldAsset) => { assets.set(a.id, a); return a; }),
      count: jest.fn(async ({ where }: any) =>
        [...assets.values()].filter((a) => a.ownerId === where.ownerId && a.linkedSoulId === where.linkedSoulId).length,
      ),
    };
    const petRepo = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where.id) return pets.get(where.id) ?? null;
        return [...pets.values()].find((p) => p.userId === where.userId) ?? null;
      }),
      create: jest.fn((data: any) => ({ id: 'pet-1', ...data })),
      save: jest.fn(async (p: LivingPet) => { pets.set(p.id, p); return p; }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SoulLinkageService,
        { provide: getRepositoryToken(WorldAsset), useValue: assetRepo },
        { provide: getRepositoryToken(LivingPet), useValue: petRepo },
      ],
    }).compile();
    service = module.get(SoulLinkageService);
  });

  it('incarnate: 写 linkedSoulId + 主宠 overrides, 返回主宠连续状态', async () => {
    assets.set('asset-1', mkAsset());
    pets.set('pet-1', mkPet({ name: '阿狐', intimacyLevel: 5, emotion: 'happy' as any }));

    const r = await service.incarnate('user-1', 'asset-1');
    expect(r.soulId).toBe('pet-1');
    expect(r.intimacyLevel).toBe(5); // 灵魂连续: intimacy 来自主宠未被触碰
    expect(r.emotion).toBe('happy');
    expect(assets.get('asset-1')!.linkedSoulId).toBe('pet-1');
    expect((pets.get('pet-1')!.personalityOverrides as any).worldIncarnationAssetId).toBe('asset-1');
  });

  it('incarnate: 主宠不存在时自动创建灵魂载体', async () => {
    assets.set('asset-1', mkAsset());
    const r = await service.incarnate('user-1', 'asset-1');
    expect(r.soulId).toBe('pet-1');
    expect(pets.get('pet-1')).toBeDefined();
  });

  it('incarnate: 非 character 资产拒绝', async () => {
    assets.set('asset-1', mkAsset({ category: 'weapon' }));
    await expect(service.incarnate('user-1', 'asset-1')).rejects.toThrow(BadRequestException);
  });

  it('incarnate: 不属于用户的资产 → NotFound', async () => {
    assets.set('asset-1', mkAsset({ ownerId: 'someone-else' }));
    await expect(service.incarnate('user-1', 'asset-1')).rejects.toThrow(NotFoundException);
  });

  it('incarnate: 超过配额上限 → Forbidden', async () => {
    pets.set('pet-1', mkPet());
    // 预置 MAX 个已关联资产
    for (let i = 0; i < SoulLinkageService.MAX_INCARNATIONS; i++) {
      assets.set(`linked-${i}`, mkAsset({ id: `linked-${i}`, linkedSoulId: 'pet-1' }));
    }
    assets.set('asset-new', mkAsset({ id: 'asset-new' }));
    await expect(service.incarnate('user-1', 'asset-new')).rejects.toThrow(ForbiddenException);
  });

  it('incarnate: 同一资产重复化身幂等', async () => {
    pets.set('pet-1', mkPet({ intimacyLevel: 3 }));
    assets.set('asset-1', mkAsset({ linkedSoulId: 'pet-1' }));
    const r = await service.incarnate('user-1', 'asset-1');
    expect(r.soulId).toBe('pet-1');
  });

  it('unincarnate: 清 linkedSoulId + 主宠指针, 不动 intimacy', async () => {
    pets.set('pet-1', mkPet({ intimacyLevel: 7, emotion: 'excited' as any, personalityOverrides: { worldIncarnationAssetId: 'asset-1', worldIncarnationName: '灵狐' } }));
    assets.set('asset-1', mkAsset({ linkedSoulId: 'pet-1' }));

    const r = await service.unincarnate('user-1', 'asset-1');
    expect(r.status).toBe('unlinked');
    expect(assets.get('asset-1')!.linkedSoulId).toBeNull();
    expect((pets.get('pet-1')!.personalityOverrides as any).worldIncarnationAssetId).toBeUndefined();
    expect(pets.get('pet-1')!.intimacyLevel).toBe(7); // 灵魂连续
  });

  it('getSoulStatus: 已链接返回主宠连续状态 + isActiveIncarnation', async () => {
    pets.set('pet-1', mkPet({ name: '阿狐', intimacyLevel: 4, emotion: 'love' as any, personalityOverrides: { worldIncarnationAssetId: 'asset-1' } }));
    assets.set('asset-1', mkAsset({ linkedSoulId: 'pet-1' }));

    const s = await service.getSoulStatus('user-1', 'asset-1');
    expect(s.linked).toBe(true);
    expect(s.intimacyLevel).toBe(4);
    expect(s.isActiveIncarnation).toBe(true);
  });

  it('unlinkOnTransfer: 易主时解除链接', async () => {
    pets.set('pet-1', mkPet({ intimacyLevel: 2, personalityOverrides: { worldIncarnationAssetId: 'asset-1' } }));
    assets.set('asset-1', mkAsset({ linkedSoulId: 'pet-1' }));

    await service.unlinkOnTransfer('asset-1');
    expect(assets.get('asset-1')!.linkedSoulId).toBeNull();
    expect((pets.get('pet-1')!.personalityOverrides as any).worldIncarnationAssetId).toBeUndefined();
  });
});
