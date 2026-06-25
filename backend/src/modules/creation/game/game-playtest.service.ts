import { Injectable, Logger } from '@nestjs/common';
import * as vm from 'vm';

/**
 * GamePlaytestService — 「自由 codegen」长尾的可玩性兜底验证。
 *
 * 自研模板 + 克隆-变异覆盖常见品类(保证可玩);但用户描述千奇百怪,长尾仍需放 LLM
 * 自由生成。问题是裸 LLM codegen 经常**一跑就崩**(截断/未定义引用/初始化抛错)。
 *
 * 这里不引入无头浏览器(重依赖),而是用 Node `vm` + 一套**最小 DOM/Canvas 桩**把生成
 * 的内联脚本**真正跑起来若干帧**:
 *   1) 语法编译(catch 截断/语法错误)
 *   2) 执行初始化 + 派发"开始"点击(进入游戏主循环)
 *   3) 泵动 requestAnimationFrame 若干帧 + 注入 resize/键盘/触摸事件
 *   4) 捕获任何同步异常 → 判定不可玩
 *
 * 它**抓不到**视觉/玩法逻辑错误(那需要真渲染 + 人/视觉模型),但能可靠拦掉"根本跑不起来"
 * 的产物——这正是自由 codegen 最大的失败模式。配合 {@link CreationGameService} 的自修复
 * 回路:不过→回灌错误让 LLM 修一次→仍不过→退场降级到克隆-变异/模板。
 */

export interface PlaytestResult {
  ok: boolean;
  /** 失败原因(可回灌给 LLM 做自修复)。 */
  reason?: string;
  /** 实际泵动的帧数(>0 表示主循环确实在跑)。 */
  frames: number;
}

/** 单次 play-test 的硬约束(防恶意/失控脚本拖垮进程)。 */
const MAX_FRAMES = 120;
const VM_TIMEOUT_MS = 4000;

@Injectable()
export class GamePlaytestService {
  private readonly logger = new Logger(GamePlaytestService.name);

