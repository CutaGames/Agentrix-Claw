import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrivacyFenceService, SensitiveCategory } from './privacy-fence.service';
import { CoSignService } from './co-sign.service';

/**
 * 顿领 §13 隐私围栏 + L3 多端协签 (P3-7)
 *   POST /api/v1/privacy/items
 *   GET  /api/v1/privacy/items?category=&family_partition=
 *   GET  /api/v1/privacy/items/:id
 *   POST /api/v1/privacy/grants
 *   POST /api/v1/privacy/grants/:id/revoke
 *   GET  /api/v1/privacy/audit?limit=
 *
 *   POST /api/v1/cosign                    create
 *   POST /api/v1/cosign/:id/sign           multi-surface sign
 *   POST /api/v1/cosign/:id/reject
 *   GET  /api/v1/cosign/:id
 *   GET  /api/v1/cosign?status=
 */
@UseGuards(JwtAuthGuard)
@Controller('v1')
export class PrivacyFenceController {
  constructor(
    private readonly fence: PrivacyFenceService,
    private readonly cosign: CoSignService,
  ) {}

  private uid(req: any) {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post('privacy/items')
  write(@Req() req: any, @Body() body: any) {
    return this.fence.write(this.uid(req), body);
  }

  @Get('privacy/items')
  list(@Req() req: any, @Query('category') category?: SensitiveCategory, @Query('family_partition') fp?: string) {
    return this.fence.list(this.uid(req), { category, family_partition: fp });
  }

  @Get('privacy/items/:id')
  read(@Req() req: any, @Param('id') id: string) {
    return this.fence.read(this.uid(req), id);
  }

  @Post('privacy/grants')
  grant(@Req() req: any, @Body() body: any) {
    return this.fence.grant(this.uid(req), body);
  }

  @Post('privacy/grants/:id/revoke')
  revoke(@Req() req: any, @Param('id') id: string) {
    return this.fence.revokeGrant(this.uid(req), id);
  }

  @Get('privacy/audit')
  audit(@Query('limit') limit?: string) {
    return this.fence.recentAudit(Number(limit) || 50);
  }

  @Post('cosign')
  createCoSign(@Req() req: any, @Body() body: any) {
    return this.cosign.create(this.uid(req), body);
  }

  @Post('cosign/:id/sign')
  sign(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.cosign.sign(this.uid(req), id, body);
  }

  @Post('cosign/:id/reject')
  rejectCoSign(@Req() req: any, @Param('id') id: string) {
    return this.cosign.reject(this.uid(req), id);
  }

  @Get('cosign/:id')
  getCoSign(@Param('id') id: string) {
    return this.cosign.get(id);
  }

  @Get('cosign')
  listCoSign(@Req() req: any, @Query('status') status?: any) {
    return this.cosign.list(this.uid(req), status);
  }
}
