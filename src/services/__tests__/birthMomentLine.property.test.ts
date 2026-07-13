/**
 * birthMomentLine — Correctness Property 2「第一句话纯本地」属性验证(P.1)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   P.1 验证主线必达与第一句话纯本地
 * design: Correctness Property 2(第一句话纯本地),§3.2
 *
 * **Validates: Requirements 3.1, 3.2**
 *
 * Property 2(第一句话纯本地):`buildBirthMomentLine` 的输出只依赖本地时钟与可选
 * petName,不发起任何网络调用,因此 100% 可生成、对固定 `now` 完全确定。
 *
 * 验证:
 *   - 固定 Date → 稳定的精确字符串(主句 + petName 个性化)。
 *   - petName 个性化关系:`buildBirthMomentLine(now, name)` === `我是{name}。` + 主句。
 *   - 确定性:同一 (now, petName) 重复调用结果完全一致(穷举 + 种子随机)。
 *   - 纯本地无网络:将 global.fetch / XMLHttpRequest 临时替换为「一调用即抛错」的
 *     spy,断言其从未被调用,且输出与替换前完全一致。
 *
 * 测试手段:fast-check 未安装于移动端 root,使用穷举边界 + 带种子的确定性 RNG 模糊。
 * 放在 `src/services/__tests__/` 匹配 jest.config 的 testMatch。
 * 注:Windows 检出 node_modules 为桩,本地不跑 jest;真实门禁走 WSL/CI。
 */
import { jest, describe, it, expect, afterEach } from '@jest/globals';
import {
  buildBirthMomentLine,
  formatBirthMoment,
} from '../onboarding/birthMomentLine';

