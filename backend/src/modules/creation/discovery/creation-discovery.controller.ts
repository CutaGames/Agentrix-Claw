import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreationDiscoveryService } from './creation-discovery.service';
import type {
  DiscoverCreationsQuery,
  DiscoverCreationsResponse,
  DiscoverMapQuery,
  DiscoverFeedQuery,
  DiscoverAgentSearchQuery,
  DiscoverMode,
  FeedSort,
} from '../../../../shared/types/creation-api';
import type { CreationType, CreationVerb } from '../../../../shared/types/creation';

/**
 * CreationDiscoveryController — 统一发现 REST 入口(world-creation-feed task 3.1)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - design §Components and Interfaces — `GET /v1/creations/discover`(三形态)
 *   - design §Discovery Surfaces — 地图 / 创作流 / Agent 检索三面共用一个查询层
 *   - 需求 1.2 / 1.8 / 4.1 / 5.1 / 5.6 / 13.1
 *
 * 把扁平 query string 解析为判别联合 {@link DiscoverCreationsQuery} 后委托
 * {@link CreationDiscoveryService.discover};业务逻辑全在 service,控制器仅解析与鉴权。
 *
 * `feed` 的 `following` 口径需要浏览者身份:`viewerAccountId` 缺省时回填认证用户 id
 * (社交关注图谱在阶段 8 落地;解析器不可用时 service 内部优雅降级为 newest)。
 */
@ApiTags('creation')
@Controller('v1/creations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CreationDiscoveryController {
  constructor(private readonly discovery: CreationDiscoveryService) {}

  /** GET /v1/creations/discover — 统一发现(mode=map|feed|agentSearch)。 */
  @Get('discover')
  @ApiOperation({ summary: 'Unified discovery: map / feed (TikTok-style) / agentSearch' })
  async discover(
    @Request() req: any,
    @Query() q: Record<string, string>,
  ): Promise<DiscoverCreationsResponse> {
    const userId: string | undefined = req.user?.id ?? req.user?.sub;
    const query = this.parseQuery(q, userId);
    return this.discovery.discover(query);
  }

  // ── 扁平 query → 判别联合 ───────────────────────────────────────

  private parseQuery(
    q: Record<string, string>,
    viewerAccountId?: string,
  ): DiscoverCreationsQuery {
    const mode = (q.mode as DiscoverMode) ?? 'feed';
    if (mode === 'map') return this.parseMap(q);
    if (mode === 'agentSearch') return this.parseAgentSearch(q);
    return this.parseFeed(q, viewerAccountId);
  }

  private parseMap(q: Record<string, string>): DiscoverMapQuery {
    const query: DiscoverMapQuery = { mode: 'map' };
    const { minLat, minLng, maxLat, maxLng } = q;
    if (
      this.isNum(minLat) &&
      this.isNum(minLng) &&
      this.isNum(maxLat) &&
      this.isNum(maxLng)
    ) {
      query.viewport = {
        minLat: Number(minLat),
        minLng: Number(minLng),
        maxLat: Number(maxLat),
        maxLng: Number(maxLng),
      };
    }
    if (this.isNum(q.lat) && this.isNum(q.lng)) {
      query.center = { lat: Number(q.lat), lng: Number(q.lng) };
    }
    if (this.isNum(q.radiusMeters)) query.radiusMeters = Number(q.radiusMeters);
    if (q.type) query.type = q.type as CreationType;
    return query;
  }

  private parseFeed(
    q: Record<string, string>,
    viewerAccountId?: string,
  ): DiscoverFeedQuery {
    const query: DiscoverFeedQuery = { mode: 'feed' };
    if (q.cursor) query.cursor = q.cursor;
    if (this.isNum(q.limit)) query.limit = Number(q.limit);
    if (q.sort) query.sort = q.sort as FeedSort;
    if (this.isNum(q.lat) && this.isNum(q.lng)) {
      query.near = { lat: Number(q.lat), lng: Number(q.lng) };
    }
    // following 口径:显式 viewerAccountId 优先,否则回填认证用户 id。
    query.viewerAccountId = q.viewerAccountId ?? viewerAccountId;
    return query;
  }

  private parseAgentSearch(q: Record<string, string>): DiscoverAgentSearchQuery {
    const query: DiscoverAgentSearchQuery = { mode: 'agentSearch' };
    if (q.query) query.query = q.query;
    if (q.verbs) {
      query.verbs = q.verbs
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean) as CreationVerb[];
    }
    if (q.type) query.type = q.type as CreationType;
    if (this.isNum(q.maxPriceAxp)) query.maxPriceAxp = Number(q.maxPriceAxp);
    if (this.isNum(q.maxPriceUsd)) query.maxPriceUsd = Number(q.maxPriceUsd);
    if (this.isNum(q.lat) && this.isNum(q.lng)) {
      query.near = {
        lat: Number(q.lat),
        lng: Number(q.lng),
        radiusMeters: this.isNum(q.radiusMeters) ? Number(q.radiusMeters) : undefined,
      };
    }
    if (this.isNum(q.minTrustLevel)) {
      query.minTrustLevel = Number(q.minTrustLevel) as DiscoverAgentSearchQuery['minTrustLevel'];
    }
    if (q.cursor) query.cursor = q.cursor;
    if (this.isNum(q.limit)) query.limit = Number(q.limit);
    return query;
  }

  private isNum(v: string | undefined): boolean {
    return v !== undefined && v !== '' && Number.isFinite(Number(v));
  }
}
