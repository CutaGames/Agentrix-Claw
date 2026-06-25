import fc from 'fast-check';
import {
  KolCandidate,
  AuthenticityThresholds,
  OutreachRecord,
  kolIdentifier,
  dedupKolCandidates,
  checkKolCompleteness,
  screenKolAuthenticity,
  computeFollowerToInteractionRatio,
  buildQualifiedKolList,
  computeKolCrmMetrics,
  requiresHumanConfirmation,
  HUMAN_CONFIRMATION_ACTIVITIES,
} from './kol-crm';
import { NOT_COLLECTED, isNotCollected } from './growth-metrics';

/**
 * KOL 发现 / 外联 / CRM 口径单测(crypto-native-agent-ops 任务 19.3 / 需求 14.11–14.15)。
 *
 * 覆盖:
 *   - 去重(按唯一标识 platform:handle,需求 14.12)。
 *   - 完整性(每条必备 5 字段,需求 14.11)。
 *   - 真实性核验:互动率低于阈值 / 粉丝-互动比异常 → 疑似造假,标记不计合格(需求 14.12)。
 *   - 合格 KOL 名单产出(去重 + 完整 + 非疑似,需求 14.11/14.12)。
 *   - CRM 量化:触达数 = 唯一外联条数;回复率 = 回复/触达;转化合作数 = converted(需求 14.13)。
 *   - 谈判人确认门:报价/佣金/签约/对外承诺 → 🔴 人确认(需求 14.14)。
 */