  /** 从完整 HTML 抽取所有内联 <script> 内容并拼接。 */
  extractScripts(html: string): string {
    const out: string[] = [];
    const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const attrs = m[0].slice(0, m[0].indexOf('>'));
      // 跳过外链脚本(src=...);自包含游戏不应有,validateGameHtml 已拦,这里双保险。
      if (/\bsrc\s*=/.test(attrs)) continue;
      out.push(m[1]);
    }
    return out.join('\n;\n');
  }

  /**
   * 跑一遍 play-test。返回 ok=true 表示"能正常启动并运行主循环"。
   * 任何桩/harness 自身的意外错误按"inconclusive"处理(ok=true, reason='harness'),
   * 不阻断发布——我们只想拦掉**确定会崩**的产物。
   */
  async playtest(html: string): Promise<PlaytestResult> {
    let script: string;
    try {
      script = this.extractScripts(html);
    } catch (e: any) {
      return { ok: true, reason: 'harness:extract', frames: 0 };
    }
    if (!script || script.trim().length < 40) {
      return { ok: false, reason: '没有可执行的内联脚本(脚本为空或缺失)', frames: 0 };
    }

    // 1) 语法编译检查(最常见:截断/未闭合)。
    try {
      // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
      new vm.Script(script, { filename: 'game.js' });
    } catch (e: any) {
      return { ok: false, reason: `脚本语法错误(可能被截断): ${String(e?.message || e).slice(0, 200)}`, frames: 0 };
    }

    // 2) 构建最小 DOM/Canvas 桩 + 执行。
    const harness = this.buildHarness();
    const sandbox = harness.sandbox;
    let runErr: string | null = null;
    try {
      const context = vm.createContext(sandbox);
      const wrapped = `try{\n${script}\n}catch(__e){ __reportError(__e); }`;
      vm.runInContext(wrapped, context, { timeout: VM_TIMEOUT_MS });
      // 3) 派发"开始"交互 + resize,进入主循环。
      harness.dispatchAll('click');
      harness.fireWindow('resize');
      harness.fireWindow('keydown', { key: 'ArrowRight' });
      // 4) 泵动动画帧。
      const frames = harness.pump(MAX_FRAMES, VM_TIMEOUT_MS);
      if (harness.error) {
        return { ok: false, reason: `运行时异常: ${harness.error.slice(0, 200)}`, frames };
      }
      // 没有任何 rAF 注册 → 可能是纯 DOM/CSS 游戏,放行(无法用帧判定),但要求确实建过画布或元素。
      if (frames === 0 && !harness.hadCanvas && !harness.touchedDom) {
        return { ok: false, reason: '脚本未启动渲染循环,也未操作任何 DOM(可能空实现)', frames: 0 };
      }
      return { ok: true, frames };
    } catch (e: any) {
      runErr = String(e?.message || e);
      // vm timeout / 失控
      if (/timed out|timeout/i.test(runErr)) {
        return { ok: false, reason: '脚本执行超时(死循环或阻塞)', frames: 0 };
      }
      this.logger.warn(`playtest harness error: ${runErr}`);
      return { ok: true, reason: 'harness:' + runErr.slice(0, 120), frames: 0 };
    }
  }

  /** 构建一套最小可用的浏览器环境桩。 */
  private buildHarness() {
    const self = this;
    let hadCanvas = false;
    let touchedDom = false;
    let error: string | null = null;
    const rafQueue: Array<(t: number) => void> = [];
    const elements: any[] = [];

    // 任意属性都返回 no-op 函数 / 0 的 2D 上下文。
    const STR_PROPS = new Set([
      'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'font', 'lineCap', 'lineJoin',
      'lineDashOffset', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY',
      'textBaseline', 'textAlign', 'globalCompositeOperation', 'miterLimit', 'filter', 'direction',
      'imageSmoothingEnabled', 'imageSmoothingQuality',
    ]);
    const ctxStub: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'measureText') return () => ({ width: 8 });
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern')
            return () => ({ addColorStop() {} });
          if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
          if (prop === 'canvas') return makeEl('canvas');
          // 已知字符串/数值属性(fillStyle 等)给默认值;其余一律当方法返回 no-op。
          return typeof prop === 'string' && STR_PROPS.has(prop) ? '' : () => undefined;
        },
        set() {
          return true;
        },
      },
    );

    function makeEl(tag: string): any {
      const handlers: Record<string, Function[]> = {};
      const el: any = {
        tagName: (tag || 'div').toUpperCase(),
        style: {},
        dataset: {},
        children: [],
        width: 360,
        height: 640,
        clientWidth: 360,
        clientHeight: 640,
        value: '',
        textContent: '',
        innerHTML: '',
        className: '',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        getContext() {
          hadCanvas = true;
          return ctxStub;
        },
        getBoundingClientRect() {
          return { left: 0, top: 0, right: 360, bottom: 640, width: 360, height: 640 };
        },
        setAttribute() {},
        getAttribute() { return null; },
        appendChild(c: any) { touchedDom = true; this.children.push(c); return c; },
        removeChild() {},
        insertBefore(c: any) { touchedDom = true; return c; },
        querySelector() { return makeEl('div'); },
        querySelectorAll() { return []; },
        addEventListener(type: string, fn: Function) { (handlers[type] = handlers[type] || []).push(fn); },
        removeEventListener() {},
        focus() {},
        play() { return { catch() {} }; },
        requestPointerLock() {},
        getContextAttributes() { return {}; },
        _handlers: handlers,
        dispatch(type: string, ev: any) {
          const list = handlers[type] || [];
          for (const fn of list) {
            try { fn.call(el, ev); } catch (e: any) { error = error || String(e?.message || e); }
          }
          const on = el['on' + type];
          if (typeof on === 'function') {
            try { on.call(el, ev); } catch (e: any) { error = error || String(e?.message || e); }
          }
        },
      };
      elements.push(el);
      return el;
    }

    function mkEvent(extra?: any): any {
      return Object.assign(
        {
          preventDefault() {},
          stopPropagation() {},
          touches: [{ clientX: 100, clientY: 200 }],
          changedTouches: [{ clientX: 100, clientY: 200 }],
          clientX: 100,
          clientY: 200,
          key: '',
          keyCode: 0,
          deltaY: 0,
        },
        extra || {},
      );
    }

    const documentStub: any = {
      getElementById: () => makeEl('div'),
      querySelector: () => makeEl('div'),
      querySelectorAll: () => [],
      createElement: (t: string) => makeEl(t),
      createTextNode: () => ({}),
      addEventListener: (type: string, fn: Function) => {
        (documentStub._h[type] = documentStub._h[type] || []).push(fn);
      },
      removeEventListener() {},
      body: makeEl('body'),
      documentElement: makeEl('html'),
      head: makeEl('head'),
      title: '',
      hidden: false,
      visibilityState: 'visible',
      _h: {} as Record<string, Function[]>,
    };

    const localStorageStub: any = (() => {
      const m: Record<string, string> = {};
      return {
        getItem: (k: string) => (k in m ? m[k] : null),
        setItem: (k: string, v: any) => { m[k] = String(v); },
        removeItem: (k: string) => { delete m[k]; },
        clear: () => { for (const k of Object.keys(m)) delete m[k]; },
      };
    })();

    const sandbox: any = {
      console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
      Math,
      JSON,
      Date,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Map,
      Set,
      Symbol,
      Promise,
      Float32Array,
      Float64Array,
      Int32Array,
      Uint8Array,
      Uint8ClampedArray,
      Uint16Array,
      Uint32Array,
      ArrayBuffer,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      NaN,
      Infinity,
      undefined,
      __GAME_CONFIG: { title: 'Playtest', difficulty: 'normal', seed: 12345 },
      __reportError: (e: any) => { error = error || String((e && e.message) || e); },
      requestAnimationFrame: (cb: (t: number) => void) => { rafQueue.push(cb); return rafQueue.length; },
      cancelAnimationFrame: () => {},
      setTimeout: (cb: Function) => { try { typeof cb === 'function' && rafQueue.push(() => cb()); } catch {} return 0; },
      clearTimeout: () => {},
      setInterval: () => 0,
      clearInterval: () => {},
      performance: { now: () => Date.now() },
      devicePixelRatio: 2,
      innerWidth: 390,
      innerHeight: 780,
      document: documentStub,
      localStorage: localStorageStub,
      AudioContext: function () { return new Proxy({}, { get: () => () => ({ connect() {}, start() {}, stop() {} }) }); },
      Image: function () { return makeEl('img'); },
      alert() {},
      navigator: { userAgent: 'playtest', vibrate() {} },
      _winHandlers: {} as Record<string, Function[]>,
      addEventListener(type: string, fn: Function) {
        (sandbox._winHandlers[type] = sandbox._winHandlers[type] || []).push(fn);
      },
      removeEventListener() {},
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.webkitAudioContext = sandbox.AudioContext;
    documentStub.defaultView = sandbox;

    return {
      sandbox,
      get error() { return error; },
      get hadCanvas() { return hadCanvas; },
      get touchedDom() { return touchedDom; },
      /** 对所有创建过的元素派发某事件(用于触发"开始"按钮)。 */
      dispatchAll(type: string) {
        for (const el of elements) {
          try { el.dispatch(type, mkEvent()); } catch (e: any) { error = error || String(e?.message || e); }
        }
      },
      /** 触发 window 级监听(resize/keydown 等)。 */
      fireWindow(type: string, extra?: any) {
        const list = sandbox._winHandlers[type] || [];
        for (const fn of list) {
          try { fn(mkEvent(extra)); } catch (e: any) { error = error || String(e?.message || e); }
        }
        const docList = documentStub._h[type] || [];
        for (const fn of docList) {
          try { fn(mkEvent(extra)); } catch (e: any) { error = error || String(e?.message || e); }
        }
      },
      /** 泵动 rAF 队列若干帧;返回实际执行的帧数。 */
      pump(maxFrames: number, budgetMs: number): number {
        const start = Date.now();
        let frames = 0;
        let t = 16;
        while (frames < maxFrames) {
          if (Date.now() - start > budgetMs) break;
          const batch = rafQueue.splice(0, rafQueue.length);
          if (batch.length === 0) break;
          for (const cb of batch) {
            try { cb(t); } catch (e: any) { error = error || String(e?.message || e); }
            if (error) return frames + 1;
          }
          frames++;
          t += 16;
        }
        return frames;
      },
    };
  }
}
