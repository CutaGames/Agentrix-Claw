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
