import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PetTeamMember,
  PetTeamRole,
  PetTeamMemberStatus,
} from '../../entities/pet-team-member.entity';
import { Workspace, WorkspacePlan } from '../../entities/workspace.entity';

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
    @InjectRepository(Workspace)
    private readonly workspaceRepo: Repository<Workspace>,
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

  // ─────────────────────────────────────────────────────────────────────
  // Multi-Agent v1 W3.7 — `updateMemberV2` (caller passes only `userId`
  // + `memberId`; we look up parentLivingPetId, enforce tier-based budget
  // cap, and apply the patch in one shot).
  // ─────────────────────────────────────────────────────────────────────

  async updateMemberV2(
    userId: string,
    memberId: string,
    patch: {
      role?: string;
      displayName?: string;
      dailyBudgetUsd?: number;
      scope?: Record<string, unknown>;
      status?: 'active' | 'paused';
    },
  ): Promise<PetTeamMember> {
    const row = await this.repo.findOne({ where: { id: memberId } });
    if (!row) throw new BadRequestException('team member not found');
    if (row.userId !== userId) {
      throw new BadRequestException('not your team member');
    }

    if (patch.role !== undefined) {
      const trimmed = patch.role.trim();
      if (!trimmed || trimmed.length > 30) {
        throw new BadRequestException('role: 1-30 chars required');
      }
      row.role = trimmed as PetTeamMember['role'];
    }
    if (patch.displayName !== undefined) {
      row.displayName = patch.displayName.slice(0, 64);
    }
    if (patch.scope !== undefined) {
      row.scope = patch.scope;
    }
    if (patch.status !== undefined) {
      if (!['active', 'paused'].includes(patch.status)) {
        throw new BadRequestException('status must be active or paused');
      }
      row.status = patch.status;
    }
    if (patch.dailyBudgetUsd !== undefined) {
      const tier = await this.resolveTier(userId);
      const cap = this.budgetCapForTier(tier);
      if (patch.dailyBudgetUsd < 0 || patch.dailyBudgetUsd > cap) {
        throw new BadRequestException(
          `dailyBudgetUsd must be 0 - ${cap.toFixed(2)} for ${tier} subscription tier`,
        );
      }
      row.dailyBudgetUsd = patch.dailyBudgetUsd.toFixed(2) as any;
    }
    return this.repo.save(row);
  }

  /**
   * Resolve the user's effective subscription tier from `workspace.plan`.
   * Looks up the user's owned workspace; uses the highest plan if multiple.
   * Falls back to 'free' on any lookup failure (defense-in-depth — Free
   * cap is the smallest, safest default).
   *
   * Spec: design.md §10.5 + R8.7
   */
  private async resolveTier(userId: string): Promise<'free' | 'pro' | 'business'> {
    if (!userId) return 'free';
    try {
      const workspaces = await this.workspaceRepo.find({
        where: { ownerId: userId },
        select: ['id', 'plan'],
      });
      if (workspaces.length === 0) return 'free';
      // Pick the highest plan
      const plans = workspaces.map((w) => w.plan);
      if (plans.includes(WorkspacePlan.ENTERPRISE) || plans.includes(WorkspacePlan.BUSINESS)) {
        return 'business';
      }
      if (plans.includes(WorkspacePlan.PRO)) return 'pro';
      return 'free';
    } catch {
      return 'free';
    }
  }

  private budgetCapForTier(tier: 'free' | 'pro' | 'business'): number {
    switch (tier) {
      case 'free': return 2;
      case 'pro': return 20;
      case 'business': return 200;
      default: return 2;
    }
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
