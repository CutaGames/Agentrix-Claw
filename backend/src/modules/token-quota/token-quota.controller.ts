import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { TokenQuotaService } from './token-quota.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('token-quota')
@UseGuards(JwtAuthGuard)
export class TokenQuotaController {
  constructor(private readonly quotaService: TokenQuotaService) {}

  /**
   * GET /api/token-quota/me
   * Returns the current period's token usage status.
   * Used by the mobile energy bar component.
   */
  @Get('me')
  async getMyQuota(@Request() req: any) {
    return this.quotaService.getQuotaStatus(req.user.id);
  }
}
