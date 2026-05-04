import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

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
  private items: FenceItem[] = [];
  private grants: AccessGrant[] = [];
  private auditLog: Array<{
    ts: number;
    actor: string;
    action: 'read_blocked' | 'read_granted' | 'write' | 'grant' | 'revoke';
    item_id?: string;
    target?: string;
    category?: SensitiveCategory;
  }> = [];

  private genId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private log(entry: typeof this.auditLog[number]) {
    this.auditLog.push(entry);
    if (this.auditLog.length > 2000) this.auditLog.shift();
  }

  write(userId: string, body: {
    category: SensitiveCategory;
    text: string;
    visible_to_roles?: string[];
    family_partition?: string;
  }): FenceItem {
    if (!body?.category || !body.text) throw new BadRequestException('category + text required');
    const allowed: SensitiveCategory[] = ['financial', 'health', 'relationship', 'location'];
    if (!allowed.includes(body.category)) throw new BadRequestException('invalid category');
    const item: FenceItem = {
      id: this.genId('fitem'),
      userId,
      category: body.category,
      text: body.text,
      visible_to_roles: body.visible_to_roles || ['owner'],
      family_partition: body.family_partition,
      ts: Date.now(),
    };
    this.items.push(item);
    this.log({ ts: Date.now(), actor: userId, action: 'write', item_id: item.id, category: body.category });
    return item;
  }

  read(userId: string, itemId: string): FenceItem {
    const item = this.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('item not found');
    if (item.userId === userId) {
      this.log({ ts: Date.now(), actor: userId, action: 'read_granted', item_id: itemId, category: item.category });
      return item;
    }
    const grant = this.grants.find(
      (g) => g.itemId === itemId && g.granteeUserId === userId && g.expiresAt > Date.now(),
    );
    if (!grant) {
      this.log({ ts: Date.now(), actor: userId, action: 'read_blocked', item_id: itemId, category: item.category });
      throw new BadRequestException('access denied: privacy fence');
    }
    this.log({ ts: Date.now(), actor: userId, action: 'read_granted', item_id: itemId, category: item.category });
    return item;
  }

  list(userId: string, filter?: { category?: SensitiveCategory; family_partition?: string }): FenceItem[] {
    let arr = this.items.filter((i) => i.userId === userId);
    if (filter?.category) arr = arr.filter((i) => i.category === filter.category);
    if (filter?.family_partition) arr = arr.filter((i) => i.family_partition === filter.family_partition);
    return arr.slice().reverse();
  }

  grant(userId: string, body: { item_id: string; grantee_user_id: string; ttl_ms?: number }): AccessGrant {
    const item = this.items.find((i) => i.id === body.item_id);
    if (!item) throw new NotFoundException('item not found');
    if (item.userId !== userId) throw new BadRequestException('only owner can grant access');
    const g: AccessGrant = {
      id: this.genId('grant'),
      itemId: body.item_id,
      granteeUserId: body.grantee_user_id,
      grantedByUserId: userId,
      expiresAt: Date.now() + (body.ttl_ms || 60 * 60 * 1000),
      grantedAt: Date.now(),
    };
    this.grants.push(g);
    this.log({ ts: Date.now(), actor: userId, action: 'grant', item_id: body.item_id, target: body.grantee_user_id });
    return g;
  }

  revokeGrant(userId: string, grantId: string): { ok: boolean } {
    const g = this.grants.find((x) => x.id === grantId);
    if (!g) throw new NotFoundException('grant not found');
    if (g.grantedByUserId !== userId) throw new BadRequestException('only grantor can revoke');
    g.expiresAt = 0;
    this.log({ ts: Date.now(), actor: userId, action: 'revoke', item_id: g.itemId, target: g.granteeUserId });
    return { ok: true };
  }

  recentAudit(limit = 50) {
    return this.auditLog.slice().reverse().slice(0, limit);
  }
}
