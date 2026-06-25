import fc from 'fast-check';
import {
  computeResponseTimeMetrics,
  computeCleanupVolume,
  computeSentimentMetrics,
  summarizeViolations,
  buildSentimentDailyReport,
  responseDurationSeconds,
  percentile,
  cleanupRequiresApproval,
  batchBanRequiresHumanConfirmation,
  isNotCollected,
  NOT_COLLECTED,
  type ModerationRecord,
  type SentimentSample,
} from './community-sentiment';

/**
 * 社区审核 + 情绪日报纯函数单测(任务 19.5 / 需求 14.20–14.22)。
 *
 * 覆盖:
 *   - 违规识别汇总(14.20):按类型计数,total = 各类型之和。
 *   - 响应时间(14.21):违规出现到处置中位数 + P90;无样本「未获取」;中位数 ≤ P90。
 *   - 清理量(14.21):当日处置条数按类型;未处置不计入;total = byType 之和。
 *   - 情绪(14.21):正/中/负占比 + 主要话题;无样本「未获取」不编造。
 *   - 清理动作审批边界(14.20):清理需审批、批量封禁需人确认(常量恒为 true)。
 */
describe('community-sentiment 纯函数(任务 19.5 / 需求 14.20–14.22)', () => {
  // ───────────────────── 违规识别汇总(14.20) ─────────────────────

  describe('summarizeViolations', () => {
    it('按类型计数,total = 各类型之和', () => {
      const records: ModerationRecord[] = [
        { id: '1', channelId: 'c', violationType: 'spam', detectedAt: '2026-05-10T00:00:00Z' },
        { id: '2', channelId: 'c', violationType: 'spam', detectedAt: '2026-05-10T00:01:00Z' },
        { id: '3', channelId: 'c', violationType: 'scam', detectedAt: '2026-05-10T00:02:00Z' },
        { id: '4', channelId: 'c', violationType: 'prohibited', detectedAt: '2026-05-10T00:03:00Z' },
      ];
      const summary = summarizeViolations(records);
      expect(summary.total).toBe(4);
      expect(summary.byType).toEqual({ spam: 2, scam: 1, prohibited: 1 });
      expect(summary.byType.spam + summary.byType.scam + summary.byType.prohibited).toBe(
        summary.total,
      );
    });
  });

  // ───────────────────── 响应时间(14.21) ─────────────────────

  describe('responseDurationSeconds', () => {
    it('= dispositionedAt − detectedAt(秒)', () => {
      const d = responseDurationSeconds({
        id: '1',
        channelId: 'c',
        violationType: 'spam',
        detectedAt: '2026-05-10T00:00:00Z',
        dispositionedAt: '2026-05-10T00:01:30Z',
      });
      expect(d).toBe(90);
    });

    it('未处置 / 缺时间 → null(不计入,不编造)', () => {
      expect(
        responseDurationSeconds({
          id: '1',
          channelId: 'c',
          violationType: 'spam',
          detectedAt: '2026-05-10T00:00:00Z',
        }),
      ).toBeNull();
    });

    it('处置早于发现(负时长,数据异常)→ null', () => {
      expect(
        responseDurationSeconds({
          id: '1',
          channelId: 'c',
          violationType: 'spam',
          detectedAt: '2026-05-10T00:05:00Z',
          dispositionedAt: '2026-05-10T00:00:00Z',
        }),
      ).toBeNull();
    });
  });

  describe('computeResponseTimeMetrics', () => {
    it('中位数 + P90(只统计已处置记录)', () => {
      // 时长(秒):10, 20, 30, 40, 100(5 条已处置 + 1 条未处置)
      const base = '2026-05-10T00:00:00Z';
      const records: ModerationRecord[] = [
        mk('1', base, '2026-05-10T00:00:10Z', 'delete'),
        mk('2', base, '2026-05-10T00:00:20Z', 'delete'),
        mk('3', base, '2026-05-10T00:00:30Z', 'ban'),
        mk('4', base, '2026-05-10T00:00:40Z', 'ban'),
        mk('5', base, '2026-05-10T00:01:40Z', 'warn'),
        mk('6', base, null, null), // 未处置
      ];
      const m = computeResponseTimeMetrics(records);
      expect(m.dispositionedCount).toBe(5);
      // 中位数(P50)= 30
      expect(m.medianSeconds).toBe(30);
      // P90:rank = 0.9*4 = 3.6 → 40 + (100-40)*0.6 = 76
      expect(m.p90Seconds).toBe(76);
    });

    it('无已处置样本 → 中位数/P90「未获取」(Property 7)', () => {
      const records: ModerationRecord[] = [mk('1', '2026-05-10T00:00:00Z', null, null)];
      const m = computeResponseTimeMetrics(records);
      expect(m.dispositionedCount).toBe(0);
      expect(m.medianSeconds).toBe(NOT_COLLECTED);
      expect(isNotCollected(m.p90Seconds)).toBe(true);
    });
  });

  // ───────────────────── 清理量(14.21) ─────────────────────

  describe('computeCleanupVolume', () => {
    it('当日处置条数按类型;未处置不计入;total = byType 之和', () => {
      const base = '2026-05-10T00:00:00Z';
      const records: ModerationRecord[] = [
        mk('1', base, '2026-05-10T00:00:10Z', 'delete'),
        mk('2', base, '2026-05-10T00:00:20Z', 'delete'),
        mk('3', base, '2026-05-10T00:00:30Z', 'ban'),
        mk('4', base, null, null), // 未处置不计入
        mk('5', base, '2026-05-10T00:00:40Z', null), // 缺动作类型不计入
      ];
      const v = computeCleanupVolume(records);
      expect(v.total).toBe(3);
      expect(v.byType.delete).toBe(2);
      expect(v.byType.ban).toBe(1);
      expect(v.byType.mute).toBe(0);
      const sum = v.byType.delete + v.byType.ban + v.byType.mute + v.byType.warn;
      expect(sum).toBe(v.total);
    });
  });

  // ───────────────────── 情绪(14.21) ─────────────────────

  describe('computeSentimentMetrics', () => {
    it('正/中/负占比(两位小数)+ 主要话题(频次降序)', () => {
      const samples: SentimentSample[] = [
        { polarity: 'positive', topics: ['airdrop', 'price'] },
        { polarity: 'positive', topics: ['airdrop'] },
        { polarity: 'neutral', topics: ['price'] },
        { polarity: 'negative', topics: ['bug'] },
      ];
      const m = computeSentimentMetrics(samples);
      expect(m.total).toBe(4);
      expect(m.positiveRatioPercent).toBe(50);
      expect(m.neutralRatioPercent).toBe(25);
      expect(m.negativeRatioPercent).toBe(25);
      // airdrop:2, price:2, bug:1 → 频次降序,平手按话题名升序
      expect(m.mainTopics[0]).toEqual({ topic: 'airdrop', count: 2 });
      expect(m.mainTopics[1]).toEqual({ topic: 'price', count: 2 });
      expect(m.mainTopics[2]).toEqual({ topic: 'bug', count: 1 });
    });

    it('无样本 → 三项占比「未获取」(不编造)', () => {
      const m = computeSentimentMetrics([]);
      expect(m.total).toBe(0);
      expect(isNotCollected(m.positiveRatioPercent)).toBe(true);
      expect(isNotCollected(m.neutralRatioPercent)).toBe(true);
      expect(isNotCollected(m.negativeRatioPercent)).toBe(true);
      expect(m.mainTopics).toEqual([]);
    });

    it('忽略非法极性与空白话题', () => {
      const m = computeSentimentMetrics([
        { polarity: 'positive', topics: ['  ', 'real'] },
        { polarity: 'invalid' as any, topics: ['ghost'] },
      ]);
      expect(m.total).toBe(1);
      expect(m.mainTopics).toEqual([{ topic: 'real', count: 1 }]);
    });

    it('topicLimit 截断主要话题', () => {
      const m = computeSentimentMetrics(
        [{ polarity: 'neutral', topics: ['a', 'b', 'c', 'd'] }],
        2,
      );
      expect(m.mainTopics).toHaveLength(2);
    });
  });

  // ───────────────────── 日报组装(14.21) ─────────────────────

  describe('buildSentimentDailyReport', () => {
    it('汇总违规/响应时间/清理量/情绪四口径', () => {
      const base = '2026-05-10T00:00:00Z';
      const report = buildSentimentDailyReport({
        date: '2026-05-10',
        moderationRecords: [
          { ...mk('1', base, '2026-05-10T00:00:10Z', 'delete'), violationType: 'spam' },
          { ...mk('2', base, '2026-05-10T00:00:30Z', 'ban'), violationType: 'scam' },
        ],
        sentimentSamples: [
          { polarity: 'positive', topics: ['x'] },
          { polarity: 'negative', topics: ['y'] },
        ],
      });
      expect(report.date).toBe('2026-05-10');
      expect(report.violations.total).toBe(2);
      expect(report.responseTime.dispositionedCount).toBe(2);
      expect(report.cleanup.total).toBe(2);
      expect(report.sentiment.total).toBe(2);
    });
  });

  // ───────────────────── 审批边界(14.20) ─────────────────────

  it('清理需审批、批量封禁需人确认(14.20)', () => {
    expect(cleanupRequiresApproval).toBe(true);
    expect(batchBanRequiresHumanConfirmation).toBe(true);
  });

  // ───────────────────── 属性测试(不变式) ─────────────────────

  describe('属性:不变式', () => {
    it('percentile 单调:median(P50) ≤ P90', () => {
      fc.assert(
        fc.property(
          fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 200 }),
          (durations) => {
            const sorted = [...durations].sort((a, b) => a - b);
            expect(percentile(sorted, 50)).toBeLessThanOrEqual(percentile(sorted, 90) + 1e-9);
          },
        ),
      );
    });

    it('清理量 total 恒等于 byType 各项之和', () => {
      const arb = fc.array(
        fc.record({
          dispositioned: fc.boolean(),
          action: fc.constantFrom('delete', 'ban', 'mute', 'warn'),
        }),
        { maxLength: 100 },
      );
      fc.assert(
        fc.property(arb, (rows) => {
          const records: ModerationRecord[] = rows.map((r, i) => ({
            id: String(i),
            channelId: 'c',
            violationType: 'spam',
            detectedAt: '2026-05-10T00:00:00Z',
            dispositionedAt: r.dispositioned ? '2026-05-10T00:01:00Z' : null,
            dispositionAction: r.dispositioned ? (r.action as any) : null,
          }));
          const v = computeCleanupVolume(records);
          const sum = v.byType.delete + v.byType.ban + v.byType.mute + v.byType.warn;
          expect(sum).toBe(v.total);
        }),
      );
    });

    it('情绪占比有样本时三项和 ≈ 100(两位小数容差)', () => {
      const arb = fc.array(fc.constantFrom('positive', 'neutral', 'negative'), {
        minLength: 1,
        maxLength: 200,
      });
      fc.assert(
        fc.property(arb, (polarities) => {
          const samples: SentimentSample[] = polarities.map((p) => ({ polarity: p as any }));
          const m = computeSentimentMetrics(samples);
          const sum =
            (m.positiveRatioPercent as number) +
            (m.neutralRatioPercent as number) +
            (m.negativeRatioPercent as number);
          // 两位小数取整后,三项和应在 [99.97, 100.03] 内。
          expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.05);
        }),
      );
    });
  });
});

// ───────────────────── 测试工具 ─────────────────────

function mk(
  id: string,
  detectedAt: string,
  dispositionedAt: string | null,
  dispositionAction: 'delete' | 'ban' | 'mute' | 'warn' | null,
): ModerationRecord {
  return {
    id,
    channelId: 'c',
    violationType: 'spam',
    detectedAt,
    dispositionedAt,
    dispositionAction,
  };
}
