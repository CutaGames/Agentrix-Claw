import { Controller, Get, Query } from '@nestjs/common';
import { MarketSkinsService, MarketSkinsQuery } from './market-skins.service';

/**
 * Marketplace Ecosystem — Public skins browsing API.
 *
 *   GET /api/v1/market/skins   Browse approved public skins (no auth required)
 *
 * Supports:
 *   - sort: featured | newest | popular
 *   - clan: A | B | C | D | E | F
 *   - limit: 1-100 (default 24)
 *   - cursor: opaque pagination cursor
 */
@Controller('v1/market')
export class MarketSkinsController {
  constructor(private readonly marketSkinsService: MarketSkinsService) {}

  @Get('skins')
  async listSkins(
    @Query('sort') sort?: 'featured' | 'newest' | 'popular',
    @Query('clan') clan?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const query: MarketSkinsQuery = {
      sort: sort || 'featured',
      clan: clan && /^[A-F]$/i.test(clan) ? clan.toUpperCase() : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      cursor: cursor || undefined,
    };

    return this.marketSkinsService.findSkins(query);
  }
}
