import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  MemoryWikiService,
  CreateWikiPageDto,
  UpdateWikiPageDto,
} from './memory-wiki.service';

@ApiTags('memory-wiki')
@Controller('memory-wiki')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MemoryWikiController {
  constructor(private readonly wikiService: MemoryWikiService) {}

  @Get('pages')
  @ApiOperation({ summary: 'List wiki pages' })
  async listPages(
    @Request() req: any,
    @Query('agentId') agentId?: string,
    @Query('search') search?: string,
    @Query('tag') tag?: string,
    @Query('limit') limit?: string,
  ) {
    return this.wikiService.listPages(req.user.id, {
      agentId,
      search,
      tag,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get a wiki page by slug' })
  async getPage(@Request() req: any, @Param('slug') slug: string) {
    return this.wikiService.getPage(req.user.id, slug);
  }

  @Post('pages')
  @ApiOperation({ summary: 'Create a wiki page' })
  async createPage(@Request() req: any, @Body() dto: CreateWikiPageDto) {
    return this.wikiService.createPage(req.user.id, dto);
  }

  @Put('pages/:slug')
  @ApiOperation({ summary: 'Update a wiki page' })
  async updatePage(
    @Request() req: any,
    @Param('slug') slug: string,
    @Body() dto: UpdateWikiPageDto,
  ) {
    return this.wikiService.updatePage(req.user.id, slug, dto);
  }

  @Delete('pages/:slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a wiki page' })
  async deletePage(@Request() req: any, @Param('slug') slug: string) {
    const deleted = await this.wikiService.deletePage(req.user.id, slug);
    return { deleted };
  }

  @Get('graph')
  @ApiOperation({ summary: 'Get wiki knowledge graph' })
  async getGraph(
    @Request() req: any,
    @Query('agentId') agentId?: string,
  ) {
    return this.wikiService.buildGraph(req.user.id, agentId);
  }

  @Post('resolve-links')
  @ApiOperation({ summary: 'Resolve [[wikilinks]] in content' })
  async resolveLinks(
    @Request() req: any,
    @Body() body: { content: string },
  ) {
    const resolved = await this.wikiService.resolveLinks(req.user.id, body.content);
    return { resolved };
  }
}
