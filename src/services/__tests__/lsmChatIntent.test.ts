import { detectLsmIntent, filterMarketsByQuery } from '../lsmChatIntent';

describe('detectLsmIntent', () => {
  it('matches positions phrasing', () => {
    expect(detectLsmIntent('查看我的持仓')).toEqual({ matched: true, kind: 'positions' });
    expect(detectLsmIntent('my positions')).toEqual({ matched: true, kind: 'positions' });
  });

  it('matches sports market phrasing → markets', () => {
    expect(detectLsmIntent('世界杯盘口')).toMatchObject({ matched: true, kind: 'markets' });
    expect(detectLsmIntent('有什么球赛能下注')).toMatchObject({ matched: true, kind: 'markets' });
    expect(detectLsmIntent('/盘口 世界杯')).toMatchObject({ matched: true, kind: 'markets' });
    expect((detectLsmIntent('看看世界杯赔率') as any).query.toLowerCase()).toContain('世界杯');
  });

  it('does NOT hijack ordinary conversation', () => {
    expect(detectLsmIntent('你好，今天天气怎么样').matched).toBe(false);
    expect(detectLsmIntent('帮我写一段 Python 代码').matched).toBe(false);
    expect(detectLsmIntent('给我讲个笑话').matched).toBe(false);
  });

  it('does not match generic aggregation prediction intent without sports words', () => {
    // 泛化预测/机会措辞交给聚合 detectMarketIntent，不被 LSM 抢占。
    expect(detectLsmIntent('找一些预测机会').matched).toBe(false);
    expect(detectLsmIntent('有什么任务可以接').matched).toBe(false);
  });
});

describe('filterMarketsByQuery', () => {
  const mk = (homeTeam: string, awayTeam: string, league = 'World Cup') => ({ homeTeam, awayTeam, league });
  it('filters by team/league, falls back to all when empty match', () => {
    const markets = [mk('Brazil', 'Spain'), mk('France', 'Argentina')];
    expect(filterMarketsByQuery(markets, 'brazil')).toHaveLength(1);
    expect(filterMarketsByQuery(markets, 'world cup')).toHaveLength(2);
    // 无匹配 → 回退全部（避免 0 结果）
    expect(filterMarketsByQuery(markets, 'zzz')).toHaveLength(2);
    // 空 query → 原样
    expect(filterMarketsByQuery(markets, '')).toHaveLength(2);
  });
});
