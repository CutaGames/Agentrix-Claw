import { Injectable, Logger, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentAccount, AgentAccountStatus } from '../../entities/agent-account.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetTeamMember } from '../../entities/pet-team-member.entity';

/**
 * Multi-Agent v2 W7 — Marketplace-hire dispatcher.
 *
 * When `agent_run` is called with `target = 'marketplace-hire'` and the
 * env flag `MULTI_AGENT_MARKETPLACE_HIRE_ENABLED=1`,this service:
 *
 *   1. Looks up a marketplace-listed pet matching the requested role
 *   2. Creates an AgentTask row with `target_kind = 'marketplace-hire'`
 *      and `hired_from_user_id = sellerUserId`
 *   3. Reserves USD via escrow (existing pet-a2a-dispatch handles this)
 *   4. Returns the subTaskId for the LLM
 *
 * **v2 SHIP — Property 6 lint allows these field writes only on
 * `feat/multi-agent-w7-w8-v2` branch + descendants.**
 *
 * Spec: design.md §13.1, §13.3; tasks.md W7.1, W7.3
 */

export interface MarketplaceHireMatchResult {
  found: boolean;
  pet?: {
    livingPetId: string;
    sellerUserId: string;
    agentAccountId: string;
    petName: string;
    role: string;
    estimatedCostUsd: number;
  };
  reason?: string;
}

@Injectable()
export class MultiAgentMarketplaceService {
  private readonly logger = new Logger(MultiAgentMarketplaceService.name);

  /** Minimum estimated cost in USD when no published rate is found. */
  private readonly DEFAULT_HIRE_COST_USD = 0.5;

  constructor(
    @InjectRepository(LivingPet)
    private readonly livingPetRepo: Repository<LivingPet>,
    @InjectRepository(PetTeamMember)
    private readonly memberRepo: Repository<PetTeamMember>,
    @InjectRepository(AgentAccount)
    private readonly agentRepo: Repository<AgentAccount>,
  ) {}

  /**
   * Find a marketplace-listed pet that can fulfill the requested role.
   *
   * v2 simplification: a pet is "marketplace-listed" when:
   *   1. its LivingPet has `bound_agent_account_id` non-null (W3 bound)
   *   2. AgentAccount metadata.marketplaceListed === true
   *   3. AgentAccount.status === ACTIVE
   *   4. owner is NOT the requester (no self-hire)
   *
   * Tie-break: highest creditScore.
   */
  async findCandidate(role: string, requesterUserId: string): Promise<MarketplaceHireMatchResult> {
    if (!role || !requesterUserId) {
      return { found: false, reason: 'role and requesterUserId required' };
    }
    const normalizedRole = role.toLowerCase().trim().replace(/-/g, '_');

    // Find candidate pet team members from any user EXCEPT requester
    const members = await this.memberRepo
      .createQueryBuilder('m')
      .where('m.user_id != :uid', { uid: requesterUserId })
      .andWhere('m.status = :status', { status: 'active' })
      .andWhere('m.bound_agent_account_id IS NOT NULL')
      .getMany();

    if (members.length === 0) {
      return { found: false, reason: 'no marketplace-listed pets available' };
    }

    // Filter by role compatibility (case-insensitive substring)
    const roleMatches = members.filter((m) => {
      const r = (m.role ?? '').toLowerCase();
      return r.includes(normalizedRole) || normalizedRole.includes(r);
    });
    if (roleMatches.length === 0) {
      return { found: false, reason: `no marketplace pet matches role '${role}'` };
    }

    // Look up AgentAccount for each candidate; pick one with marketplace flag + best credit
    let best: { member: PetTeamMember; agent: AgentAccount } | null = null;
    for (const m of roleMatches) {
      if (!m.boundAgentAccountId) continue;
      const agent = await this.agentRepo.findOne({ where: { id: m.boundAgentAccountId } });
      if (!agent) continue;
      if (agent.status !== AgentAccountStatus.ACTIVE) continue;
      const listed = agent.metadata?.marketplaceListed === true;
      if (!listed) continue;
      if (!best || (Number(agent.creditScore) > Number(best.agent.creditScore))) {
        best = { member: m, agent };
      }
    }

    if (!best) {
      return { found: false, reason: 'no actively listed pets matched role' };
    }

    const pet = await this.livingPetRepo.findOne({
      where: { id: best.member.parentLivingPetId },
    });

    return {
      found: true,
      pet: {
        livingPetId: best.member.parentLivingPetId,
        sellerUserId: best.member.userId,
        agentAccountId: best.member.boundAgentAccountId!,
        petName: pet?.name || best.member.displayName || 'Unknown Pet',
        role: best.member.role,
        estimatedCostUsd: this.estimateHireCost(best.agent),
      },
    };
  }

