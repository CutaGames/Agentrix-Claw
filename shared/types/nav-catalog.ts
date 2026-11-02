/**
 * 导航目录（合同 v1 草案，CONTRACTS.md 第一行；产品文档 5.3、6.4、7.3、8.1，D3 / D14）。
 *
 * 起点是 mobile 的本地草案（`rebuild/mobile-20260927` @ `59204a8e` `src/navigation/navCatalog.ts`），
 * 已吸收 web、desktop 在 REQ-mobile-011 下的答复。三端从这里导入，不再各自维护常量。
 *
 * 规则（8.1）：
 * - 同一件事在每个端上同名：区、页签的 id 和中英文标签都在这里定。
 * - 端只能加自己独有的区（目前只有桌面的"我的 AI 们""这台电脑"），不能改名或去掉四个共用区。
 * - 深链、推送、分享都落到"区 + 页签"。合同只定 `zone/tab` 片段；各端的路由前缀自己拼
 *   （例如 web 维护"区 + 页签 → 现有路由"的映射，见 REQ-mobile-011.re-web）。
 *
 * 待 coord 确认（草案里先按下面写）：
 * - "活动 / 回执"放在 `companion/activity`（5.3：点伙伴头像看活动；推送 `receipt_ready` 指向这里）。
 *   7.3 把"回执与活动"写在事项下；如果改到 `matters`，只改本文件和推送目的地表。
 */

export const NAV_CATALOG_SCHEMA_VERSION = 'agentrix.nav.v1' as const;

export type NavSurface = 'mobile' | 'web' | 'desktop';

export interface NavLabel {
  zh: string;
  en: string;
}

/** 伙伴 / 事项 / 分身 / 我的。用 `my` 而不是 `me`：避开手机旧的 `agentrix://me/...` 深链。 */
export const NAV_ZONE_IDS = ['companion', 'matters', 'twin', 'my'] as const;
export type NavZoneId = (typeof NAV_ZONE_IDS)[number];

/** 只有桌面显示的区（8.1 / D14）。手机和 Web 在"事项 → 电脑上"里看这些内容。 */
export const DESKTOP_ONLY_ZONE_IDS = ['my-ais', 'this-computer'] as const;
export type DesktopOnlyZoneId = (typeof DESKTOP_ONLY_ZONE_IDS)[number];

export type AnyNavZoneId = NavZoneId | DesktopOnlyZoneId;

export interface NavTab {
  id: string;
  label: NavLabel;
  /** 条件满足前隐藏（5.5："没绑定电脑时整块隐藏"）。 */
  requires?: 'paired_computer';
  /** 这些端不显示这个页签；指向它的链接按 `resolveNavDestinationForSurface` 改落点。 */
  hiddenOn?: readonly NavSurface[];
}

export interface NavZone<Z extends string = AnyNavZoneId> {
  id: Z;
  label: NavLabel;
  defaultTab: string;
  tabs: readonly NavTab[];
}

export const NAV_CATALOG: Readonly<Record<NavZoneId, NavZone<NavZoneId>>> = {
  companion: {
    id: 'companion',
    label: { zh: '伙伴', en: 'Companion' },
    defaultTab: 'chat',
    tabs: [
      { id: 'chat', label: { zh: '对话', en: 'Chat' } },
      { id: 'activity', label: { zh: '活动', en: 'Activity' } },
      { id: 'todo', label: { zh: '待办时间线', en: 'Upcoming' } },
      { id: 'artifacts', label: { zh: '作品库', en: 'Library' } },
      { id: 'call', label: { zh: '通话', en: 'Call' } },
    ],
  },
  matters: {
    id: 'matters',
    label: { zh: '事项', en: 'Matters' },
    defaultTab: 'pending',
    tabs: [
      { id: 'pending', label: { zh: '待我处理', en: 'For you' } },
      { id: 'goals', label: { zh: '目标', en: 'Goals' } },
      { id: 'schedule', label: { zh: '日程', en: 'Schedule' } },
      {
        id: 'on-computer',
        label: { zh: '电脑上', en: 'On your computer' },
        requires: 'paired_computer',
        hiddenOn: ['desktop'],
      },
      { id: 'ideas', label: { zh: '灵感', en: 'Ideas' } },
    ],
  },
  twin: {
    id: 'twin',
    label: { zh: '分身', en: 'Twin' },
    defaultTab: 'card',
    tabs: [
      { id: 'card', label: { zh: '分身名片', en: 'Twin card' } },
      { id: 'passport', label: { zh: 'Agent 护照', en: 'Agent passport' } },
      { id: 'status', label: { zh: '公开状态', en: 'Visibility' } },
      { id: 'visitors', label: { zh: '访客与线索', en: 'Visitors' } },
      { id: 'bookings', label: { zh: '预约', en: 'Bookings' } },
      { id: 'services', label: { zh: '服务目录与价格', en: 'Services' } },
      { id: 'review', label: { zh: '每周复核', en: 'Weekly review' } },
      { id: 'income', label: { zh: '收入与回执', en: 'Income' } },
    ],
  },
  my: {
    id: 'my',
    label: { zh: '我的', en: 'Me' },
    defaultTab: 'home',
    tabs: [
      { id: 'home', label: { zh: '我的', en: 'Me' } },
      { id: 'identity', label: { zh: '身份与记忆', en: 'Identity & memory' } },
      { id: 'import', label: { zh: '带入与备份', en: 'Bring in & backup' } },
      { id: 'connections', label: { zh: '连接', en: 'Connections' } },
      { id: 'devices', label: { zh: '设备', en: 'Devices' } },
      { id: 'wallet', label: { zh: '钱包与预算', en: 'Wallet & budget' } },
      { id: 'permissions', label: { zh: '权限与急停', en: 'Permissions & stop' } },
      { id: 'plan', label: { zh: '套餐与模型', en: 'Plan & models' } },
      { id: 'trust', label: { zh: '信任与信誉', en: 'Trust & reputation' } },
      { id: 'appearance', label: { zh: '外观', en: 'Appearance' } },
      { id: 'settings', label: { zh: '设置与隐私', en: 'Settings & privacy' } },
    ],
  },
};

