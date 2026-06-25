/**
 * OpenClaw Skill Hub Service — V3.0 (Real ClawHub Integration)
 *
 * Fetches the **real** skill catalog from ClawHub (https://clawhub.ai/api/v1)
 * using cursor-based pagination with **incremental accumulation**.
 *
 * Strategy:
 *  1. On startup: load from DB. If DB empty → load from snapshot JSON (committed).
 *  2. Every 2 minutes: fetch a few pages from ClawHub, persist to DB, resume cursor.
 *     This avoids rate-limits while gradually accumulating all skills.
 *  3. Full sync: resets cursor and re-fetches everything (manual trigger only).
 *  4. Cache: in-memory from DB, refreshed every 10 min.
 *
 * NOTE: ClawHub returns ~24 items per page regardless of per_page. Total ~5000+
 *       skills. At 3 pages / 2 min, full initial import takes ~2.5 hours.
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
  Skill,
  SkillStatus,
  SkillLayer,
  SkillCategory,
  SkillSource,
  SkillOriginalPlatform,
  SkillPricingType,
} from '../../entities/skill.entity';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Raw item shape returned by ClawHub /api/v1/skills */
export interface ClawHubRawSkill {
  slug: string;
  displayName: string;
  summary: string;
  tags: Record<string, string>;
  stats: {
    comments: number;
    downloads: number;
    installsAllTime: number;
    installsCurrent: number;
    stars: number;
    versions: number;
  };
  createdAt: number;
  updatedAt: number;
  latestVersion?: {
    version: string;
    createdAt: number;
    changelog?: string;
  };
  metadata?: Record<string, any> | null;
}

/** Normalised in-memory cache shape (backward-compatible) */
export interface OpenClawHubSkill {
  id: string;
  key: string;
  name: string;
  displayName?: string;
  description: string;
  category: string;
  version?: string;
  author?: string;
  icon?: string;
  tags?: string[];
  enabled: boolean;
  documentation?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  callCount?: number;
  rating?: number;
  source: 'openclaw_hub';
  hubStats?: ClawHubRawSkill['stats'];
  hubSlug?: string;
  hubUpdatedAt?: number;
}

