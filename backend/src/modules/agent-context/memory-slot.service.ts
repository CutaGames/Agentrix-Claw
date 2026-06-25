/**
 * Memory Slot Service — P1 Memory Contract
 *
 * Provides a unified memory contract layer above the raw AgentMemory entity:
 * - Slot-based read/write (key-value with scope)
 * - Automatic write-back from conversation extraction
 * - Flush plan: batch pending writes at end of turn
 * - Compaction reinject: re-inject key memories after compaction
 * - Cross-device recall: consistent memory across Web/Desktop/Mobile
 *
 * Works alongside AgentContextService (which handles buildContext/recall).
 * This service handles the write/flush/lifecycle side.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentMemory, MemoryScope, MemoryType } from '../../entities/agent-memory.entity';
import { HookService } from '../hooks/hook.service';
import { HookEventType } from '../../entities/hook-config.entity';

// ============================================================
// Memory Slot Types
// ============================================================

export interface MemorySlot {
  key: string;
  value: any;
  scope: MemoryScope;
  type: MemoryType;
  importance?: number;    // 0-1, higher = more important
  tags?: string[];
  expiresAt?: Date;
}

export interface FlushPlan {
  /** Slots queued for write (accumulated during a conversation turn) */
  pendingWrites: MemorySlot[];
  /** Keys marked for deletion */
  pendingDeletes: string[];
  /** Session context for the flush */
  sessionId?: string;
  userId: string;
  agentId?: string;
}

export interface RecallOptions {
  userId: string;
  agentId?: string;
  sessionId?: string;
  /** Maximum number of memories to recall */
  limit?: number;
  /** Filter by scope */
  scopes?: MemoryScope[];
  /** Filter by type */
  types?: MemoryType[];
  /** Filter by tags (any match) */
  tags?: string[];
  /** Only recall memories newer than this date */
  since?: Date;
}

export interface CompactionReinjectResult {
  /** Memories re-injected after compaction */
  reinjectedCount: number;
  /** Total characters of re-injected memory */
  totalChars: number;
}

// ============================================================
// Memory Slot Service
// ============================================================

@Injectable()
export class MemorySlotService {
  private readonly logger = new Logger(MemorySlotService.name);

  /** In-flight flush plans keyed by `${userId}:${sessionId}` */
  private flushPlans = new Map<string, FlushPlan>();

