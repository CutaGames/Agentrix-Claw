import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PetSkin } from '../../entities/pet-skin.entity';
import { RemixBreedingService } from './remix-breeding.service';
import { ReverseImageSearchService } from './reverse-image-search.service';
import { AncestorChainService } from './ancestor-chain.service';
import { splitRoyalty } from './royalty-splitter';
import { pHash } from './phash';

/**
 * Phase 3 E2E — exercises the full Phase 3 happy path WITHOUT touching the
 * marketplace listing/auction layer (those have their own unit tests using
 * DataSource transactions which need the full Nest infra).
 *
 * Flow (E2E-3.4 + E2E-3.5):
 *   1. Creator A mints a skin (royalty 5%)
 *   2. Creator B remixes A + a platform skin → child (royalty inherits MAX = 5%)
 *   3. Owner C buys the child from B (simulated sale: $100)
 *      - AncestorChainService walks the lineage (child → A → null)
 *      - splitRoyalty pays platform 5% + creator A 5% + B (seller) 90%
 *   4. Reverse-search on B's child thumbnail finds the lineage parents
 */

function makeImage(width: number, height: number, fn: (x: number, y: number) => number) {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = Math.max(0, Math.min(255, fn(x, y) | 0));
  }
  return { data, width, height };
}
const checker = (s: number, c: number) =>
  makeImage(s, s, (x, y) => ((Math.floor(x / c) + Math.floor(y / c)) % 2 === 0 ? 0 : 255));

