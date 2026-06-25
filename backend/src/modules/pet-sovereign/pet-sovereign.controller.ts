import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PetSovereignService,
  EnableMpcDto,
  EnableSelfDto,
  UpdateChainsDto,
  SetMemoryUriDto,
  MIN_SOVEREIGN_INTIMACY,
  SUPPORTED_CHAINS,
} from './pet-sovereign.service';
import { PetSovereignStatus } from '../../entities/pet-sovereign-profile.entity';

/**
 * Phase 6 M6 — sovereign pet REST surface.
 * Mounted at /api/v1/pet/sovereign.
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/sovereign')
export class PetSovereignController {
  constructor(private readonly service: PetSovereignService) {}

  @Get('config')
  config() {
    return {
      min_intimacy_level: MIN_SOVEREIGN_INTIMACY,
      supported_chains: SUPPORTED_CHAINS,
      custody_modes: ['platform', 'mpc', 'self'],
      memory_storages: ['platform', 'ipfs', 'arweave'],
    };
  }

  @Get(':livingPetId')
  async get(@Param('livingPetId') livingPetId: string, @Req() req: any) {
    const userId = uid(req);
    return this.service.toDto(await this.service.getOrInit(userId, livingPetId));
  }

  @Post(':livingPetId/enable-mpc')
  async enableMpc(
    @Param('livingPetId') livingPetId: string,
    @Body() body: EnableMpcDto,
    @Req() req: any,
  ) {
    const userId = uid(req);
    return this.service.toDto(await this.service.enableMpc(userId, livingPetId, body));
  }

  @Post(':livingPetId/enable-self')
  async enableSelf(
    @Param('livingPetId') livingPetId: string,
    @Body() body: EnableSelfDto,
    @Req() req: any,
  ) {
    const userId = uid(req);
    return this.service.toDto(await this.service.enableSelf(userId, livingPetId, body));
  }

  @Post(':livingPetId/revert')
  async revert(@Param('livingPetId') livingPetId: string, @Req() req: any) {
    const userId = uid(req);
    return this.service.toDto(await this.service.revertToPlatform(userId, livingPetId));
  }

  @Patch(':livingPetId/chains')
  async chains(
    @Param('livingPetId') livingPetId: string,
    @Body() body: UpdateChainsDto,
    @Req() req: any,
  ) {
    const userId = uid(req);
    return this.service.toDto(await this.service.updateChains(userId, livingPetId, body));
  }

  @Patch(':livingPetId/memory')
  async memory(
    @Param('livingPetId') livingPetId: string,
    @Body() body: SetMemoryUriDto,
    @Req() req: any,
  ) {
    const userId = uid(req);
    return this.service.toDto(await this.service.setMemoryUri(userId, livingPetId, body));
  }

  @Patch(':livingPetId/status')
  async status(
    @Param('livingPetId') livingPetId: string,
    @Body() body: { status: PetSovereignStatus },
    @Req() req: any,
  ) {
    const userId = uid(req);
    return this.service.toDto(await this.service.setStatus(userId, livingPetId, body.status));
  }
}

function uid(req: any): string {
  const u = req?.user?.userId || req?.user?.sub || req?.user?.id;
  if (!u) throw new ForbiddenException('no user context');
  return u;
}
