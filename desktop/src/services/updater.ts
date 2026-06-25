/**
 * Auto-updater glue (Sprint G-2 / US-G2-2).
 *
 * Wraps `@tauri-apps/plugin-updater`:
 *   - 30s after app boot, query `/api/v1/desktop/update/...`
 *   - If a newer release is available, push a notification
 *   - On user click, download + verify ed25519 signature + install + restart
 *
 * Signature verification is done by the Tauri updater plugin itself using
 * the `pubkey` field in tauri.conf.json. If verification fails, the plugin
 * aborts the install — we just surface the error to the user.
 */
import { addNotification } from "./notifications";
import { trackEvent } from "./analytics";

const INSTALL_EVENT = "agentrix:install-update";
const CHECK_DELAY_MS = 30_000;

let _booted = false;
let _checkInProgress = false;

export function bootUpdater(): void {
  if (_booted) return;
  _booted = true;

  // Skip in dev / browser mode — the plugin only works inside Tauri.
  try {
    if (!(window as any).__TAURI_INTERNALS__) return;
  } catch {
    return;
  }

  setTimeout(() => void checkForUpdate(), CHECK_DELAY_MS);
}

export async function checkForUpdate(): Promise<void> {
  if (_checkInProgress) return;
  _checkInProgress = true;

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update || !update.available) {
      return;
    }

    trackEvent("desktop_update_available", { version: update.version });

    const onceHandler = async () => {
      window.removeEventListener(INSTALL_EVENT, onceHandler);
      try {
        addNotification(
          "info",
          "正在下载更新…",
          `Agentrix Desktop v${update.version}`,
        );
        await update.downloadAndInstall();
        trackEvent("desktop_update_installed", { version: update.version });
        // Plugin restarts the app on its own after download+install. If it
        // doesn't on this platform, we trigger a relaunch ourselves.
        try {
          const { relaunch } = await import("@tauri-apps/plugin-process");
          await relaunch();
        } catch {}
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        trackEvent("desktop_update_failed", { reason: msg.slice(0, 100) });
        addNotification(
          "error",
          "更新失败",
          `安装失败：${msg.slice(0, 200)}`,
        );
      }
    };
    window.addEventListener(INSTALL_EVENT, onceHandler, { once: true });

    addNotification(
      "info",
      `🎉 新版本 v${update.version} 可用`,
      update.body || "包含 bug 修复与新功能。点击立即更新自动安装。",
      { label: "立即更新", event: INSTALL_EVENT },
    );
  } catch (err) {
    // Network / signature / plugin errors should not crash the desktop shell.
    console.warn("[updater] check failed:", err);
  } finally {
    _checkInProgress = false;
  }
}
