import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PetArenaMatch, PetArenaMode } from '../../entities/pet-arena-match.entity';
import { PetArenaLadderSnapshot } from '../../entities/pet-arena-ladder-snapshot.entity';
import { PetProductivitySnapshot } from '../../entities/pet-productivity-snapshot.entity';
import { PetTeamMember } from '../../entities/pet-team-member.entity';
import { LivingPet } from '../../entities/living-pet.entity';

/**
 * PetArenaService — match-maker + tournament + ladder query.
 *
 * Spec: design.md §14.5; tasks.md W8.2, W8.3, W8.4
 *
 * v2 W8 SHIP — gated by env MULTI_AGENT_PET_ARENA_ENABLED=1.
 * When OFF (default), service is provisioned but `enqueueMatch` /
 * tournament endpoints reject with 403.
 */

const ELO_K = 32;            // Standard ELO K-factor (chess uses 32 for amateurs)
const DEFAULT_ELO = 1200;
const PRODUCTIVITY_WEIGHT = 1; // 1 productivity point ≈ 1 ELO at boot

export interface CreateMatchDto {
  mode: PetArenaMode;
  aUserId: string;
  aLivingPetId: string;
  bUserId: string;
  bLivingPetId: string;
}

export interface LadderRow {
  livingPetId: string;
  petName: string;
  userId: string;
  elo: number;
  wins: number;
  losses: number;
  rank: number;
  productivityScore: number;
}

@Injectable()
export class PetArenaService {
  private readonly logger = new Logger(PetArenaService.name);

  constructor(
    @InjectRepository(PetArenaMatch)
    private readonly matchRepo: Repository<PetArenaMatch>,
    @InjectRepository(PetArenaLadderSnapshot)
    private readonly ladderRepo: Repository<PetArenaLadderSnapshot>,
    @InjectRepository(PetProductivitySnapshot)
    private readonly snapshotRepo: Repository<PetProductivitySnapshot>,
    @InjectRepository(PetTeamMember)
    private readonly memberRepo: Repository<PetTeamMember>,
    @InjectRepository(LivingPet)
    private readonly livingPetRepo: Repository<LivingPet>,
  ) {}

  private get enabled(): boolean {
    return process.env.MULTI_AGENT_PET_ARENA_ENABLED === '1';
  }

  /**
   * Match-maker — pair pets by closest productivity_score for fair
   * matchmaking (per spec §14.5). v2 simplification: caller picks
   * opponent explicitly via createMatch; auto-pair is left for v2.1.
   */
  async createMatch(dto: CreateMatchDto): Promise<PetArenaMatch> {
    if (!this.enabled) {
      throw new BadRequestException('Pet Arena is not enabled (set MULTI_AGENT_PET_ARENA_ENABLED=1)');
    }
    if (!['task_arena', 'tournament', 'arena_room'].includes(dto.mode)) {
      throw new BadRequestException('mode must be task_arena | tournament | arena_room');
    }
    if (dto.aUserId === dto.bUserId) {
      throw new BadRequestException('cannot match a user against themselves');
    }
    if (dto.aLivingPetId === dto.bLivingPetId) {
      throw new BadRequestException('a and b must be different pets');
    }

    // Verify both pets exist + ownership
    const aPet = await this.livingPetRepo.findOne({
      where: { id: dto.aLivingPetId, userId: dto.aUserId },
    });
    if (!aPet) throw new NotFoundException('side A pet not found / not owned');
    const bPet = await this.livingPetRepo.findOne({
      where: { id: dto.bLivingPetId, userId: dto.bUserId },
    });
    if (!bPet) throw new NotFoundException('side B pet not found / not owned');

    const aMember = await this.memberRepo.findOne({
      where: { parentLivingPetId: dto.aLivingPetId, status: 'active' },
    });
    const bMember = await this.memberRepo.findOne({
      where: { parentLivingPetId: dto.bLivingPetId, status: 'active' },
    });

    const aElo = await this.getCurrentElo(dto.aLivingPetId);
    const bElo = await this.getCurrentElo(dto.bLivingPetId);

    const match = this.matchRepo.create({
      mode: dto.mode,
      aUserId: dto.aUserId,
      aLivingPetId: dto.aLivingPetId,
      aAgentAccountId: aMember?.boundAgentAccountId ?? null,
      bUserId: dto.bUserId,
      bLivingPetId: dto.bLivingPetId,
      bAgentAccountId: bMember?.boundAgentAccountId ?? null,
      winnerSide: null,
      outcome: 'pending',
      scoreA: 0,
      scoreB: 0,
      aEloBefore: aElo,
      bEloBefore: bElo,
      aEloAfter: aElo,
      bEloAfter: bElo,
      costUsd: 0,
      agentTaskId: null,
    });
    return this.matchRepo.save(match);
  }

