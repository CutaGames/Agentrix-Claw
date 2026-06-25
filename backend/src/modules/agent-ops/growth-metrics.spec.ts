import {
  NOT_COLLECTED,
  isNotCollected,
  realFollowerCount,
  computeNetFollowerGrowth,
  computeImpressions,
  computeEngagementCount,
  computeEngagementRatePercent,
  screenGrowthPath,
  evaluateInteractionBudget,
  buildGrowthWeeklyMetrics,
  toReportedMetric,
} from './growth-metrics';

/**
 * 社媒增长运营口径单测(crypto-native-agent-ops 任务 19.1 / 需求 14.1–14.6)。
 *
 * 覆盖:真实增长口径(净增/曝光/互动率,仅平台原生非 bot)、缺失即「未获取」不编造、
 * 拒刷量(红线)、单账号单平台日互动限流(触顶即停并告警),以及周报组装。
 */
describe('growth-metrics (任务 19.1 / 需求 14)', () => {
  // ───────────── 真实增长口径(需求 14.2 + 共同前提) ─────────────

  describe('realFollowerCount(真实粉丝 = 平台原生 − bot)', () => {
    it('扣除 bot/spam 标记数', () => {
      expect(realFollowerCount({ reported: 1000, botFlagged: 120 })).toBe(880);
    });

    it('reported 缺失 → 未获取', () => {
      expect(realFollowerCount({ reported: null, botFlagged: 0 })).toBe(
        NOT_COLLECTED,
      );
    });

    it('botFlagged 缺失 → 未获取(不按 0 估算)', () => {
      expect(
        realFollowerCount({ reported: 1000, botFlagged: undefined }),
      ).toBe(NOT_COLLECTED);
    });

    it('bot 数异常大于 reported → 下限取 0,不出现负数', () => {
      expect(realFollowerCount({ reported: 100, botFlagged: 250 })).toBe(0);
    });
  });

  describe('computeNetFollowerGrowth(粉丝净增 = 周末 − 周初)', () => {
    it('正常净增', () => {
      const net = computeNetFollowerGrowth(
        { reported: 1000, botFlagged: 100 }, // 真实 900
        { reported: 1500, botFlagged: 150 }, // 真实 1350
      );
      expect(net).toBe(450);
    });

    it('真实流失允许为负', () => {
      const net = computeNetFollowerGrowth(
        { reported: 2000, botFlagged: 0 },
        { reported: 1800, botFlagged: 0 },
      );
      expect(net).toBe(-200);
    });

    it('任一侧缺失 → 未获取', () => {
      const net = computeNetFollowerGrowth(
        { reported: null, botFlagged: 0 },
        { reported: 1500, botFlagged: 0 },
      );
      expect(isNotCollected(net)).toBe(true);
    });
  });

  describe('computeImpressions(曝光 = 平台原生 impressions)', () => {
    it('采纳平台原生值', () => {
      expect(computeImpressions(54000)).toBe(54000);
    });

    it('缺失 → 未获取(不以其它字段估算)', () => {
      expect(computeImpressions(null)).toBe(NOT_COLLECTED);
      expect(computeImpressions(undefined)).toBe(NOT_COLLECTED);
    });

    it('负数视为异常 → 未获取', () => {
      expect(computeImpressions(-1)).toBe(NOT_COLLECTED);
    });
  });

  describe('computeEngagementCount(互动量 = 赞+评+转+藏)', () => {
    it('求和', () => {
      expect(
        computeEngagementCount({
          likes: 100,
          comments: 20,
          reposts: 30,
          saves: 10,
        }),
      ).toBe(160);
    });

    it('任一构成缺失 → 未获取', () => {
      expect(
        computeEngagementCount({
          likes: 100,
          comments: null,
          reposts: 30,
          saves: 10,
        }),
      ).toBe(NOT_COLLECTED);
    });
  });

  describe('computeEngagementRatePercent(互动率,两位小数)', () => {
    it('(赞+评+转+藏)/曝光 × 100,四舍五入两位小数', () => {
      // 160 / 5400 * 100 = 2.9629... → 2.96
      const rate = computeEngagementRatePercent(
        { likes: 100, comments: 20, reposts: 30, saves: 10 },
        5400,
      );
      expect(rate).toBe(2.96);
    });

    it('曝光为 0 → 未获取(不报 0% 误导)', () => {
      const rate = computeEngagementRatePercent(
        { likes: 1, comments: 1, reposts: 1, saves: 1 },
        0,
      );
      expect(isNotCollected(rate)).toBe(true);
    });

    it('互动构成缺失 → 未获取', () => {
      const rate = computeEngagementRatePercent(
        { likes: 1, comments: 1, reposts: 1, saves: null },
        5400,
      );
      expect(isNotCollected(rate)).toBe(true);
    });
  });

  // ───────────── 拒刷量(红线,需求 14.4) ─────────────

  describe('screenGrowthPath(拒刷量红线)', () => {
    it('买粉路径 → 命中红线被拒', () => {
      const r = screenGrowthPath('通过买粉快速提升粉丝净增');
      expect(r.ok).toBe(false);
      expect(r.redline).toBe(true);
      expect(r.rule).toContain('abuse:buy_followers');
    });

    it('机器人/假互动路径 → 命中红线被拒', () => {
      const r = screenGrowthPath('用机器人刷赞刷评论拉高互动率');
      expect(r.ok).toBe(false);
      expect(r.redline).toBe(true);
    });

    it('合规路径(优质内容 + 真实互动)→ 通过', () => {
      const r = screenGrowthPath('产出优质内容并以真实账号回复社区提问');
      expect(r.ok).toBe(true);
      expect(r.redline).toBe(false);
    });
  });

  // ───────────── 单账号单平台日互动限流(需求 14.5) ─────────────

  describe('evaluateInteractionBudget(日互动限流,触顶即停并告警)', () => {
    const config = { projectDailyCap: 50, platformTosCap: 80 };

    it('有效上限 = min(项目方设定, 平台 ToS)', () => {
      const d = evaluateInteractionBudget(config, 0, 1);
      expect(d.effectiveCap).toBe(50);
      expect(d.allowed).toBe(true);
      expect(d.capReached).toBe(false);
      expect(d.shouldAlert).toBe(false);
    });

    it('达上限 → 不再放行,触顶告警', () => {
      const d = evaluateInteractionBudget(config, 50, 1);
      expect(d.grantedCount).toBe(0);
      expect(d.allowed).toBe(false);
      expect(d.capReached).toBe(true);
      expect(d.shouldAlert).toBe(true);
      expect(d.reason).toBe('DAILY_INTERACTION_CAP_REACHED');
    });

    it('部分放行:截断到剩余配额并告警(打满上限)', () => {
      const d = evaluateInteractionBudget(config, 48, 5);
      expect(d.grantedCount).toBe(2); // 仅剩 2 个配额
      expect(d.allowed).toBe(true);
      expect(d.capReached).toBe(true);
      expect(d.shouldAlert).toBe(true);
      expect(d.reason).toBe('PARTIAL_GRANT_CAP_LIMIT');
    });

    it('不变式:usedToday + grantedCount ≤ effectiveCap(永不越界)', () => {
      // 正常前提:当日已用量不超有效上限。
      for (const used of [0, 10, 49, 50]) {
        for (const req of [1, 3, 100]) {
          const d = evaluateInteractionBudget(config, used, req);
          expect(used + d.grantedCount).toBeLessThanOrEqual(d.effectiveCap);
        }
      }
    });

    it('已用量超上限(异常)→ 不再放行(grantedCount=0)且告警', () => {
      const d = evaluateInteractionBudget(config, 100, 5);
      expect(d.grantedCount).toBe(0);
      expect(d.allowed).toBe(false);
      expect(d.capReached).toBe(true);
      expect(d.shouldAlert).toBe(true);
    });
  });

  // ───────────── 周报组装(需求 14.2/14.3,不编造) ─────────────

  describe('buildGrowthWeeklyMetrics(周报组装)', () => {
    const source = {
      platform: 'x',
      sourceUrl: 'https://x.com/acct/analytics',
      collectedAt: '2026-05-10T00:00:00.000Z',
    };

    it('完整数据 + 来源 → 三项指标均有值并挂来源,窗口 7 天', () => {
      const report = buildGrowthWeeklyMetrics({
        weekStartFollowers: { reported: 1000, botFlagged: 100 },
        weekEndFollowers: { reported: 1500, botFlagged: 150 },
        platformNativeImpressions: 5400,
        engagement: { likes: 100, comments: 20, reposts: 30, saves: 10 },
        sources: { followers: source, impressions: source, engagement: source },
      });

      expect(report.windowDays).toBe(7);
      expect(report.netFollowerGrowth.value).toBe(450);
      expect(report.netFollowerGrowth.notCollected).toBe(false);
      expect(report.netFollowerGrowth.source).toEqual(source);
      expect(report.impressions.value).toBe(5400);
      expect(report.engagementRatePercent.value).toBe(2.96);
    });

    it('缺失项落「未获取」且不挂来源(不编造)', () => {
      const report = buildGrowthWeeklyMetrics({
        weekStartFollowers: { reported: null, botFlagged: null },
        weekEndFollowers: { reported: 1500, botFlagged: 150 },
        platformNativeImpressions: null,
        engagement: { likes: 100, comments: 20, reposts: 30, saves: 10 },
        sources: { followers: source, impressions: source, engagement: source },
      });

      expect(report.netFollowerGrowth.notCollected).toBe(true);
      expect(report.netFollowerGrowth.value).toBe(NOT_COLLECTED);
      expect(report.netFollowerGrowth.source).toBeNull();
      expect(report.impressions.notCollected).toBe(true);
      // 互动率依赖曝光,曝光缺失 → 互动率亦未获取。
      expect(report.engagementRatePercent.notCollected).toBe(true);
    });

    it('有数值但缺可核来源 → 降级「未获取」(Property 7:不存在无来源的杜撰数值)', () => {
      const metric = toReportedMetric(450, null);
      // toReportedMetric 本身不强制来源,但 buildGrowthWeeklyMetrics 会 enforceSource。
      expect(metric.notCollected).toBe(false);

      const report = buildGrowthWeeklyMetrics({
        weekStartFollowers: { reported: 1000, botFlagged: 100 },
        weekEndFollowers: { reported: 1500, botFlagged: 150 },
        platformNativeImpressions: 5400,
        engagement: { likes: 100, comments: 20, reposts: 30, saves: 10 },
        sources: { followers: null, impressions: null, engagement: null },
      });
      expect(report.netFollowerGrowth.notCollected).toBe(true);
      expect(report.impressions.notCollected).toBe(true);
      expect(report.engagementRatePercent.notCollected).toBe(true);
    });
  });
});