export interface OpenClawHubSearchResult {
  items: OpenClawHubSkill[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

// NOTE: use clawhub.ai (NOT www.clawhub.ai which 307-redirects and causes issues with axios)
const CLAWHUB_API = process.env.CLAWHUB_API_URL || 'https://clawhub.ai/api/v1';
const PER_PAGE = 50;                        // ClawHub may cap to ~24
const CACHE_TTL_MS = 10 * 60 * 1000;       // 10 min in-memory cache
const INCREMENTAL_PAGES_PER_CYCLE = 3;      // pages per incremental cron cycle
const INCREMENTAL_PAGE_DELAY_MS = 2000;     // 2s delay between pages within a cycle

// Path to the snapshot JSON file (committed to repo, updated by scripts/fetch-clawhub-skills.js)
const SNAPSHOT_PATH = path.resolve(__dirname, 'clawhub-snapshot.json');

/** Map ClawHub tags → our SkillCategory enum */
const TAG_CATEGORY_MAP: Record<string, SkillCategory> = {
  code: SkillCategory.UTILITY, coding: SkillCategory.UTILITY,
  git: SkillCategory.UTILITY, github: SkillCategory.UTILITY,
  docker: SkillCategory.UTILITY, devops: SkillCategory.UTILITY,
  terminal: SkillCategory.UTILITY, ssh: SkillCategory.UTILITY,
  security: SkillCategory.UTILITY,
  database: SkillCategory.DATA, sql: SkillCategory.DATA,
  data: SkillCategory.DATA, analytics: SkillCategory.DATA,
  csv: SkillCategory.DATA, pdf: SkillCategory.DATA,
  ocr: SkillCategory.DATA, scrape: SkillCategory.DATA,
  'web-scraping': SkillCategory.DATA, 'market-data': SkillCategory.DATA,
  stock: SkillCategory.DATA, weather: SkillCategory.DATA,
  predict: SkillCategory.DATA, prediction: SkillCategory.DATA,
  api: SkillCategory.INTEGRATION, webhook: SkillCategory.INTEGRATION,
  zapier: SkillCategory.INTEGRATION, slack: SkillCategory.INTEGRATION,
  notion: SkillCategory.INTEGRATION, automation: SkillCategory.INTEGRATION,
  mcp: SkillCategory.INTEGRATION,
  trading: SkillCategory.COMMERCE, crypto: SkillCategory.COMMERCE,
  aicoin: SkillCategory.COMMERCE, freqtrade: SkillCategory.COMMERCE,
  hyperliquid: SkillCategory.COMMERCE, payment: SkillCategory.PAYMENT,
  image: SkillCategory.CUSTOM, video: SkillCategory.CUSTOM,
  music: SkillCategory.CUSTOM, 'creative-writing': SkillCategory.CUSTOM,
  creative: SkillCategory.CUSTOM, caption: SkillCategory.CUSTOM,
  title: SkillCategory.CUSTOM, game: SkillCategory.CUSTOM,
  arena: SkillCategory.CUSTOM, battle: SkillCategory.CUSTOM,
  competition: SkillCategory.CUSTOM,
  translate: SkillCategory.UTILITY, korean: SkillCategory.UTILITY,
};

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

@Injectable()
export class OpenClawSkillHubService implements OnModuleInit {
  private readonly logger = new Logger(OpenClawSkillHubService.name);

  // In-memory cache (loaded from DB)
  private cachedSkills: OpenClawHubSkill[] = [];
  private lastCacheAt: Date | null = null;

  // Incremental sync state
  private incrementalCursor: string | null = null;
  private incrementalDone = false;   // true after cursor exhaustion (all pages fetched)
  private totalFetchedThisRound = 0;
  private lastIncrementalAt: Date | null = null;
  private syncInProgress = false;

  // Rate limit state
  private rateLimitBackoffUntil = 0;
  private rateLimitConsecutiveFails = 0;

  // Stats
  private dbSkillCount = 0;
  private snapshotLoadedCount = 0;

  constructor(
    @InjectRepository(Skill)
    private readonly skillRepo: Repository<Skill>,
  ) {}

  /* ================================================================ */
  /*  Lifecycle                                                        */
  /* ================================================================ */

  async onModuleInit() {
    this.logger.log('Initialising OpenClaw Skill Hub...');

    // 1. Try loading from DB
    const dbCount = await this.countDbSkills();
    this.dbSkillCount = dbCount;

    if (dbCount > 0) {
      this.logger.log(`Found ${dbCount} OpenClaw skills in DB`);
      await this.refreshCacheFromDb();
    } else {
      // 2. DB empty → seed from snapshot JSON
      this.logger.log('DB empty — attempting snapshot seed...');
      const seeded = await this.seedFromSnapshot();
      if (seeded > 0) {
        this.snapshotLoadedCount = seeded;
        this.dbSkillCount = seeded;
        await this.refreshCacheFromDb();
      } else {
        this.logger.warn('No snapshot available. Skills will be populated via incremental fetch.');
      }
    }

    this.logger.log(`Skill Hub ready: ${this.cachedSkills.length} skills in cache, ${this.dbSkillCount} in DB`);
  }

  /* ================================================================ */
  /*  Public read API                                                  */
  /* ================================================================ */

  async getSkills(opts: {
    query?: string;
    category?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  } = {}): Promise<OpenClawHubSearchResult> {
    const { query, category, page = 1, limit = 20, sortBy = 'name', sortOrder = 'ASC' } = opts;

    await this.ensureCache();

    let filtered = [...this.cachedSkills];

    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.displayName?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.tags?.some(t => t.toLowerCase().includes(q)),
      );
    }

    if (category && category !== 'all') {
      const lowerCat = category.toLowerCase();
      filtered = filtered.filter(s => s.category?.toLowerCase() === lowerCat);
    }

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'callCount': case 'downloads':
          cmp = (a.callCount || 0) - (b.callCount || 0); break;
        case 'rating': case 'stars':
          cmp = (a.rating || 0) - (b.rating || 0); break;
        case 'name': default:
          cmp = (a.displayName || a.name).localeCompare(b.displayName || b.name); break;
      }
      return sortOrder === 'DESC' ? -cmp : cmp;
    });

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);
    return { items, total, page, limit, hasMore: start + limit < total };
  }

  async getSkillById(id: string): Promise<OpenClawHubSkill | null> {
    await this.ensureCache();
    return this.cachedSkills.find(s => s.id === id || s.key === id) ?? null;
  }

  async getSkillBySlug(slug: string): Promise<OpenClawHubSkill | null> {
    const cached = this.cachedSkills.find(s => s.key === slug || s.hubSlug === slug);
    if (cached) return cached;
    // Live fallback for individual skill lookup
    try {
      const { data } = await axios.get(`${CLAWHUB_API}/skills/${slug}`, {
        timeout: 10_000,
        maxRedirects: 5,
        headers: { 'User-Agent': 'Agentrix/2.0', Accept: 'application/json' },
      });
      if (data?.skill) return this.normalizeClawHubSkill(data.skill);
      if (data?.slug) return this.normalizeClawHubSkill(data);
    } catch { /* fall through */ }
    return null;
  }

  getCategories(): { id: string; label: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const skill of this.cachedSkills) {
      const cat = skill.category || 'general';
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, count]) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1), count }))
      .sort((a, b) => b.count - a.count);
  }

  get totalSkills(): number { return this.cachedSkills.length; }

  get hubSyncStatus() {
    return {
      cachedSkills: this.cachedSkills.length,
      dbSkills: this.dbSkillCount,
      snapshotLoaded: this.snapshotLoadedCount,
      lastCacheAt: this.lastCacheAt?.toISOString() ?? null,
      lastIncrementalAt: this.lastIncrementalAt?.toISOString() ?? null,
      incrementalDone: this.incrementalDone,
      totalFetchedThisRound: this.totalFetchedThisRound,
      syncInProgress: this.syncInProgress,
      rateLimited: this.isRateLimited(),
      rateLimitBackoffUntil: this.rateLimitBackoffUntil > 0 ? new Date(this.rateLimitBackoffUntil).toISOString() : null,
      rateLimitConsecutiveFails: this.rateLimitConsecutiveFails,
    };
  }

  async isHubReachable(): Promise<boolean> {
    try {
      const { status } = await axios.get(`${CLAWHUB_API}/skills?per_page=1`, {
        timeout: 5_000,
        maxRedirects: 5,
        validateStatus: (s) => s < 500,
      });
      return status === 200;
    } catch { return false; }
  }

  /** Manual trigger: reset cursor and start fresh fetch */
  async triggerFullSync(): Promise<{ message: string; dbCount: number }> {
    this.incrementalCursor = null;
    this.incrementalDone = false;
    this.totalFetchedThisRound = 0;
    this.resetRateLimit();
    this.logger.log('Full sync triggered — cursor reset, incremental fetch will restart');
    // Run a few pages immediately
    await this.incrementalFetchCycle();
    const count = await this.countDbSkills();
    return { message: `Sync restarted. ${count} skills in DB after initial fetch.`, dbCount: count };
  }

  /* ================================================================ */
  /*  Cache management                                                 */
  /* ================================================================ */

  private async ensureCache(): Promise<void> {
    if (this.cachedSkills.length > 0 && this.lastCacheAt &&
        Date.now() - this.lastCacheAt.getTime() < CACHE_TTL_MS) {
      return;
    }
    await this.refreshCacheFromDb();
  }

  private async refreshCacheFromDb(): Promise<void> {
    try {
      const rows = await this.skillRepo.find({
        where: {
          source: SkillSource.IMPORTED,
          originalPlatform: SkillOriginalPlatform.OPENCLAW,
          status: SkillStatus.PUBLISHED,
        },
        order: { callCount: 'DESC' },
      });
      if (rows.length > 0) {
        this.cachedSkills = rows.map(r => this.skillEntityToHubSkill(r));
        this.lastCacheAt = new Date();
        this.dbSkillCount = rows.length;
        this.logger.log(`Cache refreshed from DB: ${rows.length} skills`);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to refresh cache from DB: ${err.message}`);
    }
  }

  private async countDbSkills(): Promise<number> {
    try {
      return await this.skillRepo.count({
        where: {
          source: SkillSource.IMPORTED,
          originalPlatform: SkillOriginalPlatform.OPENCLAW,
        },
      });
    } catch { return 0; }
  }

  /* ================================================================ */
  /*  Snapshot seeder (cold start from committed JSON)                 */
  /* ================================================================ */

  private async seedFromSnapshot(): Promise<number> {
    try {
      if (!fs.existsSync(SNAPSHOT_PATH)) {
        this.logger.warn(`No snapshot file at ${SNAPSHOT_PATH}`);
        return 0;
      }
      const raw = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
      const items: ClawHubRawSkill[] = JSON.parse(raw);
      if (!Array.isArray(items) || items.length === 0) {
        this.logger.warn('Snapshot file is empty or invalid');
        return 0;
      }
      this.logger.log(`Loading ${items.length} skills from snapshot...`);

      const hubSkills = items
        .filter(item => item && item.slug)
        .map(item => this.normalizeClawHubSkill(item));

      // Persist to DB in chunks
      let persisted = 0;
      const CHUNK = 200;
      for (let i = 0; i < hubSkills.length; i += CHUNK) {
        const chunk = hubSkills.slice(i, i + CHUNK);
        const entities = chunk.map(hs => {
          const entity = this.skillRepo.create();
          this.applyHubSkillToEntity(entity, hs);
          return entity;
        });
        try {
          await this.skillRepo.save(entities, { chunk: CHUNK });
          persisted += entities.length;
        } catch {
          // On conflict (duplicate slugs), try upsert one by one
          for (const e of entities) {
            try {
              await this.skillRepo.save(e);
              persisted++;
            } catch { /* skip duplicates */ }
          }
        }
        if (i % 1000 === 0 && i > 0) {
          this.logger.log(`Snapshot seed progress: ${persisted}/${hubSkills.length}`);
        }
      }

      this.logger.log(`Snapshot seed complete: ${persisted} skills persisted to DB`);
      return persisted;
    } catch (err: any) {
      this.logger.error(`Snapshot seed failed: ${err.message}`);
      return 0;
    }
  }

  /* ================================================================ */
  /*  Rate limiting                                                    */
  /* ================================================================ */

  private isRateLimited(): boolean {
    return Date.now() < this.rateLimitBackoffUntil;
  }

  private markRateLimited(): void {
    this.rateLimitConsecutiveFails++;
    const backoffMs = Math.min(5 * 60_000 * Math.pow(2, this.rateLimitConsecutiveFails - 1), 60 * 60_000);
    this.rateLimitBackoffUntil = Date.now() + backoffMs;
    this.logger.warn(`ClawHub rate-limited, backing off ${Math.round(backoffMs / 60_000)}min (consecutive: ${this.rateLimitConsecutiveFails})`);
  }

  private resetRateLimit(): void {
    this.rateLimitConsecutiveFails = 0;
    this.rateLimitBackoffUntil = 0;
  }

  /* ================================================================ */
  /*  Incremental fetch (drip-feed, avoids rate limits)                */
  /* ================================================================ */

  /**
   * Fetches INCREMENTAL_PAGES_PER_CYCLE pages from ClawHub, persists to DB,
   * and updates the cursor. Called by cron every 2 minutes.
   */
  private async incrementalFetchCycle(): Promise<void> {
    if (this.syncInProgress) return;
    if (this.isRateLimited()) {
      this.logger.debug(`Incremental fetch skipped — rate-limited until ${new Date(this.rateLimitBackoffUntil).toISOString()}`);
      return;
    }
    if (this.incrementalDone) return; // All pages exhausted; wait for next sync round

    this.syncInProgress = true;
    let fetchedThisCycle = 0;

    try {
      for (let p = 0; p < INCREMENTAL_PAGES_PER_CYCLE; p++) {
        let url = `${CLAWHUB_API}/skills?per_page=${PER_PAGE}`;
        if (this.incrementalCursor) {
          url += `&cursor=${encodeURIComponent(this.incrementalCursor)}`;
        }

        const { data, status } = await axios.get(url, {
          timeout: 15_000,
          maxRedirects: 5,
          headers: { 'User-Agent': 'Agentrix/2.0', Accept: 'application/json' },
          validateStatus: (s) => s < 500,
        });

        if (status === 429) {
          this.markRateLimited();
          break;
        }
        if (status !== 200) {
          this.logger.warn(`ClawHub returned ${status} on incremental fetch`);
          break;
        }

        const items: ClawHubRawSkill[] = data?.items ?? [];
        if (items.length === 0) {
          this.incrementalDone = true;
          this.logger.log(`Incremental fetch complete! Total accumulated: ${this.totalFetchedThisRound}`);
          break;
        }

        // Normalise and persist
        const hubSkills = items.filter(i => i && i.slug).map(i => this.normalizeClawHubSkill(i));
        await this.persistSkillsBatch(hubSkills);
        fetchedThisCycle += hubSkills.length;
        this.totalFetchedThisRound += hubSkills.length;

        const nextCursor = data?.nextCursor;
        if (!nextCursor) {
          this.incrementalDone = true;
          this.logger.log(`Incremental fetch complete (no more cursor)! Total: ${this.totalFetchedThisRound}`);
          break;
        }
        this.incrementalCursor = nextCursor;

        // Delay between pages
        if (p < INCREMENTAL_PAGES_PER_CYCLE - 1) {
          await new Promise(r => setTimeout(r, INCREMENTAL_PAGE_DELAY_MS));
        }

        // Success → reset rate limit counter
        this.resetRateLimit();
      }

      if (fetchedThisCycle > 0) {
        this.lastIncrementalAt = new Date();
        this.dbSkillCount = await this.countDbSkills();
        this.logger.log(`Incremental cycle: +${fetchedThisCycle} skills (DB total: ${this.dbSkillCount})`);
      }
    } catch (err: any) {
      if (err.response?.status === 429 || /rate.limit/i.test(err.message)) {
        this.markRateLimited();
      }
      this.logger.error(`Incremental fetch error: ${err.message}`);
    } finally {
      this.syncInProgress = false;
    }
  }

  private async persistSkillsBatch(hubSkills: OpenClawHubSkill[]): Promise<number> {
    let persisted = 0;
    const existingMap = await this.getExistingHubSkillMap();

    const batch: Skill[] = [];
    for (const hs of hubSkills) {
      const entity = existingMap.get(hs.key) ?? this.skillRepo.create();
      this.applyHubSkillToEntity(entity, hs);
      batch.push(entity);
    }

    try {
      await this.skillRepo.save(batch, { chunk: 100 });
      persisted = batch.length;
    } catch {
      // Fallback: save one by one
      for (const e of batch) {
        try { await this.skillRepo.save(e); persisted++; } catch { /* skip */ }
      }
    }
    return persisted;
  }

  private async getExistingHubSkillMap(): Promise<Map<string, Skill>> {
    try {
      const rows = await this.skillRepo.find({
        where: {
          source: SkillSource.IMPORTED,
          originalPlatform: SkillOriginalPlatform.OPENCLAW,
        },
      });
      return new Map(rows.map(r => [r.externalSkillId ?? r.name, r]));
    } catch { return new Map(); }
  }

  /* ================================================================ */
  /*  Normalisation                                                    */
  /* ================================================================ */

  private normalizeClawHubSkill(raw: ClawHubRawSkill): OpenClawHubSkill {
    const tagKeys = raw.tags && typeof raw.tags === 'object'
      ? Object.keys(raw.tags).filter(k => k !== 'latest')
      : [];

    const category = this.inferCategory(tagKeys, raw.displayName, raw.summary);
    const version = raw.latestVersion?.version ?? raw.tags?.latest ?? undefined;

    return {
      id: `clawhub-${raw.slug}`,
      key: raw.slug,
      name: raw.slug,
      displayName: raw.displayName || raw.slug,
      description: raw.summary || 'OpenClaw community skill',
      category,
      version,
      author: 'OpenClaw Community',
      icon: this.inferIcon(category, tagKeys),
      tags: tagKeys,
      enabled: true,
      callCount: raw.stats?.downloads ?? raw.stats?.installsAllTime ?? 0,
      rating: raw.stats?.stars ?? 0,
      source: 'openclaw_hub',
      hubStats: raw.stats,
      hubSlug: raw.slug,
      hubUpdatedAt: raw.updatedAt,
    };
  }

  private inferCategory(tags: string[], name?: string, desc?: string): string {
    for (const tag of tags) {
      const mapped = TAG_CATEGORY_MAP[tag.toLowerCase()];
      if (mapped) return mapped;
    }
    const text = `${name ?? ''} ${desc ?? ''}`.toLowerCase();
    if (/trad(e|ing)|crypto|coin|exchange|binance/i.test(text)) return SkillCategory.COMMERCE;
    if (/data|analy|chart|csv|pdf/i.test(text)) return SkillCategory.DATA;
    if (/api|webhook|slack|notion|zapier/i.test(text)) return SkillCategory.INTEGRATION;
    if (/pay|stripe|checkout/i.test(text)) return SkillCategory.PAYMENT;
    if (/image|video|music|draw|creat/i.test(text)) return SkillCategory.CUSTOM;
    return SkillCategory.UTILITY;
  }

  private inferIcon(category: string, tags: string[]): string {
    if (tags.includes('git') || tags.includes('github')) return '🐙';
    if (tags.includes('docker')) return '🐋';
    if (tags.includes('ssh') || tags.includes('security')) return '🔒';
    if (tags.includes('weather')) return '🌤️';
    if (tags.includes('game') || tags.includes('arena')) return '🎮';
    const iconMap: Record<string, string> = {
      [SkillCategory.COMMERCE]: '💰', [SkillCategory.PAYMENT]: '💳',
      [SkillCategory.DATA]: '📊', [SkillCategory.INTEGRATION]: '🔌',
      [SkillCategory.CUSTOM]: '🎨', [SkillCategory.UTILITY]: '⚡',
    };
    return iconMap[category] || '⚡';
  }

  /* ================================================================ */
  /*  DB entity mapping                                                */
  /* ================================================================ */

  private applyHubSkillToEntity(entity: Skill, hs: OpenClawHubSkill): void {
    const tagList = (hs.tags ?? []).map((tag) => tag.toLowerCase());
    const text = `${hs.displayName ?? hs.name ?? ''} ${hs.description ?? ''}`.toLowerCase();
    const x402TagHit = tagList.some((tag) =>
      tag.includes('x402') ||
      tag.includes('payment') ||
      tag.includes('checkout') ||
      tag.includes('wallet') ||
      tag.includes('crypto'),
    );
    const x402TextHit = /x402|payment|checkout|wallet|crypto|onchain/i.test(text);
    const shouldEnableX402 = x402TagHit || x402TextHit;

    entity.name = hs.key;
    entity.displayName = hs.displayName ?? hs.name;
    entity.description = (hs.description ?? '').slice(0, 500);
    entity.version = hs.version ?? '1.0.0';
    entity.category = (hs.category as SkillCategory) || SkillCategory.UTILITY;
    entity.layer = SkillLayer.LOGIC;
    entity.source = SkillSource.IMPORTED;
    entity.originalPlatform = SkillOriginalPlatform.OPENCLAW;
    entity.status = SkillStatus.PUBLISHED;
    entity.externalSkillId = hs.key;
    entity.callCount = hs.callCount ?? 0;
    entity.rating = hs.rating ?? 0;
    entity.tags = hs.tags ?? [];
    entity.humanAccessible = true;
    entity.ucpEnabled = false;
    entity.x402Enabled = shouldEnableX402;
    entity.imageUrl = hs.icon ?? '⚡';
    entity.pricing = { type: SkillPricingType.FREE };
    entity.inputSchema = hs.inputSchema as any ?? {
      type: 'object',
      properties: { prompt: { type: 'string', description: 'Input prompt for the skill' } },
      required: ['prompt'],
    };
    entity.executor = {
      type: 'mcp',
      mcpServer: 'openclaw',
      endpoint: `https://clawhub.ai/skills/${hs.key}`,
    };
    entity.metadata = {
      hubSlug: hs.hubSlug ?? hs.key,
      hubStats: hs.hubStats,
      hubUpdatedAt: hs.hubUpdatedAt,
      syncedAt: new Date().toISOString(),
    };
    entity.authorInfo = { id: 'openclaw-community', name: 'OpenClaw Community', type: 'developer' };
    entity.compatibleAgents = ['all'];
    entity.permissions = ['read'];
    entity.aiPriority = 'normal';
  }

  private skillEntityToHubSkill(entity: Skill): OpenClawHubSkill {
    return {
      id: entity.id,
      key: entity.externalSkillId ?? entity.name,
      name: entity.name,
      displayName: entity.displayName,
      description: entity.description,
      category: entity.category,
      version: entity.version,
      author: entity.authorInfo?.name ?? 'OpenClaw Community',
      icon: entity.imageUrl ?? '⚡',
      tags: entity.tags ?? [],
      enabled: entity.status === SkillStatus.PUBLISHED,
      callCount: entity.callCount,
      rating: Number(entity.rating) || 0,
      source: 'openclaw_hub',
      hubSlug: entity.externalSkillId ?? entity.name,
      hubStats: entity.metadata?.hubStats,
      hubUpdatedAt: entity.metadata?.hubUpdatedAt,
    };
  }

  /* ================================================================ */
  /*  Cron jobs                                                        */
  /* ================================================================ */

  /** Every 2 minutes: fetch a few pages from ClawHub and persist */
  @Cron('0 */2 * * * *')
  async handleIncrementalFetch() {
    await this.incrementalFetchCycle();
  }

  /** Every 10 minutes: refresh in-memory cache from DB */
  @Cron('0 */10 * * * *')
  async handleCacheRefresh() {
    await this.refreshCacheFromDb();
  }

  /** Every 24 hours: reset cursor to re-sync from scratch (catches updates) */
  @Cron('0 0 3 * * *') // 3 AM daily
  async handleDailyResync() {
    this.logger.log('Daily re-sync: resetting cursor for fresh fetch');
    this.incrementalCursor = null;
    this.incrementalDone = false;
    this.totalFetchedThisRound = 0;
  }
}
