import fc from 'fast-check';
import {
  DEFAULT_MIN_WEEKS,
  ContentCalendar,
  ContentSlot,
  validateCalendarCoverage,
  validateAssetCompleteness,
  screenContentCompliance,
  screenCalendarCompliance,
  validateContentCalendar,
} from './content-calendar';

/**
 * 内容 / meme 生产口径单测(crypto-native-agent-ops 任务 19.2 / 需求 14.7–14.10)。
 *
 * 覆盖:
 *   - 内容日历覆盖(默认 ≥4 周,每周条目 ≥ 设定最小频次,需求 14.7)。
 *   - 每发布位配套素材齐全 + 标注(文案 + 图/meme 占位 + 主题/计划时间/平台,需求 14.8)。
 *   - 内容合规筛查:无披露付费喊单/价格承诺/收益保证命中红线即拒(需求 14.9 / Property 3)。
 *   - 综合验收(14.7 ∧ 14.8 ∧ 14.9)。
 */
describe('content-calendar (任务 19.2 / 需求 14.7–14.10)', () => {
  function makeSlot(overrides: Partial<ContentSlot> = {}): ContentSlot {
    return {
      theme: 'launch-teaser',
      scheduledTime: '2026-06-01T09:00:00Z',
      platform: 'x',
      copy: '社区共建,产品上线倒计时。',
      assetPlaceholder: 'meme:rocket-placeholder',
      ...overrides,
    };
  }

  function makeCalendar(weeksCount: number, perWeek: number): ContentCalendar {
    const weeks = Array.from({ length: weeksCount }, (_, wi) => ({
      weekIndex: wi + 1,
      slots: Array.from({ length: perWeek }, (_, si) =>
        makeSlot({ scheduledTime: `2026-06-0${(wi % 9) + 1}T0${si % 9}:00:00Z` }),
      ),
    }));
    return { brandTone: 'playful', themes: ['t1', 't2'], weeks };
  }

  // ───────────── 日历覆盖(14.7) ─────────────

  describe('validateCalendarCoverage', () => {
    it('默认最小周数为 4', () => {
      expect(DEFAULT_MIN_WEEKS).toBe(4);
    });

    it('4 周且每周达频次 → 合格', () => {
      const res = validateCalendarCoverage(makeCalendar(4, 3), 3);
      expect(res.qualified).toBe(true);
      expect(res.weekCount).toBe(4);
      expect(res.weeksSatisfied).toBe(true);
      expect(res.underfilledWeeks).toEqual([]);
    });

    it('不足 4 周 → 不合格(weeksSatisfied=false)', () => {
      const res = validateCalendarCoverage(makeCalendar(3, 3), 3);
      expect(res.qualified).toBe(false);
      expect(res.weeksSatisfied).toBe(false);
    });

    it('某周频次不足 → 不合格并记录该周', () => {
      const cal = makeCalendar(4, 3);
      cal.weeks[2].slots.pop(); // 第 3 周只剩 2 条 < 3
      const res = validateCalendarCoverage(cal, 3);
      expect(res.qualified).toBe(false);
      expect(res.underfilledWeeks).toEqual([
        { weekIndex: 3, required: 3, actual: 2 },
      ]);
    });

    it('可覆盖默认 4 周(显式更高 minWeeks)', () => {
      const res = validateCalendarCoverage(makeCalendar(4, 2), 2, 6);
      expect(res.requiredWeeks).toBe(6);
      expect(res.qualified).toBe(false);
    });

    it('空/缺日历 → 不合格', () => {
      expect(validateCalendarCoverage(null, 3).qualified).toBe(false);
      expect(validateCalendarCoverage({ weeks: [] }, 3).qualified).toBe(false);
    });
  });

  // ───────────── 配套素材(14.8) ─────────────

  describe('validateAssetCompleteness', () => {
    it('所有发布位齐全 → 合格', () => {
      const res = validateAssetCompleteness(makeCalendar(4, 3));
      expect(res.qualified).toBe(true);
      expect(res.slotCount).toBe(12);
      expect(res.incompleteSlots).toEqual([]);
    });

    it('缺 meme 占位 → 不合格并标 assetPlaceholder', () => {
      const cal = makeCalendar(4, 3);
      cal.weeks[0].slots[1] = makeSlot({ assetPlaceholder: '' });
      const res = validateAssetCompleteness(cal);
      expect(res.qualified).toBe(false);
      expect(res.incompleteSlots[0]).toEqual({
        weekIndex: 1,
        slotIndex: 1,
        missingFields: ['assetPlaceholder'],
      });
    });

    it('缺平台/计划时间标注 → 不合格', () => {
      const cal = makeCalendar(1, 1);
      cal.weeks[0].slots[0] = makeSlot({ platform: '', scheduledTime: '' });
      const res = validateAssetCompleteness(cal);
      expect(res.qualified).toBe(false);
      expect(res.incompleteSlots[0].missingFields).toEqual(
        expect.arrayContaining(['scheduledTime', 'platform']),
      );
    });

    it('无发布位 → 不合格', () => {
      expect(validateAssetCompleteness({ weeks: [] }).qualified).toBe(false);
    });
  });

  // ───────────── 内容合规(14.9 / 红线) ─────────────

  describe('screenContentCompliance', () => {
    it('正常文案 → 合规', () => {
      expect(screenContentCompliance('一起来共建社区!').ok).toBe(true);
    });

    it('无披露付费喊单 → 命中红线', () => {
      const res = screenContentCompliance('这是付费喊单,冲就完事');
      expect(res.ok).toBe(false);
      expect(res.redline).toBe(true);
      expect(res.rule).toBe('abuse:undisclosed_shill');
    });

    it('价格承诺(必涨)→ 命中红线', () => {
      const res = screenContentCompliance('买了必涨,放心冲');
      expect(res.ok).toBe(false);
      expect(res.rule).toBe('abuse:price_promise');
    });

    it('价格承诺(guaranteed pump)→ 命中红线', () => {
      const res = screenContentCompliance('this token is a guaranteed pump');
      expect(res.ok).toBe(false);
      expect(res.rule).toBe('abuse:price_promise');
    });

    it('收益保证(稳赚不赔)→ 命中红线', () => {
      const res = screenContentCompliance('质押稳赚不赔,保本保息');
      expect(res.ok).toBe(false);
      expect(res.rule).toBe('abuse:yield_guarantee');
    });

    it('收益保证(guaranteed returns)→ 命中红线', () => {
      const res = screenContentCompliance('stake now for guaranteed returns');
      expect(res.ok).toBe(false);
      expect(res.rule).toBe('abuse:yield_guarantee');
    });

    it('空文本 → 合规(无内容)', () => {
      expect(screenContentCompliance('').ok).toBe(true);
      expect(screenContentCompliance(null).ok).toBe(true);
    });
  });

  describe('screenCalendarCompliance', () => {
    it('整本合规 → ok', () => {
      expect(screenCalendarCompliance(makeCalendar(4, 3)).ok).toBe(true);
    });

    it('某发布位文案含收益保证 → 记录违规位', () => {
      const cal = makeCalendar(2, 2);
      cal.weeks[1].slots[0] = makeSlot({ copy: '保证收益翻倍,稳赚' });
      const res = screenCalendarCompliance(cal);
      expect(res.ok).toBe(false);
      expect(res.violations[0]).toMatchObject({
        weekIndex: 2,
        slotIndex: 0,
        field: 'copy',
      });
    });
  });

  // ───────────── 综合验收(14.7 ∧ 14.8 ∧ 14.9) ─────────────

  describe('validateContentCalendar', () => {
    it('覆盖 + 素材 + 合规全满足 → 合格', () => {
      const res = validateContentCalendar(makeCalendar(4, 3), 3);
      expect(res.qualified).toBe(true);
    });

    it('仅合规但周数不足 → 不合格', () => {
      const res = validateContentCalendar(makeCalendar(2, 3), 3);
      expect(res.qualified).toBe(false);
      expect(res.coverage.qualified).toBe(false);
    });

    it('覆盖达标但含价格承诺 → 不合格', () => {
      const cal = makeCalendar(4, 3);
      cal.weeks[0].slots[0] = makeSlot({ copy: '上线必涨,保证翻倍' });
      const res = validateContentCalendar(cal, 3);
      expect(res.qualified).toBe(false);
      expect(res.compliance.ok).toBe(false);
    });
  });

  // ───────────── 属性测试 ─────────────

  describe('属性测试(fast-check)', () => {
    // 14.7:周数 ≥ minWeeks 且每周 ≥ minPerWeek ⇔ coverage.qualified。
    it('覆盖合格 ⇔ 周数达标 ∧ 每周频次达标', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 8 }), // 周数
          fc.integer({ min: 1, max: 5 }), // minPerWeek
          fc.integer({ min: 1, max: 6 }), // minWeeks
          fc.array(fc.integer({ min: 0, max: 6 }), { maxLength: 8 }), // 每周条目数
          (weeksCount, minPerWeek, minWeeks, perWeekCounts) => {
            const weeks = Array.from({ length: weeksCount }, (_, wi) => {
              const n = perWeekCounts[wi] ?? minPerWeek;
              return {
                weekIndex: wi + 1,
                slots: Array.from({ length: n }, () => makeSlot()),
              };
            });
            const cal: ContentCalendar = { weeks };
            const res = validateCalendarCoverage(cal, minPerWeek, minWeeks);

            const weeksOk = weeksCount >= minWeeks;
            const everyWeekOk = weeks.every((w) => w.slots.length >= minPerWeek);
            expect(res.qualified).toBe(weeksOk && everyWeekOk);
          },
        ),
      );
    });

    // 14.9 / Property 3:含红线词的内容绝不判合规(不可绕过)。
    it('任一红线词内容 → 永不合规', () => {
      const redlineCorpus = fc.constantFrom(
        '付费喊单',
        '必涨',
        '保证收益',
        '稳赚不赔',
        '保本保息',
        'guaranteed returns',
        'guaranteed pump',
        'undisclosed shill',
      );
      fc.assert(
        fc.property(
          fc.string(),
          redlineCorpus,
          fc.string(),
          (prefix, needle, suffix) => {
            const screen = screenContentCompliance(
              `${prefix} ${needle} ${suffix}`,
            );
            expect(screen.ok).toBe(false);
            expect(screen.redline).toBe(true);
          },
        ),
      );
    });
  });
});
