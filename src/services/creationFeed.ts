/**
 * creationFeed — 创作流的纯逻辑辅助(World Creation & Feed · task 3.6)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design,ui-design}.md
 *   - _Requirements:
 *       5.2 —— 滑动只渲染轻量预览物(不实例化体验),显式进入才加载完整体验。
 *       5.6 —— 排序口径 + 滑动方向预加载,保证流畅。
 *       5.8 —— livestream/stage 卡「活动正在进行」时,主行动直接进入直播/现场观看。
 *       5.9 —— 创作流冷启动:内容稀少/空流时给出友好占位(不空屏)。
 *       5.10 —— 省流模式:抑制视频/自动预加载;空流占位、无障碍。
 *
 * 设计:把"是否进行中""预览取哪张图""下一屏预加载哪几张""哪些卡近屏渲染、
 * 哪些离屏回收"等判定收敛到无 RN 依赖的纯函数,便于单测,并让 `CreationCard` /
 * `CreationFeedScreen` 仅做呈现与编排。task 3.7 在此基础上补齐:
 *   - 下一屏预加载 N+1/N+2 + 去重(`preloadPreviewUris` / `selectUrisToPrefetch`);
 *   - 预览懒加载与离屏回收的渲染窗口判定(`shouldRenderPreview` /
 *     `activeWindowIndices` / `recycledIndices`)。
 *
 * ⚠️ 关于"是否进行中(live)"的派生假设(发现投影无显式 live 标志):
 *   `CreationDiscoveryItem` 当前未携带显式 `isLive` 字段(见 shared/types/creation.ts)。
 *   因此本模块从 **offerings 的可用时段(availability.schedule)** 派生:当某个 offering
 *   的某个时段窗口 [startsAt, endsAt] 覆盖"此刻"时,认为该 livestream/stage 正在进行。
 *   - `endsAt` 缺省视为"开播后持续进行"(未给结束时间 = 仍在播)。
 *   后端补充显式 live 标志后,可在此处优先采用显式字段(改一处即可)。
 */
import type { CreationDiscoveryItem, Offering } from '../../shared/types/creation';

/** 可被"直接进入"的实时类型(需求 5.8)。 */
export const LIVE_TYPES = ['livestream', 'stage'] as const;

/** 该创作类型是否为实时类(livestream/stage)。 */
export function isLiveType(item: Pick<CreationDiscoveryItem, 'type'>): boolean {
  return item.type === 'livestream' || item.type === 'stage';
}

/**
 * 某个 offering 的可用时段是否覆盖 `now`(进行中)。
 * - 无 schedule → false。
 * - 窗口需满足 startsAt <= now 且 (endsAt 缺省 或 now <= endsAt)。
 */
export function offeringActiveAt(offering: Offering, now: number): boolean {
  const schedule = offering.availability?.schedule;
  if (!schedule || schedule.length === 0) return false;
  return schedule.some(
    (w) =>
      typeof w.startsAt === 'number' &&
      w.startsAt <= now &&
      (w.endsAt == null || now <= w.endsAt),
  );
}

/**
 * livestream/stage 是否"正在进行"(需求 5.8 的进入门槛)。
 * 仅对实时类生效;从 offerings 的可用时段派生(见文件头假设说明)。
 */
export function isCreationLiveNow(
  item: Pick<CreationDiscoveryItem, 'type' | 'offerings'>,
  now: number = Date.now(),
): boolean {
  if (item.type !== 'livestream' && item.type !== 'stage') return false;
  const offerings = item.offerings ?? [];
  return offerings.some((o) => offeringActiveAt(o, now));
}

/**
 * 选取卡片预览图地址。省流模式优先缩略图(更小),普通模式也优先缩略图以快速渲染,
 * 缺省回退到原图。无预览返回空串。
 */
export function preferredPreviewUri(
  item: Pick<CreationDiscoveryItem, 'preview'>,
  _dataSaver: boolean = false,
): string {
  const p = item.preview;
  if (!p) return '';
  return p.thumbnailUrl || p.url || '';
}

/**
 * 计算"下一张需要预加载的预览图"(需求 5.10 预加载;省流模式下不预加载)。
 * @returns 待 prefetch 的 URI;无需/无法预加载时返回 null。
 *
 * 注:这是 `preloadPreviewUris(..., 1)` 的单步特例,保留以兼容既有调用方/测试;
 * 新代码请用 `preloadPreviewUris`(支持 N+1/N+2 提前量 + 去重)。
 */
export function nextPreloadUri(
  items: Pick<CreationDiscoveryItem, 'preview'>[],
  activeIndex: number,
  dataSaver: boolean = false,
): string | null {
  if (dataSaver) return null;
  if (activeIndex < 0) return null;
  const next = items[activeIndex + 1];
  if (!next) return null;
  const uri = preferredPreviewUri(next);
  return uri.length > 0 ? uri : null;
}

