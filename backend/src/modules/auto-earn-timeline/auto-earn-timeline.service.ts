import { Injectable } from '@nestjs/common';

/**
 * 顿领 §9.4 Auto-Earn 仪表盘 + A2A 时间线 (P2-2 backend)
 * In-memory MVP — aggregates earnings events.
 */

export type EarnSource = 'skill_invoke' | 'a2a_trade' | 'auto_pay' | 'staking' | 'commission';

export interface EarnEvent {
  id: string;
  userId: string;
  source: EarnSource;
  amount_cents: number;
  ref_id?: string; // skill id / trade id / etc
  note?: string;
  ts: number;
}

@Injectable()
export class AutoEarnTimelineService {
  private events: EarnEvent[] = [];

  record(userId: string, body: {
    source: EarnSource;
    amount_cents: number;
    ref_id?: string;
    note?: string;
  }): EarnEvent {
    const e: EarnEvent = {
      id: `earn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      source: body.source,
      amount_cents: body.amount_cents,
      ref_id: body.ref_id,
      note: body.note,
      ts: Date.now(),
    };
    this.events.push(e);
    if (this.events.length > 10000) this.events.shift();
    return e;
  }

  timeline(userId: string, opts?: { source?: EarnSource; limit?: number }): EarnEvent[] {
    let arr = this.events.filter((e) => e.userId === userId);
    if (opts?.source) arr = arr.filter((e) => e.source === opts.source);
    arr = arr.slice().reverse();
    return arr.slice(0, opts?.limit ?? 100);
  }

  summary(userId: string): {
    total_cents: number;
    by_source: Record<string, number>;
    last_24h_cents: number;
    last_30d_cents: number;
    estimated_mrr_cents: number;
  } {
    const mine = this.events.filter((e) => e.userId === userId);
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let total = 0;
    let last24 = 0;
    let last30d = 0;
    const by: Record<string, number> = {};
    for (const e of mine) {
      total += e.amount_cents;
      by[e.source] = (by[e.source] || 0) + e.amount_cents;
      if (now - e.ts <= day) last24 += e.amount_cents;
      if (now - e.ts <= 30 * day) last30d += e.amount_cents;
    }
    return {
      total_cents: total,
      by_source: by,
      last_24h_cents: last24,
      last_30d_cents: last30d,
      estimated_mrr_cents: last30d, // last 30d as MRR proxy
    };
  }
}
