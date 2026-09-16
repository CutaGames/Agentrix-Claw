/**
 * ttsSpeaker — TTS 播报封装(缓存 + 同会话限频 + 失败降级文字气泡)。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * task:   3.4(Requirements 3.3 / 3.4 / 3.8,9.8,Design §3.4,约束 C6)
 *
 * 包裹现有 `/voice/tts`(Edge TTS + Polly,中文多音色),播放复用现有 `AudioQueuePlayer`。
 * 关键行为(Design §3.4):
 *   - **缓存(R3.8 / C6)**:cacheKey = hash(text + voice + lang)。命中缓存 → 直接复用
 *     已合成音频(本地文件),**不重复发起合成调用**。
 *   - **限频(R9.8 / C6)**:同会话内对**合成请求**做最小间隔 + 并发上限;超限则丢弃并
 *     降级文字(命中缓存的复用不计入限频,因为不产生合成成本)。
 *   - **降级(R3.4)**:合成或播放失败 → 通过 `onDegrade` 回调让 UI 以文字气泡展示原文;
 *     **永不向调用方抛错、永不卡住主线**(Correctness Property 1)。
 *
 * 可测试性(P.6:缓存命中不重复请求 / 限频丢弃降级):所有 IO(合成 / 播放 / 时钟)经
 * `TtsSpeakerDeps` 注入;`TtsSpeaker`、`SynthRateLimiter`、`ttsCacheKey` 均导出供单测构造。
 */
import { API_BASE } from '../../config/env';
import { getApiConfig } from '../api';
import { AudioQueuePlayer } from '../AudioQueuePlayer';

// ── 缓存键(纯函数,FNV-1a 32bit) ───────────────────────────────────────────────

/**
 * 计算缓存键:`hash(lang :: voice :: text)`。
 * 同一「模板文本 + 音色 + 语言」恒定映射到同一 key → 高复用文案(如 Birth_Moment_Line
 * 模板)命中缓存即不再合成(R3.8 / C6)。纯函数,便于单测。
 */
export function ttsCacheKey(text: string, voice: string | undefined, lang: string): string {
  const input = `${lang}::${voice ?? ''}::${text}`;
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return (h >>> 0).toString(16); // 无符号十六进制
}

// ── 限频闸(同会话:最小间隔 + 并发上限) ───────────────────────────────────────

export interface RateLimiterOptions {
  /** 两次**合成请求**之间的最小间隔(ms)。 */
  minIntervalMs: number;
  /** 同时在途的合成请求上限。 */
  maxConcurrent: number;
}

/**
 * 合成请求限频器(C6 / R9.8)。仅约束**真实合成调用**;缓存复用不经过它。
 * 纯内存、可注入时钟(`tryAcquire(now)`),便于单测限频丢弃行为。
 */
export class SynthRateLimiter {
  private lastStart = Number.NEGATIVE_INFINITY;
  private inFlight = 0;

  constructor(private readonly opts: RateLimiterOptions) {}

  /**
   * 尝试占用一个合成名额。允许返回 true(并记账),被限流返回 false。
   * 被限流的两种情形:在途数已达并发上限 / 距上次合成开始不足最小间隔。
   */
  tryAcquire(now: number): boolean {
    if (this.inFlight >= this.opts.maxConcurrent) return false;
    if (now - this.lastStart < this.opts.minIntervalMs) return false;
    this.lastStart = now;
    this.inFlight += 1;
    return true;
  }

  /** 合成结束(成功/失败)后释放名额。 */
  release(): void {
    if (this.inFlight > 0) this.inFlight -= 1;
  }
}

// ── 注入依赖 ─────────────────────────────────────────────────────────────────

/** 一次 `speak` 调用的结果。 */
export type SpeakOutcome =
  | 'played' // 合成成功并已入播放队列
  | 'cached' // 命中缓存,复用音频入队(未合成)
  | 'throttled' // 被限频丢弃,已降级文字
  | 'degraded'; // 合成/播放失败或超时,已降级文字

export interface SpeakOptions {
  /** 语言(默认 'zh')。 */
  lang?: string;
  /** 指定音色(可空,后端按语言自动选)。 */
  voice?: string;
  /** 降级回调:合成失败/超时/限频时,以文字气泡展示原文(R3.4)。 */
  onDegrade?: (text: string) => void;
}

/** `TtsSpeaker` 的可注入依赖(默认实现见 `getOnboardingTtsSpeaker`)。 */
export interface TtsSpeakerDeps {
  /** 合成 text → 可播放的本地音频 uri;失败/超时应抛错。 */
  synthesize: (text: string, voice: string | undefined, lang: string) => Promise<string>;
  /** 把音频 uri(带降级文字 + 语言)入播放队列。 */
  enqueue: (uri: string, fallbackText: string, deviceLanguage: string) => void;
  /** 停止并清空播放。 */
  stopPlayback: () => void;
  /** 注册「队列播完(drain)」回调。 */
  registerDrain: (cb: () => void) => void;
  /** 当前时刻(ms),用于限频。 */
  now: () => number;
}