  /**
   * v2 simplification — flat fee from agent metadata.publishedHireCostUsd
   * if set, else the default. Real pricing from PetA2A marketplace
   * listing tier in v2.1.
   */
  private estimateHireCost(agent: AgentAccount): number {
    const meta = agent.metadata ?? {};
    if (typeof meta.publishedHireCostUsd === 'number' && meta.publishedHireCostUsd > 0) {
      return Math.min(meta.publishedHireCostUsd, 100);
    }
    return this.DEFAULT_HIRE_COST_USD;
  }

  /**
   * List my pets that I've published to the marketplace + their lifetime
   * earnings. Drives the W7.4 "earned from work" badge.
   */
  async listMyMarketplacePets(userId: string): Promise<
    Array<{
      livingPetId: string;
      petName: string;
      role: string;
      hireCount: number;
      totalEarnedUsd: number;
    }>
  > {
    const myMembers = await this.memberRepo.find({
      where: { userId, status: 'active' },
    });
    const result: Array<{
      livingPetId: string;
      petName: string;
      role: string;
      hireCount: number;
      totalEarnedUsd: number;
    }> = [];
    for (const m of myMembers) {
      if (!m.boundAgentAccountId) continue;
      const agent = await this.agentRepo.findOne({ where: { id: m.boundAgentAccountId } });
      if (!agent || agent.metadata?.marketplaceListed !== true) continue;
      const pet = await this.livingPetRepo.findOne({
        where: { id: m.parentLivingPetId },
      });
      const meta = agent.metadata ?? {};
      result.push({
        livingPetId: m.parentLivingPetId,
        petName: pet?.name || m.displayName || 'Unknown',
        role: m.role,
        hireCount: Number(meta.lifetimeHireCount ?? 0),
        totalEarnedUsd: Number(meta.lifetimeEarnedUsd ?? 0),
      });
    }
    return result;
  }

  /**
   * Toggle the marketplaceListed flag on a user's pet. Only the owner
   * can list/unlist. Sets `agent_accounts.metadata.marketplaceListed`.
   */
  async setListed(
    userId: string,
    livingPetId: string,
    listed: boolean,
    publishedHireCostUsd?: number,
  ): Promise<{ ok: true; listed: boolean }> {
    const pet = await this.livingPetRepo.findOne({
      where: { id: livingPetId, userId },
    });
    if (!pet) throw new NotFoundException('pet not found');
    if (!pet.boundAgentAccountId) {
      throw new BadRequestException('pet not bound to an AgentAccount; bind first');
    }
    const agent = await this.agentRepo.findOne({ where: { id: pet.boundAgentAccountId } });
    if (!agent) throw new NotFoundException('agent account not found');
    if (agent.ownerId !== userId) throw new BadRequestException('not your pet');

    const nextMeta = { ...(agent.metadata ?? {}) };
    nextMeta.marketplaceListed = listed;
    if (typeof publishedHireCostUsd === 'number') {
      nextMeta.publishedHireCostUsd = Math.max(0.1, Math.min(publishedHireCostUsd, 100));
    }
    agent.metadata = nextMeta;
    await this.agentRepo.save(agent);
    this.logger.log(
      `setListed user=${userId} pet=${livingPetId} listed=${listed} cost=${publishedHireCostUsd ?? 'unchanged'}`,
    );
    return { ok: true, listed };
  }

  /**
   * Bump lifetime hire stats after a successful marketplace dispatch.
   * Called by AgentTaskWorker on terminal status when
   * `task.target_kind === 'marketplace-hire'`.
   */
  async recordHireEarning(
    sellerUserId: string,
    agentAccountId: string,
    earnedUsd: number,
  ): Promise<void> {
    if (!sellerUserId || !agentAccountId) return;
    try {
      const agent = await this.agentRepo.findOne({ where: { id: agentAccountId } });
      if (!agent) return;
      const meta = { ...(agent.metadata ?? {}) };
      meta.lifetimeHireCount = Number(meta.lifetimeHireCount ?? 0) + 1;
      meta.lifetimeEarnedUsd = Number(meta.lifetimeEarnedUsd ?? 0) + earnedUsd;
      agent.metadata = meta;
      await this.agentRepo.save(agent);
    } catch (e) {
      this.logger.warn(
        `recordHireEarning failed agent=${agentAccountId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
