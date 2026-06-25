import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetCoRaisingService } from './pet-coraising.service';

/**
 * Co-Raising API — per docs §6.1.
 *
 *   POST   /api/v1/pet/coraising/invites           → owner: create invite
 *   GET    /api/v1/pet/coraising/invites           → owner: list my invites
 *   DELETE /api/v1/pet/coraising/invites/:id       → owner: cancel invite
 *   GET    /api/v1/pet/coraising/invites/by-token/:token (public)  → preview
 *   POST   /api/v1/pet/coraising/feed              → friend: feed pet via invite
 */
@Controller('v1/pet/coraising')
export class PetCoRaisingController {
  constructor(private readonly service: PetCoRaisingService) {}

  // Public — no auth so friends can peek before signing up
  @Get('invites/by-token/:token')
  peek(@Param('token') token: string) {
    return this.service.peekInvite(token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invites')
  async create(
    @Req() req: any,
    @Body()
    body: {
      agent_account_id: string;
      split_bps?: number;
      max_feeders?: number;
      expires_days?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.createInvite(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('invites')
  async list(@Req() req: any, @Query('limit') limit?: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.listMyInvites(userId, limit ? Number(limit) : 20);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('invites/:id')
  async cancel(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.cancelInvite(userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('feed')
  async feed(
    @Req() req: any,
    @Body() body: { token: string; kind?: string },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null;
    return this.service.feed(userId, { ...body, client_ip: clientIp });
  }
}
