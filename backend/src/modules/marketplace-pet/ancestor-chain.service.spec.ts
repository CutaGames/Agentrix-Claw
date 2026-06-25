import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AncestorChainService } from './ancestor-chain.service';
import { PetSkin } from '../../entities/pet-skin.entity';

describe('AncestorChainService (Phase 3 W1)', () => {
  let service: AncestorChainService;
  // Build a chain: gen0(creator=A) → gen1(creator=B,parent=gen0) → gen2(creator=C,parent=gen1) → gen3(creator=D,parent=gen2)
  const skins: any[] = [
    { id: 'gen0', parentSkinId: null, originalCreatorUserId: 'A', ownerUserId: 'A', royaltyRateBps: 1000 },
    { id: 'gen1', parentSkinId: 'gen0', originalCreatorUserId: 'B', ownerUserId: 'X', royaltyRateBps: 800 },
    { id: 'gen2', parentSkinId: 'gen1', originalCreatorUserId: 'C', ownerUserId: 'Y', royaltyRateBps: 600 },
    { id: 'gen3', parentSkinId: 'gen2', originalCreatorUserId: 'D', ownerUserId: 'Z', royaltyRateBps: 400 },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AncestorChainService,
        {
          provide: getRepositoryToken(PetSkin),
          useValue: {
            findOne: jest.fn(async ({ where }: any) =>
              skins.find((s) => s.id === where.id) ?? null,
            ),
          },
        },
      ],
    }).compile();
    service = module.get(AncestorChainService);
  });

  it('walks parent chain oldest → newest', async () => {
    const chain = await service.resolveChain('gen3');
    expect(chain.map((c) => c.creatorUserId)).toEqual(['A', 'B', 'C', 'D']);
    expect(chain.map((c) => c.royaltyRateBps)).toEqual([1000, 800, 600, 400]);
  });

  it('single-skin chain returns just that creator', async () => {
    const chain = await service.resolveChain('gen0');
    expect(chain).toHaveLength(1);
    expect(chain[0].creatorUserId).toBe('A');
  });

  it('returns empty when skin not found', async () => {
    const chain = await service.resolveChain('nope');
    expect(chain).toEqual([]);
  });
});
