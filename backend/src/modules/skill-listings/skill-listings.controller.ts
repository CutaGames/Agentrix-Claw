import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SkillListingsService, SkillStatus } from './skill-listings.service';

/**
 * 顿领 §11 Skill Marketplace + 开发者后台 (P2-6)
 *   POST /api/v1/skill-listings                       create draft
 *   POST /api/v1/skill-listings/:id/submit            submit for review
 *   POST /api/v1/skill-listings/:id/review            mock review (approve/reject)
 *   GET  /api/v1/skill-listings?status=&category=&developer_user_id=
 *   GET  /api/v1/skill-listings/:id
 *   POST /api/v1/skill-listings/:id/install           install (count++)
 *   POST /api/v1/skill-listings/:id/invoke            invoke (revenue split)
 *   GET  /api/v1/skill-listings/me/earnings           dev dashboard
 *   GET  /api/v1/skill-listings/:id/invokes           recent invokes
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/skill-listings')
export class SkillListingsController {
  constructor(private readonly service: SkillListingsService) {}

  private uid(req: any) {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    return this.service.createListing(this.uid(req), body);
  }

  @Post(':id/submit')
  submit(@Req() req: any, @Param('id') id: string) {
    return this.service.submitForReview(this.uid(req), id);
  }

  @Post(':id/review')
  review(@Param('id') id: string, @Body() body: { approve: boolean; note?: string }) {
    return this.service.reviewListing(id, body);
  }

  @Get()
  list(
    @Query('status') status?: SkillStatus,
    @Query('category') category?: string,
    @Query('developer_user_id') dev?: string,
  ) {
    return this.service.list({ status, category, developer_user_id: dev });
  }

  @Get('me/earnings')
  earnings(@Req() req: any) {
    return this.service.developerEarnings(this.uid(req));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post(':id/install')
  install(@Req() req: any, @Param('id') id: string) {
    return this.service.install(this.uid(req), id);
  }

  @Post(':id/invoke')
  invoke(@Req() req: any, @Param('id') id: string) {
    return this.service.invoke(this.uid(req), id);
  }

  @Get(':id/invokes')
  invokes(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.service.recentInvokes(id, Number(limit) || 50);
  }
}