// ============================================================
// §A 下一屏预加载(N+1 / N+2)+ 去重(需求 5.6 流畅滑动 / 5.10 省流)
// design: §Discovery Surfaces ②「冷启动…预加载下一屏保证流畅」
//          §Testing Strategy「性能:创作流滑动帧率与预加载」
// ============================================================

/**
 * 默认预加载提前量(向滑动方向预热多少张预览物)。
 * 抖音式竖滑通常下滑为主,提前预热 N+1、N+2 两张即可覆盖一次惯性滑动,
 * 既保证"上滑即显、不闪白",又不过度占用带宽/内存(需求 5.6)。
 */
export const FEED_PRELOAD_LOOKAHEAD = 2;

/**
 * 计算"当前卡之后需要预热的预览图地址"(向下方向 N+1 … N+lookahead)。
 *
 * 性质保证(供单测覆盖):
 *  - **省流模式不预加载**:`dataSaver=true` → 返回空数组(需求 5.10)。
 *  - **只预热预览物,绝不实例化体验**:仅返回轻量预览 URI,调用方用 `Image.prefetch`
 *    预热网络/磁盘缓存,不触发 enter(需求 5.2 预览 vs 进入分离)。
 *  - **越界安全**:`activeIndex<0` 或接近列表尾部时,只返回存在的项。
 *  - **去重 + 跳空**:同一 URI 只出现一次,空 URI 被剔除(避免重复 prefetch)。
 *
 * @param items     当前已加载的发现投影项(顺序即流内顺序)。
 * @param activeIndex 当前居中卡的下标。
 * @param dataSaver 省流模式。
 * @param lookahead 提前量(默认 {@link FEED_PRELOAD_LOOKAHEAD});负数/0 视为不预加载。
 * @returns 去重后的待 prefetch URI 列表(可能为空)。
 */
export function preloadPreviewUris(
  items: Pick<CreationDiscoveryItem, 'preview'>[],
  activeIndex: number,
  dataSaver: boolean = false,
  lookahead: number = FEED_PRELOAD_LOOKAHEAD,
): string[] {
  if (dataSaver) return [];
  if (activeIndex < 0) return [];
  if (!Number.isFinite(lookahead) || lookahead <= 0) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const steps = Math.floor(lookahead);
  for (let step = 1; step <= steps; step += 1) {
    const next = items[activeIndex + step];
    if (!next) break; // 到达列表尾部,后面也不会有
    const uri = preferredPreviewUri(next);
    if (uri.length > 0 && !seen.has(uri)) {
      seen.add(uri);
      out.push(uri);
    }
  }
  return out;
}

/**
 * 从候选 URI 中筛出"尚未预热过"的(避免对同一 URI 重复 prefetch)。
 * 调用方持有一份"已预热集合",每次只对新 URI 发起 `Image.prefetch`,把冗余网络
 * 请求降到最低(需求 5.6 流畅滑动的工程化保证)。
 *
 * @param candidateUris 本轮想预热的 URI(通常来自 {@link preloadPreviewUris})。
 * @param alreadyPrefetched 既有已预热集合(Set 或 URI 数组均可)。
 * @returns 需要本轮实际发起 prefetch 的、去重后的新 URI。
 */
export function selectUrisToPrefetch(
  candidateUris: string[],
  alreadyPrefetched: ReadonlySet<string> | readonly string[],
): string[] {
  const seenSet =
    alreadyPrefetched instanceof Set
      ? alreadyPrefetched
      : new Set<string>(alreadyPrefetched as readonly string[]);
  const out: string[] = [];
  const local = new Set<string>();
  for (const uri of candidateUris) {
    if (uri.length === 0) continue;
    if (seenSet.has(uri) || local.has(uri)) continue;
    local.add(uri);
    out.push(uri);
  }
  return out;
}

// ============================================================
// §B 预览懒加载与离屏回收(需求 5.2 轻量预览 / 5.6 流畅滑动)
// design: §Discovery Surfaces ②「流内只渲染轻量预览…」
// 渲染窗口:只为"当前卡 ± 半径"内的卡渲染重型预览物,窗口外的卡回收预览,
// 避免离屏卡常驻图片/视频占用内存,保证滑动帧率。FlatList 虚拟化负责卸载更远的卡。
// ============================================================

/**
 * 预览渲染窗口半径:当前卡前后各保留多少张"渲染重型预览"。
 * 半径 1 = 渲染上一张/当前/下一张共 3 张的预览物,其余回收为占位。
 */
export const FEED_RENDER_WINDOW_RADIUS = 1;

/**
 * 某张卡是否落在"激活渲染窗口"内(当前卡 ± 半径)。
 * 窗口内 → 渲染重型预览物;窗口外 → 回收为轻量占位(释放图片/视频资源)。
 *
 * @param index       待判定卡的下标。
 * @param activeIndex 当前居中卡下标(<0 表示尚无激活卡)。
 * @param radius      窗口半径(默认 {@link FEED_RENDER_WINDOW_RADIUS})。
 */
