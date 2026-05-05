import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SkillInvokeEntity } from '../../entities/skill-invoke.entity';
import { SkillListingEntity } from '../../entities/skill-listing.entity';

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
  constructor(
    @InjectRepository(SkillListingEntity)
    private readonly listingRepo: Repository<SkillListingEntity>,
    @InjectRepository(SkillInvokeEntity)
    private readonly invokeRepo: Repository<SkillInvokeEntity>,
  ) {}

  private genId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async createListing(userId: string, body: {
    name: string;
    slug: string;
    description?: string;
    price_cents: number;
    revenue_split_bps?: number;
    category?: SkillListing['category'];
  }): Promise<SkillListing> {
    if (!body?.name || !body.slug) throw new BadRequestException('name + slug required');
    if (!body.price_cents || body.price_cents < 0) throw new BadRequestException('price_cents required');
    const split = body.revenue_split_bps ?? 2000; // default 20% platform
    if (split < 0 || split > 10000) throw new BadRequestException('revenue_split_bps must be 0-10000');

    if (await this.listingRepo.findOne({ where: { slug: body.slug } })) {
      throw new BadRequestException(`slug ${body.slug} already exists`);
    }

    const now = Date.now();

    const sk = this.listingRepo.create({
      id: this.genId('sk'),
      developerUserId: userId,
      name: body.name,
      slug: body.slug,
      description: body.description || '',
      priceCents: body.price_cents,
      revenueSplitBps: split,
      category: body.category || 'other',
      status: 'draft',
      installCount: 0,
      invokeCount: 0,
      totalRevenueCents: 0,
      developerRevenueCents: 0,
      platformRevenueCents: 0,
      createdAtMs: String(now),
      updatedAtMs: String(now),
    });
    const saved = await this.listingRepo.save(sk);
    return this.toListing(saved);
  }

  async submitForReview(userId: string, id: string): Promise<SkillListing> {
    const sk = await this.getListingRow(id);
    if (sk.developerUserId !== userId) throw new BadRequestException('only developer can submit');
    if (sk.status !== 'draft' && sk.status !== 'rejected') {
      throw new BadRequestException(`cannot submit, current status: ${sk.status}`);
    }
    sk.status = 'pending_review';
    sk.updatedAtMs = String(Date.now());
    return this.toListing(await this.listingRepo.save(sk));
  }

  /** Mock review — in prod this would be an admin endpoint with RBAC. */
  async reviewListing(id: string, body: { approve: boolean; note?: string }): Promise<SkillListing> {
    const sk = await this.getListingRow(id);
    if (sk.status !== 'pending_review') throw new BadRequestException('not pending review');
    const now = Date.now();
    sk.status = body.approve ? 'approved' : 'rejected';
    sk.reviewerNote = body.note ?? null;
    sk.reviewedAtMs = String(now);
    sk.updatedAtMs = String(now);
    return this.toListing(await this.listingRepo.save(sk));
  }

  async list(filter?: { status?: SkillStatus; category?: string; developer_user_id?: string }): Promise<SkillListing[]> {
    let arr = (await this.listingRepo.find()).map((row) => this.toListing(row));
    if (filter?.status) arr = arr.filter((s) => s.status === filter.status);
    if (filter?.category) arr = arr.filter((s) => s.category === filter.category);
    if (filter?.developer_user_id) arr = arr.filter((s) => s.developerUserId === filter.developer_user_id);
    return arr.sort((a, b) => b.invoke_count - a.invoke_count);
  }

  async get(id: string): Promise<SkillListing> {
    return this.toListing(await this.getListingRow(id));
  }

  async invoke(userId: string, id: string): Promise<SkillInvoke> {
    const sk = await this.getListingRow(id);
    if (sk.status !== 'approved') throw new BadRequestException(`skill is ${sk.status}, not invokable`);
    const platform = Math.floor((sk.priceCents * sk.revenueSplitBps) / 10000);
    const developer = sk.priceCents - platform;
    const now = Date.now();
    const inv = this.invokeRepo.create({
      id: this.genId('skinv'),
      skillId: id,
      invokerUserId: userId,
      amountCents: sk.priceCents,
      developerShareCents: developer,
      platformShareCents: platform,
      tsMs: String(now),
    });
    const savedInvoke = await this.invokeRepo.save(inv);
    sk.invokeCount += 1;
    sk.totalRevenueCents += sk.priceCents;
    sk.developerRevenueCents += developer;
    sk.platformRevenueCents += platform;
    sk.updatedAtMs = String(now);
    await this.listingRepo.save(sk);
    return this.toInvoke(savedInvoke);
  }

  async install(userId: string, id: string): Promise<SkillListing> {
    const sk = await this.getListingRow(id);
    if (sk.status !== 'approved') throw new BadRequestException(`skill is ${sk.status}, not installable`);
    sk.installCount += 1;
    sk.updatedAtMs = String(Date.now());
    return this.toListing(await this.listingRepo.save(sk));
  }

  async developerEarnings(userId: string): Promise<{
    total_skills: number;
    approved_skills: number;
    total_invokes: number;
    total_revenue_cents: number;
    developer_revenue_cents: number;
    platform_revenue_cents: number;
  }> {
    const mine = (await this.listingRepo.find({ where: { developerUserId: userId } })).map((row) => this.toListing(row));
    return {
      total_skills: mine.length,
      approved_skills: mine.filter((s) => s.status === 'approved').length,
      total_invokes: mine.reduce((acc, s) => acc + s.invoke_count, 0),
      total_revenue_cents: mine.reduce((acc, s) => acc + s.total_revenue_cents, 0),
      developer_revenue_cents: mine.reduce((acc, s) => acc + s.developer_revenue_cents, 0),
      platform_revenue_cents: mine.reduce((acc, s) => acc + s.platform_revenue_cents, 0),
    };
  }

  async recentInvokes(skillId?: string, limit = 50): Promise<SkillInvoke[]> {
    const rows = skillId
      ? await this.invokeRepo.find({ where: { skillId }, order: { tsMs: 'DESC' }, take: limit })
      : await this.invokeRepo.find({ order: { tsMs: 'DESC' }, take: limit });
    return rows.slice(0, limit).map((row) => this.toInvoke(row));
  }

  private async getListingRow(id: string): Promise<SkillListingEntity> {
    const row = await this.listingRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('skill not found');
    return row;
  }

  private toListing(row: SkillListingEntity): SkillListing {
    return {
      id: row.id,
      developerUserId: row.developerUserId,
      name: row.name,
      slug: row.slug,
      description: row.description,
      price_cents: row.priceCents,
      revenue_split_bps: row.revenueSplitBps,
      category: row.category as SkillListing['category'],
      status: row.status as SkillStatus,
      install_count: row.installCount,
      invoke_count: row.invokeCount,
      total_revenue_cents: row.totalRevenueCents,
      developer_revenue_cents: row.developerRevenueCents,
      platform_revenue_cents: row.platformRevenueCents,
      createdAt: Number(row.createdAtMs),
      updatedAt: Number(row.updatedAtMs),
      reviewedAt: row.reviewedAtMs ? Number(row.reviewedAtMs) : undefined,
      reviewer_note: row.reviewerNote ?? undefined,
    };
  }

  private toInvoke(row: SkillInvokeEntity): SkillInvoke {
    return {
      id: row.id,
      skillId: row.skillId,
      invokerUserId: row.invokerUserId,
      amount_cents: row.amountCents,
      developer_share_cents: row.developerShareCents,
      platform_share_cents: row.platformShareCents,
      ts: Number(row.tsMs),
    };
  }
}
