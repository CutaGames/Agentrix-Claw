/**
 * desktopNavigation.ts — 桌面 D1：主窗口六区（产品文档 6.4、8.1、D14）。
 *
 * 区 id、中文名和顺序来自合同 v1 `shared/types/nav-catalog.ts`（`agentrix.nav.v1`，
 * `NAV_ZONES_BY_SURFACE.desktop`）：前四区与手机、Web 同名（伙伴 / 事项 / 分身 / 我的），
 * 桌面另有"我的 AI 们""这台电脑"。这里只加桌面自己的图标。
 *
 * 旧浮层仍在聊天面板里渲染。各区的入口通过 `agentrix:open-panel` 让聊天
 * 面板打开对应浮层，并切回"伙伴"区，这样旧面板都有了新位置，而不用在 D1
 * 里重写它们（ChatPanelImpl 拆分在后续切片）。
 */
import {
  NAV_CATALOG_SCHEMA_VERSION,
  NAV_ZONES_BY_SURFACE,
  isNavZoneId,
  navZone,
  resolveNavDestinationForSurface,
  type AnyNavZoneId,
  type NavDestination,
} from "../../../shared/types/nav-catalog";

export type DesktopZoneId = AnyNavZoneId;

export interface DesktopZone {
  id: DesktopZoneId;
  label: string;
  /** 与手机、Web 同名的前四区；false 表示桌面独有。 */
  shared: boolean;
  icon: string;
}

export const DESKTOP_NAV_SCHEMA_VERSION = NAV_CATALOG_SCHEMA_VERSION;

const ZONE_ICONS: Record<DesktopZoneId, string> = {
  companion: "💬",
  matters: "✅",
  twin: "🪪",
  "my-ais": "🧩",
  "this-computer": "🖥",
  my: "👤",
};

export const DESKTOP_ZONES: readonly DesktopZone[] = NAV_ZONES_BY_SURFACE.desktop.map((id) => ({
  id,
  label: navZone(id).label.zh,
  shared: isNavZoneId(id),
  icon: ZONE_ICONS[id],
}));

/**
 * 链接或推送的落点在桌面上开哪个区（合同的 `resolveNavDestinationForSurface`：
 * `matters/on-computer` 在桌面上落到"我的 AI 们"）。页签暂时不细分。
 */
export function desktopZoneForDestination(destination: NavDestination<AnyNavZoneId>): DesktopZoneId {
  return resolveNavDestinationForSurface(destination, "desktop").zone;
}

/** 聊天面板里可以从外部打开的浮层。 */
export type DesktopPanelId =
  | "approvals"
  | "background-tasks"
  | "todays-changes"
  | "task-log"
  | "task-workbench"
  | "worktree"
  | "diff"
  | "mcp"
  | "plugins"
  | "skill-canvas"
  | "memory"
  | "wiki"
  | "dreaming"
  | "self-evolution"
  | "wardrobe"
  | "soul-picker"
  | "pet-creator"
  | "pet-growth"
  | "cross-device"
  | "settings"
  | "checkin"
  | "history"
  | "file-tree"
  | "code-search"
  | "pet-variant"
  | "pet-achievements"
  | "pet-memory-album";

export const OPEN_PANEL_EVENT = "agentrix:open-panel";
export const OPEN_ZONE_EVENT = "agentrix:open-zone";

export const SHELL_V1_KEY = "agentrix_desktop_shell_v1";

/** 六区外壳默认开启；本机开关精确为 "0" 时回到旧的聊天根（一键回滚）。 */
export function isDesktopShellEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(SHELL_V1_KEY) !== "0";
  } catch {
    return true;
  }
}

export function isDesktopZoneId(value: unknown): value is DesktopZoneId {
  return typeof value === "string" && DESKTOP_ZONES.some((zone) => zone.id === value);
}

export function openDesktopZone(zone: DesktopZoneId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_ZONE_EVENT, { detail: { zone } }));
}

/**
 * 打开聊天面板里的一个浮层：先切到"伙伴"区（浮层渲染在那里），再通知聊天面板。
 * 签到弹窗由窗口级宿主渲染，走原来的 `agentrix:open-checkin`。
 */
