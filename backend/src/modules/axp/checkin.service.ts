import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserAxpLedger } from '../../entities/user-axp-ledger.entity';
import { AxpService } from './axp.service';
import { AXP_AMOUNTS } from './axp.constants';

export interface CheckinStatus {
  /** UTC date string `YYYY-MM-DD` of the last successful checkin (or null). */
  last_checkin_date: string | null;
  /** Consecutive-day streak (resets if user missed a day). */
  streak: number;
  /** Whether the user can check in today (UTC). */
  can_checkin_today: boolean;
  /** AXP the user will earn if they check in now (base + streak bonus, capped). */
  pending_amount: number;
  /** Base amount for today's checkin (20). */
  base_amount: number;
  /** Streak bonus for today's checkin (5 * streak after, capped). */
  streak_bonus: number;
  /** Cap applied to streak bonus. */
  streak_bonus_cap: number;
}

export interface CheckinResult extends CheckinStatus {
  earned: number;
  balance: number;
  ledger_id: string;
}

/**
 * Streak policy (§4.2):
 *   - base = 20 AXP
 *   - bonus = 5 * streak (cap at 80 so total maxes at 100)
 *   - streak increments if last checkin was yesterday UTC
 *   - resets to 1 if gap > 1 day
 */
const STREAK_BONUS_CAP = 80; // 5 * 16 = 80  → base+bonus caps at 100

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const aUtc = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bUtc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bUtc - aUtc) / msPerDay);
}

@Injectable()
export class CheckinService {
  constructor(
    @InjectRepository(UserAxpLedger)
    private readonly ledger: Repository<UserAxpLedger>,
    private readonly axp: AxpService,
  ) {}

  /**
   * Pure lookup — returns the user's current streak and whether they can
   * check in today. Does not mutate.
   */
  async getStatus(userId: string): Promise<CheckinStatus> {
    const last = await this.ledger.findOne({
      where: { userId, source: 'daily_checkin', direction: 'earn' },
      order: { createdAt: 'DESC' },
    });

    const now = new Date();
    const today = utcDateKey(now);

    if (!last) {
      return this.buildStatus({
        last_checkin_date: null,
        streak: 0,
        can_checkin_today: true,
        priorStreak: 0,
      });
    }

    const lastDate = last.createdAt;
    const lastKey = utcDateKey(lastDate);
    const gap = daysBetween(lastDate, now);

    // streak is persisted on last ledger row's metadata.streak (best effort).
    const priorStreak =
      typeof (last.metadata as any)?.streak === 'number'
        ? (last.metadata as any).streak
        : 1;

    if (lastKey === today) {
      return this.buildStatus({
        last_checkin_date: lastKey,
        streak: priorStreak,
        can_checkin_today: false,
        priorStreak,
      });
    }

    // Different UTC day: streak continues if exactly 1-day gap, else resets.
    const willBeStreak = gap === 1 ? priorStreak : 0;
    return this.buildStatus({
      last_checkin_date: lastKey,
      streak: willBeStreak,
      can_checkin_today: true,
      priorStreak: willBeStreak,
    });
  }

  /**
   * Idempotent per UTC day. If the user already checked in today, throws
   * 400 (UI should guard via getStatus; this is a defensive server check).
   */
  async checkin(userId: string): Promise<CheckinResult> {
    const status = await this.getStatus(userId);
    if (!status.can_checkin_today) {
      throw new BadRequestException('already_checked_in_today');
    }

    const nextStreak = status.streak + 1;
    const base = AXP_AMOUNTS.daily_checkin_base;
    const bonus = Math.min(AXP_AMOUNTS.daily_checkin_streak_bonus * status.streak, STREAK_BONUS_CAP);
    const amount = base + bonus;

    const res = await this.axp.earn({
      userId,
      source: 'daily_checkin',
      amount,
      note: `Daily check-in day ${nextStreak}`,
      metadata: { streak: nextStreak, base, bonus },
    });

    return {
      ...this.buildStatus({
        last_checkin_date: utcDateKey(new Date()),
        streak: nextStreak,
        can_checkin_today: false,
        priorStreak: nextStreak,
      }),
      earned: amount,
      balance: res.balance,
      ledger_id: res.ledger_id,
    };
  }

  private buildStatus(input: {
    last_checkin_date: string | null;
    streak: number;
    can_checkin_today: boolean;
    priorStreak: number;
  }): CheckinStatus {
    const base = AXP_AMOUNTS.daily_checkin_base;
    const streakForBonus = input.can_checkin_today ? input.priorStreak : input.streak;
    const streak_bonus = Math.min(
      AXP_AMOUNTS.daily_checkin_streak_bonus * streakForBonus,
      STREAK_BONUS_CAP,
    );
    return {
      last_checkin_date: input.last_checkin_date,
      streak: input.streak,
      can_checkin_today: input.can_checkin_today,
      pending_amount: base + streak_bonus,
      base_amount: base,
      streak_bonus,
      streak_bonus_cap: STREAK_BONUS_CAP,
    };
  }
}
