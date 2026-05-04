import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

/**
 * 顿领 §11 Skill Marketplace + 开发者后台 (P2-6)
 * In-memory MVP.
 */

export type SkillStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'unlisted';

export interface SkillListing {
  id: string;
  developerUserId: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number; // per-invocation
  revenue_split_bps: number; // platform cut, e.g. 2000 = 20%
  category: 'productivity' | 'finance' | 'social' | 'devops' | 'wellness' | 'other';
  status: SkillStatus;
  install_count: number;
  invoke_count: number;
  total_revenue_cents: number;
  developer_revenue_cents: number;
  platform_revenue_cents: number;
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number;
  reviewer_note?: string;
}

export interface SkillInvoke {
  id: string;
  skillId: string;
  invokerUserId: string;
  amount_cents: number;
  developer_share_cents: number;
  platform_share_cents: number;
  ts: number;
}

@Injectable()
export class SkillListingsService {
  private skills = new Map<string, SkillListing>();
  private invokes: SkillInvoke[] = [];

  private genId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  createListing(userId: string, body: {
    name: string;
    slug: string;
    description?: string;
    price_cents: number;
    revenue_split_bps?: number;
    category?: SkillListing['category'];
  }): SkillListing {
    if (!body?.name || !body.slug) throw new BadRequestException('name + slug required');
    if (!body.price_cents || body.price_cents < 0) throw new BadRequestException('price_cents required');
    const split = body.revenue_split_bps ?? 2000; // default 20% platform
    if (split < 0 || split > 10000) throw new BadRequestException('revenue_split_bps must be 0-10000');

    if (Array.from(this.skills.values()).some((s) => s.slug === body.slug)) {
      throw new BadRequestException(`slug ${body.slug} already exists`);
    }

    const sk: SkillListing = {
      id: this.genId('sk'),
      developerUserId: userId,
      name: body.name,
      slug: body.slug,
      description: body.description || '',
      price_cents: body.price_cents,
      revenue_split_bps: split,
      category: body.category || 'other',
      status: 'draft',
      install_count: 0,
      invoke_count: 0,
      total_revenue_cents: 0,
      developer_revenue_cents: 0,
      platform_revenue_cents: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.skills.set(sk.id, sk);
    return sk;
  }

  submitForReview(userId: string, id: string): SkillListing {
    const sk = this.get(id);
    if (sk.developerUserId !== userId) throw new BadRequestException('only developer can submit');
    if (sk.status !== 'draft' && sk.status !== 'rejected') {
      throw new BadRequestException(`cannot submit, current status: ${sk.status}`);
    }
    sk.status = 'pending_review';
    sk.updatedAt = Date.now();
    return sk;
  }

  /** Mock review — in prod this would be an admin endpoint with RBAC. */
  reviewListing(id: string, body: { approve: boolean; note?: string }): SkillListing {
    const sk = this.get(id);
    if (sk.status !== 'pending_review') throw new BadRequestException('not pending review');
    sk.status = body.approve ? 'approved' : 'rejected';
    sk.reviewer_note = body.note;
    sk.reviewedAt = Date.now();
    sk.updatedAt = Date.now();
    return sk;
  }

  list(filter?: { status?: SkillStatus; category?: string; developer_user_id?: string }): SkillListing[] {
    let arr = Array.from(this.skills.values());
    if (filter?.status) arr = arr.filter((s) => s.status === filter.status);
    if (filter?.category) arr = arr.filter((s) => s.category === filter.category);
    if (filter?.developer_user_id) arr = arr.filter((s) => s.developerUserId === filter.developer_user_id);
    return arr.sort((a, b) => b.invoke_count - a.invoke_count);
  }

  get(id: string): SkillListing {
    const s = this.skills.get(id);
    if (!s) throw new NotFoundException('skill not found');
    return s;
  }

  invoke(userId: string, id: string): SkillInvoke {
    const sk = this.get(id);
    if (sk.status !== 'approved') throw new BadRequestException(`skill is ${sk.status}, not invokable`);
    const platform = Math.floor((sk.price_cents * sk.revenue_split_bps) / 10000);
    const developer = sk.price_cents - platform;
    const inv: SkillInvoke = {
      id: this.genId('skinv'),
      skillId: id,
      invokerUserId: userId,
      amount_cents: sk.price_cents,
      developer_share_cents: developer,
      platform_share_cents: platform,
      ts: Date.now(),
    };
    this.invokes.push(inv);
    if (this.invokes.length > 5000) this.invokes.shift();
    sk.invoke_count += 1;
    sk.total_revenue_cents += sk.price_cents;
    sk.developer_revenue_cents += developer;
    sk.platform_revenue_cents += platform;
    sk.updatedAt = Date.now();
    return inv;
  }

  install(userId: string, id: string): SkillListing {
    const sk = this.get(id);
    if (sk.status !== 'approved') throw new BadRequestException(`skill is ${sk.status}, not installable`);
    sk.install_count += 1;
    sk.updatedAt = Date.now();
    return sk;
  }

  developerEarnings(userId: string): {
    total_skills: number;
    approved_skills: number;
    total_invokes: number;
    total_revenue_cents: number;
    developer_revenue_cents: number;
    platform_revenue_cents: number;
  } {
    const mine = Array.from(this.skills.values()).filter((s) => s.developerUserId === userId);
    return {
      total_skills: mine.length,
      approved_skills: mine.filter((s) => s.status === 'approved').length,
      total_invokes: mine.reduce((acc, s) => acc + s.invoke_count, 0),
      total_revenue_cents: mine.reduce((acc, s) => acc + s.total_revenue_cents, 0),
      developer_revenue_cents: mine.reduce((acc, s) => acc + s.developer_revenue_cents, 0),
      platform_revenue_cents: mine.reduce((acc, s) => acc + s.platform_revenue_cents, 0),
    };
  }

  recentInvokes(skillId?: string, limit = 50): SkillInvoke[] {
    let arr = this.invokes.slice().reverse();
    if (skillId) arr = arr.filter((i) => i.skillId === skillId);
    return arr.slice(0, limit);
  }
}
