import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PhotoMimicSeason } from '../../entities/photo-mimic-season.entity';
import { PhotoMimicEntry } from '../../entities/photo-mimic-entry.entity';
import { PhotoMimicVote } from '../../entities/photo-mimic-vote.entity';
import { AxpService } from '../axp/axp.service';
import { AXP_AMOUNTS } from '../axp/axp.constants';

const DAILY_VOTE_CAP = 3;

@Injectable()
export class PhotoMimicService {
  constructor(
    @InjectRepository(PhotoMimicSeason)
    private readonly seasons: Repository<PhotoMimicSeason>,
    @InjectRepository(PhotoMimicEntry)
    private readonly entries: Repository<PhotoMimicEntry>,
    @InjectRepository(PhotoMimicVote)
    private readonly votes: Repository<PhotoMimicVote>,
    private readonly axp: AxpService,
  ) {}

  async getCurrentSeason(): Promise<PhotoMimicSeason | null> {
    const active = await this.seasons.findOne({
      where: [{ status: 'submitting' }, { status: 'voting' }],
      order: { submitOpenAt: 'DESC' },
    });
    if (active) return active;
    // Show last settled within 72h for display
    const recent = await this.seasons.findOne({
      where: { status: 'settled' },
      order: { settledAt: 'DESC' },
    });
    if (recent && recent.settledAt) {
      const age = Date.now() - recent.settledAt.getTime();
      if (age < 72 * 3600_000) return recent;
    }
    return null;
  }

  async getLeaderboard(seasonId: string, limit = 20, offset = 0) {
    const [items, total] = await this.entries.findAndCount({
      where: { seasonId, status: In(['active', 'archived']) },
      order: { voteCount: 'DESC', createdAt: 'ASC' },
      take: Math.min(limit, 50),
      skip: offset,
    });
    return { items, total };
  }

  async submitEntry(
    userId: string,
    input: { season_id: string; source_image_url: string; caption?: string; provider?: string },
  ) {
    const season = await this.seasons.findOne({ where: { id: input.season_id } });
    if (!season) throw new NotFoundException('season not found');
    if (season.status !== 'submitting') {
      throw new BadRequestException('season is not accepting submissions');
    }

    const entry = this.entries.create({
      seasonId: season.id,
      userId,
      sourceImageUrl: input.source_image_url,
      caption: input.caption ?? null,
      status: 'active', // MVP: skip generation wait, mark active immediately
      petGenerationTaskId: null,
    });
    const saved = await this.entries.save(entry);

    // Award participation AXP
    try {
      await this.axp.earn({
        userId,
        source: 'game_participate',
        amount: AXP_AMOUNTS.game_participate_base,
        refId: saved.id,
        note: 'Photo Mimic 参赛奖励',
      });
      saved.axpRewarded = AXP_AMOUNTS.game_participate_base;
      await this.entries.save(saved);
    } catch {}

    return saved;
  }

  async getEntryById(entryId: string) {
    const entry = await this.entries.findOne({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('entry not found');
    return entry;
  }

  async getMyEntries(userId: string, limit = 20) {
    const items = await this.entries.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 50),
    });
    return { items };
  }

  async castVote(userId: string, entryId: string) {
    const entry = await this.entries.findOne({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('entry not found');
    if (entry.status !== 'active') throw new BadRequestException('entry not votable');
    if (entry.userId === userId) throw new BadRequestException('cannot vote for own entry');

    const season = await this.seasons.findOne({ where: { id: entry.seasonId } });
    if (!season || season.status !== 'voting') {
      throw new BadRequestException('voting is not open');
    }

    // Daily cap
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayVotes = await this.votes
      .createQueryBuilder('v')
      .where('v.voter_user_id = :uid', { uid: userId })
      .andWhere('v.voted_at >= :start', { start: todayStart })
      .getCount();
    if (todayVotes >= DAILY_VOTE_CAP) {
      throw new BadRequestException('daily vote limit reached (3/day)');
    }

    // Duplicate check
    const existing = await this.votes.findOne({
      where: { seasonId: entry.seasonId, entryId, voterUserId: userId },
    });
    if (existing) throw new BadRequestException('already voted for this entry');

    // Insert vote
    const vote = this.votes.create({
      seasonId: entry.seasonId,
      entryId,
      voterUserId: userId,
    });
    await this.votes.save(vote);

    // Increment vote count
    await this.entries.increment({ id: entryId }, 'voteCount', 1);

    return { ok: true, daily_votes_used: todayVotes + 1, daily_votes_remaining: DAILY_VOTE_CAP - todayVotes - 1 };
  }

  async getMyTodayVotes(userId: string) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const used = await this.votes
      .createQueryBuilder('v')
      .where('v.voter_user_id = :uid', { uid: userId })
      .andWhere('v.voted_at >= :start', { start: todayStart })
      .getCount();
    return { used, remaining: DAILY_VOTE_CAP - used };
  }

  async settleSeason(seasonId: string, adminUserId: string) {
    const season = await this.seasons.findOne({ where: { id: seasonId } });
    if (!season) throw new NotFoundException('season not found');
    if (season.status === 'settled') return { already_settled: true };

    // Find champion
    const top = await this.entries.find({
      where: { seasonId, status: In(['active']) },
      order: { voteCount: 'DESC' },
      take: 10,
    });
    if (top.length === 0) throw new BadRequestException('no entries to settle');

    // Award champion
    const champion = top[0];
    await this.axp.earn({
      userId: champion.userId,
      source: 'contest_win',
      amount: AXP_AMOUNTS.contest_win,
      refId: champion.id,
      note: 'Photo Mimic 赛季冠军',
    });
    champion.finalRank = 1;
    champion.axpRewarded += AXP_AMOUNTS.contest_win;
    await this.entries.save(champion);

    // Top 2-10 get 500 each
    for (let i = 1; i < top.length; i++) {
      top[i].finalRank = i + 1;
      try {
        await this.axp.earn({
          userId: top[i].userId,
          source: 'game_participate',
          amount: 500,
          refId: top[i].id,
          note: `Photo Mimic Top ${i + 1}`,
        });
        top[i].axpRewarded += 500;
      } catch {}
      await this.entries.save(top[i]);
    }

    // Update season
    season.status = 'settled';
    season.settledAt = new Date();
    season.championEntryId = champion.id;
    await this.seasons.save(season);

    return { settled: true, champion_entry_id: champion.id, champion_user_id: champion.userId };
  }
}
