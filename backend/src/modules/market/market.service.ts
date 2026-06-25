import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetSkin } from '../../entities/pet-skin.entity';
import { SkillListingEntity } from '../../entities/skill-listing.entity';
import { MerchantTask, TaskVisibility } from '../../entities/merchant-task.entity';

export interface SkinSearchItem {
  id: string;
  displayName: string;
  thumbnailUrl: string | null;
  clan: string | null;
  format: string;
  source: string;
}

export interface SkillSearchItem {
  id: string;
  title: string;
  description: string;
  category: string;
  priceCents: number;
  installCount: number;
}

export interface TaskSearchItem {
  id: string;
  title: string;
  description: string;
  type: string;
  budget: number;
  currency: string;
}

export interface UnifiedSearchResponse {
  skins: { items: SkinSearchItem[]; count: number };
  skills: { items: SkillSearchItem[]; count: number };
  tasks: { items: TaskSearchItem[]; count: number };
}

@Injectable()
export class MarketService {
  constructor(
    @InjectRepository(PetSkin)
    private readonly skinRepo: Repository<PetSkin>,
    @InjectRepository(SkillListingEntity)
    private readonly skillRepo: Repository<SkillListingEntity>,
    @InjectRepository(MerchantTask)
    private readonly taskRepo: Repository<MerchantTask>,
  ) {}

  /**
   * 跨 pet_skins、skill_listings、merchant_tasks 三表统一搜索。
   * 使用 ILIKE 进行模糊匹配，仅返回公开/已审核的内容。
   */
  async unifiedSearch(query: string, limit = 5): Promise<UnifiedSearchResponse> {
    const pattern = `%${query}%`;

    const [skins, skills, tasks] = await Promise.all([
      this.searchSkins(pattern, limit),
      this.searchSkills(pattern, limit),
      this.searchTasks(pattern, limit),
    ]);

    return { skins, skills, tasks };
  }

  private async searchSkins(
    pattern: string,
    limit: number,
  ): Promise<{ items: SkinSearchItem[]; count: number }> {
    const qb = this.skinRepo
      .createQueryBuilder('skin')
      .where('skin.visibility = :visibility', { visibility: 'public' })
      .andWhere('skin.moderationStatus = :status', { status: 'approved' })
      .andWhere('skin.displayName ILIKE :pattern', { pattern });

    const count = await qb.getCount();

    const items = await qb
      .select([
        'skin.id',
        'skin.displayName',
        'skin.thumbnailUrl',
        'skin.clan',
        'skin.format',
        'skin.source',
      ])
      .orderBy('skin.featured', 'DESC')
      .addOrderBy('skin.createdAt', 'DESC')
      .take(limit)
      .getMany();

    return {
      items: items.map((s) => ({
        id: s.id,
        displayName: s.displayName,
        thumbnailUrl: s.thumbnailUrl,
        clan: s.clan,
        format: s.format,
        source: s.source,
      })),
      count,
    };
  }

  private async searchSkills(
    pattern: string,
    limit: number,
  ): Promise<{ items: SkillSearchItem[]; count: number }> {
    const qb = this.skillRepo
      .createQueryBuilder('skill')
      .where('skill.status = :status', { status: 'approved' })
      .andWhere(
        '(skill.name ILIKE :pattern OR skill.description ILIKE :pattern)',
        { pattern },
      );

    const count = await qb.getCount();

    const items = await qb
      .select([
        'skill.id',
        'skill.name',
        'skill.description',
        'skill.category',
        'skill.priceCents',
        'skill.installCount',
      ])
      .orderBy('skill.installCount', 'DESC')
      .take(limit)
      .getMany();

    return {
      items: items.map((s) => ({
        id: s.id,
        title: s.name,
        description: s.description,
        category: s.category,
        priceCents: s.priceCents,
        installCount: s.installCount,
      })),
      count,
    };
  }

  private async searchTasks(
    pattern: string,
    limit: number,
  ): Promise<{ items: TaskSearchItem[]; count: number }> {
    const qb = this.taskRepo
      .createQueryBuilder('task')
      .where('task.visibility = :visibility', { visibility: TaskVisibility.PUBLIC })
      .andWhere(
        '(task.title ILIKE :pattern OR task.description ILIKE :pattern)',
        { pattern },
      );

    const count = await qb.getCount();

    const items = await qb
      .select([
        'task.id',
        'task.title',
        'task.description',
        'task.type',
        'task.budget',
        'task.currency',
      ])
      .orderBy('task.createdAt', 'DESC')
      .take(limit)
      .getMany();

    return {
      items: items.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        type: t.type,
        budget: t.budget,
        currency: t.currency,
      })),
      count,
    };
  }
}
