import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetNftService, CreateIntentDto, SUPPORTED_CHAINS, MIN_INTIMACY_LEVEL } from './pet-nft.service';

/**
 * Phase 6 M3 — pet NFT mint intent controller.
 * Mounted at /api/v1/pet/nft.
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/nft')
export class PetNftController {
  constructor(private readonly service: PetNftService) {}

  @Get('config')
  config() {
    return {
      min_intimacy_level: MIN_INTIMACY_LEVEL,
      supported_chains: SUPPORTED_CHAINS,
    };
  }

  @Get('intents')
  async listMine(@Req() req: any) {
    const userId = uid(req);
    const items = await this.service.list(userId);
    return { items: items.map((i) => this.service.toDto(i)) };
  }

  @Get('intents/:id')
  async get(@Param('id') id: string, @Req() req: any) {
    const userId = uid(req);
    return this.service.toDto(await this.service.get(userId, id));
  }

  @Post('living-pets/:livingPetId/intents')
  async create(
    @Param('livingPetId') livingPetId: string,
    @Body() body: CreateIntentDto,
    @Req() req: any,
  ) {
    const userId = uid(req);
    const row = await this.service.create(userId, livingPetId, body);
    return this.service.toDto(row);
  }

  @Post('intents/:id/cancel')
  async cancel(@Param('id') id: string, @Req() req: any) {
    const userId = uid(req);
    return this.service.toDto(await this.service.cancel(userId, id));
  }
}

function uid(req: any): string {
  const u = req?.user?.userId || req?.user?.sub || req?.user?.id;
  if (!u) throw new ForbiddenException('no user context');
  return u;
}
