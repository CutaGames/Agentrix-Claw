import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkillListingsService, SkillStatus } from './skill-listings.service';

/**
 * 顿领 §11 Skill Marketplace + 开发者后台 (P2-6)
 *   POST /api/v1/skill-listings                       create draft (auth)
 *   POST /api/v1/skill-listings/:id/submit            submit for review (auth)
 *   POST /api/v1/skill-listings/:id/review            mock review (approve/reject) (auth)
 *   GET  /api/v1/skill-listings?status=&category=&developer_user_id=   (PUBLIC)
 *   GET  /api/v1/skill-listings/:id                                      (PUBLIC)
 *   POST /api/v1/skill-listings/:id/install           install (count++) (auth)
 *   POST /api/v1/skill-listings/:id/invoke            invoke (revenue split) (auth)
 *   GET  /api/v1/skill-listings/me/earnings           dev dashboard (auth)
 *   GET  /api/v1/skill-listings/:id/invokes           recent invokes (auth)
 *
 * NOTE (P0-1 fix 2026-05-12): guard moved from class-level to per-method so
 * the Web /market/skills SSR fetch (no user token) can hit the public list
 * without a 401. Write and account endpoints remain auth-gated.
 */
@Controller('v1/skill-listings')
export class SkillListingsController {
  constructor(private readonly service: SkillListingsService) {}

  private uid(req: any) {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: any, @Body() body: any) {
    return this.service.createListing(this.uid(req), body);
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard)
  submit(@Req() req: any, @Param('id') id: string) {
    return this.service.submitForReview(this.uid(req), id);
  }

  @Post(':id/review')
  @UseGuards(JwtAuthGuard)
  review(@Param('id') id: string, @Body() body: { approve: boolean; note?: string }) {
    return this.service.reviewListing(id, body);
  }

  /** PUBLIC — marketplace browsing, no auth required. */
  @Get()
  list(
    @Query('status') status?: SkillStatus,
    @Query('category') category?: string,
    @Query('developer_user_id') dev?: string,
  ) {
    return this.service.list({ status, category, developer_user_id: dev });
  }

  @Get('me/earnings')
  @UseGuards(JwtAuthGuard)
  earnings(@Req() req: any) {
    return this.service.developerEarnings(this.uid(req));
  }

  /** PUBLIC — individual skill detail, no auth required. */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/install')
  @UseGuards(JwtAuthGuard)
  install(@Req() req: any, @Param('id') id: string) {
    return this.service.install(this.uid(req), id);
  }

  @Post(':id/invoke')
  @UseGuards(JwtAuthGuard)
  invoke(@Req() req: any, @Param('id') id: string) {
    return this.service.invoke(this.uid(req), id);
  }

  @Get(':id/invokes')
  @UseGuards(JwtAuthGuard)
  invokes(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.service.recentInvokes(id, Number(limit) || 50);
  }
}
