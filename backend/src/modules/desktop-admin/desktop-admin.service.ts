import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DesktopCrashRecordEntity } from '../../entities/desktop-crash-record.entity';
import { DesktopAnalyticsEventEntity } from '../../entities/desktop-analytics-event.entity';
import { DesktopDownloadEventEntity } from '../../entities/desktop-download-event.entity';

export type AlertSeverity = 'info' | 'warn' | 'crit';

export interface DesktopDashboard {
  generatedAt: string;
  windowDays: number;
  versionDistribution: Array<{ version: string; deviceCount: number }>;
  crashStats: {
    totalCrashes: number;
    uniqueDevices: number;
    crashRate: number;
    topFingerprints: Array<{
      fingerprint: string;
      type: string;
      sampleMessage: string;
      count: number;
    }>;
    delta7dPercent: number;
  };
  funnel: {
    launches: number;
    logins: number;
    onboardingsComplete: number;
    firstChats: number;
    loginRate: number;
    onboardingRate: number;
    firstChatRate: number;
  };
  updateStats: {
    available: number;
    installed: number;
    failed: number;
    successRate: number;
    failuresByReason: Array<{ reason: string; count: number }>;
  };
  dau: { current: number; delta7dPercent: number };
  downloads: { current: number; bySource: Array<{ source: string; count: number }> };
  alerts: Array<{ severity: AlertSeverity; message: string }>;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DesktopAdminService {
  constructor(
    @InjectRepository(DesktopCrashRecordEntity)
    private readonly crashRepo: Repository<DesktopCrashRecordEntity>,
    @InjectRepository(DesktopAnalyticsEventEntity)
    private readonly eventsRepo: Repository<DesktopAnalyticsEventEntity>,
    @InjectRepository(DesktopDownloadEventEntity)
    private readonly downloadsRepo: Repository<DesktopDownloadEventEntity>,
  ) {}

  async getDashboard(days = 7): Promise<DesktopDashboard> {
    const windowDays = Math.max(1, Math.min(90, days));
    const now = new Date();
    const since = new Date(now.getTime() - windowDays * ONE_DAY_MS);
    const sincePrev = new Date(since.getTime() - windowDays * ONE_DAY_MS);

    const [
      versionDist,
      crashStats,
      funnel,
      updateStats,
      dauNow,
      dauPrev,
      downloads,
    ] = await Promise.all([
      this.versionDistribution(since),
      this.crashStats(since, sincePrev),
      this.funnelStats(since),
      this.updateStats(since),
      this.dauWindow(new Date(now.getTime() - ONE_DAY_MS)),
      this.dauWindow(new Date(now.getTime() - 8 * ONE_DAY_MS), new Date(now.getTime() - 7 * ONE_DAY_MS)),
      this.downloadStats(since),
    ]);

    const alerts: Array<{ severity: AlertSeverity; message: string }> = [];
    if (crashStats.crashRate >= 0.005) {
      alerts.push({
        severity: 'crit',
        message: `Crash rate ${(crashStats.crashRate * 100).toFixed(2)}% exceeds 0.5% GA gate`,
      });
    } else if (crashStats.crashRate >= 0.003) {
      alerts.push({
        severity: 'warn',
        message: `Crash rate ${(crashStats.crashRate * 100).toFixed(2)}% near GA gate threshold`,
      });
    }
    if (updateStats.available > 0 && updateStats.successRate < 0.9) {
      alerts.push({
        severity: 'crit',
        message: `Auto-update success rate ${(updateStats.successRate * 100).toFixed(1)}% < 90%`,
      });
    }
    if (dauNow.deviceCount < 100 && downloads.current >= 100) {
      alerts.push({
        severity: 'warn',
        message: `${downloads.current} downloads but only ${dauNow.deviceCount} DAU — funnel attrition`,
      });
    }

    const dauDelta =
      dauPrev.deviceCount > 0
        ? ((dauNow.deviceCount - dauPrev.deviceCount) / dauPrev.deviceCount) * 100
        : 0;

    return {
      generatedAt: now.toISOString(),
      windowDays,
      versionDistribution: versionDist,
      crashStats,
      funnel,
      updateStats,
      dau: { current: dauNow.deviceCount, delta7dPercent: round(dauDelta) },
      downloads,
      alerts,
    };
  }

  // ── Internals ───────────────────────────────────────────────────────

  private async versionDistribution(since: Date) {
    const rows: Array<{ app_version: string; device_count: string }> =
      await this.eventsRepo
        .createQueryBuilder('e')
        .select('e.app_version', 'app_version')
        .addSelect('COUNT(DISTINCT e.device_id_hash)', 'device_count')
        .where('e.event_name = :name', { name: 'desktop_launch' })
        .andWhere('e.reported_at > :since', { since })
        .groupBy('e.app_version')
        .orderBy('COUNT(DISTINCT e.device_id_hash)', 'DESC')
        .getRawMany();

    return rows.map((r) => ({
      version: r.app_version,
      deviceCount: Number(r.device_count) || 0,
    }));
  }

  private async crashStats(since: Date, sincePrev: Date) {
    const totals: Array<{ total: string; devices: string }> = await this.crashRepo
      .createQueryBuilder('c')
      .select('SUM(c.count)', 'total')
      .addSelect('COUNT(DISTINCT c.device_id_hash)', 'devices')
      .where('c.reported_at > :since', { since })
      .getRawMany();
    const totalCrashes = Number(totals[0]?.total) || 0;
    const uniqueDevices = Number(totals[0]?.devices) || 0;

    const topFingerprintsRaw: Array<{
      fingerprint: string;
      type: string;
      sample_message: string;
      total: string;
    }> = await this.crashRepo
      .createQueryBuilder('c')
      .select('c.fingerprint', 'fingerprint')
      .addSelect('c.type', 'type')
      .addSelect('MIN(c.message)', 'sample_message')
      .addSelect('SUM(c.count)', 'total')
      .where('c.reported_at > :since', { since })
      .groupBy('c.fingerprint')
      .addGroupBy('c.type')
      .orderBy('SUM(c.count)', 'DESC')
      .limit(10)
      .getRawMany();

    const topFingerprints = topFingerprintsRaw.map((r) => ({
      fingerprint: r.fingerprint,
      type: r.type,
      sampleMessage: (r.sample_message || '').slice(0, 200),
      count: Number(r.total) || 0,
    }));

    // DAU for the same window
    const dauRow: Array<{ devices: string }> = await this.eventsRepo
      .createQueryBuilder('e')
      .select('COUNT(DISTINCT e.device_id_hash)', 'devices')
      .where('e.event_name = :name', { name: 'desktop_launch' })
      .andWhere('e.reported_at > :since', { since })
      .getRawMany();
    const windowDau = Number(dauRow[0]?.devices) || 0;
    const crashRate = windowDau > 0 ? totalCrashes / windowDau : 0;

    // Delta vs previous window
    const prevTotals: Array<{ total: string }> = await this.crashRepo
      .createQueryBuilder('c')
      .select('SUM(c.count)', 'total')
      .where('c.reported_at > :sincePrev AND c.reported_at <= :since', { sincePrev, since })
      .getRawMany();
    const prev = Number(prevTotals[0]?.total) || 0;
    const delta7dPercent =
      prev > 0 ? ((totalCrashes - prev) / prev) * 100 : 0;

    return {
      totalCrashes,
      uniqueDevices,
      crashRate: round(crashRate, 6),
      topFingerprints,
      delta7dPercent: round(delta7dPercent),
    };
  }

  private async funnelStats(since: Date) {
    const rows: Array<{ event_name: string; cnt: string }> = await this.eventsRepo
      .createQueryBuilder('e')
      .select('e.event_name', 'event_name')
      .addSelect('COUNT(DISTINCT e.device_id_hash)', 'cnt')
      .where('e.reported_at > :since', { since })
      .andWhere('e.event_name IN (:...names)', {
        names: [
          'desktop_launch',
          'desktop_login',
          'desktop_onboarding_complete',
          'desktop_first_chat',
        ],
      })
      .groupBy('e.event_name')
      .getRawMany();
    const map: Record<string, number> = {};
    rows.forEach((r) => (map[r.event_name] = Number(r.cnt) || 0));
    const launches = map.desktop_launch || 0;
    const logins = map.desktop_login || 0;
    const onboardings = map.desktop_onboarding_complete || 0;
    const firstChats = map.desktop_first_chat || 0;
    return {
      launches,
      logins,
      onboardingsComplete: onboardings,
      firstChats,
      loginRate: launches > 0 ? round(logins / launches, 4) : 0,
      onboardingRate: logins > 0 ? round(onboardings / logins, 4) : 0,
      firstChatRate: onboardings > 0 ? round(firstChats / onboardings, 4) : 0,
    };
  }

  private async updateStats(since: Date) {
    const rows: Array<{ event_name: string; cnt: string }> = await this.eventsRepo
      .createQueryBuilder('e')
      .select('e.event_name', 'event_name')
      .addSelect('COUNT(*)', 'cnt')
      .where('e.reported_at > :since', { since })
      .andWhere('e.event_name IN (:...names)', {
        names: [
          'desktop_update_available',
          'desktop_update_installed',
          'desktop_update_failed',
        ],
      })
      .groupBy('e.event_name')
      .getRawMany();
    const map: Record<string, number> = {};
    rows.forEach((r) => (map[r.event_name] = Number(r.cnt) || 0));
    const available = map.desktop_update_available || 0;
    const installed = map.desktop_update_installed || 0;
    const failed = map.desktop_update_failed || 0;

    const failureReasons: Array<{ reason: string; count: number }> = [];
    if (failed > 0) {
      const reasonRows: Array<{ reason: string; cnt: string }> = await this.eventsRepo
        .createQueryBuilder('e')
        .select(`COALESCE(e.event_props->>'reason', 'unknown')`, 'reason')
        .addSelect('COUNT(*)', 'cnt')
        .where('e.reported_at > :since', { since })
        .andWhere('e.event_name = :name', { name: 'desktop_update_failed' })
        .groupBy(`COALESCE(e.event_props->>'reason', 'unknown')`)
        .orderBy('COUNT(*)', 'DESC')
        .limit(5)
        .getRawMany();
      reasonRows.forEach((r) =>
        failureReasons.push({ reason: r.reason || 'unknown', count: Number(r.cnt) || 0 }),
      );
    }

    return {
      available,
      installed,
      failed,
      successRate: available > 0 ? round(installed / available, 4) : 0,
      failuresByReason: failureReasons,
    };
  }

  private async dauWindow(since: Date, until?: Date) {
    const qb = this.eventsRepo
      .createQueryBuilder('e')
      .select('COUNT(DISTINCT e.device_id_hash)', 'devices')
      .where('e.event_name = :name', { name: 'desktop_launch' })
      .andWhere('e.reported_at > :since', { since });
    if (until) qb.andWhere('e.reported_at <= :until', { until });
    const row = await qb.getRawOne<{ devices: string }>();
    return { deviceCount: Number(row?.devices) || 0 };
  }

  private async downloadStats(since: Date) {
    const totalRow = await this.downloadsRepo
      .createQueryBuilder('d')
      .select('COUNT(*)', 'cnt')
      .where('d.occurred_at > :since', { since })
      .getRawOne<{ cnt: string }>();
    const current = Number(totalRow?.cnt) || 0;

    const sourceRows: Array<{ source: string; cnt: string }> = await this.downloadsRepo
      .createQueryBuilder('d')
      .select(`COALESCE(d.utm_source, 'direct')`, 'source')
      .addSelect('COUNT(*)', 'cnt')
      .where('d.occurred_at > :since', { since })
      .groupBy(`COALESCE(d.utm_source, 'direct')`)
      .orderBy('COUNT(*)', 'DESC')
      .limit(10)
      .getRawMany();
    const bySource = sourceRows.map((r) => ({
      source: r.source,
      count: Number(r.cnt) || 0,
    }));

    return { current, bySource };
  }
}

function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
