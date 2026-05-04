import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

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
  private tasks = new Map<string, A2ATask>();
  private bids = new Map<string, A2ABid>();
  private trades = new Map<string, A2ATrade>();
  private bidsByTask = new Map<string, string[]>();

  private genId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  postTask(userId: string, body: {
    title: string;
    description?: string;
    budget_cents: number;
    skill_tags?: string[];
    owner_agent_id?: string;
  }): A2ATask {
    if (!body?.title) throw new BadRequestException('title required');
    if (!body.budget_cents || body.budget_cents <= 0) {
      throw new BadRequestException('budget_cents must be > 0');
    }
    const t: A2ATask = {
      id: this.genId('task'),
      ownerUserId: userId,
      ownerAgentId: body.owner_agent_id,
      title: body.title,
      description: body.description || '',
      budget_cents: body.budget_cents,
      skill_tags: body.skill_tags || [],
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks.set(t.id, t);
    this.bidsByTask.set(t.id, []);
    return t;
  }

  listTasks(filter?: { status?: A2ATaskStatus; tag?: string; owner_user_id?: string }): A2ATask[] {
    let arr = Array.from(this.tasks.values());
    if (filter?.status) arr = arr.filter((t) => t.status === filter.status);
    if (filter?.tag) arr = arr.filter((t) => t.skill_tags.includes(filter.tag!));
    if (filter?.owner_user_id) arr = arr.filter((t) => t.ownerUserId === filter.owner_user_id);
    return arr.sort((a, b) => b.createdAt - a.createdAt);
  }

  getTask(id: string): A2ATask {
    const t = this.tasks.get(id);
    if (!t) throw new NotFoundException('task not found');
    return t;
  }

  bid(userId: string, taskId: string, body: {
    price_cents: number;
    eta_minutes: number;
    note?: string;
    bidder_agent_id?: string;
  }): A2ABid {
    const t = this.getTask(taskId);
    if (t.ownerUserId === userId) throw new BadRequestException('cannot bid on own task');
    if (t.status !== 'open' && t.status !== 'bidding') {
      throw new BadRequestException(`task is ${t.status}, cannot bid`);
    }
    if (!body?.price_cents || body.price_cents <= 0) {
      throw new BadRequestException('price_cents required');
    }
    if (body.price_cents > t.budget_cents) {
      throw new BadRequestException('bid exceeds budget');
    }
    const b: A2ABid = {
      id: this.genId('bid'),
      taskId,
      bidderUserId: userId,
      bidderAgentId: body.bidder_agent_id,
      price_cents: body.price_cents,
      eta_minutes: body.eta_minutes || 0,
      note: body.note,
      status: 'pending',
      createdAt: Date.now(),
    };
    this.bids.set(b.id, b);
    this.bidsByTask.get(taskId)!.push(b.id);
    if (t.status === 'open') {
      t.status = 'bidding';
      t.updatedAt = Date.now();
    }
    return b;
  }

  listBids(taskId: string): A2ABid[] {
    const ids = this.bidsByTask.get(taskId) || [];
    return ids.map((id) => this.bids.get(id)!).sort((a, b) => a.price_cents - b.price_cents);
  }

  acceptBid(userId: string, taskId: string, bidId: string): A2ATrade {
    const t = this.getTask(taskId);
    if (t.ownerUserId !== userId) throw new BadRequestException('only task owner can accept');
    if (t.status !== 'bidding' && t.status !== 'open') {
      throw new BadRequestException(`task is ${t.status}, cannot accept`);
    }
    const b = this.bids.get(bidId);
    if (!b || b.taskId !== taskId) throw new NotFoundException('bid not found');
    b.status = 'accepted';
    // reject other bids
    for (const id of this.bidsByTask.get(taskId) || []) {
      if (id !== bidId) {
        const other = this.bids.get(id);
        if (other && other.status === 'pending') other.status = 'rejected';
      }
    }
    t.status = 'matched';
    t.matched_bid_id = bidId;
    t.updatedAt = Date.now();

    const trade: A2ATrade = {
      id: this.genId('trade'),
      taskId,
      bidId,
      buyer_user_id: t.ownerUserId,
      seller_user_id: b.bidderUserId,
      amount_cents: b.price_cents,
      status: 'in_progress',
      createdAt: Date.now(),
    };
    this.trades.set(trade.id, trade);
    t.status = 'in_progress';
    return trade;
  }

  deliver(userId: string, tradeId: string): A2ATrade {
    const tr = this.trades.get(tradeId);
    if (!tr) throw new NotFoundException('trade not found');
    if (tr.seller_user_id !== userId) throw new BadRequestException('only seller can deliver');
    if (tr.status !== 'in_progress') throw new BadRequestException(`trade is ${tr.status}`);
    tr.status = 'delivered';
    const t = this.tasks.get(tr.taskId);
    if (t) {
      t.status = 'delivered';
      t.updatedAt = Date.now();
    }
    return tr;
  }

  settle(userId: string, tradeId: string): A2ATrade {
    const tr = this.trades.get(tradeId);
    if (!tr) throw new NotFoundException('trade not found');
    if (tr.buyer_user_id !== userId) throw new BadRequestException('only buyer can settle');
    if (tr.status !== 'delivered') throw new BadRequestException(`trade is ${tr.status}, must be delivered`);
    tr.status = 'settled';
    tr.settledAt = Date.now();
    const t = this.tasks.get(tr.taskId);
    if (t) {
      t.status = 'settled';
      t.updatedAt = Date.now();
    }
    return tr;
  }

  listTrades(userId: string): A2ATrade[] {
    return Array.from(this.trades.values())
      .filter((t) => t.buyer_user_id === userId || t.seller_user_id === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  stats(): { total_tasks: number; total_bids: number; total_trades: number; settled_trades: number; gmv_cents: number } {
    let gmv = 0;
    let settled = 0;
    for (const t of this.trades.values()) {
      if (t.status === 'settled') {
        settled++;
        gmv += t.amount_cents;
      }
    }
    return {
      total_tasks: this.tasks.size,
      total_bids: this.bids.size,
      total_trades: this.trades.size,
      settled_trades: settled,
      gmv_cents: gmv,
    };
  }
}
