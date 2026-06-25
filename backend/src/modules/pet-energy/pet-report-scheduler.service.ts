import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetEnergyState } from '../../entities/pet-energy-state.entity';
import { PetReportService, PetDailyReport } from './pet-report.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../../entities/notification.entity';

/**
 * PetReportSchedulerService — PRD §3.5.3 日报 / 周报 cron + push delivery.
 *
 * - Daily   : every day at 18:00 server local time
 * - Weekly  : every Sunday at 20:00 server local time
 *
 * Iterates pet_energy_states (one row per active user × pet) and for each
 * generates a PetDailyReport, then dispatches a notification (which fans out
 * to Expo push). Skip pets with zero activity in the window to avoid spam.
 */
@Injectable()
export class PetReportSchedulerService {
  private readonly logger = new Logger(PetReportSchedulerService.name);

  constructor(
    @InjectRepository(PetEnergyState)
    private readonly energyRepo: Repository<PetEnergyState>,
    private readonly reportService: PetReportService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron('0 18 * * *', { name: 'pet-daily-report', timeZone: 'Asia/Shanghai' })
  async runDaily() {
    this.logger.log('🐾 daily pet report cron fired');
    await this.dispatchReports('daily');
  }

  @Cron('0 20 * * 0', { name: 'pet-weekly-report', timeZone: 'Asia/Shanghai' })
  async runWeekly() {
    this.logger.log('🐾 weekly pet report cron fired');
    await this.dispatchReports('weekly');
  }

  private async dispatchReports(window: 'daily' | 'weekly') {
    let states: PetEnergyState[] = [];
    try {
      states = await this.energyRepo.find({ take: 5000 });
    } catch (err) {
      this.logger.warn(`load energy states failed: ${(err as Error).message}`);
      return;
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const s of states) {
      try {
        const report = await this.reportService.generateDailyReport(
          s.userId,
          s.petSkinId,
        );
        // Skip noisy zero-activity entries
        if (
          report.llmCalls === 0 &&
          report.dispatches === 0 &&
          report.rewardEarnedCents === 0
        ) {
          skipped++;
          continue;
        }
        await this.notificationService.createNotification(s.userId, {
          type: NotificationType.SYSTEM,
          title:
            window === 'daily'
              ? '🐾 你的萌宠今日小结'
              : '🐾 你的萌宠本周回顾',
          message: this.formatMessage(report, window),
          metadata: {
            kind: 'pet_report',
            window,
            petSkinId: s.petSkinId,
            report,
          } as any,
        } as any);
        sent++;
      } catch (err) {
        failed++;
        this.logger.warn(
          `report failed user=${s.userId} pet=${s.petSkinId}: ${(err as Error).message}`,
        );
      }
    }
    this.logger.log(
      `🐾 pet ${window} reports — sent=${sent} skipped=${skipped} failed=${failed}`,
    );
  }

  private formatMessage(r: PetDailyReport, window: 'daily' | 'weekly'): string {
    const reward = (r.rewardEarnedCents / 100).toFixed(2);
    const cost = (r.llmCostCents / 100).toFixed(2);
    const prefix = window === 'daily' ? '今日' : '本周';
    return (
      `${prefix}完成任务 ${r.dispatchesCompleted}/${r.dispatches}，` +
      `净收益 $${reward}，LLM 调用 ${r.llmCalls} 次（消耗 $${cost}），` +
      `当前能量 ${r.energyAtEnd}%`
    );
  }
}
