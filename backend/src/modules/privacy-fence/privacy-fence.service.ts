import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PrivacyFenceAuditEntity } from '../../entities/privacy-fence-audit.entity';
import { PrivacyFenceGrantEntity } from '../../entities/privacy-fence-grant.entity';
import { PrivacyFenceItemEntity } from '../../entities/privacy-fence-item.entity';

/**
 * 顿领 §13 隐私围栏 (P3-7 part 1)
 * 4 类敏感记忆: financial / health / relationship / location
 * In-memory MVP.
 */

export type SensitiveCategory = 'financial' | 'health' | 'relationship' | 'location';

export interface FenceItem {
  id: string;
  userId: string;
  category: SensitiveCategory;
  text: string;
  visible_to_roles: string[]; // family roles allowed
  family_partition?: string; // optional: family-scoped
  ts: number;
}

export interface AccessGrant {
  id: string;
  itemId: string;
  granteeUserId: string;
  grantedByUserId: string;
  expiresAt: number;
  grantedAt: number;
}

@Injectable()
export class PrivacyFenceService {
  constructor(
    @InjectRepository(PrivacyFenceItemEntity)
    private readonly itemRepo: Repository<PrivacyFenceItemEntity>,
    @InjectRepository(PrivacyFenceGrantEntity)
    private readonly grantRepo: Repository<PrivacyFenceGrantEntity>,
    @InjectRepository(PrivacyFenceAuditEntity)
    private readonly auditRepo: Repository<PrivacyFenceAuditEntity>,
  ) {}

  private genId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private async log(entry: {
    ts: number;
    actor: string;
    action: 'read_blocked' | 'read_granted' | 'write' | 'grant' | 'revoke';
    item_id?: string;
    target?: string;
    category?: SensitiveCategory;
  }) {
    await this.auditRepo.save(
      this.auditRepo.create({
        id: this.genId('audit'),
        tsMs: String(entry.ts),
        actor: entry.actor,
        action: entry.action,
        itemId: entry.item_id ?? null,
        target: entry.target ?? null,
        category: entry.category ?? null,
      }),
    );
  }

  async write(userId: string, body: {
    category: SensitiveCategory;
    text: string;
    visible_to_roles?: string[];
    family_partition?: string;
  }): Promise<FenceItem> {
    if (!body?.category || !body.text) throw new BadRequestException('category + text required');
    const allowed: SensitiveCategory[] = ['financial', 'health', 'relationship', 'location'];
    if (!allowed.includes(body.category)) throw new BadRequestException('invalid category');
    const item = this.itemRepo.create({
      id: this.genId('fitem'),
      userId,
      category: body.category,
      text: body.text,
      visibleToRoles: body.visible_to_roles || ['owner'],
      familyPartition: body.family_partition ?? null,
      tsMs: String(Date.now()),
    });
    const saved = await this.itemRepo.save(item);
    await this.log({ ts: Date.now(), actor: userId, action: 'write', item_id: saved.id, category: body.category });
    return this.toItem(saved);
  }

  async read(userId: string, itemId: string): Promise<FenceItem> {
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('item not found');
    if (item.userId === userId) {
      await this.log({ ts: Date.now(), actor: userId, action: 'read_granted', item_id: itemId, category: item.category as SensitiveCategory });
      return this.toItem(item);
    }
    const grant = (await this.grantRepo.find({ where: { itemId, granteeUserId: userId } }))
      .find((entry) => Number(entry.expiresAtMs) > Date.now());
    if (!grant) {
      await this.log({ ts: Date.now(), actor: userId, action: 'read_blocked', item_id: itemId, category: item.category as SensitiveCategory });
      throw new BadRequestException('access denied: privacy fence');
    }
    await this.log({ ts: Date.now(), actor: userId, action: 'read_granted', item_id: itemId, category: item.category as SensitiveCategory });
    return this.toItem(item);
  }

  async list(userId: string, filter?: { category?: SensitiveCategory; family_partition?: string }): Promise<FenceItem[]> {
    let arr = (await this.itemRepo.find({ where: { userId } })).map((item) => this.toItem(item));
    if (filter?.category) arr = arr.filter((i) => i.category === filter.category);
    if (filter?.family_partition) arr = arr.filter((i) => i.family_partition === filter.family_partition);
    return arr.sort((left, right) => right.ts - left.ts);
  }

  async grant(userId: string, body: { item_id: string; grantee_user_id: string; ttl_ms?: number }): Promise<AccessGrant> {
    const item = await this.itemRepo.findOne({ where: { id: body.item_id } });
    if (!item) throw new NotFoundException('item not found');
    if (item.userId !== userId) throw new BadRequestException('only owner can grant access');
    const now = Date.now();
    const g = this.grantRepo.create({
      id: this.genId('grant'),
      itemId: body.item_id,
      granteeUserId: body.grantee_user_id,
      grantedByUserId: userId,
      expiresAtMs: String(now + (body.ttl_ms || 60 * 60 * 1000)),
      grantedAtMs: String(now),
    });
    const saved = await this.grantRepo.save(g);
    await this.log({ ts: Date.now(), actor: userId, action: 'grant', item_id: body.item_id, target: body.grantee_user_id });
    return this.toGrant(saved);
  }

  async revokeGrant(userId: string, grantId: string): Promise<{ ok: boolean }> {
    const g = await this.grantRepo.findOne({ where: { id: grantId } });
    if (!g) throw new NotFoundException('grant not found');
    if (g.grantedByUserId !== userId) throw new BadRequestException('only grantor can revoke');
    g.expiresAtMs = '0';
    await this.grantRepo.save(g);
    await this.log({ ts: Date.now(), actor: userId, action: 'revoke', item_id: g.itemId, target: g.granteeUserId });
    return { ok: true };
  }

  async recentAudit(limit = 50) {
    return (await this.auditRepo.find({ order: { tsMs: 'DESC' }, take: limit }))
      .map((entry) => ({
        ts: Number(entry.tsMs),
        actor: entry.actor,
        action: entry.action as 'read_blocked' | 'read_granted' | 'write' | 'grant' | 'revoke',
        item_id: entry.itemId ?? undefined,
        target: entry.target ?? undefined,
        category: entry.category as SensitiveCategory | undefined,
      }))
      .slice(0, limit);
  }

  private toItem(row: PrivacyFenceItemEntity): FenceItem {
    return {
      id: row.id,
      userId: row.userId,
      category: row.category as SensitiveCategory,
      text: row.text,
      visible_to_roles: row.visibleToRoles ?? [],
      family_partition: row.familyPartition ?? undefined,
      ts: Number(row.tsMs),
    };
  }

  private toGrant(row: PrivacyFenceGrantEntity): AccessGrant {
    return {
      id: row.id,
      itemId: row.itemId,
      granteeUserId: row.granteeUserId,
      grantedByUserId: row.grantedByUserId,
      expiresAt: Number(row.expiresAtMs),
      grantedAt: Number(row.grantedAtMs),
    };
  }
}
