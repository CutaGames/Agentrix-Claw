import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetGreetingService } from './pet-greeting.service';

/**
 * Greeting Card API — per docs §6.2.
 *
 *   GET  /api/v1/pet/greeting/catalog                 → template list (public)
 *   POST /api/v1/pet/greeting/send                    → send new card
 *   GET  /api/v1/pet/greeting/inbox                   → incoming cards
 *   GET  /api/v1/pet/greeting/outbox                  → sent cards
 *   GET  /api/v1/pet/greeting/by-token/:token  (pub.) → card preview
 *   POST /api/v1/pet/greeting/by-token/:token/open    → mark as opened
 *   POST /api/v1/pet/greeting/by-token/:token/redeem  → redeem AXP reward
 */
@Controller('v1/pet/greeting')
export class PetGreetingController {
  constructor(private readonly service: PetGreetingService) {}

  @Get('catalog')
  catalog() {
    return this.service.catalog();
  }

  @Get('by-token/:token')
  peek(@Param('token') token: string) {
    return this.service.peek(token);
  }

  @Post('by-token/:token/open')
  async open(@Param('token') token: string, @Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.markOpened(token, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('send')
  async send(
    @Req() req: any,
    @Body()
    body: {
      sender_pet_id: string;
      receiver_id?: string;
      receiver_hint?: string;
      template: string;
      message?: string;
    },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.send({ senderId: userId, ...body });
  }

  @UseGuards(JwtAuthGuard)
  @Get('inbox')
  async inbox(@Req() req: any, @Query('limit') limit?: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.inbox(userId, limit ? Number(limit) : 20);
  }

  @UseGuards(JwtAuthGuard)
  @Get('outbox')
  async outbox(@Req() req: any, @Query('limit') limit?: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.outbox(userId, limit ? Number(limit) : 20);
  }

  @UseGuards(JwtAuthGuard)
  @Post('by-token/:token/redeem')
  async redeem(@Param('token') token: string, @Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.redeem(token, userId);
  }
}
