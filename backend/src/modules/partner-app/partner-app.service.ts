import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import {
  PartnerApp,
  PartnerAppBillingMode,
  PartnerAppStatus,
} from '../../entities/partner-app.entity';
import { PartnerAppUsage } from '../../entities/partner-app-usage.entity';

/**
 * Phase 6 M5 — partner app SDK service.
 *
 * Owner-side:
 *   register / list / rotateKey / setStatus / setBilling
 * Runtime-side (called from incoming SDK requests):
 *   authenticate(rawApiKey) → { app, scopes }
 *   recordCall(appId, costUsd?) — increments today's usage roll-up,
 *                                  enforces monthlyCapUsd
 */

export const PARTNER_APP_SCOPES = [
  'pet.read',
  'pet.emotion.write',
  'pet.chat',
  'wallet.read',
  'marketplace.read',
] as const;
export type PartnerAppScope = (typeof PARTNER_APP_SCOPES)[number];

export interface RegisterPartnerAppDto {
  name: string;
  slug: string;
  redirectUris?: string[];
  scopes?: PartnerAppScope[];
  billingMode?: PartnerAppBillingMode;
  perCallUsd?: number;
  monthlyFlatUsd?: number;
  monthlyCapUsd?: number;
}

export interface UpdateBillingDto {
  billingMode?: PartnerAppBillingMode;
  perCallUsd?: number;
  monthlyFlatUsd?: number;
  monthlyCapUsd?: number;
}

@Injectable()
export class PartnerAppService {
  constructor(
    @InjectRepository(PartnerApp)
    private readonly appRepo: Repository<PartnerApp>,
    @InjectRepository(PartnerAppUsage)
    private readonly usageRepo: Repository<PartnerAppUsage>,
  ) {}

  // ───────── owner-side ─────────

