/**
 * Tauri HTTP 插件的 `fetch`，staging 目标下给 staging 主机的请求带上门禁头
 * （REQ-desktop-026）。连生产时和原来的 `fetch` 完全一样。
 *
 * 连 Agentrix API 的地方都从这里取 `tauriFetch`，不要直接 import `@tauri-apps/plugin-http`
 * （本机模型 localLLM 连的是 127.0.0.1，不用门禁，不改）。
 */
import { fetch as pluginFetch } from "@tauri-apps/plugin-http";
import { withStagingGate } from "./apiTarget";

export async function tauriFetch(input: URL | Request | string, init?: RequestInit & Record<string, unknown>): Promise<Response> {
  const gated = await withStagingGate(input, init);
  return pluginFetch(input, gated as never);
}
