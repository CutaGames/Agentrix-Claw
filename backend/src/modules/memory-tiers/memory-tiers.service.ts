import { Injectable } from '@nestjs/common';

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
  private items = new Map<string, MemoryItem>();

  upsert(userId: string, input: UpsertMemoryInput): MemoryItem {
    const now = Date.now();
    const id =
      input.key && input.tier
        ? `${userId}:${input.tier}:${input.key}`
        : `${userId}:${input.tier}:${now}:${Math.random().toString(36).slice(2, 8)}`;
    const ttl = input.ttl_ms ?? (input.tier === 'working' ? 30 * 60 * 1000 : undefined);
    const item: MemoryItem = {
      id,
      userId,
      tier: input.tier,
      key: input.key,
      text: input.text,
      tags: input.tags ?? [],
      agent_id: input.agent_id,
      ts: now,
      expires_at: ttl ? now + ttl : undefined,
      metadata: input.metadata,
    };
    this.items.set(id, item);
    return item;
  }

  list(userId: string, tier: MemoryTier, opts?: { limit?: number; tag?: string; agent_id?: string }) {
    this.gc();
    const arr: MemoryItem[] = [];
    for (const m of this.items.values()) {
      if (m.userId !== userId || m.tier !== tier) continue;
      if (opts?.tag && !m.tags.includes(opts.tag)) continue;
      if (opts?.agent_id && m.agent_id !== opts.agent_id) continue;
      arr.push(m);
    }
    arr.sort((a, b) => b.ts - a.ts);
    return arr.slice(0, opts?.limit ?? 50).map((m) => this.toDto(m));
  }

  get(userId: string, id: string) {
    this.gc();
    const m = this.items.get(id);
    if (!m || m.userId !== userId) return null;
    return this.toDto(m);
  }

  delete(userId: string, id: string) {
    const m = this.items.get(id);
    if (!m || m.userId !== userId) return { deleted: false };
    this.items.delete(id);
    return { deleted: true };
  }

  /** 简易语义搜索 — substring 匹配；P3 替换为 pgvector */
  search(userId: string, q: string, opts?: { tier?: MemoryTier; limit?: number }) {
    this.gc();
    const ql = q.toLowerCase();
    const out: MemoryItem[] = [];
    for (const m of this.items.values()) {
      if (m.userId !== userId) continue;
      if (opts?.tier && m.tier !== opts.tier) continue;
      if (m.text.toLowerCase().includes(ql) || m.tags.some((t) => t.toLowerCase().includes(ql))) {
        out.push(m);
      }
    }
    out.sort((a, b) => b.ts - a.ts);
    return out.slice(0, opts?.limit ?? 20).map((m) => this.toDto(m));
  }

  stats(userId: string) {
    this.gc();
    const counts: Record<MemoryTier, number> = { working: 0, episodic: 0, semantic: 0, procedural: 0 };
    for (const m of this.items.values()) {
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

  private gc() {
    const now = Date.now();
    for (const [id, m] of this.items) {
      if (m.expires_at && m.expires_at < now) this.items.delete(id);
    }
  }
}
