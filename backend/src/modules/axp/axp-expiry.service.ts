/**
 * AxpExpiryService — Sprint M-P2.
 *
 * Two scheduled jobs:
 *
 *   1. Daily expiry sweep (02:30 UTC). Drains AXP that passed its
 *      12-month earn-anniversary by writing direction='expire' rows
 *      and decrementing the user's snapshot balance.
 *
 *   2. Daily expiry warning (08:00 UTC). For every user whose oldest
 *      unspent earn row is between 25 and 30 days from expiry, send
 *      an Expo push notification through the existing
 *      NotificationService. Idempotent — the same earn row triggers
 *      at most one warning, tracked via metadata.expiryWarningSentAt.
 *
 * @see docs/MOBILE_GO_LIVE_AUDIT_2026-05-16.zh-CN.md M-P0-4 + P2-3
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual } from 'typeorm';
import { UserAxpLedger } from '../../entities/user-axp-ledger.entity';
import { AxpService } from './axp.service';
import { NotificationService } from '../notification/notification.service';

const WARNING_WINDOW_DAYS = 30; // start warning 30 days before expiry
const WARNING_TAIL_DAYS = 25; // stop warning when <=25 days remain (already covered)

@Injectable()
export class AxpExpiryService {
  private readonly logger = new Logger(AxpExpiryService.name);

  constructor(
    @InjectRepository(UserAxpLedger)
    private readonly ledger: Repository<UserAxpLedger>,
    private readonly axp: AxpService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Daily AXP expiry drain. Runs at 02:30 UTC.
   */
  @Cron('30 2 * * *')
  async runDailyExpiry(): Promise<void> {
    try {
      const before = Date.now();
      const affected = await this.axp.expireOldEarnRows(2000);
      const ms = Date.now() - before;
      if (affected > 0) {
        this.logger.log(`AXP expiry sweep: ${affected} users affected in ${ms} ms`);
      }
    } catch (e) {
      this.logger.error(`AXP expiry sweep failed: ${(e as Error).message}`);
    }
  }

  /**
   * Daily expiry warning. Runs at 08:00 UTC. Idempotent per earn row.
   */
  @Cron('0 8 * * *')
  async runDailyExpiryWarning(): Promise<void> {
    const now = new Date();
    const tailEnd = new Date(now);
    tailEnd.setDate(tailEnd.getDate() + WARNING_TAIL_DAYS);
    const tailStart = new Date(now);
    tailStart.setDate(tailStart.getDate() + WARNING_WINDOW_DAYS);

    let warned = 0;
    let scanned = 0;
    try {
      const candidates = await this.ledger.find({
        where: {
          direction: 'earn',
          expiresAt: Between(tailEnd, tailStart),
        },
        take: 5000,
        order: { expiresAt: 'ASC' },
      });
      // Group by user — only warn once per user per day even if many
      // earn rows are within window.
      const userToOldest = new Map<string, UserAxpLedger>();
      for (const r of candidates) {
        scanned++;
        if ((r.metadata as any)?.expiryWarningSentAt) continue;
        if (!userToOldest.has(r.userId)) {
          userToOldest.set(r.userId, r);
        }
      }

      for (const [userId, row] of userToOldest) {
        const expiresMs = row.expiresAt?.getTime();
        const daysLeft = expiresMs
          ? Math.max(0, Math.ceil((expiresMs - Date.now()) / 86_400_000))
          : 0;
        try {
          await this.notifications.sendPushNotification(userId, {
            title: 'AXP 即将过期',
            body: `你有 AXP 将在 ${daysLeft} 天后过期，记得在到期前兑换或抵扣。`,
            data: {
              type: 'axp_expiring',
              ledger_id: row.id,
              days_left: daysLeft,
              amount: Number(row.amount),
            },
          });
          // Stamp the row so we don't warn twice
          await this.ledger.update(
            { id: row.id },
            {
              metadata: {
                ...((row.metadata as any) ?? {}),
                expiryWarningSentAt: new Date().toISOString(),
              },
            },
          );
          warned++;
        } catch (e) {
          this.logger.warn(
            `AXP expiry warn failed for user ${userId}: ${(e as Error).message}`,
          );
        }
      }
      if (warned > 0 || scanned > 0) {
        this.logger.log(`AXP expiry warnings: scanned=${scanned} warned=${warned}`);
      }
    } catch (e) {
      this.logger.error(`AXP expiry warning failed: ${(e as Error).message}`);
    }
  }

  /**
   * Manual trigger for ops / testing. Same logic as the daily cron.
   */
  async triggerNow(): Promise<{ affected: number }> {
    const affected = await this.axp.expireOldEarnRows(500);
    return { affected };
  }
}