  async register(
    ownerUserId: string,
    dto: RegisterPartnerAppDto,
  ): Promise<{ app: PartnerApp; apiKey: string }> {
    if (!ownerUserId) throw new BadRequestException('ownerUserId required');
    if (!dto.name || dto.name.length > 64) throw new BadRequestException('name 1..64');
    if (!dto.slug || !/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/i.test(dto.slug)) {
      throw new BadRequestException('slug must match [a-z0-9-] (3..64)');
    }
    const existing = await this.appRepo.findOne({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException('slug already in use');
    this.validateScopes(dto.scopes);
    const billing = this.normalizeBilling(dto);

    const apiKey = this.mintApiKey();
    const row = this.appRepo.create({
      ownerUserId,
      name: dto.name,
      slug: dto.slug.toLowerCase(),
      apiKeyHash: this.hashKey(apiKey),
      redirectUris: dto.redirectUris ?? [],
      scopes: (dto.scopes ?? ['pet.read']) as string[],
      billingMode: billing.billingMode,
      perCallUsd: billing.perCallUsd,
      monthlyFlatUsd: billing.monthlyFlatUsd,
      monthlyCapUsd: billing.monthlyCapUsd,
      status: 'active',
    });
    const saved = await this.appRepo.save(row);
    return { app: saved, apiKey };
  }

  async listMine(ownerUserId: string): Promise<PartnerApp[]> {
    return this.appRepo.find({ where: { ownerUserId }, order: { createdAt: 'DESC' } });
  }

  async getOwn(id: string, ownerUserId: string): Promise<PartnerApp> {
    const row = await this.appRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('app not found');
    if (row.ownerUserId !== ownerUserId) throw new ForbiddenException('not your app');
    return row;
  }

  async rotateKey(id: string, ownerUserId: string): Promise<{ app: PartnerApp; apiKey: string }> {
    const row = await this.getOwn(id, ownerUserId);
    const apiKey = this.mintApiKey();
    row.apiKeyHash = this.hashKey(apiKey);
    return { app: await this.appRepo.save(row), apiKey };
  }

  async setStatus(id: string, ownerUserId: string, status: PartnerAppStatus): Promise<PartnerApp> {
    if (!['active', 'suspended', 'revoked'].includes(status)) {
      throw new BadRequestException('invalid status');
    }
    const row = await this.getOwn(id, ownerUserId);
    row.status = status;
    return this.appRepo.save(row);
  }

  async updateBilling(
    id: string,
    ownerUserId: string,
    dto: UpdateBillingDto,
  ): Promise<PartnerApp> {
    const row = await this.getOwn(id, ownerUserId);
    const billing = this.normalizeBilling({
      billingMode: dto.billingMode ?? (row.billingMode as PartnerAppBillingMode),
      perCallUsd: dto.perCallUsd ?? Number(row.perCallUsd),
      monthlyFlatUsd: dto.monthlyFlatUsd ?? Number(row.monthlyFlatUsd),
      monthlyCapUsd: dto.monthlyCapUsd ?? Number(row.monthlyCapUsd),
    });
    row.billingMode = billing.billingMode;
    row.perCallUsd = billing.perCallUsd;
    row.monthlyFlatUsd = billing.monthlyFlatUsd;
    row.monthlyCapUsd = billing.monthlyCapUsd;
    return this.appRepo.save(row);
  }

  // ───────── runtime-side ─────────

  /** SDK calls hit this with `X-Agentrix-App-Key: <raw>`. */
  async authenticate(rawApiKey: string): Promise<PartnerApp> {
    if (!rawApiKey || rawApiKey.length < 24) {
      throw new ForbiddenException('invalid api key');
    }
    const hash = this.hashKey(rawApiKey);
    const row = await this.appRepo.findOne({ where: { apiKeyHash: hash } });
    if (!row) throw new ForbiddenException('api key not recognized');
    if (row.status !== 'active') throw new ForbiddenException(`app ${row.status}`);
    return row;
  }

  hasScope(app: PartnerApp, scope: PartnerAppScope): boolean {
    return Array.isArray(app.scopes) && app.scopes.includes(scope);
  }

  /**
   * Increment today's usage. If billingMode='per_call', `costUsd` defaults
   * to app.perCallUsd. Throws BadRequestException when the monthlyCapUsd
   * would be exceeded — caller should turn that into HTTP 429.
   */
  async recordCall(appId: string, explicitCostUsd?: number): Promise<PartnerAppUsage> {
    const app = await this.appRepo.findOne({ where: { id: appId } });
    if (!app) throw new NotFoundException('app not found');
    if (app.status !== 'active') throw new ForbiddenException(`app ${app.status}`);

    const cost =
      explicitCostUsd != null
        ? explicitCostUsd
        : app.billingMode === 'per_call'
          ? Number(app.perCallUsd)
          : 0;
    if (cost < 0) throw new BadRequestException('cost must be >= 0');

    const day = new Date().toISOString().slice(0, 10);
    const monthPrefix = day.slice(0, 7);

    if (Number(app.monthlyCapUsd) > 0) {
      const monthSoFar = await this.usageRepo
        .createQueryBuilder('u')
        .select('COALESCE(SUM(u.costUsd), 0)', 'total')
        .where('u.partnerAppId = :id AND u.day LIKE :p', { id: appId, p: `${monthPrefix}%` })
        .getRawOne<{ total: string }>();
      const total = Number(monthSoFar?.total ?? 0);
      if (total + cost > Number(app.monthlyCapUsd)) {
        throw new BadRequestException(
          `monthly_cap_exceeded total=${total.toFixed(4)} cap=${app.monthlyCapUsd}`,
        );
      }
    }

    let row = await this.usageRepo.findOne({ where: { partnerAppId: appId, day } });
    if (!row) {
      row = this.usageRepo.create({ partnerAppId: appId, day, calls: 0, costUsd: '0' });
    }
    row.calls = (row.calls ?? 0) + 1;
    row.costUsd = (Number(row.costUsd) + cost).toFixed(4);
    return this.usageRepo.save(row);
  }

  async usageForMonth(appId: string, ownerUserId: string, monthPrefix: string): Promise<{ day: string; calls: number; cost_usd: string }[]> {
    await this.getOwn(appId, ownerUserId);
    const rows = await this.usageRepo.find({
      where: { partnerAppId: appId },
      order: { day: 'ASC' },
    });
    return rows
      .filter((r) => r.day.startsWith(monthPrefix))
      .map((r) => ({ day: r.day, calls: r.calls, cost_usd: r.costUsd }));
  }

  toDto(a: PartnerApp) {
    return {
      id: a.id,
      name: a.name,
      slug: a.slug,
      redirect_uris: a.redirectUris,
      scopes: a.scopes,
      billing_mode: a.billingMode,
      per_call_usd: a.perCallUsd,
      monthly_flat_usd: a.monthlyFlatUsd,
      monthly_cap_usd: a.monthlyCapUsd,
      status: a.status,
      created_at: a.createdAt?.getTime?.() ?? null,
      updated_at: a.updatedAt?.getTime?.() ?? null,
    };
  }

  // ───────── helpers ─────────

  private mintApiKey(): string {
    return 'agx_' + randomBytes(24).toString('base64url');
  }

  private hashKey(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private validateScopes(scopes?: PartnerAppScope[]): void {
    if (!scopes) return;
    for (const s of scopes) {
      if (!PARTNER_APP_SCOPES.includes(s)) {
        throw new BadRequestException(`unknown scope: ${s}`);
      }
    }
  }

  private normalizeBilling(dto: {
    billingMode?: PartnerAppBillingMode;
    perCallUsd?: number;
    monthlyFlatUsd?: number;
    monthlyCapUsd?: number;
  }): {
    billingMode: PartnerAppBillingMode;
    perCallUsd: string;
    monthlyFlatUsd: string;
    monthlyCapUsd: string;
  } {
    const mode = dto.billingMode ?? 'per_call';
    if (mode !== 'flat' && mode !== 'per_call') {
      throw new BadRequestException("billingMode must be 'flat' or 'per_call'");
    }
    const perCall = dto.perCallUsd ?? 0.001;
    const flat = dto.monthlyFlatUsd ?? 0;
    const cap = dto.monthlyCapUsd ?? 100;
    if (perCall < 0 || flat < 0 || cap < 0) throw new BadRequestException('billing amounts must be >= 0');
    return {
      billingMode: mode,
      perCallUsd: perCall.toFixed(4),
      monthlyFlatUsd: flat.toFixed(2),
      monthlyCapUsd: cap.toFixed(2),
    };
  }
}
