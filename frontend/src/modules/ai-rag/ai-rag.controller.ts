import { Controller, Post, Body, Get, Query } from '@nestjs/common';
import { RAGAPIService } from './services/rag-api.service';
import { RAGSearchRequest, RAGSearchResponse } from './interfaces/rag.interface';

@Controller('api/ai/rag')
export class AIRAGController {
  constructor(private ragService: RAGAPIService) {}

  /**
   * RAG 搜索接口
   * POST /api/ai/rag/search
   * 
   * 为 AI 模型提供智能推荐和语义检索能力
   */
  @Post('search')
  async search(@Body() request: RAGSearchRequest): Promise<RAGSearchResponse> {
    return this.ragService.search(request);
  }

  /**
   * 快速搜索接口（简化版）
   * GET /api/ai/rag/search?q={query}&limit={limit}
   */
  @Get('search')
  async quickSearch(
    @Query('q') query: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
  ): Promise<RAGSearchResponse> {
    const request: RAGSearchRequest = {
      query,
      limit: limit ? parseInt(limit, 10) : 10,
      filters: {
        category,
        priceMin: priceMin ? parseFloat(priceMin) : undefined,
        priceMax: priceMax ? parseFloat(priceMax) : undefined,
      },
    };

    return this.ragService.search(request);
  }
}