  /**
   * Resolve a match: declare winner side, compute new ELO, update both
   * pets' ladder snapshots. v2 simplification: caller passes winnerSide
   * after running the match logic; auto-judge is left for v2.1.
   */
  async resolveMatch(
    matchId: string,
    winnerSide: 'A' | 'B' | null,
    info: { scoreA?: number; scoreB?: number; costUsd?: number },
  ): Promise<PetArenaMatch> {
    if (!this.enabled) {
      throw new BadRequestException('Pet Arena is not enabled');
    }
    const m = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!m) throw new NotFoundException('match not found');
    if (m.outcome === 'completed' || m.outcome === 'canceled') {
      return m;
    }

    // Compute ELO update
    const expectedA = 1 / (1 + Math.pow(10, (m.bEloBefore - m.aEloBefore) / 400));
    const expectedB = 1 - expectedA;
    const actualA = winnerSide === 'A' ? 1 : winnerSide === 'B' ? 0 : 0.5;
    const actualB = 1 - actualA;
    const aEloAfter = Math.round(m.aEloBefore + ELO_K * (actualA - expectedA));
    const bEloAfter = Math.round(m.bEloBefore + ELO_K * (actualB - expectedB));

    m.winnerSide = winnerSide;
    m.outcome = 'completed';
    m.scoreA = info.scoreA ?? (winnerSide === 'A' ? 1 : 0);
    m.scoreB = info.scoreB ?? (winnerSide === 'B' ? 1 : 0);
    m.aEloAfter = aEloAfter;
    m.bEloAfter = bEloAfter;
    m.costUsd = info.costUsd ?? 0;
    m.completedAt = new Date();

    const saved = await this.matchRepo.save(m);

    // Update ladder snapshots for both sides
    await this.upsertLadderRow(m.aLivingPetId, m.aUserId, aEloAfter, winnerSide === 'A');
    await this.upsertLadderRow(m.bLivingPetId, m.bUserId, bEloAfter, winnerSide === 'B');

    this.logger.log(
      `pet arena match resolved id=${matchId} winner=${winnerSide ?? 'draw'} aElo=${m.aEloBefore}→${aEloAfter} bElo=${m.bEloBefore}→${bEloAfter}`,
    );
    return saved;
  }

  /**
   * Get ladder for a user's own pet pool (Pet Tab "ladder" widget).
   * Returns rows sorted by ELO desc.
   */
  async getMyLadder(userId: string): Promise<LadderRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.ladderRepo
      .createQueryBuilder('l')
      .where('l.user_id = :uid', { uid: userId })
      .andWhere('l.snapshot_date = :date', { date: today })
      .orderBy('l.elo', 'DESC')
      .getMany();

    const result: LadderRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const pet = await this.livingPetRepo.findOne({ where: { id: r.livingPetId } });
      result.push({
        livingPetId: r.livingPetId,
        petName: pet?.name ?? 'Unknown',
        userId: r.userId,
        elo: r.elo,
        wins: r.wins,
        losses: r.losses,
        rank: i + 1,
        productivityScore: r.productivityScore,
      });
    }
    return result;
  }

  /**
   * Productivity score for a pet — sum of last 4 weeks of
   * `pet_productivity_snapshot.sub_task_count`. Used as ladder
   * tie-break and as initial ELO seed.
   *
   * Spec: tasks.md W8.4
   */
  async getPetProductivityScore(livingPetId: string): Promise<number> {
    const since = new Date();
    since.setDate(since.getDate() - 28);
    const since_iso = since.toISOString().slice(0, 10);
    const result = await this.snapshotRepo
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.sub_task_count), 0)', 'sum')
      .where('s.living_pet_id = :pid', { pid: livingPetId })
      .andWhere('s.snapshot_date >= :since', { since: since_iso })
      .getRawOne<{ sum: string | number }>();
    return Number(result?.sum ?? 0);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Internals
  // ─────────────────────────────────────────────────────────────────────

  private async getCurrentElo(livingPetId: string): Promise<number> {
    // Latest non-null ladder row, else seed from productivity score.
    const latest = await this.ladderRepo
      .createQueryBuilder('l')
      .where('l.living_pet_id = :pid', { pid: livingPetId })
      .orderBy('l.snapshot_date', 'DESC')
      .limit(1)
      .getOne();
    if (latest) return latest.elo;
    const productivity = await this.getPetProductivityScore(livingPetId);
    return DEFAULT_ELO + productivity * PRODUCTIVITY_WEIGHT;
  }

  private async upsertLadderRow(
    livingPetId: string,
    userId: string,
    newElo: number,
    won: boolean,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await this.ladderRepo.findOne({
      where: { livingPetId, snapshotDate: today },
    });
    if (existing) {
      existing.elo = newElo;
      existing.wins = (existing.wins || 0) + (won ? 1 : 0);
      existing.losses = (existing.losses || 0) + (won ? 0 : 1);
      await this.ladderRepo.save(existing);
    } else {
      const productivity = await this.getPetProductivityScore(livingPetId);
      await this.ladderRepo.save(
        this.ladderRepo.create({
          livingPetId,
          userId,
          snapshotDate: today,
          elo: newElo,
          wins: won ? 1 : 0,
          losses: won ? 0 : 1,
          productivityScore: productivity,
        }),
      );
    }
  }
}
