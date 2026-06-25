import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IdentityResolverService } from './identity-resolver.service';
import { WorldAsset } from '../../world-engine/entities/world-asset.entity';
import { LivingPet } from '../../../entities/living-pet.entity';

/**
 * Unit tests for IdentityResolverService (Task 11.3, R9.3).
 *
 * Focus areas (per task spec):
 *   (1) resolveReadonlyHandles returns handles whose keys are ONLY
 *       {assetId, kind, name, thumbnailUrl} — no ownership proof
 *       (ownerId / originalCreatorId / version / userId) ever leaks;
 *   (2) authorizeAssetImport denies an unowned / non-existent asset with a
 *       structured ASSET_NOT_OWNED error and authorizes an owned asset with a
 *       credential-stripped read-only handle.
 *
 * WorldAsset / LivingPet repositories are jest.fn mocks wired through the
 * NestJS testing module (no DB).
 */
describe('IdentityResolverService — Cross_Experience_Identity (R9.3)', () => {
  let service: IdentityResolverService;

  let worldAssetRepo: { find: jest.Mock; findOne: jest.Mock };
  let livingPetRepo: { find: jest.Mock; findOne: jest.Mock };

  const USER_ID = 'user-1';
  const OTHER_USER_ID = 'user-2';

  /** The exact (and ONLY) keys a ReadonlyAssetHandle may carry — no credentials. */
  const ALLOWED_HANDLE_KEYS = ['assetId', 'kind', 'name', 'thumbnailUrl'];
  /** Ownership-credential keys that must NEVER appear on a handle. */
  const FORBIDDEN_CREDENTIAL_KEYS = [
    'ownerId',
    'originalCreatorId',
    'version',
    'userId',
    'boundAgentId',
    'meshUrl',
    'styledMeshUrl',
    'portraitUrl',
  ];

  const makeWorldAsset = (over: Partial<WorldAsset> = {}): WorldAsset =>
    ({
      id: 'wa-1',
      ownerId: USER_ID,
      originalCreatorId: 'creator-9',
      name: 'Hero Mech',
      styledMeshUrl: 'https://cdn/styled.glb',
      meshUrl: 'https://cdn/raw.glb',
      portraitUrl: 'https://cdn/portrait.png',
      boundAgentId: null,
      version: 4,
      ...over,
    }) as unknown as WorldAsset;

  const makePet = (over: Partial<LivingPet> = {}): LivingPet =>
    ({
      id: 'pet-1',
      userId: USER_ID,
      name: 'Sparky',
      ...over,
    }) as unknown as LivingPet;

  beforeEach(async () => {
    worldAssetRepo = { find: jest.fn(), findOne: jest.fn() };
    livingPetRepo = { find: jest.fn(), findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityResolverService,
        { provide: getRepositoryToken(WorldAsset), useValue: worldAssetRepo },
        { provide: getRepositoryToken(LivingPet), useValue: livingPetRepo },
      ],
    }).compile();

    service = module.get(IdentityResolverService);
  });

  // ============================================================
  // (1) resolveReadonlyHandles — no ownership credentials leak
  // ============================================================
  describe('resolveReadonlyHandles', () => {
    it('exposes ONLY {assetId, kind, name, thumbnailUrl} — never ownership credentials', async () => {
      worldAssetRepo.find.mockResolvedValue([makeWorldAsset()]);
      livingPetRepo.findOne.mockResolvedValue(makePet());

      const handles = await service.resolveReadonlyHandles(USER_ID);

      expect(handles).toHaveLength(2);
      for (const handle of handles) {
        // Every key present must be in the allowed display-only set.
        for (const key of Object.keys(handle)) {
          expect(ALLOWED_HANDLE_KEYS).toContain(key);
        }
        // No credential key may appear under any circumstance.
        for (const forbidden of FORBIDDEN_CREDENTIAL_KEYS) {
          expect(handle).not.toHaveProperty(forbidden);
        }
      }
    });

    it('maps a WorldAsset to a worldAsset handle (styled mesh thumbnail) without credentials', async () => {
      worldAssetRepo.find.mockResolvedValue([makeWorldAsset()]);
      livingPetRepo.findOne.mockResolvedValue(null);

      const handles = await service.resolveReadonlyHandles(USER_ID);

      expect(handles).toEqual([
        {
          assetId: 'wa-1',
          kind: 'worldAsset',
          name: 'Hero Mech',
          thumbnailUrl: 'https://cdn/styled.glb',
        },
      ]);
    });

    it('maps the owned LivingPet to a pet handle exposing only its display name', async () => {
      worldAssetRepo.find.mockResolvedValue([]);
      livingPetRepo.findOne.mockResolvedValue(makePet());

      const handles = await service.resolveReadonlyHandles(USER_ID);

      expect(handles).toEqual([
        { assetId: 'pet-1', kind: 'pet', name: 'Sparky' },
      ]);
      // The owning userId must not survive into the handle.
      expect(handles[0]).not.toHaveProperty('userId');
    });

    it('returns an empty list for a missing userId (no resolution attempted)', async () => {
      const handles = await service.resolveReadonlyHandles('');

      expect(handles).toEqual([]);
      expect(worldAssetRepo.find).not.toHaveBeenCalled();
      expect(livingPetRepo.findOne).not.toHaveBeenCalled();
    });

    it('continues resolving other sources when one asset source fails', async () => {
      worldAssetRepo.find.mockRejectedValue(new Error('db down'));
      livingPetRepo.findOne.mockResolvedValue(makePet());

      const handles = await service.resolveReadonlyHandles(USER_ID);

      // WorldAsset source failed, but the pet still travels with the user.
      expect(handles).toEqual([
        { assetId: 'pet-1', kind: 'pet', name: 'Sparky' },
      ]);
    });
  });

  // ============================================================
  // (2) authorizeAssetImport — ownership gating (R9.3)
  // ============================================================
  describe('authorizeAssetImport', () => {
    it('authorizes an owned WorldAsset and returns a credential-stripped handle', async () => {
      worldAssetRepo.findOne.mockResolvedValue(makeWorldAsset({ ownerId: USER_ID }));

      const result = await service.authorizeAssetImport(USER_ID, 'wa-1');

      expect(result.authorized).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.handle).toEqual({
        assetId: 'wa-1',
        kind: 'worldAsset',
        name: 'Hero Mech',
        thumbnailUrl: 'https://cdn/styled.glb',
      });
      // Even on the authorized path, no credential leaks through the handle.
      for (const forbidden of FORBIDDEN_CREDENTIAL_KEYS) {
        expect(result.handle).not.toHaveProperty(forbidden);
      }
    });

    it('denies import of an asset owned by another user with ASSET_NOT_OWNED', async () => {
      worldAssetRepo.findOne.mockResolvedValue(
        makeWorldAsset({ ownerId: OTHER_USER_ID }),
      );

      const result = await service.authorizeAssetImport(USER_ID, 'wa-1');

      expect(result.authorized).toBe(false);
      expect(result.handle).toBeUndefined();
      expect(result.error?.error).toBe('ASSET_NOT_OWNED');
    });

    it('denies import of a non-existent asset with ASSET_NOT_OWNED', async () => {
      worldAssetRepo.findOne.mockResolvedValue(null);
      livingPetRepo.findOne.mockResolvedValue(null);

      const result = await service.authorizeAssetImport(USER_ID, 'ghost-asset');

      expect(result.authorized).toBe(false);
      expect(result.error?.error).toBe('ASSET_NOT_OWNED');
    });

    it('denies when assetId is missing without querying any source', async () => {
      const result = await service.authorizeAssetImport(USER_ID, '');

      expect(result.authorized).toBe(false);
      expect(result.error?.error).toBe('ASSET_NOT_OWNED');
      expect(worldAssetRepo.findOne).not.toHaveBeenCalled();
      expect(livingPetRepo.findOne).not.toHaveBeenCalled();
    });

    it('assertOwnership returns true only when the user owns the asset', async () => {
      worldAssetRepo.findOne.mockResolvedValueOnce(
        makeWorldAsset({ ownerId: USER_ID }),
      );
      await expect(service.assertOwnership(USER_ID, 'wa-1')).resolves.toBe(true);

      worldAssetRepo.findOne.mockResolvedValueOnce(
        makeWorldAsset({ ownerId: OTHER_USER_ID }),
      );
      await expect(service.assertOwnership(USER_ID, 'wa-1')).resolves.toBe(false);
    });
  });
});
