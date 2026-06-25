import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetBreedingService } from './pet-breeding.service';

/**
 * Pet Phase 6 S5 — 社交繁育 API
 *   POST /api/v1/pet/breeding/invite      { partnerUserId, initiatorPetSkinId, partnerPetSkinId }
 *   POST /api/v1/pet/breeding/:id/accept
 *   POST /api/v1/pet/breeding/:id/decline
 *   POST /api/v1/pet/breeding/:id/cancel
 *   POST /api/v1/pet/breeding/:id/hatch
 *   GET  /api/v1/pet/breeding/mine
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/breeding')
export class PetBreedingController {
  constructor(private readonly service: PetBreedingService) {}

  @Get('mine')
  async mine(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.listForUser(userId);
  }

  @Post('invite')
  async invite(
    @Req() req: any,
    @Body()
    body: {
      partnerUserId: string;
      initiatorPetSkinId: string;
      partnerPetSkinId: string;
    },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.invite({
      initiatorUserId: userId,
      partnerUserId: body.partnerUserId,
      initiatorPetSkinId: body.initiatorPetSkinId,
      partnerPetSkinId: body.partnerPetSkinId,
    });
  }

  @Post(':id/accept')
  async accept(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.accept(id, userId);
  }

  @Post(':id/decline')
  async decline(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.decline(id, userId);
  }

  @Post(':id/cancel')
  async cancel(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.cancel(id, userId);
  }

  @Post(':id/hatch')
  async hatch(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.hatch(id, userId);
  }
}
