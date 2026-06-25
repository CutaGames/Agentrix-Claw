import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RemixBreedingService } from './remix-breeding.service';
import { PetSkin } from '../../entities/pet-skin.entity';

describe('RemixBreedingService (BE-T3.7)', () => {
  let svc: RemixBreedingService;
  let repo: any;
  let store: Record<string, any>;

  const mkSkin = (over: Partial<any> = {}) => ({
    id: over.id ?? Math.random().toString(36).slice(2),
    ownerUserId: 'u1',
    source: 'generated',
    displayName: 'P',
    url: 'p.vrm',
    thumbnailUrl: null,
    format: 'vrm',
    manifest: {},
    retired: false,
    royaltyRateBps: 0,
    originalCreatorUserId: 'u1',
    ...over,
  });

  beforeEach(async () => {
    store = {};
    repo = {
      findOne: jest.fn(async ({ where: { id } }: any) => store[id] || null),
      create: jest.fn((entity: any) => entity),
      save: jest.fn(async (entity: any) => {
        const id = `child-${Object.keys(store).length}`;
        const saved = { id, ...entity };
        store[id] = saved;
        return saved;
      }),
    };
    const mod = await Test.createTestingModule({
      providers: [
        RemixBreedingService,
        { provide: getRepositoryToken(PetSkin), useValue: repo },
      ],
    }).compile();
    svc = mod.get(RemixBreedingService);
  });

  it('rejects same parent twice', async () => {
    await expect(svc.breed({
      parentASkinId: 'a', parentBSkinId: 'a',
      requesterUserId: 'u1', displayName: 'X',
    })).rejects.toThrow();
  });

  it('rejects empty display_name', async () => {
    await expect(svc.breed({
      parentASkinId: 'a', parentBSkinId: 'b',
      requesterUserId: 'u1', displayName: '   ',
    })).rejects.toThrow();
  });

  it('rejects when a parent missing', async () => {
    store['a'] = mkSkin({ id: 'a' });
    await expect(svc.breed({
      parentASkinId: 'a', parentBSkinId: 'missing',
      requesterUserId: 'u1', displayName: 'X',
    })).rejects.toThrow(/not found/);
  });

  it('rejects retired parent', async () => {
    store['a'] = mkSkin({ id: 'a', retired: true });
    store['b'] = mkSkin({ id: 'b' });
    await expect(svc.breed({
      parentASkinId: 'a', parentBSkinId: 'b',
      requesterUserId: 'u1', displayName: 'X',
    })).rejects.toThrow(/retired/);
  });

  it('forbids remixing from a non-owned non-platform skin', async () => {
    store['a'] = mkSkin({ id: 'a', ownerUserId: 'other', source: 'generated' });
    store['b'] = mkSkin({ id: 'b', ownerUserId: 'u1' });
    await expect(svc.breed({
      parentASkinId: 'a', parentBSkinId: 'b',
      requesterUserId: 'u1', displayName: 'X',
    })).rejects.toThrow(/parent_a/);
  });

  it('allows remixing from platform skin without ownership', async () => {
    store['a'] = mkSkin({ id: 'a', ownerUserId: null, source: 'platform', royaltyRateBps: 100 });
    store['b'] = mkSkin({ id: 'b', ownerUserId: 'u1', royaltyRateBps: 200, originalCreatorUserId: 'u1' });
    const child = await svc.breed({
      parentASkinId: 'a', parentBSkinId: 'b',
      requesterUserId: 'u1', displayName: 'Hybrid',
    });
    expect(child.source).toBe('remixed');
    expect(child.parentSkinId).toBe('a');
  });

  it('caps royalty at MAX(parents)', async () => {
    store['a'] = mkSkin({ id: 'a', ownerUserId: 'u1', royaltyRateBps: 200 });
    store['b'] = mkSkin({ id: 'b', ownerUserId: 'u1', royaltyRateBps: 500 });
    const child = await svc.breed({
      parentASkinId: 'a', parentBSkinId: 'b',
      requesterUserId: 'u1', displayName: 'C', desiredRoyaltyRateBps: 9000,
    });
    expect(child.royaltyRateBps).toBe(500);
  });

  it('defaults royalty to MAX(parents) when not specified', async () => {
    store['a'] = mkSkin({ id: 'a', ownerUserId: 'u1', royaltyRateBps: 300 });
    store['b'] = mkSkin({ id: 'b', ownerUserId: 'u1', royaltyRateBps: 700 });
    const child = await svc.breed({
      parentASkinId: 'a', parentBSkinId: 'b',
      requesterUserId: 'u1', displayName: 'C',
    });
    expect(child.royaltyRateBps).toBe(700);
  });

  it('originalCreator inherits from higher-royalty parent', async () => {
    store['a'] = mkSkin({ id: 'a', ownerUserId: 'u1', royaltyRateBps: 100, originalCreatorUserId: 'creatorA' });
    store['b'] = mkSkin({ id: 'b', ownerUserId: 'u1', royaltyRateBps: 800, originalCreatorUserId: 'creatorB' });
    const child = await svc.breed({
      parentASkinId: 'a', parentBSkinId: 'b',
      requesterUserId: 'u1', displayName: 'C',
    });
    expect(child.originalCreatorUserId).toBe('creatorB');
  });

  it('lineage: child.parentSkinId === parentA.id (anchor); manifest records both', async () => {
    store['a'] = mkSkin({ id: 'a', ownerUserId: 'u1' });
    store['b'] = mkSkin({ id: 'b', ownerUserId: 'u1' });
    const child = await svc.breed({
      parentASkinId: 'a', parentBSkinId: 'b',
      requesterUserId: 'u1', displayName: 'C',
    });
    expect(child.parentSkinId).toBe('a');
    expect((child.manifest as any).remixedFrom).toEqual(['a', 'b']);
  });

  it('clamps desired royalty to [0, 10000]', async () => {
    store['a'] = mkSkin({ id: 'a', ownerUserId: 'u1', royaltyRateBps: 10000 });
    store['b'] = mkSkin({ id: 'b', ownerUserId: 'u1', royaltyRateBps: 10000 });
    const child = await svc.breed({
      parentASkinId: 'a', parentBSkinId: 'b',
      requesterUserId: 'u1', displayName: 'C', desiredRoyaltyRateBps: -50,
    });
    expect(child.royaltyRateBps).toBe(0);
  });
});
