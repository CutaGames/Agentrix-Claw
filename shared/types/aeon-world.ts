/**
 * Aeon(永曜城)世界骨架共享类型 — 跨端单一来源(Task 1.x)。
 *
 * spec: .kiro/specs/agentrix-world/{requirements,design}.md
 * 纪元(Epoch)/ 地块(Plot)/ 房间(Room)的跨端 DTO 与常量。后端 DTO、移动端、
 * 桌面端均从此消费,保证字段一致(R18.3)。
 */

// ── 纪元(Epoch,R17)─────────────────────────────────────────────
export type AeonEpoch = 'earth' | 'mars' | 'galaxy';

/** 纪元有序列表(地球为 MVP 唯一激活)。 */
export const AEON_EPOCHS: readonly AeonEpoch[] = ['earth', 'mars', 'galaxy'] as const;

/** 当前(MVP)唯一激活的纪元。 */
export const AEON_ACTIVE_EPOCH: AeonEpoch = 'earth';

export interface AeonEpochInfo {
  id: AeonEpoch;
  /** 是否已发布可进入。MVP 仅 earth=true。 */
  unlocked: boolean;
  displayName: string;
  /** 锁定纪元的预览文案。 */
  teaser?: string;
}

// ── 地块(Plot,R4)──────────────────────────────────────────────
export type AeonPlotStatus = 'active' | 'dormant';

export interface AeonPlotDto {
  id: string;
  ownerUserId: string;
  epoch: AeonEpoch;
  /** 真实地理坐标(选址锚,非设备实时 GPS;R4.7)。 */
  lat: number;
  lng: number;
  /** 量化网格单元键(epoch+gridCell 唯一)。 */
  gridCell: string;
  status: AeonPlotStatus;
  displayName: string;
  /** 最近 owner 活动时间(ms),用于休眠回收(R4.6)。 */
  lastActivityAt: number;
  createdAt: number;
  /** 真实商家入驻 POI(可空)。 */
  poi?: AeonPlotPoi | null;
}

/** 地图 marker(列出已圈地块,R4.5)。 */
export interface AeonPlotMarker {
  id: string;
  ownerUserId: string;
  ownerName?: string;
  lat: number;
  lng: number;
  displayName: string;
  status: AeonPlotStatus;
  /** 商家地块:POI 名 + 类目(地图上区分店铺/居民地)。 */
  poiName?: string | null;
  poiCategory?: string | null;
}

/** 附近的地块(基于实时 GPS 的地理社交)。带到当前用户的距离(米)。 */
export interface AeonNearbyPlot extends AeonPlotMarker {
  /** 到查询点的距离(米)。 */
  distanceM: number;
  /** 是否当前用户自己的地块。 */
  mine?: boolean;
}

/** 地理签到结果(到访真实地点的领地 → 奖励 AXP)。 */
export interface AeonCheckinResult {
  ok: boolean;
  plotId: string;
  /** 本次签到奖励 AXP(0 = 今天已签过)。 */
  rewardAxp: number;
  alreadyCheckedInToday: boolean;
  bridged: boolean;
  balance?: number;
  message: string;
  /** 连续签到天数(本地块或全局,见 streak 设计)。 */
  streakDays?: number;
}

/** 附近的人(在场玩家按 GPS 聚合,不只地块)。 */
export interface AeonNearbyPerson {
  userId: string;
  displayName: string;
  /** 该用户主宠/角色族群(渲染头像)。 */
  clan?: string;
  /** 到查询点距离(米)。 */
  distanceM: number;
  /** 最近上报位置时间(ms)。 */
  lastSeen: number;
  /** 是否正在某地块/房间(可点进去找 TA)。 */
  plotId?: string | null;
}

/** 签到打卡排行条目。 */
export interface AeonCheckinLeaderEntry {
  userId: string;
  displayName: string;
  /** 周期内签到次数 / 去过的地块数。 */
  checkins: number;
  distinctPlots: number;
  /** 当前连续签到天数。 */
  streakDays: number;
}

/** 真实商家入驻地块(POI 绑定)。 */
export interface AeonPlotPoi {
  /** POI 名(店名)。 */
  name: string;
  /** 类目:restaurant/cafe/shop/service/other。 */
  category: string;
  /** 外部 POI id(高德/腾讯/天地图,可空)。 */
  externalPoiId?: string | null;
  /** 商家用户 id(认证后绑定)。 */
  merchantUserId?: string | null;
  /** 是否已认证商家。 */
  verified?: boolean;
  /** 关联的 marketplace/商品入口(可空)。 */
  storeUrl?: string | null;
  address?: string | null;
}

