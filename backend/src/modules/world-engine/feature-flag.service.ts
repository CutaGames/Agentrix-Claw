import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminConfig } from '../../entities/admin-config.entity';
import * as crypto from 'crypto';

interface FeatureFlagMetadata {
  type: 'feature_flag';
  rolloutPercentage: number;
  rolloutStrategy: 'user_id_hash';
  allowlist: string[];
  denylist: string[];
  description: string;
}

/** Cached config row with expiry timestamp */
interface CachedConfig {
  config: AdminConfig | null;
  expiresAt: number;
}

@Injectable()
export class WorldEngineFeatureFlagService {
  private static readonly FLAG_KEY = 'world_engine_enabled';

  /** Cache TTL: 60 seconds to avoid DB reads on every request */
  private static readonly CACHE_TTL_MS = 60_000;

  /** In-memory cache for the admin_configs row */
  private cachedConfig: CachedConfig | null = null;

  constructor(
    @InjectRepository(AdminConfig)
    private readonly configRepo: Repository<AdminConfig>,
  ) {}

  /**
   * Evaluate whether the World Engine feature is enabled for a given user.
   *
   * Evaluation order:
   * 1. Master switch OFF → always false
   * 2. User in denylist → false
   * 3. User in allowlist → true
   * 4. Percentage rollout: SHA-256("world_engine:" + userId) → bucket 0-99 → compare with rolloutPercentage
   *
   * The config row is cached for 60s to avoid DB reads on every request.
   */
  async isEnabledForUser(userId: string): Promise<boolean> {
    const config = await this.getConfigCached();

    if (!config || config.value !== 'true') {
      return false; // master kill-switch
    }

    const meta = config.metadata as unknown as FeatureFlagMetadata;
    if (!meta || meta.type !== 'feature_flag') {
      return false;
    }

    // Check denylist → false
    if (meta.denylist?.includes(userId)) return false;
    // Check allowlist → true
    if (meta.allowlist?.includes(userId)) return true;

    // Hash-based cohort: SHA-256("world_engine:" + userId) → bucket 0-99
    const hash = crypto
      .createHash('sha256')
      .update(`world_engine:${userId}`)
      .digest();
    const bucket = hash.readUInt16BE(0) % 100;
    return bucket < meta.rolloutPercentage;
  }

  /**
   * Invalidate the cached config. Useful for testing or after admin updates.
   */
  invalidateCache(): void {
    this.cachedConfig = null;
  }

  /**
   * Read the config row from cache if fresh, otherwise from DB.
   * Caches the result (including null/not-found) for 60 seconds.
   */
  private async getConfigCached(): Promise<AdminConfig | null> {
    const now = Date.now();

    if (this.cachedConfig && now < this.cachedConfig.expiresAt) {
      return this.cachedConfig.config;
    }

    const config = await this.configRepo.findOne({
      where: { key: WorldEngineFeatureFlagService.FLAG_KEY },
    });

    this.cachedConfig = {
      config: config ?? null,
      expiresAt: now + WorldEngineFeatureFlagService.CACHE_TTL_MS,
    };

    return this.cachedConfig.config;
  }
}