export function openDesktopPanel(panel: DesktopPanelId) {
  if (typeof window === "undefined") return;
  if (panel === "checkin") {
    window.dispatchEvent(new CustomEvent("agentrix:open-checkin"));
    return;
  }
  openDesktopZone("companion");
  window.dispatchEvent(new CustomEvent(OPEN_PANEL_EVENT, { detail: { panel } }));
}

export interface ZoneEntry {
  label: string;
  description: string;
  panel?: DesktopPanelId;
  /** 外部链接（在浏览器打开），用于迁到 Web 的功能。 */
  href?: string;
}

export interface ZoneSection {
  title: string;
  entries: ZoneEntry[];
}

export const WEB_APP_ORIGIN = "https://www.agentrix.top";

/**
 * 各区的入口。"这台电脑"的执行安全、算力节点和自带订阅是直接嵌入的组件，
 * 不在这里列出（见 DesktopShell）。
 */
export const ZONE_SECTIONS: Readonly<Record<Exclude<DesktopZoneId, "companion">, ZoneSection[]>> = {
  matters: [
    {
      title: "待我处理",
      entries: [
        { label: "待审批", description: "AI 等你确认的操作", panel: "approvals" },
        { label: "今日改动", description: "今天 AI 在这台电脑上改过的文件", panel: "todays-changes" },
      ],
    },
    {
      title: "任务",
      entries: [
        { label: "后台任务", description: "运行中、排队和已完成的任务", panel: "background-tasks" },
        { label: "任务台", description: "拆解与执行中的任务", panel: "task-workbench" },
        { label: "工作日志", description: "每一步做了什么", panel: "task-log" },
      ],
    },
  ],
  twin: [
    {
      title: "分身",
      entries: [
        {
          label: "在网页上管理分身",
          description: "创建、公开页和名片在 Web 上编辑；桌面负责用本机文件补充分身",
          href: `${WEB_APP_ORIGIN}/agents`,
        },
      ],
    },
    {
      title: "接单与交付（规划中）",
      entries: [
        {
          label: "接单与交付台",
          description: "公开分身和付费问答就绪后开放（桌面 D5），现在还没有开放",
        },
      ],
    },
  ],
  "my-ais": [
    {
      title: "开发",
      entries: [
        { label: "Worktree", description: "多条工作线并行", panel: "worktree" },
        { label: "改动对比", description: "查看工作区的 Diff", panel: "diff" },
        { label: "文件树", description: "浏览工作区文件", panel: "file-tree" },
        { label: "代码搜索", description: "文本、符号和语义搜索", panel: "code-search" },
      ],
    },
    {
      title: "连接与扩展",
      entries: [
        { label: "MCP", description: "本机 MCP 服务", panel: "mcp" },
        { label: "插件", description: "已安装的插件", panel: "plugins" },
        { label: "技能画布", description: "编排技能", panel: "skill-canvas" },
      ],
    },
  ],
  "this-computer": [],
  my: [
    {
      title: "身份与记忆",
      entries: [
        { label: "记忆", description: "它记得的关于你的事", panel: "memory" },
        { label: "记忆百科", description: "整理成条目的长期记忆", panel: "wiki" },
        { label: "梦境整理", description: "空闲时整理记忆", panel: "dreaming" },
        { label: "自我进化", description: "记忆、梦境和百科的变化", panel: "self-evolution" },
      ],
    },
    {
      title: "伙伴形象",
      entries: [
        { label: "衣橱", description: "形象与装扮", panel: "wardrobe" },
        { label: "形态", description: "形态与节日装扮", panel: "pet-variant" },
        { label: "灵魂", description: "性格与说话方式", panel: "soul-picker" },
        { label: "成长", description: "成长数据", panel: "pet-growth" },
        { label: "成就", description: "", panel: "pet-achievements" },
        { label: "相册", description: "一起留下的记忆", panel: "pet-memory-album" },
        { label: "创建新形象", description: "", panel: "pet-creator" },
      ],
    },
    {
      title: "设备与其他",
      entries: [
        { label: "跨设备", description: "手机、手表和其他电脑", panel: "cross-device" },
        { label: "每日签到", description: "", panel: "checkin" },
        { label: "对话历史", description: "", panel: "history" },
        { label: "设置", description: "账号、模型、快捷键", panel: "settings" },
      ],
    },
  ],
};
