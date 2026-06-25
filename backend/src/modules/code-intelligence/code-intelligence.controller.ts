import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CodeIntelligenceService } from './code-intelligence.service';

@ApiTags('Code Intelligence')
@Controller('code-intelligence')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CodeIntelligenceController {
  constructor(private readonly codeIntelligenceService: CodeIntelligenceService) {}

  @Post('index')
  @ApiOperation({ summary: 'Build or refresh the workspace AST/LSP/semantic code index' })
  @ApiResponse({ status: 201, description: 'Code index refreshed' })
  async indexWorkspace(@Body() body: { rootPath?: string; maxFiles?: number; maxFileBytes?: number }) {
    return this.codeIntelligenceService.indexWorkspace(body || {});
  }

  @Get('status')
  @ApiOperation({ summary: 'Get current code index status' })
  @ApiResponse({ status: 200, description: 'Code index status returned' })
  async getStatus() {
    return this.codeIntelligenceService.getStatus();
  }

  @Get('symbols')
  @ApiOperation({ summary: 'Search indexed workspace symbols' })
  @ApiResponse({ status: 200, description: 'Matching symbols returned' })
  async searchSymbols(@Query('query') query = '', @Query('limit') limit?: string) {
    return {
      symbols: this.codeIntelligenceService.searchSymbols(query, limit ? parseInt(limit, 10) : undefined),
    };
  }

  @Get('documents/symbols')
  @ApiOperation({ summary: 'Return LSP-style document symbols for a file path' })
  @ApiResponse({ status: 200, description: 'Document symbols returned' })
  async getDocumentSymbols(@Query('path') filePath = '') {
    return {
      symbols: this.codeIntelligenceService.getDocumentSymbols(filePath),
    };
  }

  @Get('semantic-search')
  @ApiOperation({ summary: 'Search indexed code chunks with the local semantic vector index' })
  @ApiResponse({ status: 200, description: 'Semantic code search results returned' })
  async semanticSearch(@Query('query') query = '', @Query('limit') limit?: string) {
    return {
      results: this.codeIntelligenceService.semanticSearch(query, limit ? parseInt(limit, 10) : undefined),
    };
  }

  @Get('references')
  @ApiOperation({ summary: 'Find definition and call references for a symbol' })
  @ApiResponse({ status: 200, description: 'References returned' })
  async findReferences(@Query('symbol') symbol = '', @Query('limit') limit?: string) {
    return {
      references: this.codeIntelligenceService.findReferences(symbol, limit ? parseInt(limit, 10) : undefined),
    };
  }

  @Get('call-graph')
  @ApiOperation({ summary: 'Return callers/callees for an indexed symbol' })
  @ApiResponse({ status: 200, description: 'Call graph returned' })
  async getCallGraph(
    @Query('symbol') symbol = '',
    @Query('direction') direction: 'callers' | 'callees' | 'both' = 'both',
    @Query('limit') limit?: string,
  ) {
    return {
      edges: this.codeIntelligenceService.getCallGraph(symbol, direction, limit ? parseInt(limit, 10) : undefined),
    };
  }

  @Get('hybrid-search')
  @ApiOperation({ summary: 'Search symbols, references, call graph, and semantic chunks with fused scores' })
  @ApiResponse({ status: 200, description: 'Hybrid search results returned' })
  async hybridSearch(@Query('query') query = '', @Query('limit') limit?: string) {
    return {
      results: this.codeIntelligenceService.hybridSearch(query, limit ? parseInt(limit, 10) : undefined),
    };
  }
}