/** 桌面独有两区（产品文档 6.4，REQ-mobile-011.re-desktop）。 */
export const DESKTOP_ONLY_NAV_CATALOG: Readonly<Record<DesktopOnlyZoneId, NavZone<DesktopOnlyZoneId>>> = {
  'my-ais': {
    id: 'my-ais',
    label: { zh: '我的 AI 们', en: 'My AIs' },
    defaultTab: 'sessions',
    tabs: [
      { id: 'sessions', label: { zh: '会话', en: 'Sessions' } },
      { id: 'changes', label: { zh: '改动', en: 'Changes' } },
      { id: 'connections', label: { zh: '连接', en: 'Connections' } },
      { id: 'memory', label: { zh: '共用记忆', en: 'Shared memory' } },
      { id: 'spend', label: { zh: '花费', en: 'Spend' } },
    ],
  },
  'this-computer': {
    id: 'this-computer',
    label: { zh: '这台电脑', en: 'This computer' },
    defaultTab: 'safety',
    tabs: [
      { id: 'safety', label: { zh: '安全与急停', en: 'Safety & stop' } },
      { id: 'folders', label: { zh: '目录与应用', en: 'Folders & apps' } },
      { id: 'models', label: { zh: '本机模型', en: 'Local models' } },
      { id: 'trust', label: { zh: '工作区信任', en: 'Workspace trust' } },
      { id: 'snapshots', label: { zh: '快照与撤回', en: 'Snapshots & undo' } },
    ],
  },
};

/** 每个端显示哪些区、按什么顺序（手机 5.3、桌面 6.4、Web 7.3）。 */
export const NAV_ZONES_BY_SURFACE: Readonly<Record<NavSurface, readonly AnyNavZoneId[]>> = {
  mobile: ['companion', 'matters', 'twin', 'my'],
  web: ['companion', 'matters', 'twin', 'my'],
  desktop: ['companion', 'matters', 'twin', 'my-ais', 'this-computer', 'my'],
};

/** https 区链接前缀（REQ-mobile-011.re-web）：`https://agentrix.top/go/<zone>/<tab>[?ref=<id>]`。 */
export const NAV_WEB_LINK_PREFIX = '/go' as const;
export const NAV_WEB_ORIGIN = 'https://agentrix.top' as const;
export const NAV_APP_SCHEME = 'agentrix:' as const;

/** 页签内条目的不透明引用（审批 id、目标 id……）。 */
export const NAV_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;

export interface NavDestination<Z extends string = NavZoneId> {
  zone: Z;
  tab: string;
  ref?: string;
}

export function isNavZoneId(value: unknown): value is NavZoneId {
  return typeof value === 'string' && (NAV_ZONE_IDS as readonly string[]).includes(value);
}

export function isDesktopOnlyZoneId(value: unknown): value is DesktopOnlyZoneId {
  return typeof value === 'string' && (DESKTOP_ONLY_ZONE_IDS as readonly string[]).includes(value);
}

export function navZone(zone: AnyNavZoneId): NavZone {
  return isNavZoneId(zone) ? NAV_CATALOG[zone] : DESKTOP_ONLY_NAV_CATALOG[zone];
}

export function isNavTab(zone: AnyNavZoneId, tab: unknown): tab is string {
  return typeof tab === 'string' && navZone(zone).tabs.some((t) => t.id === tab);
}

export function isNavRef(value: unknown): value is string {
  return typeof value === 'string' && NAV_REF_PATTERN.test(value);
}

/** 某个端当前显示的页签（按用户是否已绑定电脑）。 */
export function visibleNavTabs(
  zone: AnyNavZoneId,
  context: { surface: NavSurface; hasPairedComputer: boolean },
): NavTab[] {
  return navZone(zone).tabs.filter(
    (tab) =>
      (tab.requires !== 'paired_computer' || context.hasPairedComputer) &&
      !(tab.hiddenOn ?? []).includes(context.surface),
  );
}