export const AEON_GEO = {
  /** 附近默认搜索半径(米)。 */
  NEARBY_DEFAULT_RADIUS_M: 5000,
  /** 附近最大半径(米),防滥查全表。 */
  NEARBY_MAX_RADIUS_M: 50000,
  /** 附近返回上限。 */
  NEARBY_LIMIT: 50,
  /** 地理签到判定半径(米):距地块多近算"到访"。 */
  CHECKIN_RADIUS_M: 300,
  /** 单次地理签到奖励 AXP。 */
  CHECKIN_REWARD_AXP: 15,
  /** 连续签到每天额外加成 AXP(× 连续天数,封顶 STREAK_BONUS_CAP)。 */
  STREAK_BONUS_PER_DAY: 5,
  STREAK_BONUS_CAP: 50,
  /** "附近的人"实时位置保留窗口(ms);超过视为离线不返回。 */
  PRESENCE_TTL_MS: 5 * 60 * 1000,
  /** "附近的人"上报节流(ms)。 */
  PRESENCE_REPORT_THROTTLE_MS: 30 * 1000,
} as const;

/** 两点球面距离(米),Haversine。前后端共用,避免漂移。 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ── 坐标系转换(国内合规底图)──────────────────────────────────────
// 设备 GPS = WGS-84;国内底图(天地图/高德/腾讯)= GCJ-02(火星坐标),有数百米偏移。
// 用法:GPS 坐标存库/算距用 WGS-84;叠加到国内 GCJ-02 底图上渲染时转 GCJ-02;
// 反过来从 GCJ-02 底图点选要存库时转回 WGS-84。前后端共用同一实现,避免漂移。
const GCJ_A = 6378245.0;
const GCJ_EE = 0.00669342162296594323;

function outOfChina(lat: number, lng: number): boolean {
  // 粗略中国范围;范围外不做偏移(国外底图用 WGS-84,无需转换)。
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}
function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin((y / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}
function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin((x / 3.0) * Math.PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * Math.PI) + 300.0 * Math.sin((x / 30.0) * Math.PI)) * 2.0) / 3.0;
  return ret;
}

/** WGS-84(GPS)→ GCJ-02(国内底图)。中国境外原样返回。 */
export function wgs84ToGcj02(lat: number, lng: number): { lat: number; lng: number } {
  if (outOfChina(lat, lng)) return { lat, lng };
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - GCJ_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * Math.PI);
  dLng = (dLng * 180.0) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

/** GCJ-02(国内底图点选)→ WGS-84(GPS/存库)。粗逆变换(精度 ~1m,足够选址)。 */
export function gcj02ToWgs84(lat: number, lng: number): { lat: number; lng: number } {
  if (outOfChina(lat, lng)) return { lat, lng };
  const g = wgs84ToGcj02(lat, lng);
  return { lat: lat * 2 - g.lat, lng: lng * 2 - g.lng };
}

// ── 房间(Room,R5)──────────────────────────────────────────────
export type AeonRoomKind = 'company' | 'venue' | 'meeting' | 'market' | 'public';

export interface AeonRoomDto {
  id: string;
  plotId: string;
  orgId: string | null;
  kind: AeonRoomKind;
  capacity: number;
  /** 原语组合配置(房间用途由此声明,不写死场景;R5.3)。 */
  config: Record<string, unknown>;
  displayName: string;
}

// ── 常量 ────────────────────────────────────────────────────────
export const AEON_WORLD = {
  /** MVP 房间默认容量(真人+agent 合计),与 aeon-sync 的 ROOM_CAPACITY_MVP 对齐。 */
  DEFAULT_ROOM_CAPACITY: 20,
  /** 地块休眠判定:无活动超过此毫秒数标记 dormant(R4.6,初定 30 天)。 */
  PLOT_DORMANT_MS: 30 * 24 * 60 * 60 * 1000,
  /**
   * 地图网格量化精度(小数位)。design Open Q:初定街区级。
   * 4 位小数 ≈ 11m;为"圈一块地建小镇"取 3 位 ≈ 110m 街区粒度。
   */
  GRID_DECIMALS: 3,
  /** 进入地块场景的目标时长上限(ms,R4.4)。 */
  ENTER_SCENE_TARGET_MS: 5000,
} as const;

/**
 * 把 (lat,lng) 量化为网格单元键。同一格子在同一纪元仅允许一个 active Plot(R4.3)。
 * 集中在此,前后端共用同一量化逻辑,避免选址判定漂移。
 */
export function toGridCell(lat: number, lng: number, decimals = AEON_WORLD.GRID_DECIMALS): string {
  const q = (n: number) => {
    const f = Math.pow(10, decimals);
    return (Math.round(n * f) / f).toFixed(decimals);
  };
  return `${q(lat)},${q(lng)}`;
}

// ── 建造物(BuildItem,R10)─────────────────────────────────────
/** 功能建筑链接目标类型(进入建筑即打开对应空间,R10.6)。 */
export type AeonBuildLinkKind = 'org' | 'room' | 'stage' | 'none';

