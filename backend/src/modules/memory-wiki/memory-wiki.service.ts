import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WikiPage } from '../../entities/wiki-page.entity';

export interface CreateWikiPageDto {
  title: string;
  content: string;
  agentId?: string;
  tags?: string[];
  linkedMemoryIds?: string[];
}

export interface UpdateWikiPageDto {
  title?: string;
  content?: string;
  tags?: string[];
  linkedMemoryIds?: string[];
}

export interface WikiGraphNode {
  slug: string;
  title: string;
  linksTo: string[];
  linkedFrom: string[];
  tags: string[];
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

@Injectable()
export class MemoryWikiService {
  private readonly logger = new Logger(MemoryWikiService.name);

  constructor(
    @InjectRepository(WikiPage)
    private readonly wikiRepo: Repository<WikiPage>,
  ) {}

  /** Extract [[wikilinks]] from markdown content */
  private extractWikilinks(content: string): string[] {
    const links: string[] = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(WIKILINK_RE.source, 'g');
    while ((match = re.exec(content)) !== null) {
      links.push(this.slugify(match[1]));
    }
    return [...new Set(links)];
  }

  /** Convert title to slug */
  private slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  /** Create a new wiki page */
  async createPage(userId: string, dto: CreateWikiPageDto): Promise<WikiPage> {
    const slug = this.slugify(dto.title);

    const existing = await this.wikiRepo.findOne({ where: { userId, slug } });
    if (existing) {
      throw new ConflictException(`Wiki page "${dto.title}" already exists`);
    }

    const outgoingLinks = this.extractWikilinks(dto.content ?? '');

    const page = this.wikiRepo.create({
      userId,
      agentId: dto.agentId,
      slug,
      title: dto.title,
      content: dto.content ?? '',
      outgoingLinks,
      tags: dto.tags ?? [],
      linkedMemoryIds: dto.linkedMemoryIds ?? [],
    });

    return this.wikiRepo.save(page);
  }

  /** Update a wiki page */
  async updatePage(userId: string, slug: string, dto: UpdateWikiPageDto): Promise<WikiPage> {
    const page = await this.wikiRepo.findOne({ where: { userId, slug } });
    if (!page) throw new NotFoundException('Wiki page not found');

    if (dto.title !== undefined) {
      page.title = dto.title;
      const newSlug = this.slugify(dto.title);
      if (newSlug !== slug) {
        const conflict = await this.wikiRepo.findOne({ where: { userId, slug: newSlug } });
        if (conflict) throw new ConflictException(`Page "${dto.title}" already exists`);
        page.slug = newSlug;
      }
    }

    if (dto.content !== undefined) {
      page.content = dto.content;
      page.outgoingLinks = this.extractWikilinks(dto.content);
    }

    if (dto.tags !== undefined) page.tags = dto.tags;
    if (dto.linkedMemoryIds !== undefined) page.linkedMemoryIds = dto.linkedMemoryIds;

    return this.wikiRepo.save(page);
  }

  /** Get a single page by slug */
  async getPage(userId: string, slug: string): Promise<WikiPage> {
    const page = await this.wikiRepo.findOne({ where: { userId, slug } });
    if (!page) throw new NotFoundException('Wiki page not found');
    page.viewCount += 1;
    await this.wikiRepo.update(page.id, { viewCount: page.viewCount });
    return page;
  }

  /** List all pages for a user */
  async listPages(
    userId: string,
    opts?: { agentId?: string; search?: string; tag?: string; limit?: number },
  ): Promise<WikiPage[]> {
    const qb = this.wikiRepo
      .createQueryBuilder('wp')
      .where('wp.userId = :userId', { userId })
      .orderBy('wp.updatedAt', 'DESC')
      .take(opts?.limit ?? 50);

    if (opts?.agentId) {
      qb.andWhere('wp.agentId = :agentId', { agentId: opts.agentId });
    }
    if (opts?.search) {
      qb.andWhere(
        '(wp.title ILIKE :search OR wp.content ILIKE :search)',
        { search: `%${opts.search}%` },
      );
    }
    if (opts?.tag) {
      qb.andWhere('wp.tags @> :tag', { tag: JSON.stringify([opts.tag]) });
    }

    return qb.getMany();
  }

  /** Delete a wiki page */
  async deletePage(userId: string, slug: string): Promise<boolean> {
    const result = await this.wikiRepo.delete({ userId, slug });
    return (result.affected ?? 0) > 0;
  }

  /** Build the wiki graph for visualization */
  async buildGraph(userId: string, agentId?: string): Promise<WikiGraphNode[]> {
    const pages = await this.listPages(userId, { agentId, limit: 500 });
    const slugIndex = new Map<string, WikiPage>();
    for (const p of pages) slugIndex.set(p.slug, p);

    // Build backlinks
    const backlinks = new Map<string, string[]>();
    for (const p of pages) {
      for (const link of p.outgoingLinks) {
        if (!backlinks.has(link)) backlinks.set(link, []);
        backlinks.get(link)!.push(p.slug);
      }
    }

    return pages.map((p) => ({
      slug: p.slug,
      title: p.title,
      linksTo: p.outgoingLinks,
      linkedFrom: backlinks.get(p.slug) ?? [],
      tags: p.tags,
    }));
  }

  /** Resolve [[wikilinks]] in content to URLs or titles */
  async resolveLinks(userId: string, content: string): Promise<string> {
    const slugs = this.extractWikilinks(content);
    if (slugs.length === 0) return content;

    const pages = await this.wikiRepo
      .createQueryBuilder('wp')
      .select(['wp.slug', 'wp.title'])
      .where('wp.userId = :userId', { userId })
      .andWhere('wp.slug IN (:...slugs)', { slugs })
      .getMany();

    const titleMap = new Map(pages.map((p) => [p.slug, p.title]));

    return content.replace(WIKILINK_RE, (_match, rawTitle) => {
      const slug = this.slugify(rawTitle);
      const title = titleMap.get(slug);
      return title ? `[${title}](/wiki/${slug})` : `[[${rawTitle}]]`;
    });
  }
}
