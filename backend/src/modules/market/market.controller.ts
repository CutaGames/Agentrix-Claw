import { Controller, Get, Query } from '@nestjs/common';
import { MarketService, UnifiedSearchResponse } from './market.service';

/**
 * MarketController — Marketplace Ecosystem 统一市场端点。
 *
 *   GET /api/v1/market/search?query=xxx&limit=N  跨表统一搜索
 */
@Controller('v1/market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  /**
   * 统一搜索端点 — 跨 pet_skins、skill_listings、merchant_tasks 三表搜索。
   * 返回按类别分组的结果 + 各类别计数。
   *
   * 无需认证（公开端点）。
   */
  @Get('search')
  async search(
    @Query('query') query: string,
    @Query('limit') limit?: string,
  ): Promise<UnifiedSearchResponse> {
    const searchQuery = (query || '').trim();
    if (!searchQuery) {
      return {
        skins: { items: [], count: 0 },
        skills: { items: [], count: 0 },
        tasks: { items: [], count: 0 },
      };
    }

    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 5, 1), 50) : 5;
    return this.marketService.unifiedSearch(searchQuery, parsedLimit);
  }
}
