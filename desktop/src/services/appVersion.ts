/**
 * Desktop app version as built. `window.__AGENTRIX_DESKTOP_VERSION__` is
 * replaced at build time by vite.config.ts (`define`) from package.json, which
 * `scripts/sync-version.mjs` keeps equal to tauri.conf.json and Cargo.toml.
 * Keep the exact `(window as any).__AGENTRIX_DESKTOP_VERSION__` shape so the
 * define replacement matches (same as analytics.ts / crashReport.ts).
 */
export function getDesktopAppVersion(): string {
  try {
    const version = (window as any).__AGENTRIX_DESKTOP_VERSION__;
    return typeof version === "string" && version ? version : "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}
