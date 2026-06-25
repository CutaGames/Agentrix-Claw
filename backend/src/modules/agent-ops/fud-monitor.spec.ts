import {
  assessFud,
  buildFudResponseDraft,
  DEFAULT_FUD_THRESHOLDS,
  responsePublishRequiresApproval,
  type FudThresholds,
} from './fud-monitor';
import { NOT_COLLECTED } from './growth-metrics';
import type { SentimentSample } from './community-sentiment';

/**
 * FUD / 情绪监控与响应草稿(任务 20 / 需求 15.3)单测。
 *
 * 覆盖:FUD 等级研判(负面占比映射 + 最小样本)、FUD 焦点话题(仅负面样本)、
 * **只读响应草稿**(仅建议时产出非空草稿;发布需经审批,绝不自动发布)、不编造(无样本 unknown)。
 */
describe('fud-monitor(任务 20 / 需求 15.3)', () => {
  const T: FudThresholds = {
    elevatedNegativeRatioPercent: 30,
    highNegativeRatioPercent: 50,
    minSampleSize: 5,
  };

  const neg = (topics?: string[]): SentimentSample => ({ polarity: 'negative', topics });
  const pos = (topics?: string[]): SentimentSample => ({ polarity: 'positive', topics });
  const neu = (topics?: string[]): SentimentSample => ({ polarity: 'neutral', topics });

  // ───────────────────────── FUD 研判 ─────────────────────────

  describe('FUD 等级研判(需求 15.3)', () => {
    it('样本不足 → unknown,负面占比「未获取」,不建议响应(不编造)', () => {
      const a = assessFud([neg(), pos()], T);
      expect(a.level).toBe('unknown');
      expect(a.negativeRatioPercent).toBe(NOT_COLLECTED);
      expect(a.responseRecommended).toBe(false);
    });

    it('低负面占比 → low,不建议响应', () => {
      // 10 样本,1 负面 = 10% < 30%。
      const samples = [neg(), ...Array(9).fill(0).map(() => pos())];
      const a = assessFud(samples, T);
      expect(a.sampleSize).toBe(10);
      expect(a.level).toBe('low');
      expect(a.negativeRatioPercent).toBe(10);
      expect(a.responseRecommended).toBe(false);
    });

    it('负面占比达 elevated 阈值 → elevated,建议响应', () => {
      // 10 样本,4 负面 = 40% ∈ [30,50)。
      const samples = [...Array(4).fill(0).map(() => neg()), ...Array(6).fill(0).map(() => pos())];
      const a = assessFud(samples, T);
      expect(a.level).toBe('elevated');
      expect(a.negativeRatioPercent).toBe(40);
      expect(a.responseRecommended).toBe(true);
    });

    it('负面占比达 high 阈值 → high,建议响应', () => {
      // 10 样本,6 负面 = 60% ≥ 50%。
      const samples = [...Array(6).fill(0).map(() => neg()), ...Array(4).fill(0).map(() => pos())];
      const a = assessFud(samples, T);
      expect(a.level).toBe('high');
      expect(a.negativeRatioPercent).toBe(60);
      expect(a.responseRecommended).toBe(true);
    });

    it('FUD 焦点话题仅取负面样本(判定依据)', () => {
      const samples = [
        neg(['rug', 'team']),
        neg(['rug']),
        neg(['rug']),
        pos(['moon', 'team']), // 正面话题不计入 FUD 焦点
        neu(['team']),
      ];
      const a = assessFud(samples, T);
      // rug 出现 3 次(全负面)→ 焦点首位。
      expect(a.fudTopics[0]).toEqual({ topic: 'rug', count: 3 });
      expect(a.fudTopics.map((t) => t.topic)).not.toContain('moon');
    });
  });

  // ───────────────────────── 响应草稿(只读不发布) ─────────────────────────

  describe('响应草稿(只读;发布需审批,需求 15.3)', () => {
    it('建议响应时产出非空草稿,引用 FUD 焦点话题,且声明需审批', () => {
      const a = assessFud(
        [...Array(6).fill(0).map(() => neg(['rug', 'unlock'])), ...Array(4).fill(0).map(() => pos())],
        T,
      );
      const draft = buildFudResponseDraft(a, { projectName: 'Acme' });
      expect(draft.responseRecommended).toBe(true);
      expect(draft.draft.length).toBeGreaterThan(0);
      expect(draft.draft).toContain('Acme');
      expect(draft.addressedTopics).toContain('rug');
      expect(draft.publishRequiresApproval).toBe(true);
      // 草稿不含价格承诺/收益保证类措辞(红线话术)。
      expect(draft.draft).not.toMatch(/必涨|稳赚|保证收益|翻倍/);
    });

    it('low / unknown 不产出草稿(不无依据发声)', () => {
      const low = assessFud([neg(), ...Array(9).fill(0).map(() => pos())], T);
      const draftLow = buildFudResponseDraft(low);
      expect(draftLow.responseRecommended).toBe(false);
      expect(draftLow.draft).toBe('');
      expect(draftLow.addressedTopics).toEqual([]);
      expect(draftLow.publishRequiresApproval).toBe(true);

      const unknown = assessFud([neg()], T);
      const draftUnknown = buildFudResponseDraft(unknown);
      expect(draftUnknown.draft).toBe('');
      expect(draftUnknown.publishRequiresApproval).toBe(true);
    });

    it('发布响应恒需审批标记为 true(绝不自动发布)', () => {
      expect(responsePublishRequiresApproval).toBe(true);
    });

    it('默认阈值可用', () => {
      expect(DEFAULT_FUD_THRESHOLDS.minSampleSize).toBeGreaterThan(0);
      const a = assessFud([], DEFAULT_FUD_THRESHOLDS);
      expect(a.level).toBe('unknown');
    });
  });
});
