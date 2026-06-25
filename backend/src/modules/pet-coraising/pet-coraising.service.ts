import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, Not } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { PetCoRaisingInvite } from '../../entities/pet-coraising-invite.entity';
import { PetCoRaisingFeed } from '../../entities/pet-coraising-feed.entity';
import { AxpService } from '../axp/axp.service';
import { AXP_AMOUNTS } from '../axp/axp.constants';

/**
 * Co-Raising service — per docs §6.1.
 *
 * Three write paths:
 *   - createInvite: pet owner generates a public token/link
 *   - feed (authenticated): registered friend feeds the pet — earns AXP
 *     and is recorded for the 5% split on pet future earnings
 *   - feedAsGuest (unauthenticated): single tap for first-time viewers,
 *     no AXP reward but still contributes pet energy
 *
 * Commission-split wiring (feeder gets 5% of pet earnings) is a follow-up
 * in commission V4 integration — for now we record the invite so it can
 * be joined against future earnings retrospectively.
 */
@Injectable()
export class PetCoRaisingService {
  private readonly logger = new Logger(PetCoRaisingService.name);

  constructor(
    @InjectRepository(PetCoRaisingInvite)
    private readonly invites: Repository<PetCoRaisingInvite>,
    @InjectRepository(PetCoRaisingFeed)
    private readonly feeds: Repository<PetCoRaisingFeed>,
    private readonly axp: AxpService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Invite lifecycle ───────────────────────────────────────

  async createInvite(
    inviterId: string,
    input: {
      agent_account_id: string;
      split_bps?: number;
      max_feeders?: number;
      expires_days?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    if (!input.agent_account_id) {
      throw new BadRequestException('agent_account_id is required');
    }
    const splitBps = Math.min(Math.max(input.split_bps ?? 500, 0), 2000); // cap at 20%
    const token = this.generateToken();
    const expiresAt = input.expires_days
      ? new Date(Date.now() + input.expires_days * 86400_000)
      : null;
    const row = this.invites.create({
      inviterId,
      agentAccountId: input.agent_account_id,
      token,
      splitBps,
      maxFeeders: input.max_feeders ?? 0,
      feedersCount: 0,
      totalFeeds: 0,
      expiresAt,
      status: 'active',
      metadata: input.metadata ?? {},
    });
    await this.invites.save(row);
    return this.viewInvite(row);
  }

  async listMyInvites(inviterId: string, limit = 20) {
    const rows = await this.invites.find({
      where: { inviterId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 100),
    });
    return { items: rows.map((r) => this.viewInvite(r)) };
  }

  async getInviteByToken(token: string) {
    const row = await this.invites.findOne({ where: { token } });
    if (!row) throw new NotFoundException('invite not found');
    if (row.status !== 'active') {
      throw new BadRequestException(`invite is ${row.status}`);
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      await this.invites.update({ id: row.id }, { status: 'expired' });
      throw new BadRequestException('invite has expired');
    }
    return this.viewInvite(row);
  }

  async cancelInvite(inviterId: string, inviteId: string) {
    const row = await this.invites.findOne({ where: { id: inviteId } });
    if (!row || row.inviterId !== inviterId) {
      throw new NotFoundException('invite not found');
    }
    await this.invites.update({ id: inviteId }, { status: 'cancelled' });
    return { ok: true };
  }

  // ── Feed action ────────────────────────────────────────────

  async feed(
    feederId: string,
    input: { token: string; kind?: string; client_ip?: string },
  ): Promise<{
    energy_given: number;
    axp_awarded: number;
    pet_total_feeds: number;
  }> {
    const invite = await this.invites.findOne({ where: { token: input.token } });
    if (!invite) throw new NotFoundException('invite not found');
    if (invite.status !== 'active') {
      throw new BadRequestException(`invite is ${invite.status}`);
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      await this.invites.update({ id: invite.id }, { status: 'expired' });
      throw new BadRequestException('invite has expired');
    }
    if (invite.inviterId === feederId) {
      throw new BadRequestException('cannot feed your own pet via invite');
    }
    if (invite.maxFeeders > 0 && invite.feedersCount >= invite.maxFeeders) {
      // New feeder not allowed, but if feeder is already known → keep going
      const alreadyFed = await this.feeds.findOne({
        where: { inviteId: invite.id, feederId },
      });
      if (!alreadyFed) {
        throw new BadRequestException('invite is full');
      }
    }

    const feedDate = this.utcDateStr();
    const clientHash = input.client_ip
      ? createHash('sha256').update(input.client_ip).digest('hex').slice(0, 32)
      : null;

    return this.dataSource.transaction(async (manager) => {
      // Enforce "one feed per day per (invite,feeder)" via unique index.
      // If duplicate, Postgres throws 23505 → we surface as 400.
      try {
        const feedRow = manager.create(PetCoRaisingFeed, {
          inviteId: invite.id,
          feederId,
          kind: input.kind ?? 'feed',
          energy: 2,
          axpAwarded: AXP_AMOUNTS.coraising_feed_receive,
          feedDate,
          clientHash,
          metadata: {},
        });
        await manager.save(feedRow);
      } catch (e: any) {
        if (e?.code === '23505') {
          throw new BadRequestException('already fed today');
        }
        throw e;
      }

      // Update invite counters (feedersCount only if this is a new feeder)
      const existingFeeds = await manager.count(PetCoRaisingFeed, {
        where: { inviteId: invite.id, feederId },
      });
      const isNewFeeder = existingFeeds === 1;
      await manager.update(
        PetCoRaisingInvite,
        { id: invite.id },
        {
          totalFeeds: invite.totalFeeds + 1,
          feedersCount: invite.feedersCount + (isNewFeeder ? 1 : 0),
        },
      );

      // Award AXP to feeder (via AxpService — its own transaction)
      await this.axp.earn({
        userId: feederId,
        source: 'coraising_feed',
        amount: AXP_AMOUNTS.coraising_feed_receive,
        refId: invite.id,
        note: `Fed pet via co-raise invite`,
      });
      // Small AXP kickback to the owner too
      await this.axp.earn({
        userId: invite.inviterId,
        source: 'coraising_owner',
        amount: AXP_AMOUNTS.coraising_feed_owner,
        refId: invite.id,
        note: `Friend fed your pet`,
      });

      return {
        energy_given: 2,
        axp_awarded: AXP_AMOUNTS.coraising_feed_receive,
        pet_total_feeds: invite.totalFeeds + 1,
      };
    });
  }

  /** Guest (unauthenticated) can see a preview but cannot feed until signed in. */
  async peekInvite(token: string) {
    const invite = await this.invites.findOne({ where: { token } });
    if (!invite || invite.status !== 'active') {
      throw new NotFoundException('invite not available');
    }
    return {
      token: invite.token,
      agent_account_id: invite.agentAccountId,
      split_bps: invite.splitBps,
      feeders_count: invite.feedersCount,
      total_feeds: invite.totalFeeds,
      status: invite.status,
      expires_at: invite.expiresAt?.getTime() ?? null,
    };
  }

  // ── Helpers ────────────────────────────────────────────────

  private viewInvite(row: PetCoRaisingInvite) {
    return {
      id: row.id,
      inviter_id: row.inviterId,
      agent_account_id: row.agentAccountId,
      token: row.token,
      split_bps: row.splitBps,
      max_feeders: row.maxFeeders,
      feeders_count: row.feedersCount,
      total_feeds: row.totalFeeds,
      status: row.status,
      expires_at: row.expiresAt?.getTime() ?? null,
      created_at: row.createdAt.getTime(),
      share_url: `https://agentrix.top/home/co-raising/${row.token}`,
    };
  }

  private generateToken(): string {
    // 22 base36 chars ≈ 113 bits. URL-safe, human-typeable.
    return randomBytes(14).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 22);
  }

  private utcDateStr(): string {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }
}
