/**
 * 开机自启的真实状态。
 *
 * 以前设置页的开关初始值写死为"开"，没开自启的人也看到"开"；点一下"关"反而是在关一个本来就没开的东西。
 * 现在开关只显示系统里的真实状态（`@tauri-apps/plugin-autostart` 的 `isEnabled()`），每次改完都再读一次。
 * 不在 Tauri 里（网页预览、测试）时读不到，返回 null，界面显示"未知"并禁用开关。
 */

export interface AutostartPlugin {
  isEnabled(): Promise<boolean>;
  enable(): Promise<void>;
  disable(): Promise<void>;
}

type PluginLoader = () => Promise<AutostartPlugin>;

const defaultLoader: PluginLoader = async () => {
  const mod = await import("@tauri-apps/plugin-autostart");
  return { isEnabled: mod.isEnabled, enable: mod.enable, disable: mod.disable };
};

let loader: PluginLoader = defaultLoader;

/** 只给测试用。传 null 恢复默认。 */
export function __setAutostartPluginLoaderForTests(next: PluginLoader | null): void {
  loader = next ?? defaultLoader;
}

/** 读系统里的真实状态；读不到返回 null。 */
export async function readAutostartEnabled(): Promise<boolean | null> {
  try {
    const plugin = await loader();
    return (await plugin.isEnabled()) === true;
  } catch {
    return null;
  }
}

export interface AutostartChangeResult {
  /** 改完之后系统里的真实状态；读不到是 null。 */
  enabled: boolean | null;
  /** 真实状态和想要的一致。 */
  ok: boolean;
}

/** 按本人的选择开或关，然后再读一次系统状态。界面以返回的 `enabled` 为准，不以点击为准。 */
export async function setAutostartEnabled(wanted: boolean): Promise<AutostartChangeResult> {
  let plugin: AutostartPlugin;
  try {
    plugin = await loader();
  } catch {
    return { enabled: null, ok: false };
  }
  try {
    if (wanted) await plugin.enable();
    else await plugin.disable();
  } catch {
    // 改失败了也要读回真实状态，不能让界面停在点击后的样子。
  }
  let enabled: boolean | null;
  try {
    enabled = (await plugin.isEnabled()) === true;
  } catch {
    enabled = null;
  }
  return { enabled, ok: enabled === wanted };
}
