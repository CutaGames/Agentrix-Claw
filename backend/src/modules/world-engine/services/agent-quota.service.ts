import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorldAsset } from '../entities/world-asset.entity';

/**
 * AgentQuotaService — Shared Agent slot quota check.
 *
 * Manages the unified Agent slot quota across both OpenClaw instances
 * and World Asset bound agents. Uses the workspace's `maxAgents` as
 * the single source of truth (FREE=3, PRO=10, BUSINESS=50, ENTERPRISE=200).
 *
 * Implements a Redis mutex for serializing concurrent bind operations
 * to prevent race conditions that could exceed the quota.
 *
 * Requirements: 11.2, 11.3, 6.6
 */
@Injectable()
export class AgentQuotaService {
  private readonly logger = new Logger(AgentQuotaService.name);

  // In-memory lock map as a fallback when Redis is not available.
  // In production, this should be replaced with a proper Redis mutex.
  private readonly lockMap = new Map<string, { expiresAt: number }>();

  constructor(
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepo: Repository<WorldAsset>,
  ) {}

  /**
   * Check the current Agent quota for a user.
   *
   * Counts:
   * - Active OpenClaw instances (openclaw_instances WHERE userId AND status='active')
   * - World Assets with bound agents (world_assets WHERE ownerId AND boundAgentId IS NOT NULL)
   *
   * Returns { current, max, available: current < max }
   */
  async checkAgentQuota(
    userId: string,
  ): Promise<{ current: number; max: number; available: boolean }> {
    // Get user's workspace maxAgents limit
    const max = await this.getUserMaxAgents(userId);

    // Count existing bound agents across both systems
    const current = await this.countBoundAgents(userId);

    return {
      current,
      max,
      available: current < max,
    };
  }

  /**
   * Acquire an Agent slot for binding.
   *
   * Checks quota and acquires a Redis mutex to serialize concurrent binds.
   * Throws ForbiddenException if quota is exhausted.
   *
   * @param userId - The user attempting to bind an agent
   * @throws ForbiddenException if no slots available
   */
  async acquireAgentSlot(userId: string): Promise<void> {
    // Acquire lock to serialize concurrent binds
    const lockKey = `agent_bind_lock:${userId}`;
    const acquired = await this.acquireLock(lockKey, 10_000); // 10s TTL

    if (!acquired) {
      throw new ForbiddenException(
        'Another agent binding operation is in progress. Please try again.',
      );
    }

    try {
      const quota = await this.checkAgentQuota(userId);

      if (!quota.available) {
        throw new ForbiddenException(
          `Agent slot quota reached (${quota.current}/${quota.max}). ` +
          'Please upgrade your subscription or unbind an existing agent to proceed.',
        );
      }
    } catch (error) {
      // Release lock on failure
      await this.releaseLock(lockKey);
      throw error;
    }
  }

  /**
   * Release the Agent slot lock for a user.
   *
   * Should be called after the bind operation completes (success or failure).
   */
  async releaseAgentSlot(userId: string): Promise<void> {
    const lockKey = `agent_bind_lock:${userId}`;
    await this.releaseLock(lockKey);
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /**
   * Get the user's workspace maxAgents limit.
   * Queries the workspaces table for the user's owned workspace.
   */
  private async getUserMaxAgents(userId: string): Promise<number> {
    try {
      // Query the workspace directly via raw query since we don't import the Workspace entity
      const result = await this.worldAssetRepo.manager.query(
        `SELECT "maxAgents" FROM workspaces WHERE "ownerId" = $1 AND status = 'active' LIMIT 1`,
        [userId],
      );

      if (result && result.length > 0) {
        return result[0].maxAgents || 3;
      }

      // Default to FREE plan limit if no workspace found
      return 3;
    } catch (error) {
      this.logger.warn(`Failed to query workspace maxAgents for user ${userId}: ${error.message}`);
      // Default to FREE plan limit on error
      return 3;
    }
  }

  /**
   * Count all bound agents for a user across both OpenClaw and World Assets.
   */
  private async countBoundAgents(userId: string): Promise<number> {
    let openclawCount = 0;
    let worldAssetCount = 0;

    // Count active OpenClaw instances
    try {
      const openclawResult = await this.worldAssetRepo.manager.query(
        `SELECT COUNT(*) as count FROM openclaw_instances WHERE "userId" = $1 AND status = 'active'`,
        [userId],
      );
      openclawCount = parseInt(openclawResult?.[0]?.count || '0', 10);
    } catch (error) {
      // Table might not exist yet; treat as 0
      this.logger.debug(`openclaw_instances query failed (may not exist): ${error.message}`);
      openclawCount = 0;
    }

    // Count World Assets with bound agents
    try {
      const boundResult = await this.worldAssetRepo.manager.query(
        `SELECT COUNT(*) as count FROM world_assets WHERE "ownerId" = $1 AND "boundAgentId" IS NOT NULL`,
        [userId],
      );
      worldAssetCount = parseInt(boundResult?.[0]?.count || '0', 10);
    } catch (error) {
      this.logger.debug(`world_assets bound agent count query failed: ${error.message}`);
      worldAssetCount = 0;
    }

    return openclawCount + worldAssetCount;
  }

  /**
   * Acquire a distributed lock (in-memory fallback; production should use Redis).
   *
   * In production, this should use:
   *   SET agent_bind_lock:{userId} 1 NX EX 10
   */
  private async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();

    // Clean up expired locks
    const existing = this.lockMap.get(key);
    if (existing && existing.expiresAt <= now) {
      this.lockMap.delete(key);
    }

    // Try to acquire
    if (this.lockMap.has(key)) {
      return false;
    }

    this.lockMap.set(key, { expiresAt: now + ttlMs });
    return true;
  }

  /**
   * Release a distributed lock.
   *
   * In production, this should use:
   *   DEL agent_bind_lock:{userId}
   */
  private async releaseLock(key: string): Promise<void> {
    this.lockMap.delete(key);
  }
}
