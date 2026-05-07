import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PetSkinService } from './pet-skin.service';
import { PetSkin } from '../../entities/pet-skin.entity';
import { PetActiveSkin } from '../../entities/pet-active-skin.entity';
import { AncestorChainService } from '../marketplace-pet/ancestor-chain.service';

/**
 * BE-T1.2: 来源跟踪 (source = generated / purchased / remixed)
 * BE-T1.3: pet-active-skin 唯一约束（一 user 仅一 active）
 * BE-T1.6 (skin variant): activate 不属于 user 的私有皮肤 → ForbiddenException
 */
describe('PetSkinService', () => {
  let service: PetSkinService;

  const skinRepo = {
    create: jest.fn((d) => d),
    save: jest.fn((d) => Promise.resolve({ ...d, id: d.id ?? 'skin-uuid', createdAt: new Date() })),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const activeRepo = {
    create: jest.fn((d) => d),
    save: jest.fn((d) => Promise.resolve(d)),
    findOne: jest.fn(),
  };

  const ancestorChain = {
    resolveChain: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    ancestorChain.resolveChain.mockResolvedValue([]);
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PetSkinService,
        { provide: getRepositoryToken(PetSkin), useValue: skinRepo },
        { provide: getRepositoryToken(PetActiveSkin), useValue: activeRepo },
        { provide: AncestorChainService, useValue: ancestorChain },
      ],
    }).compile();
    service = mod.get<PetSkinService>(PetSkinService);
  });

  describe('create', () => {
    it.each(['platform', 'generated', 'purchased', 'remixed', 'gifted'] as const)(
      'tracks source = %s',
      async (source) => {
        const out = await service.create({
          ownerUserId: 'u1',
          source,
          displayName: 'Test',
          url: 'https://cdn/test.vrm',
        });
        expect(out.source).toBe(source);
      },
    );
  });

  describe('activate', () => {
    it('throws NotFoundException when skin missing', async () => {
      skinRepo.findOne.mockResolvedValue(null);
      await expect(service.activate('u1', 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when skin owned by another user', async () => {
      skinRepo.findOne.mockResolvedValue({ id: 's1', ownerUserId: 'u2', retired: false });
      await expect(service.activate('u1', 's1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows activating platform-global skin (ownerUserId null)', async () => {
      skinRepo.findOne.mockResolvedValue({ id: 's1', ownerUserId: null, retired: false });
      activeRepo.findOne.mockResolvedValue(null);
      await service.activate('u1', 's1');
      expect(activeRepo.create).toHaveBeenCalledWith({ userId: 'u1', activeSkinId: 's1' });
      expect(activeRepo.save).toHaveBeenCalled();
    });

    it('upserts (replaces) existing active skin for same user — uniqueness contract', async () => {
      skinRepo.findOne.mockResolvedValue({ id: 's2', ownerUserId: 'u1', retired: false });
      const existing = { userId: 'u1', activeSkinId: 's1' };
      activeRepo.findOne.mockResolvedValue(existing);
      await service.activate('u1', 's2');
      expect(existing.activeSkinId).toBe('s2');
      expect(activeRepo.create).not.toHaveBeenCalled();
      expect(activeRepo.save).toHaveBeenCalledWith(existing);
    });

    it('rejects retired skin', async () => {
      skinRepo.findOne.mockResolvedValue({ id: 's1', ownerUserId: 'u1', retired: true });
      await expect(service.activate('u1', 's1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('listOwned', () => {
    it('queries with retired=false + (owner = userId OR null)', async () => {
      const qb: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      skinRepo.createQueryBuilder.mockReturnValue(qb);
      await service.listOwned('u1');
      expect(qb.where).toHaveBeenCalledWith('s.retired = false');
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('owner_user_id'),
        { userId: 'u1' },
      );
    });
  });

  // ─── V4 §3.2 — Marketplace moderation + paid install ─────────────
  describe('listMarketplace (V4 §3.2)', () => {
    it('filters to public + approved + not-retired', async () => {
      const calls: Array<[string, any?]> = [];
      const qb: any = {
        where: jest.fn((s, p) => { calls.push([s, p]); return qb; }),
        andWhere: jest.fn((s, p) => { calls.push([s, p]); return qb; }),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      };
      skinRepo.createQueryBuilder.mockReturnValue(qb);
      await service.listMarketplace({});
      const flat = calls.map(([s]) => s).join(' | ');
      expect(flat).toContain("s.retired = false");
      expect(flat).toContain("s.visibility = 'public'");
      expect(flat).toContain("s.moderation_status = 'approved'");
    });
  });

  describe('installFromMarketplace (V4 §3.2)', () => {
    it('rejects install when source skin is not public/approved', async () => {
      skinRepo.findOne.mockResolvedValue({
        id: 's1',
        ownerUserId: 'seller',
        retired: false,
        visibility: 'private',
        moderationStatus: 'pending',
        priceCents: 0,
      });
      await expect(service.installFromMarketplace('buyer', 's1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('clones free public skin with parent + creator lineage and no purchaseSplit', async () => {
      const src = {
        id: 's1',
        ownerUserId: 'seller',
        originalCreatorUserId: 'creator0',
        royaltyRateBps: 1000,
        retired: false,
        visibility: 'public',
        moderationStatus: 'approved',
        priceCents: 0,
        displayName: 'Sky',
        url: 'https://cdn/s.vrm',
        thumbnailUrl: null,
        format: 'vrm',
        manifest: { tag: 'a' },
      };
      skinRepo.findOne.mockResolvedValue(src);
      const out = await service.installFromMarketplace('buyer', 's1');
      expect(out.source).toBe('purchased');
      expect(out.parentSkinId).toBe('s1');
      expect(out.originalCreatorUserId).toBe('creator0');
      expect(out.royaltyRateBps).toBe(1000);
      expect((out.manifest as any).installedFrom).toBe('s1');
      expect((out.manifest as any).purchaseSplit).toBeUndefined();
      expect(ancestorChain.resolveChain).not.toHaveBeenCalled();
    });

    it('requires acknowledgedPriceCents to match for paid skin', async () => {
      skinRepo.findOne.mockResolvedValue({
        id: 's1',
        ownerUserId: 'seller',
        retired: false,
        visibility: 'public',
        moderationStatus: 'approved',
        priceCents: 500,
      });
      await expect(service.installFromMarketplace('buyer', 's1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.installFromMarketplace('buyer', 's1', { acknowledgedPriceCents: 400 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('embeds RoyaltySplitter result into clone manifest for paid install', async () => {
      const src = {
        id: 's1',
        ownerUserId: 'seller',
        originalCreatorUserId: 'creator0',
        royaltyRateBps: 1500,
        retired: false,
        visibility: 'public',
        moderationStatus: 'approved',
        priceCents: 1000,
        displayName: 'Sky',
        url: 'https://cdn/s.vrm',
        thumbnailUrl: null,
        format: 'vrm',
        manifest: {},
      };
      skinRepo.findOne.mockResolvedValue(src);
      ancestorChain.resolveChain.mockResolvedValue([
        { creatorUserId: 'creator0', royaltyRateBps: 1500 },
      ]);
      const out = await service.installFromMarketplace('buyer', 's1', {
        acknowledgedPriceCents: 1000,
      });
      const split = (out.manifest as any).purchaseSplit;
      expect(split).toBeDefined();
      expect(split.grossPriceCents).toBe(1000);
      expect(split.platformCents).toBe(50); // 5% of 1000c
      expect(split.payoutStatus).toBe('pending');
      // creator0 gets 15% royalty = 150c
      const creatorPayout = split.payouts.find(
        (p: any) => p.recipientUserId === 'creator0' && p.reason === 'royalty',
      );
      expect(creatorPayout?.amountCents).toBe(150);
      // seller gets 1000 - 50 - 150 = 800
      expect(split.sellerCents).toBe(800);
    });
  });

  describe('setVisibility (V4 §3.2)', () => {
    it('rejects when caller is not owner', async () => {
      skinRepo.findOne.mockResolvedValue({ id: 's1', ownerUserId: 'other' });
      await expect(service.setVisibility('u1', 's1', 'public')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('resets moderation to pending when republishing a previously rejected skin', async () => {
      const skin: any = {
        id: 's1',
        ownerUserId: 'u1',
        visibility: 'private',
        moderationStatus: 'rejected',
      };
      skinRepo.findOne.mockResolvedValue(skin);
      await service.setVisibility('u1', 's1', 'public');
      expect(skin.visibility).toBe('public');
      expect(skin.moderationStatus).toBe('pending');
    });
  });

  describe('moderate (V4 §3.2)', () => {
    it('returns null when skin missing', async () => {
      skinRepo.findOne.mockResolvedValue(null);
      const out = await service.moderate('ghost', 'approved');
      expect(out).toBeNull();
    });

    it('flips moderation_status', async () => {
      const skin: any = { id: 's1', moderationStatus: 'pending' };
      skinRepo.findOne.mockResolvedValue(skin);
      await service.moderate('s1', 'approved', 'looks fine');
      expect(skin.moderationStatus).toBe('approved');
    });
  });
});