export interface TtsSpeakerOptions {
  minIntervalMs?: number;
  maxConcurrent?: number;
  /** 单次合成的超时(ms);超时即降级,保证主线必达。 */
  synthTimeoutMs?: number;
}

const DEFAULT_MIN_INTERVAL_MS = 1_200;
const DEFAULT_MAX_CONCURRENT = 1;
const DEFAULT_SYNTH_TIMEOUT_MS = 8_000;

/** 把语言码映射为设备语音(expo-speech 兜底)所需的 locale。 */
function deviceLanguage(lang: string): string {
  if (lang.startsWith('zh')) return 'zh-CN';
  if (lang.startsWith('en')) return 'en-US';
  return lang;
}

/** 给合成加超时:超时 reject,由 speak 的 catch 统一降级。 */
function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('tts-synth-timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// ── TtsSpeaker ───────────────────────────────────────────────────────────────

/**
 * 同会话级的 TTS 播报器:维护音频缓存 + 限频闸 + 单一播放队列。
 * 单例使用(`getOnboardingTtsSpeaker`)以让缓存/限频在整个引导会话内生效(C6)。
 */
export class TtsSpeaker {
  /** 模板音频缓存:cacheKey → 本地可播放 uri(R3.8)。 */
  private readonly cache = new Map<string, string>();
  /** 限频闸(导出只读,供单测/调用方观测)。 */
  readonly rateLimiter: SynthRateLimiter;
  private readonly synthTimeoutMs: number;

  /** 是否仍有音频在播/排队(用于 whenIdle 完成判定)。 */
  private playing = false;
  private idleResolvers: Array<() => void> = [];

  constructor(private readonly deps: TtsSpeakerDeps, options?: TtsSpeakerOptions) {
    this.rateLimiter = new SynthRateLimiter({
      minIntervalMs: options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
      maxConcurrent: options?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
    });
    this.synthTimeoutMs = options?.synthTimeoutMs ?? DEFAULT_SYNTH_TIMEOUT_MS;
    // 队列播完 → 标记 idle 并唤醒等待者。
    this.deps.registerDrain(() => this.handleDrain());
  }

  /**
   * 播报一句话。**永不抛错**;返回本次结果(played/cached/throttled/degraded)。
   *
   * 顺序(Design §3.4):
   *   1) 命中缓存 → 直接复用音频入队(不合成、不限频)。
   *   2) 限频被拒 → 降级文字(R9.8 / C6)。
   *   3) 合成(带超时)→ 成功入缓存并入队;失败/超时 → 降级文字(R3.4)。
   */
  async speak(text: string, opts: SpeakOptions = {}): Promise<SpeakOutcome> {
    const lang = opts.lang ?? 'zh';
    const voice = opts.voice;
    const trimmed = (text ?? '').trim();
    if (!trimmed) return 'degraded';

    const key = ttsCacheKey(trimmed, voice, lang);

    // 1) 缓存命中:复用音频,不重复合成(R3.8)。
    const cached = this.cache.get(key);
    if (cached) {
      this.playing = true;
      try {
        this.deps.enqueue(cached, trimmed, deviceLanguage(lang));
      } catch {
        /* 入队失败不抛错;drain 由播放器兜底,主线必达 */
      }
      return 'cached';
    }

    // 2) 限频:超限丢弃并降级文字(C6 / R9.8)。
    if (!this.rateLimiter.tryAcquire(this.deps.now())) {
      this.degrade(opts, trimmed);
      return 'throttled';
    }

    // 3) 合成(带超时)→ 缓存 → 入队;任何失败降级(R3.4)。
    try {
      const uri = await raceTimeout(this.deps.synthesize(trimmed, voice, lang), this.synthTimeoutMs);
      this.cache.set(key, uri);
      this.playing = true;
      this.deps.enqueue(uri, trimmed, deviceLanguage(lang));
      return 'played';
    } catch {
      this.degrade(opts, trimmed);
      return 'degraded';
    } finally {
      this.rateLimiter.release();
    }
  }

  /**
   * 返回一个在「播放队列下次清空」时 resolve 的 Promise;若当前已空闲则立即 resolve。
   * 调用方据此在「主句 + 可选天气句」全部播完后推进步骤(R3.7),
   * 且因 AudioQueuePlayer 最终必触发 drain → 不会永久挂起(Property 1)。
   */
  whenIdle(): Promise<void> {
    if (!this.playing) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleResolvers.push(resolve));
  }

  /** 当前是否空闲(无音频在播/排队)。 */
  isIdle(): boolean {
    return !this.playing;
  }

  /** 停止播放并清空队列(组件卸载/跳过时调用);同时释放 whenIdle 等待者。 */
  stop(): void {
    try {
      this.deps.stopPlayback();
    } catch {
      /* ignore */
    }
    this.handleDrain();
  }

  /** 测试/调用方辅助:某文案是否已在缓存。 */
  hasCached(text: string, voice: string | undefined, lang = 'zh'): boolean {
    return this.cache.has(ttsCacheKey((text ?? '').trim(), voice, lang));
  }

  /** 清空缓存(主要供测试隔离)。 */
  clearCache(): void {
    this.cache.clear();
  }

  private degrade(opts: SpeakOptions, text: string): void {
    try {
      opts.onDegrade?.(text);
    } catch {
      /* UI 回调异常不影响主线 */
    }
  }

  private handleDrain(): void {
    this.playing = false;
    const resolvers = this.idleResolvers;
    this.idleResolvers = [];
    for (const resolve of resolvers) {
      try {
        resolve();
      } catch {
        /* ignore */
      }
    }
  }
}