export interface AeonBuildItemDto {
  id: string;
  plotId: string;
  /** 来自用户 World_Assets 的资产(可空)。 */
  sourceAssetId: string | null;
  /** 模块化科技未来城建筑目录 id(可空)。 */
  catalogId: string | null;
  x: number;
  y: number;
  rotation: number;
  /** 链接到的 Org/Room/Stage id(功能建筑)。 */
  linksToId: string | null;
  linksToKind: AeonBuildLinkKind;
  /** 展示名(目录项名或资产名)。 */
  label: string;
}

/** 放置/移动请求(移动端拖拽 → 后端校验持久化)。 */
export interface AeonBuildPlacement {
  catalogId?: string | null;
  sourceAssetId?: string | null;
  x: number;
  y: number;
  rotation?: number;
  linksToId?: string | null;
  linksToKind?: AeonBuildLinkKind;
  label?: string;
}

/** 模块化建筑目录项(科技未来城外观,R10 可放置物来源之一)。 */
export interface AeonBuildCatalogItem {
  catalogId: string;
  label: string;
  /** 占地格数(用于重叠/边界校验)。 */
  footprint: { w: number; h: number };
  /** 该目录项是否为功能建筑(可链接 Org/Room)。 */
  functional: boolean;
  /** 概念图/缩略图占位(美术量产前用 emoji/占位)。 */
  icon: string;
}

// ── 世界新闻(World_News,R14.5)────────────────────────────────
export type AeonNewsKind =
  | 'task_accepted'
  | 'task_completed'
  | 'company_founded'
  | 'hire'
  | 'bounty_posted'
  | 'milestone'
  | 'market_sale'
  | 'micro_story';

export interface AeonNewsItem {
  id: string;
  epoch: AeonEpoch;
  kind: AeonNewsKind;
  /** 一行摘要(LLM 微剧情或模板生成)。 */
  headline: string;
  /** 关联主体(org/user/plot)。 */
  refId?: string;
  createdAt: number;
}

/** 排行榜条目(产出/接单/收入)。 */
export interface AeonLeaderboardEntry {
  subjectId: string;
  subjectName: string;
  metric: 'output' | 'tasks_done' | 'axp_earned';
  value: number;
}

// ── 建造世界常量 ────────────────────────────────────────────────
export const AEON_BUILD = {
  /** 地块内部建造网格边界(格);超出拒绝放置(R10.2)。 */
  PLOT_GRID_W: 32,
  PLOT_GRID_H: 32,
  /** 单地块最大建造物数(防爆)。 */
  MAX_ITEMS_PER_PLOT: 200,
} as const;

// ── 现场活动/演出排期(Event,Stage 原语调度层)──────────────────
export type AeonEventKind = 'talk_show' | 'share' | 'auction' | 'concert' | 'meetup' | 'other';
/** 派生展示状态:未开始 / 进行中 / 已结束 / 已取消。 */
export type AeonEventStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';

export interface AeonEventDto {
  id: string;
  epoch: AeonEpoch;
  kind: AeonEventKind;
  title: string;
  description: string;
  hostUserId: string;
  hostName: string;
  startsAt: number;
  endsAt: number | null;
  plotId: string | null;
  buildItemId: string | null;
  coverUrl: string | null;
  status: AeonEventStatus;
  /** 派生的实时舞台房间 id:`aeon-live-<eventId>`。 */
  roomId: string;
  /** 预约人数。 */
  rsvpCount: number;
  /** 当前请求用户是否已预约(列表/详情按需填充)。 */
  rsvpedByMe?: boolean;
  /** 当前在场实时人数(进行中活动才有意义)。 */
  liveCount?: number;
  createdAt: number;
}

export interface AeonEventCreateInput {
  kind?: AeonEventKind;
  title: string;
  description?: string;
  startsAt: number;
  endsAt?: number | null;
  plotId?: string | null;
  buildItemId?: string | null;
  coverUrl?: string | null;
}

export const AEON_EVENTS = {
  /** 活动房间 id 前缀(舞台房间约定,与 aeon-sync StageService.isStageRoom 对齐)。 */
  ROOM_PREFIX: 'aeon-live-',
  /** 列表默认时间窗(ms):往前 1h(进行中)~ 往后 14 天。 */
  UPCOMING_WINDOW_MS: 14 * 24 * 60 * 60 * 1000,
  GRACE_LIVE_BEFORE_MS: 10 * 60 * 1000, // 开演前 10 分钟即可进场
  GRACE_LIVE_AFTER_MS: 60 * 60 * 1000, // 无结束时间则开演后 1h 视为仍 live
} as const;

/** 由 eventId 派生实时舞台房间 id。 */
export function aeonEventRoomId(eventId: string): string {
  return `${AEON_EVENTS.ROOM_PREFIX}${eventId}`;
}
