import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierRouterService } from './tier-router.service';

/**
 * Tier Router API.
 *
 *   GET /v1/compute/devices?requires=pet_gen|video_gen|llm
 *     → Returns the online capable desktops for this user, so mobile UI
 *       can show "✅ Your Alienware 4090 is online · tap to route here"
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/compute')
export class TierRouterController {
  constructor(private readonly router: TierRouterService) {}

  @Get('devices')
  async listDevices(
    @Req() req: any,
    @Query('requires') requires: 'pet_gen' | 'video_gen' | 'llm' = 'pet_gen',
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const devices = await this.router.listCapableDevices(userId, requires);
    return { items: devices, total: devices.length };
  }
}
