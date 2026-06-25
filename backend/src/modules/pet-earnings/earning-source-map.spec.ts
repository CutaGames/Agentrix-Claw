import {
  categoryForSource,
  EARN_SOURCE_CATEGORY,
  EARNING_CATEGORIES,
  allEarnSources,
} from './earning-source-map';

describe('earning-source-map (Pet Earning Flywheel 需求 1 分类映射)', () => {
  it('每个 AXP earn source 都能解析到一个非空分类（无遗漏、无崩溃）', () => {
    for (const src of allEarnSources()) {
      const cat = categoryForSource(src);
      expect(typeof cat).toBe('string');
      expect(cat.length).toBeGreaterThan(0);
    }
  });

  it('集市赚钱线分类正确', () => {
    expect(categoryForSource('task_complete')).toBe(EARNING_CATEGORIES.TASK);
    expect(categoryForSource('skin_sold')).toBe(EARNING_CATEGORIES.SKIN);
    expect(categoryForSource('creation_tip')).toBe(EARNING_CATEGORIES.CREATION);
    expect(categoryForSource('lsm_payout')).toBe(EARNING_CATEGORIES.PREDICTION);
    expect(categoryForSource('contest_win')).toBe(EARNING_CATEGORIES.CONTEST);
    expect(categoryForSource('referral_signup')).toBe(EARNING_CATEGORIES.REFERRAL);
    expect(categoryForSource('referral_gmv_pct')).toBe(EARNING_CATEGORIES.REFERRAL);
  });

  it('未登记 source 归「其他」', () => {
    expect(categoryForSource('daily_checkin')).toBe(EARNING_CATEGORIES.OTHER);
    expect(categoryForSource('some_unknown_source')).toBe(EARNING_CATEGORIES.OTHER);
  });

  it('所有显式映射的 source 都是合法 AXP earn source', () => {
    const known = new Set(allEarnSources());
    for (const src of Object.keys(EARN_SOURCE_CATEGORY)) {
      expect(known.has(src)).toBe(true);
    }
  });
});