export function isWithinRenderWindow(
  index: number,
  activeIndex: number,
  radius: number = FEED_RENDER_WINDOW_RADIUS,
): boolean {
  if (activeIndex < 0) return false;
  const r = Math.max(0, Math.floor(radius));
  return index >= activeIndex - r && index <= activeIndex + r;
}

/**
 * 是否应为该卡渲染重型预览物(= 落在渲染窗口内)。
 * 这是 `CreationCard` 决定"显示预览图 / 显示占位回收"的纯判定(需求 5.2)。
 */
export function shouldRenderPreview(
  index: number,
  activeIndex: number,
  radius: number = FEED_RENDER_WINDOW_RADIUS,
): boolean {
  return isWithinRenderWindow(index, activeIndex, radius);
}

/**
 * 计算"激活渲染窗口"内的卡下标集合(已按列表长度夹取到 [0, total) )。
 * @returns 升序、无越界的下标数组;activeIndex<0 或 total<=0 时为空。
 */
export function activeWindowIndices(
  activeIndex: number,
  total: number,
  radius: number = FEED_RENDER_WINDOW_RADIUS,
): number[] {
  if (total <= 0 || activeIndex < 0) return [];
  const r = Math.max(0, Math.floor(radius));
  const start = Math.max(0, activeIndex - r);
  const end = Math.min(total - 1, activeIndex + r);
  const out: number[] = [];
  for (let i = start; i <= end; i += 1) out.push(i);
  return out;
}

/**
 * 计算"应回收预览(窗口外)"的卡下标集合 —— 即 [0,total) 中不在激活窗口内者。
 * 这些卡若仍挂载(FlatList 窗口内但非近屏),应释放重型预览,只留占位。
 * @returns 升序、无越界的下标数组。
 */
export function recycledIndices(
  activeIndex: number,
  total: number,
  radius: number = FEED_RENDER_WINDOW_RADIUS,
): number[] {
  if (total <= 0) return [];
  const active = new Set(activeWindowIndices(activeIndex, total, radius));
  const out: number[] = [];
  for (let i = 0; i < total; i += 1) {
    if (!active.has(i)) out.push(i);
  }
  return out;
}

/**
 * 创作流是否处于"冷启动空态"——加载完成、非加载/非错误,且无任何条目(需求 5.9)。
 */
export function isColdStartEmpty(opts: {
  isLoading: boolean;
  isError: boolean;
  itemCount: number;
}): boolean {
  return !opts.isLoading && !opts.isError && opts.itemCount === 0;
}

// ============================================================
// §C 手动测试清单(task 3.7 · 性能验收 · 需求 5.2 / 5.6)
// 真机帧率/预加载/回收等需在设备上目测,无法在 node 单测覆盖,故列清单。
// ------------------------------------------------------------
// 滑动帧率(需求 5.6):
//  1. 真机进入「创作流」,连续快速上滑 20+ 屏。期望:无明显掉帧/卡顿,
//     滑动顺滑(开发版可开 RN Perf Monitor / Flipper,JS+UI 帧率 ≈ 60fps)。
//  2. 切换排序口径(最新/热门/关注/附近)后再次连刷,帧率应保持稳定。
//
// 下一屏预加载(需求 5.6,preloadPreviewUris + selectUrisToPrefetch):
//  3. 普通网络下停在某卡约 1s 再上滑,下一/下二屏预览应"即显、不闪白"。
//  4. 抓包/看日志:同一预览 URI 不应被重复 prefetch(去重生效);
//     回到已看过的卡不应触发新的 prefetch(已预热集合生效)。
//  5. 仅预览被预热:预加载期间不应发生 enter/体验实例化的网络或导航(需求 5.2)。
//
// 省流模式(需求 5.10):
//  6. 打开顶部「📶/🌙 省流」开关:不再自动预加载下一屏(滑到才加载),
//     预览优先用缩略图;关闭后预加载恢复。
//
// 预览懒加载与离屏回收(需求 5.2,shouldRenderPreview):
//  7. 当前卡 ± 1 屏渲染完整预览图;再远的离屏卡回收为占位(类型 emoji),
//     回滑时近屏卡重新显示预览。长时间滑动后内存应平稳(无持续增长)。
//  8. FlatList 虚拟化:windowSize=3 / maxToRenderPerBatch=3 / initialNumToRender=2 /
//     removeClippedSubviews 已开启——远处卡被卸载,不常驻内存。
//
// 进入分离(需求 5.2):
//  9. 滑动过程中绝不进入体验;仅点击主行动(▶️玩/🛒买/🔴看/🎤现场/🚪逛)才 enter。
// ============================================================
