/**
 * CompanionFeatureFlagService — P-9 wave 16 T24.3.
 *
 * Mirrors `WorldEngineFeatureFlagService` (already shipped). Reads the
 * `pet_companion_redesign_enabled` row from `admin_configs`, evaluates
 * cohort hash + denylist + allowlist + master switch, returns true when
 * a user should see the new 4-tab IA + companion ball + sheets.
 *
 * The mobile bundle that lands in 100% of users contains both the legacy
 * IA and the P-9 IA; the boot path reads this flag once via
 * `GET /v1/feature-flag/pet_companion_redesign?userId=` and locks the
 * choice for the session.
 *
 * Spec: requirements.md R12.9.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminConfig } from '../../entities/admin-config.entity';
import * as crypto from 'crypto';

interface FeatureFlagMetadata {
  type: 'feature_flag';
  rolloutPercentage: number;
  rolloutStrategy?: 'user_id_hash';
  allowlist: string[];
  denylist: string[];
  description?: string;
}

interface CachedConfig {
  config: AdminConfig | null;
  expiresAt: number;
}

@Injectable()
export class CompanionFeatureFlagService {
  static readonly FLAG_KEY = 'pet_companion_redesign_enabled';
  private static readonly CACHE_TTL_MS = 60_000;

  private cachedConfig: CachedConfig | null = null;

  constructor(
    @InjectRepository(AdminConfig)
    private readonly configRepo: Repository<AdminConfig>,
  ) {}

  /** Evaluate enable for a specific user (handles cohort %, allowlist, denylist). */
  async isEnabledForUser(userId: string): Promise<boolean> {
    const config = await this.getConfig();
    if (!config) return false;
    if (config.value !== 'true') return false;

    const meta = config.metadata as unknown as FeatureFlagMetadata;
    if (!meta || meta.type !== 'feature_flag') return false;

    if (meta.denylist?.includes(userId)) return false;
    if (meta.allowlist?.includes(userId)) return true;

    const pct = Math.max(0, Math.min(100, meta.rolloutPercentage ?? 0));
    if (pct >= 100) return true;
    if (pct <= 0) return false;

    // Stable hash-based cohort: same userId always sees same answer.
    const hash = crypto
      .createHash('sha256')
      .update(`${CompanionFeatureFlagService.FLAG_KEY}:${userId}`)
      .digest();
    const bucket = hash.readUInt32BE(0) % 100;
    return bucket < pct;
  }

  /** Mass query — used by Mobile boot to learn its enable state. */
  async describeForUser(userId: string): Promise<{
    enabled: boolean;
    rolloutPercentage: number;
    cohort: 'denylist' | 'allowlist' | 'cohort' | 'master-off';
  }> {
    const config = await this.getConfig();
    if (!config || config.value !== 'true') {
      return { enabled: false, rolloutPercentage: 0, cohort: 'master-off' };
    }
    const meta = config.metadata as unknown as FeatureFlagMetadata;
    if (meta?.denylist?.includes(userId)) {
      return { enabled: false, rolloutPercentage: meta.rolloutPercentage ?? 0, cohort: 'denylist' };
    }
    if (meta?.allowlist?.includes(userId)) {
      return { enabled: true, rolloutPercentage: meta.rolloutPercentage ?? 0, cohort: 'allowlist' };
    }
    const enabled = await this.isEnabledForUser(userId);
    return {
      enabled,
      rolloutPercentage: meta?.rolloutPercentage ?? 0,
      cohort: 'cohort',
    };
  }

  invalidateCache(): void {
    this.cachedConfig = null;
  }

  private async getConfig(): Promise<AdminConfig | null> {
    const now = Date.now();
    if (this.cachedConfig && this.cachedConfig.expiresAt > now) {
      return this.cachedConfig.config;
    }
    const config = await this.configRepo.findOne({
      where: { key: CompanionFeatureFlagService.FLAG_KEY },
    });
    this.cachedConfig = {
      config: config ?? null,
      expiresAt: now + CompanionFeatureFlagService.CACHE_TTL_MS,
    };
    return config ?? null;
  }
}