// ── 默认合成实现(/voice/tts → 本地缓存文件) ─────────────────────────────────────

let FileSystem: any = null;
try {
  // 与 useVoiceSession 同款:legacy API 暴露 cacheDirectory / downloadAsync。
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  FileSystem = require('expo-file-system/legacy');
} catch {
  FileSystem = null; // web/桩环境无原生模块
}

const TTS_CACHE_DIR =
  FileSystem?.cacheDirectory ? `${FileSystem.cacheDirectory}soul-tts/` : null;
let dirEnsured = false;

async function ensureCacheDir(): Promise<void> {
  if (!FileSystem || !TTS_CACHE_DIR || dirEnsured) return;
  try {
    await FileSystem.makeDirectoryAsync(TTS_CACHE_DIR, { intermediates: true });
  } catch {
    /* 已存在 / 创建失败都不致命:downloadAsync 会再报错并降级 */
  }
  dirEnsured = true;
}

/**
 * 默认合成:GET `/voice/tts`(带 Bearer 鉴权)→ 下载到本地缓存文件 → 返回文件 uri。
 *
 * 之所以下载到文件(而非把带鉴权的 URL 直接交给播放器):`/voice/tts` 受 JWT 保护,
 * 而 AudioQueuePlayer 直接喂 URL 无法附带 Authorization 头;下载到文件既正确鉴权,
 * 又顺带实现 R3.8「模板音频缓存」(同一文案二次播报复用本地文件,不再请求)。
 */
async function defaultSynthesize(
  text: string,
  voice: string | undefined,
  lang: string,
): Promise<string> {
  if (!FileSystem || !TTS_CACHE_DIR) {
    throw new Error('tts-filesystem-unavailable');
  }
  await ensureCacheDir();

  const token = getApiConfig().token ?? null;
  const key = ttsCacheKey(text, voice, lang);
  const fileUri = `${TTS_CACHE_DIR}${key}.mp3`;

  const url =
    `${API_BASE}/voice/tts?text=${encodeURIComponent(text)}` +
    `&lang=${encodeURIComponent(lang)}` +
    (voice ? `&voice=${encodeURIComponent(voice)}` : '');

  const res = await FileSystem.downloadAsync(
    url,
    fileUri,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  );
  if (!res || typeof res.status !== 'number' || res.status < 200 || res.status >= 300) {
    throw new Error(`tts-http-${res?.status ?? 'unknown'}`);
  }
  return res.uri;
}

// ── 单例(整段引导会话共享缓存 + 限频) ─────────────────────────────────────────

let singleton: TtsSpeaker | null = null;

/**
 * 取得引导会话级 TTS 播报器单例(默认接 `/voice/tts` + AudioQueuePlayer)。
 * 单例确保缓存与限频在 first_words / Companion_QA 等多处播报间一致生效(C6)。
 */
export function getOnboardingTtsSpeaker(): TtsSpeaker {
  if (singleton) return singleton;

  let drainCb: (() => void) | null = null;
  const player = new AudioQueuePlayer(() => {
    drainCb?.();
  });

  singleton = new TtsSpeaker({
    synthesize: defaultSynthesize,
    enqueue: (uri, fallbackText, deviceLang) => player.enqueue(uri, fallbackText, deviceLang),
    stopPlayback: () => {
      void player.stopAll();
    },
    registerDrain: (cb) => {
      drainCb = cb;
    },
    now: () => Date.now(),
  });
  return singleton;
}
