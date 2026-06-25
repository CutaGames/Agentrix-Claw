import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WorldEngineFeatureFlagService } from './feature-flag.service';
import { AdminConfig } from '../../entities/admin-config.entity';

describe('WorldEngineFeatureFlagService', () => {
  let service: WorldEngineFeatureFlagService;
  let mockConfigRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    mockConfigRepo = { findOne: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorldEngineFeatureFlagService,
        { provide: getRepositoryToken(AdminConfig), useValue: mockConfigRepo },
      ],
    }).compile();
    service = module.get<WorldEngineFeatureFlagService>(WorldEngineFeatureFlagService);
  });

  afterEach(() => { service.invalidateCache(); });

  it('returns false when no config row exists', async () => {
    mockConfigRepo.findOne.mockResolvedValue(null);
    expect(await service.isEnabledForUser('user-1')).toBe(false);
  });

  it('returns false when master switch is "false"', async () => {
    mockConfigRepo.findOne.mockResolvedValue({
      key: 'world_engine_enabled', value: 'false',
      metadata: { type: 'feature_flag', rolloutPercentage: 100, allowlist: [], denylist: [] },
    });
    expect(await service.isEnabledForUser('user-1')).toBe(false);
  });

  it('returns false when user is in denylist', async () => {
    mockConfigRepo.findOne.mockResolvedValue({
      key: 'world_engine_enabled', value: 'true',
      metadata: { type: 'feature_flag', rolloutPercentage: 100, rolloutStrategy: 'user_id_hash', allowlist: [], denylist: ['blocked'], description: '' },
    });
    expect(await service.isEnabledForUser('blocked')).toBe(false);
  });

  it('returns true when user is in allowlist', async () => {
    mockConfigRepo.findOne.mockResolvedValue({
      key: 'world_engine_enabled', value: 'true',
      metadata: { type: 'feature_flag', rolloutPercentage: 0, rolloutStrategy: 'user_id_hash', allowlist: ['vip'], denylist: [], description: '' },
    });
    expect(await service.isEnabledForUser('vip')).toBe(true);
  });

  it('denylist takes priority over allowlist', async () => {
    mockConfigRepo.findOne.mockResolvedValue({
      key: 'world_engine_enabled', value: 'true',
      metadata: { type: 'feature_flag', rolloutPercentage: 100, rolloutStrategy: 'user_id_hash', allowlist: ['u'], denylist: ['u'], description: '' },
    });
    expect(await service.isEnabledForUser('u')).toBe(false);
  });

  it('returns true for all users at 100% rollout', async () => {
    mockConfigRepo.findOne.mockResolvedValue({
      key: 'world_engine_enabled', value: 'true',
      metadata: { type: 'feature_flag', rolloutPercentage: 100, rolloutStrategy: 'user_id_hash', allowlist: [], denylist: [], description: '' },
    });
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      service.invalidateCache();
      expect(await service.isEnabledForUser(id)).toBe(true);
    }
  });

  it('returns false for all users at 0% rollout', async () => {
    mockConfigRepo.findOne.mockResolvedValue({
      key: 'world_engine_enabled', value: 'true',
      metadata: { type: 'feature_flag', rolloutPercentage: 0, rolloutStrategy: 'user_id_hash', allowlist: [], denylist: [], description: '' },
    });
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      service.invalidateCache();
      expect(await service.isEnabledForUser(id)).toBe(false);
    }
  });

  it('caches config row - only one DB call for multiple evaluations', async () => {
    mockConfigRepo.findOne.mockResolvedValue({
      key: 'world_engine_enabled', value: 'true',
      metadata: { type: 'feature_flag', rolloutPercentage: 100, rolloutStrategy: 'user_id_hash', allowlist: [], denylist: [], description: '' },
    });
    await service.isEnabledForUser('u1');
    await service.isEnabledForUser('u2');
    await service.isEnabledForUser('u3');
    expect(mockConfigRepo.findOne).toHaveBeenCalledTimes(1);
  });

  it('refreshes cache after invalidation', async () => {
    mockConfigRepo.findOne.mockResolvedValue({
      key: 'world_engine_enabled', value: 'false',
      metadata: { type: 'feature_flag', rolloutPercentage: 0, allowlist: [], denylist: [] },
    });
    expect(await service.isEnabledForUser('u1')).toBe(false);

    mockConfigRepo.findOne.mockResolvedValue({
      key: 'world_engine_enabled', value: 'true',
      metadata: { type: 'feature_flag', rolloutPercentage: 100, rolloutStrategy: 'user_id_hash', allowlist: [], denylist: [], description: '' },
    });
    // Still cached
    expect(await service.isEnabledForUser('u1')).toBe(false);
    // After invalidation
    service.invalidateCache();
    expect(await service.isEnabledForUser('u1')).toBe(true);
    expect(mockConfigRepo.findOne).toHaveBeenCalledTimes(2);
  });

  it('hash-based cohort is deterministic for same user', async () => {
    mockConfigRepo.findOne.mockResolvedValue({
      key: 'world_engine_enabled', value: 'true',
      metadata: { type: 'feature_flag', rolloutPercentage: 50, rolloutStrategy: 'user_id_hash', allowlist: [], denylist: [], description: '' },
    });
    const r1 = await service.isEnabledForUser('test-user');
    service.invalidateCache();
    const r2 = await service.isEnabledForUser('test-user');
    expect(r1).toBe(r2);
  });
});