/**
 * 把一个落点换成某个端上真正存在的位置：
 * - 桌面打开 `matters/on-computer` → `my-ais/sessions`；
 * - 手机和 Web 打开桌面独有区 → `matters/on-computer`。
 * `ref` 原样保留。
 */
export function resolveNavDestinationForSurface(
  destination: NavDestination<AnyNavZoneId>,
  surface: NavSurface,
): NavDestination<AnyNavZoneId> {
  const keepRef = destination.ref !== undefined ? { ref: destination.ref } : {};
  if (surface === 'desktop' && destination.zone === 'matters' && destination.tab === 'on-computer') {
    return { zone: 'my-ais', tab: 'sessions', ...keepRef };
  }
  if (surface !== 'desktop' && isDesktopOnlyZoneId(destination.zone)) {
    return { zone: 'matters', tab: 'on-computer', ...keepRef };
  }
  return destination;
}

export type NavLinkParseResult =
  | { ok: true; destination: NavDestination }
  | { ok: false; reason: 'not_a_zone_link' | 'unknown_tab' | 'invalid_ref' | 'unsupported_query' | 'too_deep' };

/**
 * 解析区链接：`agentrix://<zone>[/<tab>][?ref=<id>]`、`https://agentrix.top/go/<zone>/...`，
 * 或 App 内相对路径 `/<zone>/...`（也接受 `go/<zone>/...`）。
 * - 只接受 `ref` 一个查询键，且最多一个；不接受比页签更深的路径。
 * - 站点根下 `/go/` 之外的 https 页面是 Web 页面（例如营销页 `/twin`），不算区链接。
 * - 只解析四个共用区；桌面独有区只在桌面应用内使用，不出现在对外链接里。
 */
export function parseNavLink(input: string): NavLinkParseResult {
  if (typeof input !== 'string' || input.length === 0 || input.length > 2048) {
    return { ok: false, reason: 'not_a_zone_link' };
  }
  const absolute = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(input);
  let url: URL;
  try {
    url = absolute
      ? new URL(input)
      : new URL(input.startsWith('/') ? input : `/${input}`, 'https://nav.invalid');
  } catch {
    return { ok: false, reason: 'not_a_zone_link' };
  }
  if (url.protocol !== 'https:' && url.protocol !== NAV_APP_SCHEME) {
    return { ok: false, reason: 'not_a_zone_link' };
  }
  if (absolute && url.protocol === 'https:' && url.hostname !== 'agentrix.top') {
    return { ok: false, reason: 'not_a_zone_link' };
  }
  if (url.username || url.password || url.port) {
    return { ok: false, reason: 'not_a_zone_link' };
  }
  const path = url.protocol === NAV_APP_SCHEME ? `${url.hostname}${url.pathname}` : url.pathname;
  let segments = path.split('/').filter(Boolean);
  const viaGo = segments[0] === NAV_WEB_LINK_PREFIX.slice(1);
  if (absolute && url.protocol === 'https:' && !viaGo) return { ok: false, reason: 'not_a_zone_link' };
  if (viaGo) segments = segments.slice(1);
  const [zone, tab, ...rest] = segments;
  if (!isNavZoneId(zone)) return { ok: false, reason: 'not_a_zone_link' };
  if (rest.length > 0) return { ok: false, reason: 'too_deep' };
  const effectiveTab = tab ?? NAV_CATALOG[zone].defaultTab;
  if (!isNavTab(zone, effectiveTab)) return { ok: false, reason: 'unknown_tab' };
  const keys = Array.from(url.searchParams.keys());
  if (keys.some((key) => key !== 'ref') || url.searchParams.getAll('ref').length > 1) {
    return { ok: false, reason: 'unsupported_query' };
  }
  const ref = url.searchParams.get('ref');
  if (ref !== null && !isNavRef(ref)) return { ok: false, reason: 'invalid_ref' };
  return { ok: true, destination: { zone, tab: effectiveTab, ...(ref !== null ? { ref } : {}) } };
}

/** 规范路径：`/<zone>/<tab>[?ref=<id>]`。 */
export function serializeNavDestination(destination: NavDestination): string {
  if (!isNavZoneId(destination.zone) || !isNavTab(destination.zone, destination.tab)) {
    throw new Error('invalid nav destination');
  }
  if (destination.ref !== undefined && !isNavRef(destination.ref)) {
    throw new Error('invalid nav ref');
  }
  const base = `/${destination.zone}/${destination.tab}`;
  return destination.ref !== undefined ? `${base}?ref=${encodeURIComponent(destination.ref)}` : base;
}

/** 可分享的 https 形式：`https://agentrix.top/go/<zone>/<tab>[?ref=<id>]`。 */
export function navDestinationWebUrl(destination: NavDestination): string {
  return `${NAV_WEB_ORIGIN}${NAV_WEB_LINK_PREFIX}${serializeNavDestination(destination)}`;
}

/** App 深链形式：`agentrix://<zone>/<tab>[?ref=<id>]`。 */
export function navDestinationAppUrl(destination: NavDestination): string {
  return `agentrix:/${serializeNavDestination(destination)}`;
}
