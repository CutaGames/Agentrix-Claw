import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PetSkinService } from './pet-skin.service';
import { PetSkin } from '../../entities/pet-skin.entity';
import { PetActiveSkin } from '../../entities/pet-active-skin.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { AncestorChainService } from '../marketplace-pet/ancestor-chain.service';
import { UserPlanResolverService } from '../pet-gen-quota/user-plan-resolver.service';

/**
 * BE-T1.2: 来源跟踪 (source = generated / purchased / remixed)
 * BE-T1.3: pet-active-skin 唯一约束（一 user 仅一 active）
 * BE-T1.6 (skin variant): activate 不属于 user 的私有皮肤 → ForbiddenException
 * Pet Phase 6 P0-3 / P0-6 (2026-05-08): paid install 需 paid Order + 非 free tier
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

  const orderRepo = {
    findOne: jest.fn(),
    save: jest.fn((d) => Promise.resolve(d)),
  };

  const ancestorChain = {
    resolveChain: jest.fn().mockResolvedValue([]),
  };

  const planResolver = {
    getPlan: jest.fn().mockResolvedValue('pro'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    ancestorChain.resolveChain.mockResolvedValue([]);
    planResolver.getPlan.mockResolvedValue('pro');
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PetSkinService,
        { provide: getRepositoryToken(PetSkin), useValue: skinRepo },
        { provide: getRepositoryToken(PetActiveSkin), useValue: activeRepo },
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: AncestorChainService, useValue: ancestorChain },
        { provide: UserPlanResolverService, useValue: planResolver },
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

    // ── P2-4 (2026-05-08) marketplace search/filter/sort ────────────────
    it('applies q (display_name ILIKE) + price range + sort', async () => {
      const calls: Array<[string, any?]> = [];
      const orderCalls: Array<[string, string?]> = [];
      const qb: any = {
        where: jest.fn((s, p) => { calls.push([s, p]); return qb; }),
        andWhere: jest.fn((s, p) => { calls.push([s, p]); return qb; }),
        orderBy: jest.fn((s, d) => { orderCalls.push([s, d]); return qb; }),
        addOrderBy: jest.fn((s, d) => { orderCalls.push([s, d]); return qb; }),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      };
      skinRepo.createQueryBuilder.mockReturnValue(qb);
      await service.listMarketplace({
        q: 'sky',
        minPriceCents: 100,
        maxPriceCents: 5000,
        sort: 'price_asc',
      });
      const flat = calls.map(([s, p]) => `${s}::${JSON.stringify(p ?? null)}`).join(' || ');
      expect(flat).toContain('display_name ILIKE');
      expect(flat).toContain('"q":"%sky%"');
      expect(flat).toContain('price_cents >=');
      expect(flat).toContain('price_cents <=');
      expect(orderCalls[0][0]).toBe('s.price_cents');
      expect(orderCalls[0][1]).toBe('ASC');
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
      orderRepo.findOne.mockResolvedValue({
        id: 'order-1',
        userId: 'buyer',
        productId: 's1',
        amount: 10, // $10.00 → 1000 cents
        status: OrderStatus.PAID,
        metadata: {},
      });
      const out = await service.installFromMarketplace('buyer', 's1', {
        acknowledgedPriceCents: 1000,
        orderId: 'order-1',
      });
      const split = (out.manifest as any).purchaseSplit;
      expect(split).toBeDefined();
      expect(split.grossPriceCents).toBe(1000);
      expect(split.platformCents).toBe(50); // 5% of 1000c
      expect(split.payoutStatus).toBe('pending');
      expect(split.orderId).toBe('order-1');
      // creator0 gets 15% royalty = 150c
      const creatorPayout = split.payouts.find(
        (p: any) => p.recipientUserId === 'creator0' && p.reason === 'royalty',
      );
      expect(creatorPayout?.amountCents).toBe(150);
      // seller gets 1000 - 50 - 150 = 800
      expect(split.sellerCents).toBe(800);
      // P0-3 — order is marked consumed so a single payment cannot be replayed
      expect(orderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            consumedForSkinInstall: expect.any(String),
            consumedForSkinSourceId: 's1',
          }),
        }),
      );
    });

    // ---- P0-6 server-authoritative tier gating ----
    it('rejects paid install for free-tier users with pet_skin_requires_pro', async () => {
      planResolver.getPlan.mockResolvedValue('free');
      skinRepo.findOne.mockResolvedValue({
        id: 's1',
        ownerUserId: 'seller',
        retired: false,
        visibility: 'public',
        moderationStatus: 'approved',
        priceCents: 500,
      });
      await expect(
        service.installFromMarketplace('buyer', 's1', {
          acknowledgedPriceCents: 500,
          orderId: 'order-1',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'pet_skin_requires_pro' }),
      });
      // Free skin still installs even on free tier
      planResolver.getPlan.mockResolvedValue('free');
      skinRepo.findOne.mockResolvedValue({
        id: 's2',
        ownerUserId: 'seller',
        retired: false,
        visibility: 'public',
        moderationStatus: 'approved',
        priceCents: 0,
        manifest: {},
      });
      await expect(service.installFromMarketplace('buyer', 's2')).resolves.toMatchObject({
        source: 'purchased',
      });
    });

    // ---- P0-3 paid install requires real Order ----
    it('rejects paid install without orderId (payment_required)', async () => {
      skinRepo.findOne.mockResolvedValue({
        id: 's1',
        ownerUserId: 'seller',
        retired: false,
        visibility: 'public',
        moderationStatus: 'approved',
        priceCents: 500,
      });
      await expect(
        service.installFromMarketplace('buyer', 's1', { acknowledgedPriceCents: 500 }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'payment_required' }),
      });
    });

    it.each([
      ['order_not_found', null],
      ['order_not_owned', { id: 'o1', userId: 'someone-else', amount: 5, status: OrderStatus.PAID, productId: 's1', metadata: {} }],
      ['order_not_paid', { id: 'o1', userId: 'buyer', amount: 5, status: OrderStatus.CREATED, productId: 's1', metadata: {} }],
      ['order_amount_mismatch', { id: 'o1', userId: 'buyer', amount: 4, status: OrderStatus.PAID, productId: 's1', metadata: {} }],
      ['order_skin_mismatch', { id: 'o1', userId: 'buyer', amount: 5, status: OrderStatus.PAID, productId: 'other-skin', metadata: {} }],
      ['order_already_consumed', { id: 'o1', userId: 'buyer', amount: 5, status: OrderStatus.PAID, productId: 's1', metadata: { consumedForSkinInstall: 'previous' } }],
    ])('rejects paid install with %s', async (code, orderRow) => {
      skinRepo.findOne.mockResolvedValue({
        id: 's1',
        ownerUserId: 'seller',
        retired: false,
        visibility: 'public',
        moderationStatus: 'approved',
        priceCents: 500,
      });
      orderRepo.findOne.mockResolvedValue(orderRow);
      await expect(
        service.installFromMarketplace('buyer', 's1', {
          acknowledgedPriceCents: 500,
          orderId: 'o1',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code }),
      });
    });
  });

  // ---- P0-6 entitlements snapshot ----
  describe('resolveEntitlements (P0-6)', () => {
    it('marks free tier as cannot install paid skins', async () => {
      planResolver.getPlan.mockResolvedValue('free');
      const e = await service.resolveEntitlements('u1');
      expect(e).toEqual({
        tier: 'free',
        can_install_paid_skin: false,
        can_breed: true,
        paid_install_requires_order: true,
      });
    });

    it.each(['pro', 'pro_plus', 'enterprise'] as const)('allows %s tier to install paid skins', async (tier) => {
      planResolver.getPlan.mockResolvedValue(tier);
      const e = await service.resolveEntitlements('u1');
      expect(e.can_install_paid_skin).toBe(true);
      expect(e.tier).toBe(tier);
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
