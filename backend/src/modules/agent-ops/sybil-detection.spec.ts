import fc from 'fast-check';

import {
  buildSybilDetectionReport,
  dispositionIsProjectOwnerDecision,
  flaggedParticipants,
  reverseSybilUseProhibited,
  riskBandForScore,
  SYBIL_RISK_BAND_THRESHOLDS,
  type SybilDetectionReport,
} from './sybil-detection';
import {
  DEFAULT_SYBIL_THRESHOLDS,
  type ParticipantOnchainBehavior,
  type SybilThresholds,
} from './quest-verification';
import * as sybilModule from './sybil-detection';

/**
 * Sybil 只读链上行为检测(任务 20 / 需求 15.2)单测。
 *
 * 覆盖:sybil 评分(信号累计 + 等级映射)、可疑簇识别、**只读不处置**(无任何
 * 发放/扣发/封禁函数;dispositionIsProjectOwnerDecision 恒为 true)。
 */
describe('sybil-detection(任务 20 / 需求 15.2)', () => {
  const T: SybilThresholds = {
    minTxCount: 5,
    minWalletAgeDays: 7,
    minDistinctCounterparties: 3,
    minClusterSize: 3,
    riskScoreThreshold: 50,
  };

  // ───────────────────────── sybil 评分 ─────────────────────────

  describe('sybil 评分(评分 + 依据,需求 15.2)', () => {
    it('健康参与者(高活跃/老钱包/多对手/独立资金)→ 评分 0、不标记、无信号', () => {
      const report = buildSybilDetectionReport(
        [
          {
            address: '0xHealthy',
            funderAddress: '0xUniqueFunder',
            txCount: 100,
            walletAgeDays: 365,
            distinctCounterparties: 30,
          },
        ],
        T,
      );
      expect(report.totalAnalyzed).toBe(1);
      const e = report.entries[0];
      expect(e.riskScore).toBe(0);
      expect(e.flaggedSybil).toBe(false);
      expect(e.signals).toEqual([]);
      expect(e.riskBand).toBe('low');
      expect(report.flaggedCount).toBe(0);
    });

    it('低活跃 + 新钱包 + 单一对手(无簇)→ 累计 25+15+10=50,达阈值被标记', () => {
      const report = buildSybilDetectionReport(
        [
          {
            address: '0xWeak',
            funderAddress: '0xLoneFunder',
            txCount: 1,
            walletAgeDays: 1,
            distinctCounterparties: 1,
          },
        ],
        T,
      );
      const e = report.entries[0];
      expect(e.signals).toEqual(
        expect.arrayContaining([
          'low_onchain_activity',
          'new_wallet',
          'single_counterparty_pattern',
        ]),
      );
      expect(e.riskScore).toBe(50);
      expect(e.flaggedSybil).toBe(true);
      expect(e.riskBand).toBe('high');
    });

    it('共享资金来源 → 可疑簇 + shared_funding_cluster 信号(权重 50)', () => {
      const shared = '0xShared';
      const behaviors: ParticipantOnchainBehavior[] = [
        { address: '0xA', funderAddress: shared, txCount: 50, walletAgeDays: 100, distinctCounterparties: 10 },
        { address: '0xB', funderAddress: shared, txCount: 50, walletAgeDays: 100, distinctCounterparties: 10 },
        { address: '0xC', funderAddress: shared, txCount: 50, walletAgeDays: 100, distinctCounterparties: 10 },
      ];
      const report = buildSybilDetectionReport(behaviors, T);
      expect(report.clusterCount).toBe(1);
      expect(report.suspiciousClusters[0].members.sort()).toEqual(['0xa', '0xb', '0xc']);
      for (const e of report.entries) {
        expect(e.signals).toContain('shared_funding_cluster');
        expect(e.riskScore).toBe(50);
        expect(e.flaggedSybil).toBe(true);
        expect(e.clusterId).toBe('0xshared');
      }
      expect(report.flaggedCount).toBe(3);
    });

    it('缺失字段的信号不计入(不编造,Property 7)', () => {
      const report = buildSybilDetectionReport(
        [{ address: '0xPartial', txCount: null, walletAgeDays: undefined }],
        T,
      );
      const e = report.entries[0];
      // 仅地址,无任何可判信号 → 评分 0。
      expect(e.signals).toEqual([]);
      expect(e.riskScore).toBe(0);
    });

    it('按风险评分降序、评分相同按标识升序(确定性排序)', () => {
      const report = buildSybilDetectionReport(
        [
          { address: '0xZ', txCount: 100, walletAgeDays: 100, distinctCounterparties: 10 }, // 0
          { address: '0xHigh', txCount: 1, walletAgeDays: 1, distinctCounterparties: 1 }, // 50
          { address: '0xA', txCount: 100, walletAgeDays: 100, distinctCounterparties: 10 }, // 0
        ],
        T,
      );
      const scores = report.entries.map((e) => e.riskScore);
      // 非升序。
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
      }
      // 同分(0)按标识升序:0xa 在 0xz 之前。
      const zeroIds = report.entries.filter((e) => e.riskScore === 0).map((e) => e.identifier);
      expect(zeroIds).toEqual(['0xa', '0xz']);
    });

    it('按地址去重(保留首现,统计剔除数)', () => {
      const report = buildSybilDetectionReport(
        [
          { address: '0xDup', txCount: 100, walletAgeDays: 100, distinctCounterparties: 10 },
          { address: '0xDUP', txCount: 1, walletAgeDays: 1, distinctCounterparties: 1 },
        ],
        T,
      );
      expect(report.totalAnalyzed).toBe(1);
      expect(report.duplicatesRemoved).toBe(1);
      // 保留首现读数(健康)。
      expect(report.entries[0].riskScore).toBe(0);
    });

    it('riskBandForScore 边界映射', () => {
      expect(riskBandForScore(0)).toBe('low');
      expect(riskBandForScore(SYBIL_RISK_BAND_THRESHOLDS.medium - 0.01)).toBe('low');
      expect(riskBandForScore(SYBIL_RISK_BAND_THRESHOLDS.medium)).toBe('medium');
      expect(riskBandForScore(SYBIL_RISK_BAND_THRESHOLDS.high - 0.01)).toBe('medium');
      expect(riskBandForScore(SYBIL_RISK_BAND_THRESHOLDS.high)).toBe('high');
      expect(riskBandForScore(100)).toBe('high');
    });
  });

  // ───────────────────────── 只读不处置(15.2 / 14.18) ─────────────────────────

  describe('只读不处置(需求 15.2 / 14.18)', () => {
    it('报告携带 dispositionIsProjectOwnerDecision=true', () => {
      const report = buildSybilDetectionReport([{ address: '0xA' }], T);
      expect(report.dispositionIsProjectOwnerDecision).toBe(true);
      expect(dispositionIsProjectOwnerDecision).toBe(true);
    });

    it('禁止反向用于制造 sybil 标记恒为 true', () => {
      expect(reverseSybilUseProhibited).toBe(true);
    });

    it('模块 SHALL NOT 暴露任何处置(发放/扣发/封禁/分发)函数', () => {
      const exported = Object.keys(sybilModule);
      // 锚定动词在导出名开头(典型函数命名),避免误伤 riskBand* 等只读名。
      const dispositionLike = exported.filter((name) =>
        /^(disburse|payout|distribute|reward|ban|block|revoke|slash|grant|reject|exclude|enforce)/i.test(
          name,
        ),
      );
      expect(dispositionLike).toEqual([]);
    });

    it('flaggedParticipants 仅做只读筛选,不改动报告', () => {
      const report = buildSybilDetectionReport(
        [
          { address: '0xWeak', txCount: 1, walletAgeDays: 1, distinctCounterparties: 1 },
          { address: '0xOk', txCount: 100, walletAgeDays: 100, distinctCounterparties: 10 },
        ],
        T,
      );
      const before = JSON.stringify(report);
      const flagged = flaggedParticipants(report);
      expect(flagged.every((e) => e.flaggedSybil)).toBe(true);
      expect(JSON.stringify(report)).toBe(before);
    });
  });

  // ───────────────────────── Property:评分单调 + 不处置不变式 ─────────────────────────

  describe('Property — sybil 评分稳健性与只读不处置', () => {
    const behaviorArb = fc.record({
      address: fc.hexaString({ minLength: 1, maxLength: 8 }).map((s) => `0x${s}`),
      funderAddress: fc.option(
        fc.hexaString({ minLength: 1, maxLength: 4 }).map((s) => `0xf${s}`),
        { nil: undefined },
      ),
      txCount: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
      walletAgeDays: fc.option(fc.integer({ min: 0, max: 1000 }), { nil: undefined }),
      distinctCounterparties: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
    });

    it('**Validates: Requirements 15.2** — 任意输入下评分 ∈ [0,100],flaggedSybil ⇔ score≥阈值,且处置归属恒为项目方', () => {
      fc.assert(
        fc.property(fc.array(behaviorArb, { maxLength: 30 }), (behaviors) => {
          const report: SybilDetectionReport = buildSybilDetectionReport(
            behaviors as ParticipantOnchainBehavior[],
            DEFAULT_SYBIL_THRESHOLDS,
          );
          // 只读不处置不变式。
          expect(report.dispositionIsProjectOwnerDecision).toBe(true);
          // 统计自洽。
          expect(report.totalAnalyzed).toBe(report.entries.length);
          expect(report.clusterCount).toBe(report.suspiciousClusters.length);
          let flagged = 0;
          for (let i = 0; i < report.entries.length; i++) {
            const e = report.entries[i];
            expect(e.riskScore).toBeGreaterThanOrEqual(0);
            expect(e.riskScore).toBeLessThanOrEqual(100);
            expect(e.flaggedSybil).toBe(
              e.riskScore >= DEFAULT_SYBIL_THRESHOLDS.riskScoreThreshold,
            );
            expect(e.riskBand).toBe(riskBandForScore(e.riskScore));
            if (e.flaggedSybil) flagged++;
            // 降序。
            if (i > 0) {
              expect(report.entries[i - 1].riskScore).toBeGreaterThanOrEqual(e.riskScore);
            }
          }
          expect(report.flaggedCount).toBe(flagged);
        }),
        { numRuns: 200 },
      );
    });
  });
});
