import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { A2ABidEntity } from '../../entities/a2a-bid.entity';
import { A2AMatchTaskEntity } from '../../entities/a2a-match-task.entity';
import { A2ATradeEntity } from '../../entities/a2a-trade.entity';

/**
 * 顿领 §10 A2A 跨用户撮合（P2-8 第一部分）
 * In-memory MVP — production 版应 schema 化 + ledger.
 */

export type A2ATaskStatus =
  | 'open'
  | 'bidding'
  | 'matched'
  | 'in_progress'
  | 'delivered'
  | 'settled'
  | 'cancelled';

export interface A2ATask {
  id: string;
  ownerUserId: string;
  ownerAgentId?: string;
  title: string;
  description: string;
  budget_cents: number;
  skill_tags: string[];
  status: A2ATaskStatus;
  matched_bid_id?: string;
  createdAt: number;
  updatedAt: number;
}

export interface A2ABid {
  id: string;
  taskId: string;
  bidderUserId: string;
  bidderAgentId?: string;
  price_cents: number;
  eta_minutes: number;
  note?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

export interface A2ATrade {
  id: string;
  taskId: string;
  bidId: string;
  buyer_user_id: string;
  seller_user_id: string;
  amount_cents: number;
  status: 'in_progress' | 'delivered' | 'settled';
  createdAt: number;
  settledAt?: number;
}

@Injectable()
export class A2AMatchingService {
  constructor(
    @InjectRepository(A2AMatchTaskEntity)
    private readonly taskRepo: Repository<A2AMatchTaskEntity>,
    @InjectRepository(A2ABidEntity)
    private readonly bidRepo: Repository<A2ABidEntity>,
    @InjectRepository(A2ATradeEntity)
    private readonly tradeRepo: Repository<A2ATradeEntity>,
  ) {}

  private genId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async postTask(userId: string, body: {
    title: string;
    description?: string;
    budget_cents: number;
    skill_tags?: string[];
    owner_agent_id?: string;
  }): Promise<A2ATask> {
    if (!body?.title) throw new BadRequestException('title required');
    if (!body.budget_cents || body.budget_cents <= 0) {
      throw new BadRequestException('budget_cents must be > 0');
    }
    const now = Date.now();
    const t = this.taskRepo.create({
      id: this.genId('task'),
      ownerUserId: userId,
      ownerAgentId: body.owner_agent_id ?? null,
      title: body.title,
      description: body.description || '',
      budgetCents: body.budget_cents,
      skillTags: body.skill_tags || [],
      status: 'open',
      matchedBidId: null,
      createdAtMs: String(now),
      updatedAtMs: String(now),
    });
    const saved = await this.taskRepo.save(t);
    return this.toTask(saved);
  }

