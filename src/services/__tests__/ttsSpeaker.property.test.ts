/**
 * ttsSpeaker — Correctness Property 10「TTS 节流」属性验证(P.6,Part A)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   P.6 验证 TTS 节流 + 跨端单一记忆源
 * design: Correctness Property 10(TTS 节流),§3.4
 *
 * **Validates: Requirements 3.8, 9.8**
 *
 * Property 10(TTS 节流):同一会话内播报受 `rateLimiter` 约束,命中缓存的模板文案
 * 不重复发起合成。本测试从三个角度证明该不变式:
 *   1) 缓存命中不重复请求(R3.8):同一 (text, voice, lang) 二次播报命中缓存,
 *      `synthesize` 仅被调用一次,第二次返回 'cached'。
 *   2) 同会话限频丢弃 / 降级(R9.8 / C6):合成请求受「最小间隔 + 并发上限」约束,
 *      超限的合成请求返回 'throttled'、触发 `onDegrade`(文字降级),且不调用 `synthesize`。
 *   3) `ttsCacheKey` 决定性:相同输入恒等,text/voice/lang 任一不同则不同。
 *
 * 测试手段(与本仓库 P.1 同款):fast-check 未安装于移动端 root,因此用
 *   - 注入的**假时钟**(`deps.now`)让限频窗口完全确定且**无真实定时器/等待**;
 *   - 注入的 `synthesize` spy(立即 resolve / 受控延后 resolve)隔离网络;
 *   - 穷举边界 + 带种子的确定性 RNG 模糊覆盖「任意输入下不变式成立」。
 *
 * 放在 `src/services/__tests__/` 匹配 jest.config 的 testMatch。
 * 注:Windows 检出 node_modules 为桩,本地不跑 jest;真实门禁走 WSL/CI。
 */
import { jest, describe, it, expect } from '@jest/globals';
import {
  TtsSpeaker,
  SynthRateLimiter,
  ttsCacheKey,
  type TtsSpeakerDeps,
  type TtsSpeakerOptions,
} from '../onboarding/ttsSpeaker';

// ── 注入式测试夹具:假时钟 + synthesize/enqueue spy + 手控 drain ────────────────

interface Harness {
  speaker: TtsSpeaker;
  synthesize: jest.Mock<(text: string, voice: string | undefined, lang: string) => Promise<string>>;
  enqueue: jest.Mock<(uri: string, fallbackText: string, deviceLanguage: string) => void>;
  stopPlayback: jest.Mock<() => void>;
  drain: () => void;
  setNow: (t: number) => void;
}

/**
 * 构造一个完全注入的 TtsSpeaker:
 *   - `now()` 由内部 clock 控制(测试推进窗口,绝不用真实定时器);
 *   - `synthesize` 默认立即 resolve 一个稳定 uri(可被 mockImplementationOnce 覆盖);
 *   - `enqueue` / `stopPlayback` 为可观测 spy;`registerDrain` 捕获 drain 回调。
 */
