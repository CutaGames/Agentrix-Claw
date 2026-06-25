import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReverseImageSearchService } from './reverse-image-search.service';
import { PetSkin } from '../../entities/pet-skin.entity';
import { pHash } from './phash';

function makeImage(width: number, height: number, fn: (x: number, y: number) => number) {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = Math.max(0, Math.min(255, fn(x, y) | 0));
  }
  return { data, width, height };
}

const gradient = (s: number) => makeImage(s, s, (x, y) => (x + y) * (255 / (2 * s)));
const checker = (s: number, c: number) =>
  makeImage(s, s, (x, y) => ((Math.floor(x / c) + Math.floor(y / c)) % 2 === 0 ? 0 : 255));

describe('ReverseImageSearchService (BE-T3.6)', () => {
  let svc: ReverseImageSearchService;
  let repo: any;
  let qb: any;
  let dataset: any[];

  beforeEach(async () => {
    dataset = [];
    qb = {
      _skip: 0, _take: 500,
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn(function (this: any, n: number) { this._skip = n; return this; }),
      take: jest.fn(function (this: any, n: number) { this._take = n; return this; }),
      getMany: jest.fn(async function (this: any) {
        return dataset
          .filter((s) => !s.retired && (s.manifest as any)?.phash)
          .slice(this._skip, this._skip + this._take);
      }),
    };
    repo = {
      findOne: jest.fn(async ({ where: { id } }: any) => dataset.find((s) => s.id === id) || null),
      update: jest.fn(async ({ id }: any, patch: any) => {
        const s = dataset.find((d) => d.id === id);
        if (s) Object.assign(s, patch);
        return { affected: 1 };
      }),
      createQueryBuilder: jest.fn(() => qb),
    };

    const mod = await Test.createTestingModule({
      providers: [
        ReverseImageSearchService,
        { provide: getRepositoryToken(PetSkin), useValue: repo },
      ],
    }).compile();
    svc = mod.get(ReverseImageSearchService);
  });

  it('registerPhash stores hash into manifest.phash', async () => {
    dataset.push({ id: 's1', manifest: {}, retired: false });
    const hash = await svc.registerPhash('s1', gradient(64));
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect((dataset[0].manifest as any).phash).toBe(hash);
  });

  it('searchByImage returns near-duplicate within threshold', async () => {
    const a = checker(96, 12);
    const b = checker(64, 8); // same checkerboard structure, scaled
    dataset.push({
      id: 'orig', ownerUserId: 'u1', retired: false,
      manifest: { phash: pHash(a) }, thumbnailUrl: 'a.png', displayName: 'A',
    });
    const result = await svc.searchByImage(b);
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].skinId).toBe('orig');
    expect(result.matches[0].distance).toBeLessThanOrEqual(12);
  });

  it('searchByImage excludes retired skins', async () => {
    dataset.push({
      id: 'retired', ownerUserId: 'u1', retired: true,
      manifest: { phash: pHash(gradient(64)) }, thumbnailUrl: null, displayName: 'X',
    });
    const r = await svc.searchByImage(gradient(64));
    expect(r.matches).toHaveLength(0);
  });

  it('searchByImage respects excludeSkinId', async () => {
    const h = pHash(gradient(64));
    dataset.push({ id: 's1', ownerUserId: 'u', retired: false, manifest: { phash: h }, thumbnailUrl: null, displayName: 'A' });
    dataset.push({ id: 's2', ownerUserId: 'u', retired: false, manifest: { phash: h }, thumbnailUrl: null, displayName: 'B' });
    const r = await svc.searchByImage(gradient(64), { excludeSkinId: 's1' });
    expect(r.matches.map((m) => m.skinId)).toEqual(['s2']);
  });

  it('searchByImage returns nothing when nothing within threshold', async () => {
    dataset.push({
      id: 'unrelated', ownerUserId: 'u', retired: false,
      manifest: { phash: pHash(checker(64, 8)) }, thumbnailUrl: null, displayName: 'C',
    });
    const r = await svc.searchByImage(gradient(64), { threshold: 4 });
    expect(r.matches).toHaveLength(0);
  });

  it('matches sorted ascending by distance and capped at limit', async () => {
    dataset.push({ id: 'close', ownerUserId: 'u', retired: false, manifest: { phash: pHash(checker(64, 8)) }, thumbnailUrl: null, displayName: 'A' });
    dataset.push({ id: 'far', ownerUserId: 'u', retired: false, manifest: { phash: pHash(checker(64, 4)) }, thumbnailUrl: null, displayName: 'B' });
    const r = await svc.searchByImage(checker(72, 9), { limit: 1 });
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].skinId).toBe('close');
  });
});
