import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemoryItemEntity } from '../../entities/memory-item.entity';

/**
 * 顿领 §5.5 4 层记忆 API 标准化
 *
 *   working    会话即时上下文（本机/RAM，过期 30 min）
 *   episodic   时间线事件（"今天和 Aira 聊了什么"）
 *   semantic   抽象语义（关系图谱、偏好画像）
 *   procedural 操作技能（如何用某 skill / workflow）
 *
 * 当前实现：进程内 in-memory，足够 P1 端到端 demo。
 * P2-P3 阶段会替换为 PostgreSQL/JSONB + pgvector + 隐私围栏 (P3-7)。
 */
export type MemoryTier = 'working' | 'episodic' | 'semantic' | 'procedural';

export interface MemoryItem {
  id: string;
  userId: string;
  tier: MemoryTier;
  key?: string;
  text: string;
  tags: string[];
  agent_id?: string;
  ts: number;
  expires_at?: number;
  metadata?: Record<string, unknown>;
}

export interface UpsertMemoryInput {
  tier: MemoryTier;
  text: string;
  key?: string;
  tags?: string[];
  agent_id?: string;
  ttl_ms?: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class MemoryTiersService {
  constructor(
    @InjectRepository(MemoryItemEntity)
    private readonly memoryRepo: Repository<MemoryItemEntity>,
  ) {}

  async upsert(userId: string, input: UpsertMemoryInput): Promise<MemoryItem> {
    const now = Date.now();
    const id =
      input.key && input.tier
        ? `${userId}:${input.tier}:${input.key}`
        : `${userId}:${input.tier}:${now}:${Math.random().toString(36).slice(2, 8)}`;
    const ttl = input.ttl_ms ?? (input.tier === 'working' ? 30 * 60 * 1000 : undefined);

    const row = this.memoryRepo.create({
      id,
      userId,
      tier: input.tier,
      memoryKey: input.key ?? null,
      text: input.text,
      tags: input.tags ?? [],
      agentId: input.agent_id ?? null,
      tsMs: String(now),
      expiresAtMs: ttl ? String(now + ttl) : null,
      metadata: input.metadata ?? null,
    });
    const saved = await this.memoryRepo.save(row);
    return this.toMemoryItem(saved);
  }

  async list(userId: string, tier: MemoryTier, opts?: { limit?: number; tag?: string; agent_id?: string }) {
    await this.gc(userId);
    let arr = (await this.memoryRepo.find({
      where: { userId, tier },
      order: { tsMs: 'DESC' },
      take: opts?.limit ?? 50,
    })).map((row) => this.toMemoryItem(row));

    if (opts?.tag) arr = arr.filter((m) => m.tags.includes(opts.tag!));
    if (opts?.agent_id) arr = arr.filter((m) => m.agent_id === opts.agent_id);
    arr.sort((a, b) => b.ts - a.ts);
    return arr.slice(0, opts?.limit ?? 50).map((m) => this.toDto(m));
  }

  async get(userId: string, id: string) {
    await this.gc(userId);
    const row = await this.memoryRepo.findOne({ where: { id, userId } });
    if (!row) return null;
    return this.toDto(this.toMemoryItem(row));
  }

  async delete(userId: string, id: string) {
    const row = await this.memoryRepo.findOne({ where: { id, userId } });
    if (!row) return { deleted: false };
    await this.memoryRepo.delete(id);
    return { deleted: true };
  }

  /** 简易语义搜索 — substring 匹配；P3 替换为 pgvector */
  async search(userId: string, q: string, opts?: { tier?: MemoryTier; limit?: number }) {
    await this.gc(userId);
    const ql = q.toLowerCase();
    const rows = await this.memoryRepo.find({ where: { userId } });
    let out = rows.map((row) => this.toMemoryItem(row));
    if (opts?.tier) out = out.filter((m) => m.tier === opts.tier);
    out = out.filter((m) => m.text.toLowerCase().includes(ql) || m.tags.some((t) => t.toLowerCase().includes(ql)));
    out.sort((a, b) => b.ts - a.ts);
    return out.slice(0, opts?.limit ?? 20).map((m) => this.toDto(m));
  }

  async stats(userId: string) {
    await this.gc(userId);
    const counts: Record<MemoryTier, number> = { working: 0, episodic: 0, semantic: 0, procedural: 0 };
    for (const m of (await this.memoryRepo.find({ where: { userId } })).map((row) => this.toMemoryItem(row))) {
      if (m.userId === userId) counts[m.tier] += 1;
    }
    return counts;
  }

  private toDto(m: MemoryItem) {
    return {
      memory_id: m.id,
      tier: m.tier,
      key: m.key || null,
      text: m.text,
      tags: m.tags,
      agent_id: m.agent_id || null,
      ts: m.ts,
      expires_at: m.expires_at || null,
      metadata: m.metadata || {},
    };
  }

  private toMemoryItem(row: MemoryItemEntity): MemoryItem {
    return {
      id: row.id,
      userId: row.userId,
      tier: row.tier as MemoryTier,
      key: row.memoryKey ?? undefined,
      text: row.text,
      tags: row.tags ?? [],
      agent_id: row.agentId ?? undefined,
      ts: Number(row.tsMs),
      expires_at: row.expiresAtMs ? Number(row.expiresAtMs) : undefined,
      metadata: row.metadata ?? undefined,
    };
  }

  private async gc(userId: string) {
    const rows = await this.memoryRepo.find({ where: { userId } });
    const now = Date.now();
    const expiredIds = rows
      .filter((row) => row.expiresAtMs && Number(row.expiresAtMs) < now)
      .map((row) => row.id);
    if (expiredIds.length > 0) {
      await this.memoryRepo.delete(expiredIds);
    }
  }
}
