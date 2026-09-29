/**
 * appearance.ts — 桌面 D1：外观（D11、产品文档 11.3、11.5）。
 *
 * 模式：跟随系统 / 浅色 / 深色，写到 `<html data-theme>`（只会是 light 或 dark，
 * 跟随系统时也写解析结果，因为桌面旧样式只认显式的 data-theme）。
 * 主题色：写到 `<html data-accent>`，取值与色值来自 `shared/design-tokens/`
 * （web，REQ-web-003）；`global.css` 把桌面旧变量映射到 `--ax-*`。
 *
 * 默认模式：D11 的目标是"跟随系统"。桌面浅色还有约 40 条 `!important`
 * 覆盖规则没清（需要在真实窗口里逐个看），所以桌面默认仍为深色；清完再把
 * DEFAULT_MODE 改为 DEFAULT_APPEARANCE.mode。老用户 `agentrix_theme` 里的
 * 选择原样保留。
 *
 * 回滚：`agentrix_desktop_tokens_v1 = "0"` 时 `<html data-tokens="off">`，
 * 旧变量不再指向 token。
 */
import {
  ACCENT_IDS,
  ACCENT_LABELS,
  DEFAULT_APPEARANCE,
  isAccentId,
  resolveColorScheme,
  type AccentId,
} from "../../../shared/design-tokens/index.ts";

export type AppearanceMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export type AppearanceAccent = AccentId;
export { ACCENT_IDS, ACCENT_LABELS };

export const APPEARANCE_MODE_KEY = "agentrix_appearance_mode";
export const APPEARANCE_ACCENT_KEY = "agentrix_appearance_accent";
/** 旧键：只存 dark / light。继续写，兼容还在读它的旧代码。 */
export const LEGACY_THEME_KEY = "agentrix_theme";
export const APPEARANCE_CHANGED_EVENT = "agentrix:appearance-changed";

export const TOKENS_V1_KEY = "agentrix_desktop_tokens_v1";

export const DEFAULT_MODE: AppearanceMode = "dark";
export const DEFAULT_ACCENT: AppearanceAccent = DEFAULT_APPEARANCE.accent;

const MODES: readonly AppearanceMode[] = ["system", "light", "dark"];

export const APPEARANCE_MODE_LABELS: Readonly<Record<AppearanceMode, string>> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readAppearanceMode(): AppearanceMode {
  const store = storage();
  const saved = store?.getItem(APPEARANCE_MODE_KEY);
  if (saved && (MODES as readonly string[]).includes(saved)) return saved as AppearanceMode;
  const legacy = store?.getItem(LEGACY_THEME_KEY);
  if (legacy === "light" || legacy === "dark") return legacy;
  return DEFAULT_MODE;
}

export function readAppearanceAccent(): AppearanceAccent {
  const saved = storage()?.getItem(APPEARANCE_ACCENT_KEY);
  return isAccentId(saved) ? saved : DEFAULT_ACCENT;
}

export function areDesignTokensEnabled(): boolean {
  return storage()?.getItem(TOKENS_V1_KEY) !== "0";
}

function systemPrefersDark(): boolean {
  try {
    return Boolean(globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches);
  } catch {
    return false;
  }
}

export function resolveTheme(mode: AppearanceMode, prefersDark = systemPrefersDark()): ResolvedTheme {
  return resolveColorScheme(mode, prefersDark);
}

/** 把当前偏好写到 `<html>` 上。返回实际生效的明暗。 */
export function applyAppearance(): ResolvedTheme {
  const mode = readAppearanceMode();
  const theme = resolveTheme(mode);
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-accent", readAppearanceAccent());
    root.setAttribute("data-appearance-mode", mode);
    if (areDesignTokensEnabled()) root.removeAttribute("data-tokens");
    else root.setAttribute("data-tokens", "off");
  }
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGED_EVENT, { detail: { mode, theme } }));
    } catch {
      /* non-DOM host */
    }
  }
  return theme;
}

export function setAppearanceMode(mode: AppearanceMode): ResolvedTheme {
  if (!(MODES as readonly string[]).includes(mode)) throw new Error(`unknown appearance mode: ${mode}`);
  const store = storage();
  try {
    store?.setItem(APPEARANCE_MODE_KEY, mode);
    // 旧键只懂 dark / light；跟随系统时写入当前解析结果。
    store?.setItem(LEGACY_THEME_KEY, resolveTheme(mode));
  } catch {
    /* storage full / unavailable — still apply for this window */
  }
  return applyAppearance();
}

export function setAppearanceAccent(accent: AppearanceAccent): void {
  if (!isAccentId(accent)) throw new Error(`unknown accent: ${accent}`);
  try {
    storage()?.setItem(APPEARANCE_ACCENT_KEY, accent);
  } catch {
    /* ignore */
  }
  applyAppearance();
}

/**
 * 启动时调用（每个窗口一次）：应用偏好；跟随系统时监听系统明暗变化；
 * 其他窗口改了偏好时通过 storage 事件同步。返回卸载函数。
 */
export function installAppearance(): () => void {
  applyAppearance();
  if (typeof window === "undefined") return () => {};

  let media: MediaQueryList | undefined;
  try {
    media = window.matchMedia?.("(prefers-color-scheme: dark)");
  } catch {
    media = undefined;
  }
  const onSystemChange = () => {
    if (readAppearanceMode() === "system") applyAppearance();
  };
  media?.addEventListener?.("change", onSystemChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === APPEARANCE_MODE_KEY || event.key === APPEARANCE_ACCENT_KEY || event.key === LEGACY_THEME_KEY || event.key === TOKENS_V1_KEY) {
      applyAppearance();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    media?.removeEventListener?.("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}
