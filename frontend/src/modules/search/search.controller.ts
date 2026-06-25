import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SearchService } from './search.service';

@ApiTags('搜索')
@Controller('search')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: '全局搜索' })
  @ApiResponse({ status: 200, description: '返回搜索结果' })
  async search(
    @Request() req,
    @Query('q') query: string,
    @Query('type') type?: string,
    @Query('limit') limit?: number,
  ) {
    if (!query || query.trim().length === 0) {
      return { results: [] };
    }

    return this.searchService.search(req.user.id, query, type, limit);
  }

  @Get('semantic')
  @ApiOperation({ summary: '语义搜索（Marketplace商品）' })
  @ApiResponse({ status: 200, description: '返回语义搜索结果' })
  async semanticSearch(
    @Request() req,
    @Query('q') query: string,
    @Query('topK') topK?: number,
    @Query('category') category?: string,
    @Query('priceMin') priceMin?: number,
    @Query('priceMax') priceMax?: number,
  ) {
    if (!query || query.trim().length === 0) {
      return { results: [] };
    }

    const filters: Record<string, any> = {};
    if (category) filters.category = category;
    if (priceMin !== undefined) filters.priceMin = priceMin;
    if (priceMax !== undefined) filters.priceMax = priceMax;

    return this.searchService.semanticSearch(query, topK || 10, filters);
  }
}

