/**
 * lsmPosterCopy.test — LSM 世界杯海报转化文案纯函数覆盖（World Cup 拉新）。
 *
 * 覆盖：利益点（100 AXP + 100 USDC 分开表述、限量前 1000 名）、行动号召（注册即玩）、
 * 比分/状态映射、中英双语、AXP↔USD 无固定兑换比例（合规红线）。RN 渲染另由 APK 验证。
 */
import {
  buildWorldCupPosterCopy,
  worldCupHeroTagline,
  lsmScoreText,
  lsmStatusText,
  SIGNUP_BONUS_DISPLAY,
} from '../lsmPosterCopy';

describe('lsmScoreText / lsmStatusText', () => {
  it('两侧皆有分数才渲染比分', () => {
    expect(lsmScoreText(2, 1)).toBe('2 : 1');
    expect(lsmScoreText(0, 0)).toBe('0 : 0');
    expect(lsmScoreText(2, null)).toBe('');
    expect(lsmScoreText(null, null)).toBe('');
    expect(lsmScoreText(undefined, undefined)).toBe('');
  });

  it('状态本地化', () => {
    expect(lsmStatusText('live', true)).toBe('滚球进行中');
    expect(lsmStatusText('live', false)).toBe('LIVE');
    expect(lsmStatusText('pre', true)).toBe('即将开赛');
    expect(lsmStatusText('final', false)).toBe('FINAL');
    expect(lsmStatusText(undefined, true)).toBe('');
  });
});

describe('buildWorldCupPosterCopy — 转化文案', () => {
  const base = { homeTeam: 'Argentina', awayTeam: 'Brazil', status: 'live', homeScore: 1, awayScore: 0, sport: 'soccer' };

  it('中文：含 100 AXP + 100 USDC 体验金（精简、不含比分/稀缺进度）', () => {
    const c = buildWorldCupPosterCopy({ zh: true, ...base });
    expect(c.description).toContain('100 AXP');
    expect(c.description).toContain('100 USDC');
    expect(c.description).toContain('站内体验金');
    // 精简后描述不再嵌比分/状态（由 priceLabel 单独展示），也不含稀缺进度。
    expect(c.description).not.toContain('比分');
    expect(c.description).not.toMatch(/\d+\s*\/\s*1000/);
    expect(c.ctaLabel).toContain('100 AXP');
    expect(c.ctaLabel).toContain('100 USDC');
    expect(c.tags).not.toContain('限量1000名');
    expect(c.categoryLabel).toBe('世界杯');
  });

  it('英文：含 100 AXP + 100 USDC trial credits（精简）', () => {
    const c = buildWorldCupPosterCopy({ zh: false, ...base });
    expect(c.description).toContain('100 AXP');
    expect(c.description).toContain('100 USDC');
    expect(c.description.toLowerCase()).toContain('trial credits');
    expect(c.description).not.toMatch(/\d+\s*\/\s*1000/);
    expect(c.ctaLabel).toContain('Scan to register');
    expect(c.categoryLabel).toBe('World Cup');
  });

  it('合规红线：AXP 与 USDC 分开表述，绝不呈现固定兑换比例', () => {
    for (const zh of [true, false]) {
      const c = buildWorldCupPosterCopy({ zh, ...base });
      const text = `${c.description} ${c.ctaLabel} ${c.subtitle}`;
      // 不得出现 "100 AXP = ... USD" / "AXP=USD" / "1 AXP = " 之类等价/兑换比例表述
      expect(text).not.toMatch(/AXP\s*=\s*/i);
      expect(text).not.toMatch(/=\s*\d+\s*USD/i);
      expect(text).not.toMatch(/兑换|等于|等价|折合/);
      // AXP 与 USDC 必须各自独立出现（分开列出）
      expect(text).toMatch(/AXP/);
      expect(text).toMatch(/USDC/);
    }
  });

  it('有 league 时 subtitle 用联赛名，否则用拉新副标题', () => {
    expect(buildWorldCupPosterCopy({ zh: true, ...base, league: '世界杯 A 组' }).subtitle).toBe('世界杯 A 组');
    expect(buildWorldCupPosterCopy({ zh: true, ...base, league: undefined }).subtitle).toContain('注册即玩');
  });

  it('无比分（赛前）：score 为空，状态由 statusText 单独承载，描述不含比分', () => {
    const c = buildWorldCupPosterCopy({ zh: true, homeTeam: 'Spain', awayTeam: 'France', status: 'pre' });
    expect(c.score).toBe('');
    expect(c.statusText).toBe('即将开赛');
    expect(c.description).not.toContain('比分');
  });

  it('展示口径与后端默认一致（100/100/1000）', () => {
    expect(SIGNUP_BONUS_DISPLAY).toEqual({ limit: 1000, axp: 100, usdc: 100 });
  });
});

describe('worldCupHeroTagline', () => {
  it('中英标语含双币体验金（无稀缺进度）', () => {
    expect(worldCupHeroTagline(true)).toContain('注册即领');
    expect(worldCupHeroTagline(true)).toContain('100 AXP + 100 USDC');
    expect(worldCupHeroTagline(true)).not.toMatch(/\d+\s*\/\s*1000/);
    expect(worldCupHeroTagline(false)).toContain('100 AXP + 100 USDC');
    expect(worldCupHeroTagline(false)).not.toMatch(/\d+\s*\/\s*1000/);
  });
});