describe('kol-crm (任务 19.3 / 需求 14.11–14.15)', () => {
  const thresholds: AuthenticityThresholds = {
    minEngagementRatePercent: 1.0, // 互动率 <1% → 疑似
    maxFollowerToInteractionRatio: 1000, // 粉丝/互动 >1000 → 比例异常
  };

  function makeCandidate(overrides: Partial<KolCandidate> = {}): KolCandidate {
    return {
      handle: '@cryptowhale',
      platform: 'x',
      followerCount: 50000,
      avgEngagementRate30d: 3.5,
      avgInteractions30d: 800,
      relevanceTags: ['defi', 'l2'],
      sourceUrl: 'https://x.com/cryptowhale',
      ...overrides,
    };
  }

  // ───────────── 去重(14.12) ─────────────

  describe('kolIdentifier / dedupKolCandidates', () => {
    it('唯一标识归一化(去 @、小写、platform:handle)', () => {
      expect(kolIdentifier(makeCandidate({ handle: '@CryptoWhale', platform: 'X' }))).toBe(
        'x:cryptowhale',
      );
    });

    it('按唯一标识去重,统计剔除数(保留首现)', () => {
      const list = [
        makeCandidate({ handle: '@a' }),
        makeCandidate({ handle: 'A' }), // 归一化后与 @a 相同
        makeCandidate({ handle: '@b' }),
      ];
      const res = dedupKolCandidates(list);
      expect(res.unique.length).toBe(2);
      expect(res.duplicatesRemoved).toBe(1);
    });

    it('同 handle 不同平台不算重复', () => {
      const list = [
        makeCandidate({ handle: '@a', platform: 'x' }),
        makeCandidate({ handle: '@a', platform: 'telegram' }),
      ];
      expect(dedupKolCandidates(list).duplicatesRemoved).toBe(0);
    });

    it('空 handle 不可去重,原样保留', () => {
      const list = [makeCandidate({ handle: '' }), makeCandidate({ handle: '' })];
      const res = dedupKolCandidates(list);
      expect(res.unique.length).toBe(2);
      expect(res.duplicatesRemoved).toBe(0);
    });
  });

  // ───────────── 完整性(14.11) ─────────────

  describe('checkKolCompleteness', () => {
    it('五字段齐全 → 完整', () => {
      const res = checkKolCompleteness(makeCandidate());
      expect(res.complete).toBe(true);
      expect(res.missingFields).toEqual([]);
    });

    it('缺可核来源 → 不完整(14.11)', () => {
      const res = checkKolCompleteness(makeCandidate({ sourceUrl: '' }));
      expect(res.complete).toBe(false);
      expect(res.missingFields).toContain('sourceUrl');
    });

    it('缺粉丝量 / 互动率(未获取)→ 不完整', () => {
      const res = checkKolCompleteness(
        makeCandidate({ followerCount: null, avgEngagementRate30d: undefined }),
      );
      expect(res.complete).toBe(false);
      expect(res.missingFields).toEqual(
        expect.arrayContaining(['followerCount', 'avgEngagementRate30d']),
      );
    });

    it('空相关性标签 → 不完整', () => {
      const res = checkKolCompleteness(makeCandidate({ relevanceTags: [] }));
      expect(res.complete).toBe(false);
      expect(res.missingFields).toContain('relevanceTags');
    });
  });

  // ───────────── 真实性核验(14.12) ─────────────

  describe('screenKolAuthenticity', () => {
    it('健康账号(互动率达标 + 比例正常)→ 非疑似', () => {
      const res = screenKolAuthenticity(makeCandidate(), thresholds);
      expect(res.suspectedFake).toBe(false);
      expect(res.signals).toEqual([]);
    });

    it('互动率低于阈值 → 疑似(engagement_below_threshold)', () => {
      const res = screenKolAuthenticity(
        makeCandidate({ avgEngagementRate30d: 0.3 }),
        thresholds,
      );
      expect(res.suspectedFake).toBe(true);
      expect(res.signals).toContain('engagement_below_threshold');
    });

    it('粉丝/互动比异常 → 疑似(follower_engagement_ratio_abnormal)', () => {
      // 200 万粉丝、均互动 100 → 比例 20000 > 1000。
      const res = screenKolAuthenticity(
        makeCandidate({ followerCount: 2_000_000, avgInteractions30d: 100 }),
        thresholds,
      );
      expect(res.suspectedFake).toBe(true);
      expect(res.signals).toContain('follower_engagement_ratio_abnormal');
    });

    it('互动率未获取 → 不据以编造「低于阈值」信号', () => {
      const res = screenKolAuthenticity(
        makeCandidate({ avgEngagementRate30d: null }),
        thresholds,
      );
      expect(res.signals).not.toContain('engagement_below_threshold');
    });

    it('互动量未获取 → 比例「未获取」,不判异常', () => {
      const res = screenKolAuthenticity(
        makeCandidate({ avgInteractions30d: null }),
        thresholds,
      );
      expect(isNotCollected(res.followerToInteractionRatio)).toBe(true);
      expect(res.signals).not.toContain('follower_engagement_ratio_abnormal');
    });
  });

  describe('computeFollowerToInteractionRatio', () => {
    it('正常计算(两位小数)', () => {
      expect(
        computeFollowerToInteractionRatio(
          makeCandidate({ followerCount: 50000, avgInteractions30d: 800 }),
        ),
      ).toBe(62.5);
    });

    it('互动量为 0 → 未获取(避免除零)', () => {
      expect(
        computeFollowerToInteractionRatio(
          makeCandidate({ avgInteractions30d: 0 }),
        ),
      ).toBe(NOT_COLLECTED);
    });
  });

  // ───────────── 合格名单(14.11 ∧ 14.12) ─────────────

  describe('buildQualifiedKolList', () => {
    it('去重 + 完整 + 非疑似 → 合格;疑似/不完整分流且不计合格', () => {
      const list = [
        makeCandidate({ handle: '@good' }), // 合格
        makeCandidate({ handle: '@GOOD' }), // 与 @good 重复 → 去重
        makeCandidate({ handle: '@fake', avgEngagementRate30d: 0.2 }), // 疑似刷粉
        makeCandidate({ handle: '@nosrc', sourceUrl: '' }), // 不完整
      ];
      const res = buildQualifiedKolList(list, thresholds);
      expect(res.duplicatesRemoved).toBe(1);
      expect(res.qualifiedCount).toBe(1);
      expect(res.qualified[0].identifier).toBe('x:good');
      expect(res.flaggedSuspect.map((e) => e.identifier)).toEqual(['x:fake']);
      expect(res.incomplete.map((e) => e.identifier)).toEqual(['x:nosrc']);
    });

    it('疑似造假即便字段完整也不计入合格 KOL(14.12)', () => {
      const list = [makeCandidate({ avgEngagementRate30d: 0.1 })];
      const res = buildQualifiedKolList(list, thresholds);
      expect(res.qualifiedCount).toBe(0);
      expect(res.flaggedSuspect.length).toBe(1);
      expect(res.flaggedSuspect[0].qualified).toBe(false);
    });

    it('空输入 → 全 0', () => {
      const res = buildQualifiedKolList([], thresholds);
      expect(res).toMatchObject({ qualifiedCount: 0, duplicatesRemoved: 0 });
    });
  });

  // ───────────── CRM 量化(14.13) ─────────────

  describe('computeKolCrmMetrics', () => {
    function rec(handle: string, stage: OutreachRecord['stage']): OutreachRecord {
      return { handle, platform: 'x', stage };
    }

    it('触达数=唯一外联条数;回复率=回复/触达;转化=converted', () => {
      const records = [
        rec('@a', 'reached'),
        rec('@b', 'replied'),
        rec('@c', 'converted'),
        rec('@d', 'in_negotiation'),
      ];
      const m = computeKolCrmMetrics(records);
      expect(m.reachCount).toBe(4);
      expect(m.replyCount).toBe(3); // replied + converted + in_negotiation
      expect(m.conversionCount).toBe(1);
      expect(m.replyRatePercent).toBe(75);
      expect(m.conversionRatePercent).toBe(25);
    });

    it('同一 KOL 多次外联只计一条(去重,保留最高阶段)', () => {
      const records = [
        rec('@a', 'reached'),
        rec('@A', 'converted'), // 同一 KOL,进阶到 converted
      ];
      const m = computeKolCrmMetrics(records);
      expect(m.reachCount).toBe(1);
      expect(m.replyCount).toBe(1);
      expect(m.conversionCount).toBe(1);
    });

    it('触达数为 0 → 回复率/转化率「未获取」(不编造)', () => {
      const m = computeKolCrmMetrics([]);
      expect(m.reachCount).toBe(0);
      expect(m.replyRatePercent).toBe(NOT_COLLECTED);
      expect(m.conversionRatePercent).toBe(NOT_COLLECTED);
    });
  });

  // ───────────── 谈判人确认门(14.14) ─────────────

  describe('requiresHumanConfirmation', () => {
    it('报价/佣金/签约/对外承诺 → 必须 🔴 人确认', () => {
      for (const a of ['quote', 'commission', 'sign', 'commitment'] as const) {
        expect(requiresHumanConfirmation(a)).toBe(true);
        expect(HUMAN_CONFIRMATION_ACTIVITIES.has(a)).toBe(true);
      }
    });

    it('发现/CRM/外联 → 非 🔴(走 🟢/🟡)', () => {
      for (const a of ['discovery', 'crm', 'outreach'] as const) {
        expect(requiresHumanConfirmation(a)).toBe(false);
      }
    });
  });

  // ───────────── 属性测试(fast-check) ─────────────

  describe('属性测试(fast-check)', () => {
    // 14.12:合格 KOL ⇔ 字段完整 ∧ 非疑似造假;疑似项永不计入合格。
    it('合格 ⇔ 完整 ∧ 非疑似;三类分流互斥且总数守恒(去重后)', () => {
      const candidateArb = fc.record({
        handle: fc.string({ minLength: 1, maxLength: 6 }),
        platform: fc.constantFrom('x', 'telegram', 'youtube'),
        followerCount: fc.option(fc.integer({ min: 0, max: 5_000_000 }), {
          nil: null,
        }),
        avgEngagementRate30d: fc.option(
          fc.double({ min: 0, max: 20, noNaN: true }),
          { nil: null },
        ),
        avgInteractions30d: fc.option(fc.integer({ min: 0, max: 100_000 }), {
          nil: null,
        }),
        relevanceTags: fc.array(fc.string(), { maxLength: 3 }),
        sourceUrl: fc.option(fc.string(), { nil: null }),
      });

      fc.assert(
        fc.property(
          fc.array(candidateArb, { maxLength: 30 }),
          (candidates) => {
            const res = buildQualifiedKolList(
              candidates as KolCandidate[],
              thresholds,
            );

            // 每个合格条目:完整 ∧ 非疑似。
            for (const e of res.qualified) {
              expect(e.complete).toBe(true);
              expect(e.authenticity.suspectedFake).toBe(false);
              expect(e.qualified).toBe(true);
            }
            // 疑似项:完整但 suspectedFake,绝不计入合格。
            for (const e of res.flaggedSuspect) {
              expect(e.complete).toBe(true);
              expect(e.authenticity.suspectedFake).toBe(true);
              expect(e.qualified).toBe(false);
            }
            // 不完整项:complete=false。
            for (const e of res.incomplete) {
              expect(e.complete).toBe(false);
              expect(e.qualified).toBe(false);
            }

            // 三类互斥且守恒:三类之和 = 去重后唯一条数。
            const uniqueCount = dedupKolCandidates(
              candidates as KolCandidate[],
            ).unique.length;
            expect(
              res.qualified.length +
                res.flaggedSuspect.length +
                res.incomplete.length,
            ).toBe(uniqueCount);
            expect(res.qualifiedCount).toBe(res.qualified.length);
          },
        ),
      );
    });

    // 14.13:触达数 ≥ 回复数 ≥ 转化数;回复率/转化率 ∈ [0,100] 或「未获取」。
    it('CRM 漏斗单调:触达 ≥ 回复 ≥ 转化;比率落在 [0,100]', () => {
      const recordArb = fc.record({
        handle: fc.string({ minLength: 1, maxLength: 5 }),
        platform: fc.constantFrom('x', 'telegram'),
        stage: fc.constantFrom<OutreachRecord['stage']>(
          'reached',
          'replied',
          'in_negotiation',
          'converted',
        ),
      });

      fc.assert(
        fc.property(
          fc.array(recordArb, { maxLength: 40 }),
          (records) => {
            const m = computeKolCrmMetrics(records as OutreachRecord[]);
            expect(m.reachCount).toBeGreaterThanOrEqual(m.replyCount);
            expect(m.replyCount).toBeGreaterThanOrEqual(m.conversionCount);

            if (m.reachCount === 0) {
              expect(m.replyRatePercent).toBe(NOT_COLLECTED);
              expect(m.conversionRatePercent).toBe(NOT_COLLECTED);
            } else {
              expect(isNotCollected(m.replyRatePercent)).toBe(false);
              expect(m.replyRatePercent as number).toBeGreaterThanOrEqual(0);
              expect(m.replyRatePercent as number).toBeLessThanOrEqual(100);
              expect(m.conversionRatePercent as number).toBeLessThanOrEqual(100);
            }
          },
        ),
      );
    });
  });
});
