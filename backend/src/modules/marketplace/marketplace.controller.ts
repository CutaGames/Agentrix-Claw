import { Body, Controller, Get, Post, Query, UseGuards, Request, Param } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { AgentMarketplaceService } from './agent-marketplace.service';
import { AssetIngestorService } from './services/asset-ingestor.service';
import { AssetTradingService } from './services/asset-trading.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MarketplaceAssetType } from '../../entities/marketplace-asset.entity';

@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly agentMarketplaceService: AgentMarketplaceService,
    private readonly assetIngestorService: AssetIngestorService,
    private readonly assetTradingService: AssetTradingService,
  ) {}

  @Get('assets')
  async getAssets(
    @Query('type') type?: string,
    @Query('chain') chain?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.marketplaceService.getAssets({
      type,
      chain,
      search,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
  }

  @Get('assets/search')
  async searchAssets(
    @Query('query') query?: string,
    @Query('type') type?: MarketplaceAssetType,
    @Query('chain') chain?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
  ) {
    return this.marketplaceService.searchAssets(query || '', {
      type,
      chain,
      priceMin: priceMin ? parseFloat(priceMin) : undefined,
      priceMax: priceMax ? parseFloat(priceMax) : undefined,
    });
  }

  @Get('assets/recommend')
  async getRecommendedAssets(
    @Request() req: any,
    @Query('limit') limit = '10',
  ) {
    return this.marketplaceService.getRecommendedAssets(req.user?.id, parseInt(limit, 10));
  }

  @UseGuards(JwtAuthGuard)
  @Post('ingest')
  async ingest(@Body() body: { sources?: string[] }) {
    const result = await this.assetIngestorService.refreshSources(body?.sources);
    return { success: true, result };
  }

  @UseGuards(JwtAuthGuard)
  @Post('swap')
  async executeSwap(@Request() req: any, @Body() body: any) {
    return this.assetTradingService.executeSwap(req.user?.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('nft/purchase')
  async purchaseNFT(
    @Request() req: any,
    @Body() body: { nftId: string; price: string },
  ) {
    return this.assetTradingService.executeNFTPurchase(req.user?.id, body.nftId, body.price);
  }

  // ========== Agent Marketplace ==========

  @Get('agents/search')
  async searchAgents(
    @Query('keyword') keyword?: string,
    @Query('category') category?: string,
    @Query('minRating') minRating?: string,
    @Query('sortBy') sortBy?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.agentMarketplaceService.searchAgents({
      keyword,
      category,
      minRating: minRating ? parseFloat(minRating) : undefined,
      sortBy: sortBy as any,
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('agents/recommend')
  async recommendAgents(@Request() req: any, @Query('limit') limit = '10') {
    return this.agentMarketplaceService.recommendAgents(
      req.user?.id,
      parseInt(limit, 10),
    );
  }

  @Get('agents/:agentId/stats')
  async getAgentStats(@Param('agentId') agentId: string) {
    return this.agentMarketplaceService.getAgentStats(agentId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('agents/:agentId/call')
  async recordAgentCall(
    @Request() req: any,
    @Param('agentId') agentId: string,
  ) {
    await this.agentMarketplaceService.recordAgentCall(agentId, req.user?.id);
    return { success: true };
  }

  @Get('agents/rankings')
  async getAgentRankings(@Query('agentIds') agentIds?: string) {
    const agentIdList = agentIds ? agentIds.split(',') : [];
    return this.agentMarketplaceService.getAgentRankings(agentIdList);
  }
}