  async listTasks(filter?: { status?: A2ATaskStatus; tag?: string; owner_user_id?: string }): Promise<A2ATask[]> {
    let arr = (await this.taskRepo.find()).map((row) => this.toTask(row));
    if (filter?.status) arr = arr.filter((t) => t.status === filter.status);
    if (filter?.tag) arr = arr.filter((t) => t.skill_tags.includes(filter.tag!));
    if (filter?.owner_user_id) arr = arr.filter((t) => t.ownerUserId === filter.owner_user_id);
    return arr.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getTask(id: string): Promise<A2ATask> {
    return this.toTask(await this.getTaskRow(id));
  }

  async bid(userId: string, taskId: string, body: {
    price_cents: number;
    eta_minutes: number;
    note?: string;
    bidder_agent_id?: string;
  }): Promise<A2ABid> {
    const t = await this.getTaskRow(taskId);
    if (t.ownerUserId === userId) throw new BadRequestException('cannot bid on own task');
    if (t.status !== 'open' && t.status !== 'bidding') {
      throw new BadRequestException(`task is ${t.status}, cannot bid`);
    }
    if (!body?.price_cents || body.price_cents <= 0) {
      throw new BadRequestException('price_cents required');
    }
    if (body.price_cents > t.budgetCents) {
      throw new BadRequestException('bid exceeds budget');
    }
    const b = this.bidRepo.create({
      id: this.genId('bid'),
      taskId,
      bidderUserId: userId,
      bidderAgentId: body.bidder_agent_id ?? null,
      priceCents: body.price_cents,
      etaMinutes: body.eta_minutes || 0,
      note: body.note ?? null,
      status: 'pending',
      createdAtMs: String(Date.now()),
    });
    const saved = await this.bidRepo.save(b);
    if (t.status === 'open') {
      t.status = 'bidding';
      t.updatedAtMs = String(Date.now());
      await this.taskRepo.save(t);
    }
    return this.toBid(saved);
  }

  async listBids(taskId: string): Promise<A2ABid[]> {
    return (await this.bidRepo.find({ where: { taskId } }))
      .map((row) => this.toBid(row))
      .sort((a, b) => a.price_cents - b.price_cents);
  }

  async acceptBid(userId: string, taskId: string, bidId: string): Promise<A2ATrade> {
    const t = await this.getTaskRow(taskId);
    if (t.ownerUserId !== userId) throw new BadRequestException('only task owner can accept');
    if (t.status !== 'bidding' && t.status !== 'open') {
      throw new BadRequestException(`task is ${t.status}, cannot accept`);
    }
    const b = await this.bidRepo.findOne({ where: { id: bidId } });
    if (!b || b.taskId !== taskId) throw new NotFoundException('bid not found');
    b.status = 'accepted';
    await this.bidRepo.save(b);

    // reject other bids
    for (const other of await this.bidRepo.find({ where: { taskId } })) {
      if (other.id !== bidId) {
        if (other && other.status === 'pending') other.status = 'rejected';
        await this.bidRepo.save(other);
      }
    }

    const now = Date.now();
    t.status = 'in_progress';
    t.matchedBidId = bidId;
    t.updatedAtMs = String(now);
    await this.taskRepo.save(t);

    const trade = this.tradeRepo.create({
      id: this.genId('trade'),
      taskId,
      bidId,
      buyerUserId: t.ownerUserId,
      sellerUserId: b.bidderUserId,
      amountCents: b.priceCents,
      status: 'in_progress',
      createdAtMs: String(now),
      settledAtMs: null,
    });
    const savedTrade = await this.tradeRepo.save(trade);
    return this.toTrade(savedTrade);
  }

  async deliver(userId: string, tradeId: string): Promise<A2ATrade> {
    const tr = await this.getTradeRow(tradeId);
    if (tr.sellerUserId !== userId) throw new BadRequestException('only seller can deliver');
    if (tr.status !== 'in_progress') throw new BadRequestException(`trade is ${tr.status}`);
    tr.status = 'delivered';
    await this.tradeRepo.save(tr);

    const t = await this.taskRepo.findOne({ where: { id: tr.taskId } });
    if (t) {
      t.status = 'delivered';
      t.updatedAtMs = String(Date.now());
      await this.taskRepo.save(t);
    }
    return this.toTrade(tr);
  }

  async settle(userId: string, tradeId: string): Promise<A2ATrade> {
    const tr = await this.getTradeRow(tradeId);
    if (tr.buyerUserId !== userId) throw new BadRequestException('only buyer can settle');
    if (tr.status !== 'delivered') throw new BadRequestException(`trade is ${tr.status}, must be delivered`);
    const now = Date.now();
    tr.status = 'settled';
    tr.settledAtMs = String(now);
    await this.tradeRepo.save(tr);

    const t = await this.taskRepo.findOne({ where: { id: tr.taskId } });
    if (t) {
      t.status = 'settled';
      t.updatedAtMs = String(now);
      await this.taskRepo.save(t);
    }
    return this.toTrade(tr);
  }

  async listTrades(userId: string): Promise<A2ATrade[]> {
    return (await this.tradeRepo.find({ order: { createdAtMs: 'DESC' } }))
      .map((row) => this.toTrade(row))
      .filter((t) => t.buyer_user_id === userId || t.seller_user_id === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async stats(): Promise<{ total_tasks: number; total_bids: number; total_trades: number; settled_trades: number; gmv_cents: number }> {
    const [tasks, bids, trades] = await Promise.all([
      this.taskRepo.find(),
      this.bidRepo.find(),
      this.tradeRepo.find(),
    ]);
    let gmv = 0;
    let settled = 0;
    for (const t of trades.map((row) => this.toTrade(row))) {
      if (t.status === 'settled') {
        settled++;
        gmv += t.amount_cents;
      }
    }
    return {
      total_tasks: tasks.length,
      total_bids: bids.length,
      total_trades: trades.length,
      settled_trades: settled,
      gmv_cents: gmv,
    };
  }

  private async getTaskRow(id: string): Promise<A2AMatchTaskEntity> {
    const row = await this.taskRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('task not found');
    return row;
  }

  private async getTradeRow(id: string): Promise<A2ATradeEntity> {
    const row = await this.tradeRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('trade not found');
    return row;
  }

  private toTask(row: A2AMatchTaskEntity): A2ATask {
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      ownerAgentId: row.ownerAgentId ?? undefined,
      title: row.title,
      description: row.description,
      budget_cents: row.budgetCents,
      skill_tags: row.skillTags ?? [],
      status: row.status as A2ATaskStatus,
      matched_bid_id: row.matchedBidId ?? undefined,
      createdAt: Number(row.createdAtMs),
      updatedAt: Number(row.updatedAtMs),
    };
  }

  private toBid(row: A2ABidEntity): A2ABid {
    return {
      id: row.id,
      taskId: row.taskId,
      bidderUserId: row.bidderUserId,
      bidderAgentId: row.bidderAgentId ?? undefined,
      price_cents: row.priceCents,
      eta_minutes: row.etaMinutes,
      note: row.note ?? undefined,
      status: row.status as A2ABid['status'],
      createdAt: Number(row.createdAtMs),
    };
  }

  private toTrade(row: A2ATradeEntity): A2ATrade {
    return {
      id: row.id,
      taskId: row.taskId,
      bidId: row.bidId,
      buyer_user_id: row.buyerUserId,
      seller_user_id: row.sellerUserId,
      amount_cents: row.amountCents,
      status: row.status as A2ATrade['status'],
      createdAt: Number(row.createdAtMs),
      settledAt: row.settledAtMs ? Number(row.settledAtMs) : undefined,
    };
  }
}
