/**
 * desktopSurfaces.ts — 桌面 D1：哪些面板在默认路径上。
 *
 * 产品文档 6.5：繁育、小游戏、社交、视频工作室、海报工坊、世界创作器移出默认
 * 路径；经济与团队面板迁到 Web。这里只摘入口、不删代码、不删数据：
 *   - 菜单（标题栏"更多"、浮球右键、桌宠右键）不再显示这些入口；
 *   - 事件（`agentrix:open-*`）打开这些面板时直接忽略，并发出
 *     `agentrix:surface-moved`，由界面提示"已移到 Web / 已下线"；
 *   - 本机开关 `agentrix_desktop_legacy_surfaces` 精确为 "1" 时恢复旧入口
 *     （一键回滚，DRH-R04.3）。
 */

export type RetiredSurfaceId =
  | "pet-breeding"
  | "pet-minigames"
  | "social"
  | "video-studio"
  | "poster-workshop"
  | "world-creator"
  | "creator-studio"
  | "agent-economy"
  | "agent-team"
  | "agent-ops";

export type SurfaceDestination = "web" | "retired";

export interface RetiredSurface {
  id: RetiredSurfaceId;
  label: string;
  destination: SurfaceDestination;
}

export const RETIRED_SURFACES: Readonly<Record<RetiredSurfaceId, RetiredSurface>> = {
  "pet-breeding": { id: "pet-breeding", label: "宠物繁育", destination: "retired" },
  "pet-minigames": { id: "pet-minigames", label: "宠物小游戏", destination: "retired" },
  social: { id: "social", label: "社交（共养、贺卡、模仿）", destination: "retired" },
  "video-studio": { id: "video-studio", label: "视频工作室", destination: "web" },
  "poster-workshop": { id: "poster-workshop", label: "海报工坊", destination: "web" },
  "world-creator": { id: "world-creator", label: "世界创作器", destination: "web" },
  "creator-studio": { id: "creator-studio", label: "创作工坊", destination: "web" },
  "agent-economy": { id: "agent-economy", label: "Agent 经济", destination: "web" },
  "agent-team": { id: "agent-team", label: "Agent 团队", destination: "web" },
  "agent-ops": { id: "agent-ops", label: "Agent 运营", destination: "web" },
};

export const LEGACY_SURFACES_KEY = "agentrix_desktop_legacy_surfaces";
export const SURFACE_MOVED_EVENT = "agentrix:surface-moved";

/** 旧入口是否恢复（一键回滚）。精确为 "1" 才算。 */
export function areLegacySurfacesEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(LEGACY_SURFACES_KEY) === "1";
  } catch {
    return false;
  }
}

/** 某个面板现在能不能从桌面打开。未登记的面板不受影响。 */
export function isSurfaceAvailable(id: string): boolean {
  if (!(id in RETIRED_SURFACES)) return true;
  return areLegacySurfacesEnabled();
}

/**
 * 打开面板前调用：可用就执行 `open`，否则发 `agentrix:surface-moved` 并返回 false。
 * 用在事件监听里，保证菜单以外的入口（深链、跨窗口 relay、远程命令）也打不开。
 */
export function openSurfaceIfAvailable(id: RetiredSurfaceId, open: () => void): boolean {
  if (isSurfaceAvailable(id)) {
    open();
    return true;
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(SURFACE_MOVED_EVENT, { detail: RETIRED_SURFACES[id] }));
    } catch {
      /* non-DOM host */
    }
  }
  return false;
}

/** 创作工坊的页签对应哪个退出默认路径的面板。 */
export function studioSurfaceFor(tab?: string): RetiredSurfaceId {
  if (tab === "world") return "world-creator";
  if (tab === "poster") return "poster-workshop";
  if (tab === "video") return "video-studio";
  return "creator-studio";
}

/** 给菜单用：按面板 id 过滤。没有 surface 字段的菜单项保留。 */
export function filterMenuBySurface<T extends { surface?: RetiredSurfaceId }>(items: T[]): T[] {
  return items.filter((item) => !item.surface || isSurfaceAvailable(item.surface));
}

export function describeMovedSurface(surface: RetiredSurface): string {
  return surface.destination === "web"
    ? `${surface.label}已移到网页版，请在 Web 上打开。`
    : `${surface.label}已从桌面端下线，数据仍保留。`;
}

/**
 * Desktop D1 (6.5) — native context-menu entries that leave the default
 * path. Items are dropped unless the legacy-surfaces switch is on; separators
 * that end up adjacent (or at the edges) are collapsed.
 */
const BALL_MENU_SURFACES: Record<string, RetiredSurfaceId> = {
  "ball-creator-studio": "creator-studio",
  "ball-world-creator": "world-creator",
  "ball-video": "video-studio",
  "ball-coraising": "social",
  "ball-greeting": "social",
  "ball-pet-breeding": "pet-breeding",
};

export function filterBallMenuItems<T extends { id?: string; item?: string }>(items: T[]): T[] {
  const kept = items.filter((entry) => {
    const surface = entry.id ? BALL_MENU_SURFACES[entry.id] : undefined;
    return !surface || isSurfaceAvailable(surface);
  });
  const result: T[] = [];
  for (const entry of kept) {
    const isSeparator = entry.item === "Separator";
    if (isSeparator && (result.length === 0 || result[result.length - 1].item === "Separator")) continue;
    result.push(entry);
  }
  while (result.length > 0 && result[result.length - 1].item === "Separator") result.pop();
  return result;
}