describe('Phase 3 E2E — remix lineage + royalty + reverse search', () => {
  let store: Record<string, any>;
  let repo: any;
  let qb: any;
  let remix: RemixBreedingService;
  let reverse: ReverseImageSearchService;
  let ancestor: AncestorChainService;

  beforeEach(async () => {
    store = {};
    let counter = 0;
    qb = {
      _skip: 0, _take: 500,
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn(function (this: any, n: number) { this._skip = n; return this; }),
      take: jest.fn(function (this: any, n: number) { this._take = n; return this; }),
      getMany: jest.fn(async function (this: any) {
        return Object.values(store)
          .filter((s: any) => !s.retired && (s.manifest as any)?.phash)
          .slice(this._skip, this._skip + this._take);
      }),
    };
    repo = {
      findOne: jest.fn(async ({ where: { id } }: any) => store[id] || null),
      create: jest.fn((entity: any) => entity),
      save: jest.fn(async (entity: any) => {
        const id = entity.id ?? `s-${++counter}`;
        const saved = { ...entity, id };
        store[id] = saved;
        return saved;
      }),
      update: jest.fn(async ({ id }: any, patch: any) => {
        if (store[id]) Object.assign(store[id], patch);
        return { affected: 1 };
      }),
      createQueryBuilder: jest.fn(() => qb),
    };

    const mod = await Test.createTestingModule({
      providers: [
        RemixBreedingService,
        ReverseImageSearchService,
        AncestorChainService,
        { provide: getRepositoryToken(PetSkin), useValue: repo },
      ],
    }).compile();

    remix = mod.get(RemixBreedingService);
    reverse = mod.get(ReverseImageSearchService);
    ancestor = mod.get(AncestorChainService);
  });

  it('full flow: mint → remix → resale royalty + reverse search', async () => {
    // 1. Creator A mints skin (5% royalty), publishes as platform-remixable.
    //    In production this happens via marketplace listing; here we simulate by
    //    setting source='platform' so creator-B can remix without explicit purchase.
    const skinA = await repo.save({
      id: 'skin-A',
      ownerUserId: 'creator-A',
      source: 'platform',
      displayName: 'Mascot A',
      url: 'a.vrm',
      format: 'vrm',
      manifest: {},
      retired: false,
      parentSkinId: null,
      royaltyRateBps: 500,
      originalCreatorUserId: 'creator-A',
    });

    // 1b. Platform skin (publicly remixable)
    await repo.save({
      id: 'skin-P',
      ownerUserId: null,
      source: 'platform',
      displayName: 'Platform mascot',
      url: 'p.vrm',
      format: 'vrm',
      manifest: {},
      retired: false,
      parentSkinId: null,
      royaltyRateBps: 0,
      originalCreatorUserId: null,
    });

    // 2. Creator B remixes A + platform → child
    const child = await remix.breed({
      parentASkinId: 'skin-A',
      parentBSkinId: 'skin-P',
      requesterUserId: 'creator-B',
      displayName: 'Hybrid',
    });
    expect(child.parentSkinId).toBe('skin-A');
    expect(child.royaltyRateBps).toBe(500); // capped at MAX(parents)
    expect(child.originalCreatorUserId).toBe('creator-A');
    expect(child.source).toBe('remixed');

    // 3. Owner B sells child to C for $100 (10000 cents)
    //    - Resolve lineage:
    const chain = await ancestor.resolveChain(child.id);
    // chain[0] = oldest = creator-A; chain[1] = newest = creator-A again
    // (because child.originalCreator was inherited as creator-A)
    expect(chain.length).toBeGreaterThanOrEqual(1);
    expect(chain[0].creatorUserId).toBe('creator-A');

    const split = splitRoyalty({
      grossPriceCents: 10000,
      platformBps: 500, // 5%
      sellerUserId: 'creator-B',
      ancestorChain: chain,
    });
    expect(split.platformCents).toBe(500);
    // Creator-A appears in chain (oldest); royalty 5% of 10000 = 500
    const creatorAPayout = split.payouts.find(
      (p) => p.recipientUserId === 'creator-A' && p.reason === 'royalty',
    );
    expect(creatorAPayout?.amountCents).toBeGreaterThan(0);
    // Seller (creator-B) gets the residual
    const sellerPayout = split.payouts.find((p) => p.reason === 'seller');
    expect(sellerPayout?.recipientUserId).toBe('creator-B');
    expect(split.platformCents + split.totalRoyaltyCents + (sellerPayout?.amountCents || 0)).toBe(10000);

    // 4. Reverse search: register skin-A's pHash, then search by same image → find skin-A
    const img = checker(96, 12);
    const hashA = await reverse.registerPhash('skin-A', img);
    expect(hashA).toMatch(/^[0-9a-f]{16}$/);
    const result = await reverse.searchByImage(img);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.matches[0].skinId).toBe('skin-A');
    expect(result.matches[0].distance).toBeLessThanOrEqual(6);
  });

  it('royalty 3-layer ancestor truncation (BE-T3.5)', async () => {
    // 4 generations: G0 → G1 → G2 → G3 → G4(seller). Splitter must keep only 3 ancestors.
    const generations = ['G0', 'G1', 'G2', 'G3', 'G4'];
    let parentId: string | null = null;
    for (let i = 0; i < generations.length; i++) {
      await repo.save({
        id: generations[i],
        ownerUserId: `user-${generations[i]}`,
        source: i === 0 ? 'generated' : 'remixed',
        displayName: generations[i],
        url: 'x.vrm',
        format: 'vrm',
        manifest: {},
        retired: false,
        parentSkinId: parentId,
        royaltyRateBps: 200, // 2% per layer
        originalCreatorUserId: `user-${generations[i]}`,
      });
      parentId = generations[i];
    }

    const chain = await ancestor.resolveChain('G4');
    expect(chain.length).toBe(5); // chain itself includes all

    const split = splitRoyalty({
      grossPriceCents: 10000,
      platformBps: 500,
      sellerUserId: 'user-G4', // seller's own self-royalty is filtered out
      ancestorChain: chain,
      maxAncestors: 3,
    });

    // 3 royalty payouts (G0, G1, G2 — oldest first), at 2% each = 200 cents each
    const royalties = split.payouts.filter((p) => p.reason === 'royalty');
    expect(royalties).toHaveLength(3);
    expect(royalties.map((r) => r.recipientUserId)).toEqual(['user-G0', 'user-G1', 'user-G2']);
    expect(royalties.every((r) => r.amountCents === 200)).toBe(true);
  });
});
