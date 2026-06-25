import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoEarnEventEntity } from '../../entities/auto-earn-event.entity';

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
  constructor(
    @InjectRepository(AutoEarnEventEntity)
    private readonly earnRepo: Repository<AutoEarnEventEntity>,
  ) {}

  async record(userId: string, body: {
    source: EarnSource;
    amount_cents: number;
    ref_id?: string;
    note?: string;
  }): Promise<EarnEvent> {
    const entity = this.earnRepo.create({
      externalId: `earn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      source: body.source,
      amountCents: body.amount_cents,
      refId: body.ref_id ?? null,
      note: body.note ?? null,
      eventTsMs: String(Date.now()),
    });
    const saved = await this.earnRepo.save(entity);
    return this.toEarnEvent(saved);
  }

  async timeline(userId: string, opts?: { source?: EarnSource; limit?: number }): Promise<EarnEvent[]> {
    const where: Record<string, unknown> = { userId };
    if (opts?.source) where.source = opts.source;

    const rows = await this.earnRepo.find({
      where,
      order: { eventTsMs: 'DESC' },
      take: opts?.limit ?? 100,
    });
    return rows.map((row) => this.toEarnEvent(row));
  }

  async summary(userId: string): Promise<{
    total_cents: number;
    by_source: Record<string, number>;
    last_24h_cents: number;
    last_30d_cents: number;
    estimated_mrr_cents: number;
  }> {
    const mine = await this.earnRepo.find({ where: { userId } });
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let total = 0;
    let last24 = 0;
    let last30d = 0;
    const by: Record<string, number> = {};
    for (const row of mine) {
      const event = this.toEarnEvent(row);
      total += event.amount_cents;
      by[event.source] = (by[event.source] || 0) + event.amount_cents;
      if (now - event.ts <= day) last24 += event.amount_cents;
      if (now - event.ts <= 30 * day) last30d += event.amount_cents;
    }
    return {
      total_cents: total,
      by_source: by,
      last_24h_cents: last24,
      last_30d_cents: last30d,
      estimated_mrr_cents: last30d, // last 30d as MRR proxy
    };
  }

  private toEarnEvent(row: AutoEarnEventEntity): EarnEvent {
    return {
      id: row.externalId,
      userId: row.userId,
      source: row.source as EarnSource,
      amount_cents: row.amountCents,
      ref_id: row.refId ?? undefined,
      note: row.note ?? undefined,
      ts: Number(row.eventTsMs),
    };
  }
}
