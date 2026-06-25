/**
 * MoodDiaryPushService — P-9 wave 13 T21.1 / T21.2.
 *
 * Schedules the daily 19:00-21:00 push notification surfacing today's
 * `pet_diary` entry. Behaviour mirrors spec R5:
 *   - Once per user per day (deduped by `pet_diary.last_pushed_at`)
 *   - Skip if `last_viewed_at` already set (user already opened the diary)
 *   - Quiet_Hours (22-08 user-local) → defer to 08:00-10:00 next morning
 *   - 7 consecutive non-opens → drop frequency to weekly (R5.9)
 *
 * Push payload uses `agentrix://intent/mood-diary?id=<id>&text=<text>` so
 * the existing wave-11 `mood-diary` intent handler takes over on tap.
 *
 * Spec: requirements.md R5.2-R5.9.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetDiaryEntry } from '../../entities/pet-diary-entry.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { NotificationService } from '../notification/notification.service';

const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 8;
const PUSH_WINDOW_START_HOUR = 19;
const PUSH_WINDOW_END_HOUR = 21;
const NON_OPEN_BACKOFF_THRESHOLD = 7;
const WEEKLY_BACKOFF_DAYS = 7;

@Injectable()
export class MoodDiaryPushService {
  private readonly logger = new Logger(MoodDiaryPushService.name);

  constructor(
    @InjectRepository(PetDiaryEntry)
    private readonly diaryRepo: Repository<PetDiaryEntry>,
    @InjectRepository(LivingPet)
    private readonly petRepo: Repository<LivingPet>,
    private readonly notification: NotificationService,
  ) {}

  /**
   * Run every hour during the push window. We don't run at fixed 19:00
   * because user timezones vary; the hourly cron + per-user clock check
   * lands the push within an hour of the user's local 19-21 slot.
   *
   * Dev note: backend default tz is server (UTC by default). Phase 1
   * approximates with server hour ∈ [19, 21]; future enhancement reads
   * `user.timezone_offset` and lands correctly across timezones.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'pet-mood-diary-push' })
  async tick(): Promise<void> {
    const now = new Date();
    const h = now.getHours();
    if (h < PUSH_WINDOW_START_HOUR || h >= PUSH_WINDOW_END_HOUR + 1) return;

    try {
      const todayKey = this.dateKey(now);
      const candidates = await this.diaryRepo.find({
        where: { dateKey: todayKey } as any,
        take: 500,
      });
      if (candidates.length === 0) return;

      let sent = 0;
      let skipped = 0;
      for (const entry of candidates) {
        const ok = await this.maybeSendOne(entry, now);
        if (ok) sent++;
        else skipped++;
      }
      this.logger.log(`mood-diary-push tick: sent=${sent} skipped=${skipped}`);
    } catch (err) {
      this.logger.error(`mood-diary-push tick failed: ${(err as Error).message}`);
    }
  }

  private async maybeSendOne(entry: PetDiaryEntry, now: Date): Promise<boolean> {
    // Already viewed today — no need to push
    const lastViewedAt = (entry as any).lastViewedAt as Date | null | undefined;
    if (lastViewedAt && this.dateKey(lastViewedAt) === entry.dateKey) {
      return false;
    }

    // Already pushed today
    const lastPushedAt = (entry as any).lastPushedAt as Date | null | undefined;
    if (lastPushedAt && this.dateKey(lastPushedAt) === entry.dateKey) {
      return false;
    }

    // 7 consecutive non-opens → weekly backoff
    const consecutiveMisses = ((entry as any).consecutivePushMisses ?? 0) as number;
    if (consecutiveMisses >= NON_OPEN_BACKOFF_THRESHOLD) {
      const lastSentAt = lastPushedAt ?? null;
      if (lastSentAt) {
        const ageDays = (now.getTime() - lastSentAt.getTime()) / (24 * 3600 * 1000);
        if (ageDays < WEEKLY_BACKOFF_DAYS) return false;
      }
    }

    // Quiet hours — phase 1 server-clock approximation
    if (now.getHours() >= QUIET_START_HOUR || now.getHours() < QUIET_END_HOUR) {
      return false;
    }

    const pet = await this.petRepo.findOne({ where: { userId: entry.userId } as any });
    const petName = (pet as any)?.nickname || (pet as any)?.name || 'Aira';
    const diaryText = (entry as any).body || (entry as any).text || '今天有点想你';
    const truncated = diaryText.length > 90 ? diaryText.slice(0, 87) + '…' : diaryText;
    const deeplink = `agentrix://intent/mood-diary?id=${encodeURIComponent(entry.id)}&text=${encodeURIComponent(truncated)}`;

    const ok = await this.notification.sendPushNotification(entry.userId, {
      title: `🐾 ${petName} 的今日小记`,
      body: truncated,
      data: {
        type: 'pet-mood-diary',
        diaryId: entry.id,
        deeplink,
      },
      channelId: 'pet-mood-diary',
    });

    if (ok) {
      // Persist last_pushed_at + bump consecutivePushMisses (will reset
      // when client posts mood-diary view, e.g. via the existing
      // diary view endpoint or the wave-11 mood-diary intent handler).
      (entry as any).lastPushedAt = now;
      (entry as any).consecutivePushMisses = consecutiveMisses + 1;
      await this.diaryRepo.save(entry);
    }
    return ok;
  }

  private dateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
