import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionService } from './subscription.service';

/**
 * Subscription API — per docs §3.
 *
 *   GET /api/v1/subscription          → current user's subscription view
 *   GET /api/v1/subscription/catalog  → public catalog (5 tiers + enterprise)
 *   GET /api/v1/me/quota              → TierQuota for the current user
 */
@Controller('v1')
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  @Get('subscription/catalog')
  catalog() {
    return { tiers: this.service.getCatalog() };
  }

  @UseGuards(JwtAuthGuard)
  @Get('subscription')
  async current(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.getSubscription(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/quota')
  async quota(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.getQuota(userId);
  }
}