/** 用数字构造器构造**本地时间**,避免 ISO 字符串解析的时区歧义(测试机无关)。 */
function localDate(
  y: number,
  monthIndex: number,
  d: number,
  h: number,
  min: number,
): Date {
  return new Date(y, monthIndex, d, h, min, 0, 0);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('formatBirthMoment — 本地时间精确格式', () => {
  it('「2026年6月4日 20:13」(月/日不补零,时/分补零)', () => {
    expect(formatBirthMoment(localDate(2026, 5, 4, 20, 13))).toBe('2026年6月4日 20:13');
  });

  it('个位时/分补零;月/日保持个位', () => {
    expect(formatBirthMoment(localDate(2026, 0, 1, 9, 5))).toBe('2026年1月1日 09:05');
    expect(formatBirthMoment(localDate(2030, 11, 31, 0, 0))).toBe('2030年12月31日 00:00');
  });

  it('对固定 now 完全确定(重复 20 次恒等)', () => {
    const now = localDate(2026, 5, 4, 20, 13);
    const first = formatBirthMoment(now);
    for (let i = 0; i < 20; i++) {
      expect(formatBirthMoment(now)).toBe(first);
    }
  });
});

describe('buildBirthMomentLine — 精确主句与 petName 个性化', () => {
  it('无 petName → 主句精确字符串', () => {
    expect(buildBirthMomentLine(localDate(2026, 5, 4, 20, 13))).toBe(
      '我在 2026年6月4日 20:13 这一刻,被你赋予了灵魂。',
    );
  });

  it('有 petName → 个性化前缀 + 主句精确字符串', () => {
    expect(buildBirthMomentLine(localDate(2026, 5, 4, 20, 13), '小灵')).toBe(
      '我是小灵。我在 2026年6月4日 20:13 这一刻,被你赋予了灵魂。',
    );
  });

  it('个性化关系恒成立:line(now,name) === 「我是{name}。」 + line(now)', () => {
    const now = localDate(2026, 5, 4, 20, 13);
    const names = ['小灵', 'Aria', '阿狸', 'X', '灵狐九尾'];
    for (const name of names) {
      expect(buildBirthMomentLine(now, name)).toBe(
        `我是${name}。${buildBirthMomentLine(now)}`,
      );
    }
  });

  it('空白 petName 经 trim 视为无名(等价于不传)', () => {
    const now = localDate(2026, 5, 4, 20, 13);
    const bare = buildBirthMomentLine(now);
    expect(buildBirthMomentLine(now, '')).toBe(bare);
    expect(buildBirthMomentLine(now, '   ')).toBe(bare);
  });

  it('petName 前后空白被 trim', () => {
    const now = localDate(2026, 5, 4, 20, 13);
    expect(buildBirthMomentLine(now, '  小灵 ')).toBe(buildBirthMomentLine(now, '小灵'));
  });

  it('输出必非空,以「我在 」开头(无名)、以「。」结尾', () => {
    const line = buildBirthMomentLine(localDate(2026, 5, 4, 20, 13));
    expect(line.length).toBeGreaterThan(0);
    expect(line.startsWith('我在 ')).toBe(true);
    expect(line.endsWith('。')).toBe(true);
  });

  it('默认参数(now=new Date())也必定可生成非空主句', () => {
    const line = buildBirthMomentLine();
    expect(typeof line).toBe('string');
    expect(line.startsWith('我在 ')).toBe(true);
    expect(line.endsWith('。')).toBe(true);
  });
});

describe('Property 2:确定性(仅依赖 now + petName)', () => {
  it('同一 (now, petName) 重复调用 20 次结果完全一致', () => {
    const now = localDate(2026, 5, 4, 20, 13);
    const first = buildBirthMomentLine(now, '小灵');
    for (let i = 0; i < 20; i++) {
      expect(buildBirthMomentLine(now, '小灵')).toBe(first);
    }
  });

  it('种子随机的 (now, petName) 下,两次调用恒等(确定性模糊)', () => {
    const rng = mulberry32(20260604);
    for (let i = 0; i < 25; i++) {
      const now = localDate(
        2000 + Math.floor(rng() * 100),
        Math.floor(rng() * 12),
        1 + Math.floor(rng() * 28),
        Math.floor(rng() * 24),
        Math.floor(rng() * 60),
      );
      const name = rng() < 0.5 ? undefined : `宠物${Math.floor(rng() * 1000)}`;
      const a = buildBirthMomentLine(now, name);
      const b = buildBirthMomentLine(now, name);
      expect(b).toBe(a);
      // 与 formatBirthMoment 一致:主句必包含格式化时刻子串。
      expect(a.includes(formatBirthMoment(now))).toBe(true);
    }
  });
});

describe('Property 2:纯本地、绝不发起网络调用', () => {
  const realFetch = (global as any).fetch;
  const realXHR = (global as any).XMLHttpRequest;

  afterEach(() => {
    (global as any).fetch = realFetch;
    (global as any).XMLHttpRequest = realXHR;
  });

  it('global.fetch / XMLHttpRequest 被替换为抛错 spy 时,从不被调用且输出不变', () => {
    const now = localDate(2026, 5, 4, 20, 13);
    const expectedBare = buildBirthMomentLine(now);
    const expectedNamed = buildBirthMomentLine(now, '小灵');

    const fetchSpy = jest.fn(() => {
      throw new Error('network call attempted — Birth_Moment_Line 必须纯本地');
    });
    const xhrSpy = jest.fn(() => {
      throw new Error('XHR attempted — Birth_Moment_Line 必须纯本地');
    });
    (global as any).fetch = fetchSpy;
    (global as any).XMLHttpRequest = xhrSpy;

    // 在「网络被封死」的环境下多次生成,均应成功且与封死前一致。
    for (let i = 0; i < 5; i++) {
      expect(buildBirthMomentLine(now)).toBe(expectedBare);
      expect(buildBirthMomentLine(now, '小灵')).toBe(expectedNamed);
      expect(formatBirthMoment(now)).toBe('2026年6月4日 20:13');
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
  });
});
