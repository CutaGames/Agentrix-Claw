import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MemoryTier, MemoryTiersService, UpsertMemoryInput } from './memory-tiers.service';

/**
 * 顿领 §5.5 Memory 4-tier API
 *
 *   POST   /api/v1/memory/upsert     {tier, text, key?, tags?, agent_id?, ttl_ms?}
 *   GET    /api/v1/memory/:tier      ?tag=&agent_id=&limit=
 *   GET    /api/v1/memory/item/:id
 *   DELETE /api/v1/memory/item/:id
 *   GET    /api/v1/memory/search     ?q=&tier=&limit=
 *   GET    /api/v1/memory/stats
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/memory')
export class MemoryTiersController {
  constructor(private readonly service: MemoryTiersService) {}

  private uid(req: any) {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post('upsert')
  upsert(@Req() req: any, @Body() body: UpsertMemoryInput) {
    return this.service.upsert(this.uid(req), body);
  }

  @Get('stats')
  stats(@Req() req: any) {
    return this.service.stats(this.uid(req));
  }

  @Get('search')
  search(
    @Req() req: any,
    @Query('q') q: string,
    @Query('tier') tier?: MemoryTier,
    @Query('limit') limit?: string,
  ) {
    return this.service.search(this.uid(req), q || '', {
      tier,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('item/:id')
  getOne(@Req() req: any, @Param('id') id: string) {
    return this.service.get(this.uid(req), id);
  }

  @Delete('item/:id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.delete(this.uid(req), id);
  }

  @Get(':tier')
  list(
    @Req() req: any,
    @Param('tier') tier: MemoryTier,
    @Query('tag') tag?: string,
    @Query('agent_id') agentId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.list(this.uid(req), tier, {
      tag,
      agent_id: agentId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
