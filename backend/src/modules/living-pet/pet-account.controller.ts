import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LivingPet } from '../../entities/living-pet.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { PetArenaLadderSnapshot } from '../../entities/pet-arena-ladder-snapshot.entity';

/**
 * Multi-Agent v2.1 — Pet "经济身份" view endpoint.
 *
 * Returns the AgentAccount + Arena ELO + earnings for a single LivingPet.
 * Mobile and desktop both consume this for the Pet detail "经济身份" Tab
 * (Mobile shows full view per PM decision §6 = "全部展示";Desktop already
 * has this in AgentTeamPanel/MemberSettingsModal).
 *
 * Auth: requires JWT; the caller must own the pet (returns 404 otherwise to
 * avoid existence leak).
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet')
export class PetAccountController {
  constructor(
    @InjectRepository(LivingPet)
    private readonly petRepo: Repository<LivingPet>,
    @InjectRepository(AgentAccount)
    private readonly agentRepo: Repository<AgentAccount>,
    @InjectRepository(PetArenaLadderSnapshot)
    private readonly ladderRepo: Repository<PetArenaLadderSnapshot>,
  ) {}

  @Get(':livingPetId/account')
  async getAccount(@Param('livingPetId') livingPetId: string, @Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    if (!userId) throw new NotFoundException('pet not found');

    const pet = await this.petRepo.findOne({ where: { id: livingPetId } });
    if (!pet || pet.userId !== userId) {
      throw new NotFoundException('pet not found');
    }

    const boundAgentAccountId = (pet as any).boundAgentAccountId as string | null;
    let agent: AgentAccount | null = null;
    if (boundAgentAccountId) {
      agent = await this.agentRepo
        .findOne({ where: { id: boundAgentAccountId } })
        .catch(() => null);
    }

    // Latest ladder snapshot row for this pet (ordered desc by snapshotDate).
    let ladder: PetArenaLadderSnapshot | null = null;
    try {
      ladder = await this.ladderRepo
        .createQueryBuilder('l')
        .where('l.livingPetId = :id', { id: livingPetId })
        .orderBy('l.snapshotDate', 'DESC')
        .limit(1)
        .getOne();
    } catch {
      ladder = null;
    }

    const meta = (agent?.metadata as any) || {};

    return {
      livingPetId: pet.id,
      petName: pet.name || pet.id.slice(0, 8),
      ownerUserId: pet.userId,

      // AgentAccount block — null if pet not bound yet
      agent: agent
        ? {
            agentUniqueId: agent.agentUniqueId,
            creditScore: Number(agent.creditScore || 0),
            riskLevel: agent.riskLevel,
            spendingLimits: agent.spendingLimits || null,
            usedTodayAmount: Number(agent.usedTodayAmount || 0),
            usedMonthAmount: Number(agent.usedMonthAmount || 0),
            preferredModel: agent.preferredModel || null,
            preferredProvider: agent.preferredProvider || null,
            status: agent.status,
          }
        : null,

      // Marketplace stats (W7 — flag-gated UI elsewhere)
      marketplace: {
        listed: meta.marketplaceListed === true,
        publishedHireCostUsd: typeof meta.publishedHireCostUsd === 'number'
          ? meta.publishedHireCostUsd
          : null,
        lifetimeHireCount: typeof meta.lifetimeHireCount === 'number'
          ? meta.lifetimeHireCount
          : 0,
        lifetimeEarnedUsd: typeof meta.lifetimeEarnedUsd === 'number'
          ? meta.lifetimeEarnedUsd
          : 0,
      },

      // Arena ELO snapshot (W8)
      arena: ladder
        ? {
            currentElo: ladder.elo,
            wins: ladder.wins,
            losses: ladder.losses,
            rankGlobal: ladder.rankGlobal,
            rankInUserPool: ladder.rankInUserPool,
            productivityScore: ladder.productivityScore,
            snapshotDate: ladder.snapshotDate,
          }
        : null,
    };
  }
}
