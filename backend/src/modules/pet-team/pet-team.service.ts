import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PetTeamMember,
  PetTeamRole,
  PetTeamMemberStatus,
} from '../../entities/pet-team-member.entity';

/**
 * Phase 6 M2 — multi-pet team service.
 *
 * Public API:
 *   list(parentLivingPetId)
 *   grant(parentLivingPetId, userId, dto)
 *   updateScope(memberId, parentLivingPetId, partial)
 *   pause(memberId, parentLivingPetId)
 *   resume(memberId, parentLivingPetId)
 *   revoke(memberId, parentLivingPetId)
 *
 * Authorisation note: callers must verify that `userId === livingPet.userId`
 * BEFORE calling grant/update/etc. The service does not look up LivingPet
 * itself to keep the dependency tree shallow.
 */
export const ALL_TEAM_ROLES: PetTeamRole[] = [
  'ceo', 'dev', 'qa_ops', 'growth', 'ops',
  'media', 'ecosystem', 'community', 'brand',
  'hunter', 'treasury',
];

export interface GrantTeamMemberDto {
  role: PetTeamRole;
  soulTemplateId: string;
  displayName?: string;
  scope?: Record<string, unknown>;
  dailyBudgetUsd?: number;
  walletAddress?: string | null;
}

@Injectable()
export class PetTeamService {
  constructor(
    @InjectRepository(PetTeamMember)
    private readonly repo: Repository<PetTeamMember>,
  ) {}

  async list(parentLivingPetId: string): Promise<PetTeamMember[]> {
    if (!parentLivingPetId) throw new BadRequestException('parentLivingPetId required');
    return this.repo.find({
      where: { parentLivingPetId },
      order: { createdAt: 'ASC' },
    });
  }

  async grant(
    parentLivingPetId: string,
    userId: string,
    dto: GrantTeamMemberDto,
  ): Promise<PetTeamMember> {
    if (!parentLivingPetId || !userId) {
      throw new BadRequestException('parentLivingPetId and userId required');
    }
    if (!ALL_TEAM_ROLES.includes(dto.role)) {
      throw new BadRequestException(`role must be one of ${ALL_TEAM_ROLES.join(',')}`);
    }
    if (!dto.soulTemplateId || dto.soulTemplateId.length > 64) {
      throw new BadRequestException('soulTemplateId required (≤64 chars)');
    }
    const existing = await this.repo.findOne({
      where: { parentLivingPetId, role: dto.role },
    });
    if (existing) {
      throw new BadRequestException(`role=${dto.role} already granted on this pet`);
    }
    const row = this.repo.create({
      parentLivingPetId,
      userId,
      role: dto.role,
      soulTemplateId: dto.soulTemplateId,
      displayName: (dto.displayName || dto.role).slice(0, 64),
      scope: dto.scope || {},
      dailyBudgetUsd: (typeof dto.dailyBudgetUsd === 'number' ? dto.dailyBudgetUsd : 0.5).toFixed(2) as any,
      walletAddress: dto.walletAddress ?? null,
      status: 'active',
    });
    return this.repo.save(row);
  }

  async updateScope(
    memberId: string,
    parentLivingPetId: string,
    patch: { scope?: Record<string, unknown>; dailyBudgetUsd?: number; displayName?: string },
  ): Promise<PetTeamMember> {
    const row = await this.requireOwn(memberId, parentLivingPetId);
    if (patch.scope) row.scope = patch.scope;
    if (typeof patch.dailyBudgetUsd === 'number') {
      if (patch.dailyBudgetUsd < 0) throw new BadRequestException('dailyBudgetUsd >= 0');
      row.dailyBudgetUsd = patch.dailyBudgetUsd.toFixed(2) as any;
    }
    if (patch.displayName) row.displayName = patch.displayName.slice(0, 64);
    return this.repo.save(row);
  }

  async setStatus(
    memberId: string,
    parentLivingPetId: string,
    status: PetTeamMemberStatus,
  ): Promise<PetTeamMember> {
    const row = await this.requireOwn(memberId, parentLivingPetId);
    if (!['active', 'paused', 'revoked'].includes(status)) {
      throw new BadRequestException('invalid status');
    }
    row.status = status;
    return this.repo.save(row);
  }

  pause(memberId: string, parentLivingPetId: string) {
    return this.setStatus(memberId, parentLivingPetId, 'paused');
  }
  resume(memberId: string, parentLivingPetId: string) {
    return this.setStatus(memberId, parentLivingPetId, 'active');
  }
  revoke(memberId: string, parentLivingPetId: string) {
    return this.setStatus(memberId, parentLivingPetId, 'revoked');
  }

  toDto(m: PetTeamMember) {
    return {
      id: m.id,
      parent_living_pet_id: m.parentLivingPetId,
      role: m.role,
      soul_template_id: m.soulTemplateId,
      display_name: m.displayName,
      scope: m.scope || {},
      daily_budget_usd: Number(m.dailyBudgetUsd),
      wallet_address: m.walletAddress,
      status: m.status,
      created_at: m.createdAt?.getTime?.() ?? null,
      updated_at: m.updatedAt?.getTime?.() ?? null,
    };
  }

  private async requireOwn(memberId: string, parentLivingPetId: string): Promise<PetTeamMember> {
    const row = await this.repo.findOne({ where: { id: memberId } });
    if (!row) throw new NotFoundException('team member not found');
    if (row.parentLivingPetId !== parentLivingPetId) {
      throw new BadRequestException('team member does not belong to this pet');
    }
    return row;
  }
}