function makeHarness(options?: TtsSpeakerOptions): Harness {
  let clock = 0;
  let drainCb: () => void = () => {};

  const synthesize = jest.fn(
    async (text: string, voice: string | undefined, lang: string) =>
      `file://tts/${ttsCacheKey(text, voice, lang)}.mp3`,
  );
  const enqueue = jest.fn();
  const stopPlayback = jest.fn();

  const deps: TtsSpeakerDeps = {
    synthesize: synthesize as TtsSpeakerDeps['synthesize'],
    enqueue: enqueue as TtsSpeakerDeps['enqueue'],
    stopPlayback: stopPlayback as TtsSpeakerDeps['stopPlayback'],
    registerDrain: (cb) => {
      drainCb = cb;
    },
    now: () => clock,
  };

  const speaker = new TtsSpeaker(deps, options);
  return {
    speaker,
    synthesize,
    enqueue,
    stopPlayback,
    drain: () => drainCb(),
    setNow: (t) => {
      clock = t;
    },
  };
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

// ── ttsCacheKey 决定性(R3.8 缓存键基础) ───────────────────────────────────────

describe('ttsCacheKey — 决定性缓存键(R3.8)', () => {
  it('相同 (text, voice, lang) → 相同 key(重复 10 次恒等)', () => {
    const first = ttsCacheKey('你好世界', 'zh-CN-XiaoxiaoNeural', 'zh');
    for (let i = 0; i < 10; i++) {
      expect(ttsCacheKey('你好世界', 'zh-CN-XiaoxiaoNeural', 'zh')).toBe(first);
    }
  });

  it('text 不同 → key 不同', () => {
    expect(ttsCacheKey('甲', 'v1', 'zh')).not.toBe(ttsCacheKey('乙', 'v1', 'zh'));
  });

  it('voice 不同 → key 不同', () => {
    expect(ttsCacheKey('同一句', 'v1', 'zh')).not.toBe(ttsCacheKey('同一句', 'v2', 'zh'));
  });

  it('lang 不同 → key 不同', () => {
    expect(ttsCacheKey('hi', 'v1', 'zh')).not.toBe(ttsCacheKey('hi', 'v1', 'en'));
  });

  it('种子随机输入下两次调用恒等(确定性模糊,25 例)', () => {
    const rng = mulberry32(0x7715);
    for (let i = 0; i < 25; i++) {
      const text = `t${Math.floor(rng() * 1000)}`;
      const voice = rng() < 0.5 ? undefined : `voice${Math.floor(rng() * 5)}`;
      const lang = rng() < 0.5 ? 'zh' : 'en';
      expect(ttsCacheKey(text, voice, lang)).toBe(ttsCacheKey(text, voice, lang));
    }
  });
});

// ── SynthRateLimiter 限频闸(纯函数,注入时钟) ───────────────────────────────

describe('SynthRateLimiter — 同会话限频闸(R9.8 / C6)', () => {
  it('并发上限:满额拒绝,release 后恢复(minInterval 关闭)', () => {
    const rl = new SynthRateLimiter({ minIntervalMs: 0, maxConcurrent: 2 });
    expect(rl.tryAcquire(0)).toBe(true); // inFlight 1
    expect(rl.tryAcquire(0)).toBe(true); // inFlight 2
    expect(rl.tryAcquire(0)).toBe(false); // 已达并发上限 → 拒绝
    rl.release(); // inFlight 1
    expect(rl.tryAcquire(0)).toBe(true); // 名额恢复
  });

  it('最小间隔:间隔不足拒绝,达到间隔放行(并发上限放开)', () => {
    const rl = new SynthRateLimiter({ minIntervalMs: 1_000, maxConcurrent: 99 });
    expect(rl.tryAcquire(0)).toBe(true); // lastStart = 0
    expect(rl.tryAcquire(500)).toBe(false); // 500 - 0 < 1000 → 拒绝
    expect(rl.tryAcquire(999)).toBe(false); // 仍不足
    expect(rl.tryAcquire(1_000)).toBe(true); // 恰好达到间隔 → 放行
  });
});

// ── 缓存命中不重复请求(R3.8) ────────────────────────────────────────────────

describe('TtsSpeaker.speak — 缓存命中不重复合成(R3.8)', () => {
  it('同一 (text, voice, lang) 二次播报:首次 played 合成一次,二次 cached 不再合成', async () => {
    const h = makeHarness({ minIntervalMs: 0, maxConcurrent: 5 });

    const first = await h.speaker.speak('诞生时刻文案', { lang: 'zh', voice: 'v1' });
    expect(first).toBe('played');
    expect(h.synthesize).toHaveBeenCalledTimes(1);
    expect(h.enqueue).toHaveBeenCalledTimes(1);
    expect(h.speaker.hasCached('诞生时刻文案', 'v1', 'zh')).toBe(true);

    const second = await h.speaker.speak('诞生时刻文案', { lang: 'zh', voice: 'v1' });
    expect(second).toBe('cached');
    // 关键:第二次命中缓存,**未**再次发起合成调用(R3.8 / C6)。
    expect(h.synthesize).toHaveBeenCalledTimes(1);
    // 仍入播放队列(复用缓存音频)。
    expect(h.enqueue).toHaveBeenCalledTimes(2);
    expect(h.enqueue.mock.calls[1][0]).toBe(h.enqueue.mock.calls[0][0]); // 同一缓存 uri
  });

  it('不同文案各自合成;同一文案多次复用缓存仅合成一次', async () => {
    const h = makeHarness({ minIntervalMs: 0, maxConcurrent: 5 });

    expect(await h.speaker.speak('文案A', { voice: 'v1' })).toBe('played');
    expect(await h.speaker.speak('文案B', { voice: 'v1' })).toBe('played');
    expect(await h.speaker.speak('文案A', { voice: 'v1' })).toBe('cached');
    expect(await h.speaker.speak('文案A', { voice: 'v1' })).toBe('cached');

    expect(h.synthesize).toHaveBeenCalledTimes(2); // 仅 A、B 各合成一次
  });

  it('音色 / 语言不同视为不同文案,各自合成(缓存键含 voice/lang)', async () => {
    const h = makeHarness({ minIntervalMs: 0, maxConcurrent: 5 });

    expect(await h.speaker.speak('同一句', { voice: 'v1', lang: 'zh' })).toBe('played');
    expect(await h.speaker.speak('同一句', { voice: 'v2', lang: 'zh' })).toBe('played');
    expect(await h.speaker.speak('同一句', { voice: 'v1', lang: 'en' })).toBe('played');
    expect(h.synthesize).toHaveBeenCalledTimes(3);
  });
});

// ── 同会话限频丢弃 / 降级(R9.8 / C6) ────────────────────────────────────────

describe('TtsSpeaker.speak — 限频丢弃并降级文字(R9.8 / C6)', () => {
  it('最小间隔内的合成请求被丢弃 → throttled + onDegrade,且不调用 synthesize', async () => {
    const h = makeHarness({ minIntervalMs: 1_000, maxConcurrent: 1 });
    const degraded: string[] = [];

    // t=0:首次合成放行。
    h.setNow(0);
    expect(await h.speaker.speak('甲', { onDegrade: (t) => degraded.push(t) })).toBe('played');

    // t=0:间隔不足(0 - 0 < 1000)→ 被限频丢弃,降级文字,不发起合成。
    expect(await h.speaker.speak('乙', { onDegrade: (t) => degraded.push(t) })).toBe('throttled');

    // t=1000:达到最小间隔 → 再次放行合成。
    h.setNow(1_000);
    expect(await h.speaker.speak('丙', { onDegrade: (t) => degraded.push(t) })).toBe('played');

    // 仅「甲」「丙」真正合成,「乙」被丢弃且降级为文字。
    expect(h.synthesize).toHaveBeenCalledTimes(2);
    const synthTexts = h.synthesize.mock.calls.map((c) => c[0]);
    expect(synthTexts).toEqual(['甲', '丙']);
    expect(synthTexts).not.toContain('乙');
    expect(degraded).toEqual(['乙']); // 仅被丢弃者降级
  });

  it('并发在途达上限时,后续合成请求被丢弃并降级(maxConcurrent)', async () => {
    const h = makeHarness({ minIntervalMs: 0, maxConcurrent: 1 });
    const degraded: string[] = [];

    // 让首个合成「挂起」以占住唯一并发名额(受控延后 resolve,无真实定时器)。
    let releaseFirst!: (uri: string) => void;
    h.synthesize.mockImplementationOnce(
      () => new Promise<string>((resolve) => {
        releaseFirst = resolve;
      }),
    );

    // 不 await:speak 同步执行到 synthesize 的 await 点 → 已占用名额并挂起。
    const pFirst = h.speaker.speak('甲', { onDegrade: (t) => degraded.push(t) });

    // 名额已被占满 → 第二个合成请求被丢弃降级。
    expect(await h.speaker.speak('乙', { onDegrade: (t) => degraded.push(t) })).toBe('throttled');
    expect(degraded).toEqual(['乙']);
    expect(h.synthesize).toHaveBeenCalledTimes(1); // 仅「甲」真正发起合成

    // 释放首个合成 → 它正常完成,名额回收。
    releaseFirst('file://tts/jia.mp3');
    await expect(pFirst).resolves.toBe('played');
  });

  it('空白文本直接降级,不占用合成名额', async () => {
    const h = makeHarness({ minIntervalMs: 1_000, maxConcurrent: 1 });
    expect(await h.speaker.speak('   ')).toBe('degraded');
    expect(h.synthesize).not.toHaveBeenCalled();
    // 未消耗名额:随后正常文案仍可立即合成。
    expect(await h.speaker.speak('正常文案')).toBe('played');
    expect(h.synthesize).toHaveBeenCalledTimes(1);
  });
});

// ── 合成失败降级(R3.4,与限频降级共用降级路径) ──────────────────────────────

describe('TtsSpeaker.speak — 合成失败降级文字(R3.4)', () => {
  it('synthesize 抛错 → 返回 degraded 且触发 onDegrade,绝不抛错', async () => {
    const h = makeHarness({ minIntervalMs: 0, maxConcurrent: 5 });
    h.synthesize.mockImplementationOnce(async () => {
      throw new Error('tts-http-500');
    });
    const degraded: string[] = [];

    await expect(
      h.speaker.speak('会失败的一句', { onDegrade: (t) => degraded.push(t) }),
    ).resolves.toBe('degraded');
    expect(degraded).toEqual(['会失败的一句']);

    // 失败后名额已释放:同一文案重试可再次合成(未被缓存)。
    expect(await h.speaker.speak('会失败的一句')).toBe('played');
    expect(h.synthesize).toHaveBeenCalledTimes(2);
  });
});
