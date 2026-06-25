import {
  evaluateMonitorCondition,
  readPath,
  MonitorCondition,
} from './monitor.types';

/**
 * evaluateMonitorCondition / readPath 单测(crypto-native-agent-ops 任务 16)。
 *
 * 覆盖需求 9.1/9.2 的触发条件判定:价格阈值、变化率、窗口(解锁/空投领取)、
 * 存在性/真值(治理提案、安全异常)等通用算子,纯函数无网络/无库依赖。
 */
describe('evaluateMonitorCondition — 触发条件判定 (需求 9.1/9.2)', () => {
  describe('数值比较', () => {
    const cases: Array<[MonitorCondition['operator'], number, number, boolean]> = [
      ['gt', 100, 90, true],
      ['gt', 90, 100, false],
      ['gte', 100, 100, true],
      ['lt', 50, 60, true],
      ['lte', 60, 60, true],
      ['eq', 42, 42, true],
      ['neq', 42, 43, true],
    ];
    it.each(cases)('%s: observed=%d threshold=%d → %s', (operator, observed, value, expected) => {
      expect(
        evaluateMonitorCondition({ operator, value } as MonitorCondition, observed),
      ).toBe(expected);
    });

    it('字符串数字("$1,234.5")可被解析比较', () => {
      expect(
        evaluateMonitorCondition({ operator: 'gt', value: 1000 }, '$1,234.5'),
      ).toBe(true);
    });

    it('非数值观测 → 数值算子不命中(不编造)', () => {
      expect(evaluateMonitorCondition({ operator: 'gt', value: 1 }, 'n/a')).toBe(false);
      expect(evaluateMonitorCondition({ operator: 'gt', value: 1 }, null)).toBe(false);
    });
  });

  describe('change_pct_gte — 变化率(脱锚/价格波动)', () => {
    it('相对上次观测变化 >= 阈值 → 命中', () => {
      expect(
        evaluateMonitorCondition({ operator: 'change_pct_gte', value: 5 }, 1.06, {
          previousValue: 1.0,
        }),
      ).toBe(true);
    });

    it('变化不足阈值 → 不命中', () => {
      expect(
        evaluateMonitorCondition({ operator: 'change_pct_gte', value: 5 }, 1.02, {
          previousValue: 1.0,
        }),
      ).toBe(false);
    });

    it('无基线(首次)→ 不命中(不编造)', () => {
      expect(
        evaluateMonitorCondition({ operator: 'change_pct_gte', value: 5 }, 1.5),
      ).toBe(false);
    });

    it('可用 condition.baseline 作基线', () => {
      expect(
        evaluateMonitorCondition(
          { operator: 'change_pct_gte', value: 10, baseline: 100 },
          120,
        ),
      ).toBe(true);
    });
  });

  describe('in_window — 解锁/空投领取窗口', () => {
    const now = Date.parse('2026-06-01T12:00:00Z');

    it('now 在 [start, end] 内 → 命中', () => {
      expect(
        evaluateMonitorCondition({ operator: 'in_window' }, null, {
          now,
          windowStart: Date.parse('2026-06-01T00:00:00Z'),
          windowEnd: Date.parse('2026-06-02T00:00:00Z'),
        }),
      ).toBe(true);
    });

    it('now 早于 start → 不命中', () => {
      expect(
        evaluateMonitorCondition({ operator: 'in_window' }, null, {
          now,
          windowStart: Date.parse('2026-06-02T00:00:00Z'),
          windowEnd: null,
        }),
      ).toBe(false);
    });

    it('now 晚于 end → 不命中', () => {
      expect(
        evaluateMonitorCondition({ operator: 'in_window' }, null, {
          now,
          windowStart: null,
          windowEnd: Date.parse('2026-05-01T00:00:00Z'),
        }),
      ).toBe(false);
    });

    it('无任何边界 → 不命中(避免空窗口恒真)', () => {
      expect(
        evaluateMonitorCondition({ operator: 'in_window' }, null, {
          now,
          windowStart: null,
          windowEnd: null,
        }),
      ).toBe(false);
    });
  });

  describe('exists / truthy — 治理提案 / 安全异常出现即告警', () => {
    it('exists:非空 → 命中', () => {
      expect(evaluateMonitorCondition({ operator: 'exists' }, { id: 'p1' })).toBe(true);
      expect(evaluateMonitorCondition({ operator: 'exists' }, null)).toBe(false);
      expect(evaluateMonitorCondition({ operator: 'exists' }, undefined)).toBe(false);
    });

    it('truthy:真值 → 命中(默认算子)', () => {
      expect(evaluateMonitorCondition({}, true)).toBe(true);
      expect(evaluateMonitorCondition({}, 0)).toBe(false);
      expect(evaluateMonitorCondition({ operator: 'truthy' }, 'risky-approval')).toBe(true);
    });
  });
});

describe('readPath — 点分路径取值', () => {
  it('读取嵌套字段', () => {
    expect(readPath({ a: { b: { c: 7 } } }, 'a.b.c')).toBe(7);
  });
  it('缺失路径返回 undefined', () => {
    expect(readPath({ a: 1 }, 'a.b.c')).toBeUndefined();
  });
  it('无 path 返回原对象', () => {
    const o = { x: 1 };
    expect(readPath(o)).toBe(o);
  });
  it('非对象输入安全返回 undefined', () => {
    expect(readPath(null, 'a')).toBeUndefined();
    expect(readPath(5, 'a')).toBeUndefined();
  });
});
