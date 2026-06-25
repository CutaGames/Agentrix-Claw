import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetTeamService, ALL_TEAM_ROLES, GrantTeamMemberDto } from './pet-team.service';

/**
 * Phase 6 M2 — multi-pet team controller.
 * Mounted at /api/v1/pet/team.
 *
 * Auth: JwtAuthGuard. The caller's user must own the LivingPet referenced by
 * `parentLivingPetId`. We re-check on every write.
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/team')
export class PetTeamController {
  constructor(
    private readonly service: PetTeamService,
    @InjectRepository(LivingPet)
    private readonly petRepo: Repository<LivingPet>,
  ) {}

  @Get('roles')
  listRoles() {
    return { roles: ALL_TEAM_ROLES };
  }

  @Get(':parentLivingPetId')
  async list(@Param('parentLivingPetId') parentLivingPetId: string, @Req() req: any) {
    const userId = uid(req);
    await this.assertOwn(parentLivingPetId, userId);
    const rows = await this.service.list(parentLivingPetId);
    return { items: rows.map((r) => this.service.toDto(r)) };
  }

  @Post(':parentLivingPetId/members')
  async grant(
    @Param('parentLivingPetId') parentLivingPetId: string,
    @Body() body: GrantTeamMemberDto,
    @Req() req: any,
  ) {
    const userId = uid(req);
    await this.assertOwn(parentLivingPetId, userId);
    const row = await this.service.grant(parentLivingPetId, userId, body);
    return this.service.toDto(row);
  }

  @Patch(':parentLivingPetId/members/:memberId')
  async updateScope(
    @Param('parentLivingPetId') parentLivingPetId: string,
    @Param('memberId') memberId: string,
    @Body() body: { scope?: Record<string, unknown>; daily_budget_usd?: number; display_name?: string },
    @Req() req: any,
  ) {
    const userId = uid(req);
    await this.assertOwn(parentLivingPetId, userId);
    const row = await this.service.updateScope(memberId, parentLivingPetId, {
      scope: body.scope,
      dailyBudgetUsd: body.daily_budget_usd,
      displayName: body.display_name,
    });
    return this.service.toDto(row);
  }

  @Put(':parentLivingPetId/members/:memberId/pause')
  async pause(
    @Param('parentLivingPetId') parentLivingPetId: string,
    @Param('memberId') memberId: string,
    @Req() req: any,
  ) {
    const userId = uid(req);
    await this.assertOwn(parentLivingPetId, userId);
    return this.service.toDto(await this.service.pause(memberId, parentLivingPetId));
  }

  @Put(':parentLivingPetId/members/:memberId/resume')
  async resume(
    @Param('parentLivingPetId') parentLivingPetId: string,
    @Param('memberId') memberId: string,
    @Req() req: any,
  ) {
    const userId = uid(req);
    await this.assertOwn(parentLivingPetId, userId);
    return this.service.toDto(await this.service.resume(memberId, parentLivingPetId));
  }

  @Delete(':parentLivingPetId/members/:memberId')
  async revoke(
    @Param('parentLivingPetId') parentLivingPetId: string,
    @Param('memberId') memberId: string,
    @Req() req: any,
  ) {
    const userId = uid(req);
    await this.assertOwn(parentLivingPetId, userId);
    return this.service.toDto(await this.service.revoke(memberId, parentLivingPetId));
  }

  // ─────────────────────────────────────────────────────────────────────
  // Multi-Agent v1 W3.7 — simplified PATCH endpoint (no parentLivingPetId)
  // for MemberSettingsModal. Backend looks up parentLivingPetId from the
  // member row, then enforces tier-based budget cap (R8.7).
  // ─────────────────────────────────────────────────────────────────────

  @Patch(':memberId')
  async updateMember(
    @Param('memberId') memberId: string,
    @Body() body: {
      role?: string;
      displayName?: string;
      dailyBudgetUsd?: number;
      scope?: Record<string, unknown>;
      status?: 'active' | 'paused';
    },
    @Req() req: any,
  ) {
    const userId = uid(req);
    const result = await this.service.updateMemberV2(userId, memberId, body);
    return this.service.toDto(result);
  }

  // ───────── private ─────────

  private async assertOwn(parentLivingPetId: string, userId: string): Promise<void> {
    if (!parentLivingPetId) throw new BadRequestException('parentLivingPetId required');
    const pet = await this.petRepo.findOne({ where: { id: parentLivingPetId } });
    if (!pet) throw new BadRequestException('parent living pet not found');
    if (pet.userId !== userId) throw new ForbiddenException('not your pet');
  }
}

function uid(req: any): string {
  const u = req?.user?.userId || req?.user?.sub || req?.user?.id;
  if (!u) throw new ForbiddenException('no user context');
  return u;
}