  constructor(
    @InjectRepository(AgentMemory)
    private readonly memoryRepo: Repository<AgentMemory>,
    private readonly hookService: HookService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════
  // Slot CRUD
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Read a single memory slot by key.
   */
  async readSlot(userId: string, key: string, scope?: MemoryScope): Promise<AgentMemory | null> {
    const where: any = { userId, key };
    if (scope) where.scope = scope;
    return this.memoryRepo.findOne({
      where,
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * Write a memory slot (upsert by userId + key + scope).
   */
  async writeSlot(
    userId: string,
    slot: MemorySlot,
    sessionId?: string,
    agentId?: string,
  ): Promise<AgentMemory> {
    const existing = await this.memoryRepo.findOne({
      where: {
        userId,
        key: slot.key,
        scope: slot.scope,
      },
    });

    if (existing) {
      existing.value = slot.value;
      existing.type = slot.type;
      if (slot.importance !== undefined || slot.tags || slot.expiresAt) {
        existing.metadata = {
          ...existing.metadata,
          importance: slot.importance ?? existing.metadata?.importance,
          tags: slot.tags ?? existing.metadata?.tags,
          expiresAt: slot.expiresAt ?? existing.metadata?.expiresAt,
        };
      }
      return this.memoryRepo.save(existing);
    }

    const memory = this.memoryRepo.create({
      userId,
      sessionId,
      agentId,
      key: slot.key,
      value: slot.value,
      scope: slot.scope,
      type: slot.type,
      metadata: {
        importance: slot.importance,
        tags: slot.tags,
        expiresAt: slot.expiresAt,
      },
    });

    return this.memoryRepo.save(memory);
  }

  /**
   * Delete a memory slot.
   */
  async deleteSlot(userId: string, key: string, scope?: MemoryScope): Promise<boolean> {
    const where: any = { userId, key };
    if (scope) where.scope = scope;
    const result = await this.memoryRepo.delete(where);
    return (result.affected || 0) > 0;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Recall (Read-side)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Recall memories with filtering and ranking.
   * Returns memories sorted by importance (desc) then recency (desc).
   */
  async recall(options: RecallOptions): Promise<AgentMemory[]> {
    const qb = this.memoryRepo.createQueryBuilder('m');

    qb.where('m.userId = :userId', { userId: options.userId });

    if (options.sessionId) {
      qb.andWhere('(m.sessionId = :sessionId OR m.scope != :sessionScope)', {
        sessionId: options.sessionId,
        sessionScope: MemoryScope.SESSION,
      });
    }

    if (options.agentId) {
      qb.andWhere('(m.agentId = :agentId OR m.scope IN (:...globalScopes))', {
        agentId: options.agentId,
        globalScopes: [MemoryScope.USER, MemoryScope.SHARED],
      });
    }

    if (options.scopes?.length) {
      qb.andWhere('m.scope IN (:...scopes)', { scopes: options.scopes });
    }

    if (options.types?.length) {
      qb.andWhere('m.type IN (:...types)', { types: options.types });
    }

    if (options.since) {
      qb.andWhere('m.updatedAt >= :since', { since: options.since });
    }

    if (options.tags?.length) {
      qb.andWhere(`m.metadata->>'tags' IS NOT NULL`);
      // Note: JSONB array overlap for tags
      qb.andWhere(`m.metadata->'tags' ?| ARRAY[:...tags]`, { tags: options.tags });
    }

    // Sort by importance desc, then recency desc
    qb.orderBy(`COALESCE((m.metadata->>'importance')::float, 0.5)`, 'DESC');
    qb.addOrderBy('m.updatedAt', 'DESC');

    qb.take(options.limit || 20);

    return qb.getMany();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Flush Plan (Write-batching)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Queue a slot write to the flush plan (deferred until flushPendingWrites).
   */
  queueWrite(userId: string, sessionId: string, slot: MemorySlot): void {
    const planKey = `${userId}:${sessionId}`;
    let plan = this.flushPlans.get(planKey);
    if (!plan) {
      plan = { pendingWrites: [], pendingDeletes: [], userId, sessionId };
      this.flushPlans.set(planKey, plan);
    }

    // Deduplicate by key (last write wins)
    const idx = plan.pendingWrites.findIndex(s => s.key === slot.key && s.scope === slot.scope);
    if (idx >= 0) {
      plan.pendingWrites[idx] = slot;
    } else {
      plan.pendingWrites.push(slot);
    }
  }

  /**
   * Queue a slot deletion to the flush plan.
   */
  queueDelete(userId: string, sessionId: string, key: string): void {
    const planKey = `${userId}:${sessionId}`;
    let plan = this.flushPlans.get(planKey);
    if (!plan) {
      plan = { pendingWrites: [], pendingDeletes: [], userId, sessionId };
      this.flushPlans.set(planKey, plan);
    }
    if (!plan.pendingDeletes.includes(key)) {
      plan.pendingDeletes.push(key);
    }
  }

  /**
   * Flush all pending writes/deletes for a session.
   * Called at the end of each conversation turn by RuntimeSeamService.
   */
  async flushPendingWrites(userId: string, sessionId: string, agentId?: string): Promise<number> {
    const planKey = `${userId}:${sessionId}`;
    const plan = this.flushPlans.get(planKey);
    if (!plan || (plan.pendingWrites.length === 0 && plan.pendingDeletes.length === 0)) {
      return 0;
    }

    let count = 0;

    // Execute deletes
    for (const key of plan.pendingDeletes) {
      await this.deleteSlot(userId, key);
      count++;
    }

    // Execute writes
    for (const slot of plan.pendingWrites) {
      await this.writeSlot(userId, slot, sessionId, agentId);
      count++;

      // Fire memory_save hook
      this.hookService.executeHooks({
        userId,
        sessionId,
        eventType: HookEventType.MEMORY_SAVE,
        metadata: { key: slot.key, scope: slot.scope, type: slot.type },
      }).catch((err: any) => {
        this.logger.warn(`Memory save hook failed: ${err.message}`);
      });
    }

    this.flushPlans.delete(planKey);
    this.logger.log(`Flushed ${count} memory ops for session ${sessionId}`);
    return count;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Compaction Reinject
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * After compaction removes conversation history, re-inject key memories
   * so the agent retains critical context. Returns a system message block
   * that should be prepended after the compaction summary.
   */
  async buildCompactionReinject(
    userId: string,
    agentId?: string,
    sessionId?: string,
    maxChars = 4000,
  ): Promise<{ text: string; result: CompactionReinjectResult }> {
    const memories = await this.recall({
      userId,
      agentId,
      sessionId,
      scopes: [MemoryScope.SESSION, MemoryScope.AGENT],
      limit: 15,
    });

    if (memories.length === 0) {
      return { text: '', result: { reinjectedCount: 0, totalChars: 0 } };
    }

    const lines: string[] = [];
    let totalChars = 0;
    for (const m of memories) {
      const line = `- [${m.scope}/${m.type}] ${m.key}: ${JSON.stringify(m.value).substring(0, 200)}`;
      if (totalChars + line.length > maxChars) break;
      lines.push(line);
      totalChars += line.length;
    }

    const text = `\n## Post-Compaction Memory Reinject (${lines.length} entries)\n${lines.join('\n')}\n`;
    return {
      text,
      result: { reinjectedCount: lines.length, totalChars },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Expiry Cleanup
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Remove expired memories. Should be called periodically (e.g. cron).
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.memoryRepo
      .createQueryBuilder()
      .delete()
      .where(`metadata->>'expiresAt' IS NOT NULL`)
      .andWhere(`(metadata->>'expiresAt')::timestamp < NOW()`)
      .execute();
    const count = result.affected || 0;
    if (count > 0) this.logger.log(`Cleaned up ${count} expired memories`);
    return count;
  }
}
