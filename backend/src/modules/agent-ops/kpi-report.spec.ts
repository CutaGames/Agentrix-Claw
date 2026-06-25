import fc from 'fast-check';

import {
  assessReportTimeliness,
  buildKpiDashboardReport,
  DEFAULT_REPORT_GRACE_SECONDS,
  REPORT_PERIOD_SECONDS,
  summarizeMonitoring,
  type ReportPeriod,
} from './kpi-report';
import { buildSybilDetectionReport } from './sybil-detection';
import { assessFud } from './fud-monitor';
import type { MonitorCheckOutcome } from './monitor.types';

/**
 * 运营/数据报告(KPI 看板)+ 按时产出研判(任务 20 / 需求 15.4)单测。
 *
 * 覆盖:报告按时产出研判(onTime / overdueSeconds,含宽限期与首期)、监控汇总(15.1)、
 * KPI 看板组装(汇总监控 + sybil + FUD + 按时研判,可保存/可分享)。
 */
describe('kpi-report(任务 20 / 需求 15.4)', () => {
  const outcome = (over: Partial<MonitorCheckOutcome>): MonitorCheckOutcome => ({
    triggered: false,
    summary: '',
    checkedAt: '2026-05-10T00:00:00.000Z',
    ...over,
  });

  // ───────────────────────── 按时产出研判 ─────────────────────────

  describe('报告按时产出研判(需求 15.4)', () => {
    it('在到期点产出 → 按时(overdueSeconds=0)', () => {
      const last = '2026-05-10T00:00:00.000Z';
      const produced = '2026-05-11T00:00:00.000Z'; // +1 天 = daily 到期
      const s = assessReportTimeliness({ period: 'daily', lastProducedAt: last, producedAt: produced });
      expect(s.onTime).toBe(true);
      expect(s.overdueSeconds).toBe(0);
      expect(s.dueAt).toBe(produced);
    });

    it('到期后、宽限期内产出 → 仍按时', () => {
      const last = '2026-05-10T00:00:00.000Z';
      // 到期 +1 天后再过 30 分钟(< 1 小时宽限)。
      const produced = '2026-05-11T00:30:00.000Z';
      const s = assessReportTimeliness({ period: 'daily', lastProducedAt: last, producedAt: produced });
      expect(s.onTime).toBe(true);
      expect(s.overdueSeconds).toBe(0);
    });

    it('超过宽限期产出 → 逾期(overdueSeconds>0)', () => {
      const last = '2026-05-10T00:00:00.000Z';
      // 到期 +1 天后再过 2 小时(> 1 小时宽限)→ 逾期 1 小时。
      const produced = '2026-05-11T02:00:00.000Z';
      const s = assessReportTimeliness({ period: 'daily', lastProducedAt: last, producedAt: produced });
      expect(s.onTime).toBe(false);
      expect(s.overdueSeconds).toBe(60 * 60);
    });

    it('提前产出 → 按时', () => {
      const last = '2026-05-10T00:00:00.000Z';
      const produced = '2026-05-10T12:00:00.000Z'; // 早于到期
      const s = assessReportTimeliness({ period: 'weekly', lastProducedAt: last, producedAt: produced });
      expect(s.onTime).toBe(true);
      expect(s.overdueSeconds).toBe(0);
    });

    it('首期(无 lastProducedAt)→ 以本次产出为到期点,恒按时', () => {
      const produced = '2026-05-10T00:00:00.000Z';
      for (const period of ['daily', 'weekly', 'monthly'] as ReportPeriod[]) {
        const s = assessReportTimeliness({ period, lastProducedAt: null, producedAt: produced });
        expect(s.onTime).toBe(true);
        expect(s.overdueSeconds).toBe(0);
        expect(s.dueAt).toBe(produced);
      }
    });

    it('零宽限期:晚于到期 1 秒即逾期', () => {
      const last = '2026-05-10T00:00:00.000Z';
      const produced = '2026-05-11T00:00:01.000Z';
      const s = assessReportTimeliness({
        period: 'daily',
        lastProducedAt: last,
        producedAt: produced,
        graceSeconds: 0,
      });
      expect(s.onTime).toBe(false);
      expect(s.overdueSeconds).toBe(1);
    });

    it('非法 producedAt 抛错(不编造时间)', () => {
      expect(() =>
        assessReportTimeliness({ period: 'daily', producedAt: 'not-a-date' }),
      ).toThrow(TypeError);
    });

    it('**Validates: Requirements 15.4** — onTime ⇔ overdueSeconds===0(任意周期/时刻)', () => {
      const periodArb = fc.constantFrom<ReportPeriod>('daily', 'weekly', 'monthly');
      fc.assert(
        fc.property(
          periodArb,
          fc.integer({ min: 0, max: 10_000_000 }), // lastProduced epoch sec
          fc.integer({ min: 0, max: 20_000_000 }), // delta sec after due
          fc.integer({ min: 0, max: 7200 }), // grace
          (period, lastSec, deltaSec, grace) => {
            const lastMs = lastSec * 1000;
            const dueMs = lastMs + REPORT_PERIOD_SECONDS[period] * 1000;
            const producedMs = dueMs + deltaSec * 1000;
            const s = assessReportTimeliness({
              period,
              lastProducedAt: new Date(lastMs).toISOString(),
              producedAt: new Date(producedMs).toISOString(),
              graceSeconds: grace,
            });
            expect(s.onTime).toBe(s.overdueSeconds === 0);
            // delta 在宽限内 ⇒ 按时。
            if (deltaSec <= grace) {
              expect(s.onTime).toBe(true);
            } else {
              expect(s.onTime).toBe(false);
              expect(s.overdueSeconds).toBe(deltaSec - grace);
            }
          },
        ),
        { numRuns: 300 },
      );
    });

    it('默认宽限期为正', () => {
      expect(DEFAULT_REPORT_GRACE_SECONDS).toBeGreaterThan(0);
    });
  });

  // ───────────────────────── 监控汇总(15.1) ─────────────────────────

  describe('监控汇总(需求 15.1)', () => {
    it('统计触发/失败/总数,告警仅含命中项', () => {
      const s = summarizeMonitoring([
        outcome({ triggered: true, summary: '金库异常转出' }),
        outcome({ triggered: false }),
        outcome({ triggered: false, error: 'fetch failed' }),
      ]);
      expect(s.totalChecks).toBe(3);
      expect(s.triggeredCount).toBe(1);
      expect(s.errorCount).toBe(1);
      expect(s.alerts).toHaveLength(1);
      expect(s.alerts[0].summary).toBe('金库异常转出');
    });

    it('空输入 → 全 0(不编造)', () => {
      const s = summarizeMonitoring([]);
      expect(s).toEqual({ totalChecks: 0, triggeredCount: 0, errorCount: 0, alerts: [] });
    });
  });

  // ───────────────────────── KPI 看板组装(15.4) ─────────────────────────

  describe('KPI 看板报告组装(需求 15.4)', () => {
    it('汇总监控 + sybil + FUD + 按时研判,且可保存/可分享', () => {
      const sybilReport = buildSybilDetectionReport([
        { address: '0xA', funderAddress: '0xS', txCount: 1, walletAgeDays: 1, distinctCounterparties: 1 },
        { address: '0xB', funderAddress: '0xS', txCount: 1, walletAgeDays: 1, distinctCounterparties: 1 },
        { address: '0xC', funderAddress: '0xS', txCount: 1, walletAgeDays: 1, distinctCounterparties: 1 },
      ]);
      const fud = assessFud(
        [...Array(6).fill(0).map(() => ({ polarity: 'negative' as const, topics: ['rug'] })), ...Array(4).fill(0).map(() => ({ polarity: 'positive' as const }))],
      );
      const report = buildKpiDashboardReport({
        date: '2026-05-11',
        monitorOutcomes: [outcome({ triggered: true, summary: '提案上链' })],
        sybilReport,
        fud,
        timeliness: {
          period: 'daily',
          lastProducedAt: '2026-05-10T00:00:00.000Z',
          producedAt: '2026-05-11T00:00:00.000Z',
        },
      });

      expect(report.shareable).toBe(true);
      expect(report.monitoring.triggeredCount).toBe(1);
      expect(report.sybil).not.toBeNull();
      expect(report.sybil!.flaggedCount).toBe(3);
      // 看板保留「只读不处置」标记。
      expect(report.sybil!.dispositionIsProjectOwnerDecision).toBe(true);
      expect(report.fud).not.toBeNull();
      expect(report.fud!.level).toBe('high');
      expect(report.fud!.fudTopics).toContain('rug');
      expect(report.schedule.onTime).toBe(true);
    });

    it('缺 sybil / FUD 输入 → 对应切片为 null(不编造)', () => {
      const report = buildKpiDashboardReport({
        date: '2026-05-11',
        monitorOutcomes: [],
        timeliness: { period: 'weekly', producedAt: '2026-05-11T00:00:00.000Z' },
      });
      expect(report.sybil).toBeNull();
      expect(report.fud).toBeNull();
      expect(report.shareable).toBe(true);
      expect(report.schedule.onTime).toBe(true);
    });
  });
});
