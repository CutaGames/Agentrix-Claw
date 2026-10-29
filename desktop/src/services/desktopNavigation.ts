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
  /** Chinese name (the contract's `label.zh`). */
  label: string;
  /** English name (the contract's `label.en`); every language other than Chinese shows this one. */
  labelEn: string;
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
  labelEn: navZone(id).label.en,
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

/** The zone's name in the app language: Chinese for `zh`, English for every other language. */
export function desktopZoneLabel(zone: DesktopZone, locale: string): string {
  return locale === "zh" ? zone.label : zone.labelEn;
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
  /** Catalog key: the words are `zone.entry.<key>.label` / `.desc` in `i18n/strings.ts`. */
  key: string;
  /** Chinese words (also the source of the zh catalog entries; the shell reads the catalog). */
  label: string;
  description: string;
  panel?: DesktopPanelId;
  /** 外部链接（在浏览器打开），用于迁到 Web 的功能。 */
  href?: string;
}

export interface ZoneSection {
  /** Catalog key: the title is `zone.section.<key>` in `i18n/strings.ts`. */
  key: string;
  title: string;
  entries: ZoneEntry[];
}

export const WEB_APP_ORIGIN = "https://www.agentrix.top";

/** E116 人人都有分身: the twin zone links the one-tap web home. Exact `1`; default off (the web page ships dark too). */
export function twinEveryoneEnabled(env: Record<string, unknown> = (import.meta.env ?? {}) as unknown as Record<string, unknown>): boolean {
  return env.VITE_TWIN_EVERYONE_V1_ENABLED === "1";
}

/**
 * 各区的入口。"这台电脑"的执行安全、算力节点和自带订阅是直接嵌入的组件，
 * 不在这里列出（见 DesktopShell）。
 */
export const ZONE_SECTIONS: Readonly<Record<Exclude<DesktopZoneId, "companion">, ZoneSection[]>> = {
  matters: [
    {
      key: "pending",
      title: "待我处理",
      entries: [
        // The approvals themselves are in ApprovalInboxSection right above this list; this entry
        // opens the notification center (panel id kept for the chat panel's opener).
        { key: "notifications", label: "通知", description: "提醒、任务结果和同步消息", panel: "approvals" },
        { key: "todays", label: "今日改动", description: "今天 AI 在这台电脑上改过的文件", panel: "todays-changes" },
      ],
    },
    {
      key: "tasks",
      title: "任务",
      entries: [
        { key: "bgTasks", label: "后台任务", description: "运行中、排队和已完成的任务", panel: "background-tasks" },
        { key: "workbench", label: "任务台", description: "拆解与执行中的任务", panel: "task-workbench" },
        { key: "workLog", label: "工作日志", description: "每一步做了什么", panel: "task-log" },
      ],
    },
  ],
  twin: [
    {
      key: "twin",
      title: "分身",
      entries: [
        // E116 人人都有分身: one tap and add to it any time, on the web home (only while the build switch is on).
        ...(twinEveryoneEnabled()
          ? [
              {
                key: "twinEveryone",
                label: "我的分身首页",
                description: "点一下就有分身，随时补充；补充内容和公开名片在网页上做",
                href: `${WEB_APP_ORIGIN}/console/twin`,
              },
            ]
          : []),
        {
          key: "twinWeb",
          label: "在网页上管理分身",
          description: "创建、公开页和名片在 Web 上编辑；桌面负责用本机文件补充分身",
          href: `${WEB_APP_ORIGIN}/agents`,
        },
      ],
    },
  ],
  "my-ais": [
    {
      key: "dev",
      title: "开发",
      entries: [
        { key: "worktree", label: "Worktree", description: "多条工作线并行", panel: "worktree" },
        { key: "diff", label: "改动对比", description: "查看工作区的 Diff", panel: "diff" },
        { key: "fileTree", label: "文件树", description: "浏览工作区文件", panel: "file-tree" },
        { key: "codeSearch", label: "代码搜索", description: "文本、符号和语义搜索", panel: "code-search" },
      ],
    },
    {
      key: "connect",
      title: "连接与扩展",
      entries: [
        { key: "mcp", label: "MCP", description: "本机 MCP 服务", panel: "mcp" },
        { key: "plugins", label: "插件", description: "已安装的插件", panel: "plugins" },
        { key: "skillCanvas", label: "技能画布", description: "编排技能", panel: "skill-canvas" },
      ],
    },
  ],
  "this-computer": [],
  my: [
    {
      key: "identity",
      title: "身份与记忆",
      entries: [
        { key: "memory", label: "记忆", description: "它记得的关于你的事", panel: "memory" },
        { key: "wiki", label: "记忆百科", description: "整理成条目的长期记忆", panel: "wiki" },
        { key: "dreaming", label: "梦境整理", description: "空闲时整理记忆", panel: "dreaming" },
        { key: "evolution", label: "自我进化", description: "记忆、梦境和百科的变化", panel: "self-evolution" },
      ],
    },
    {
      key: "pet",
      title: "伙伴形象",
      entries: [
        { key: "wardrobe", label: "衣橱", description: "形象与装扮", panel: "wardrobe" },
        { key: "variant", label: "形态", description: "形态与节日装扮", panel: "pet-variant" },
        { key: "soul", label: "灵魂", description: "性格与说话方式", panel: "soul-picker" },
        { key: "growth", label: "成长", description: "成长数据", panel: "pet-growth" },
        { key: "achievements", label: "成就", description: "", panel: "pet-achievements" },
        { key: "album", label: "相册", description: "一起留下的记忆", panel: "pet-memory-album" },
        { key: "createLook", label: "创建新形象", description: "", panel: "pet-creator" },
      ],
    },
    {
      key: "devices",
      title: "设备与其他",
      entries: [
        { key: "crossDevice", label: "跨设备", description: "手机、手表和其他电脑", panel: "cross-device" },
        { key: "checkin", label: "每日签到", description: "", panel: "checkin" },
        { key: "history", label: "对话历史", description: "", panel: "history" },
        { key: "settings", label: "设置", description: "账号、模型、快捷键", panel: "settings" },
      ],
    },
  ],
};
