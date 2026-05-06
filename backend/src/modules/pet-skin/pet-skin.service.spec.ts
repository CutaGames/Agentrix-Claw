import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PetSkinService } from './pet-skin.service';
import { PetSkin } from '../../entities/pet-skin.entity';
import { PetActiveSkin } from '../../entities/pet-active-skin.entity';

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

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PetSkinService,
        { provide: getRepositoryToken(PetSkin), useValue: skinRepo },
        { provide: getRepositoryToken(PetActiveSkin), useValue: activeRepo },
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
});
