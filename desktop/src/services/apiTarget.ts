/**
 * API 目标（REQ-desktop-026，DRW Gate B 在 staging 上验收）。
 *
 * 目标由 Rust 在进程启动时选定：从终端启动时设 `AGENTRIX_API_TARGET=staging`，
 * Rust 在每个 WebView 的页面脚本之前注入只读的 `window.__AGENTRIX_API_TARGET__`。
 * WebView 自己不能选目标：只认 "staging" 这一个值，其余一律生产。
 *
 * 这个文件不引入任何依赖，桌宠窗口的小入口也能用。
 */

export type HostApiTarget = "production" | "staging";

export const PRODUCTION_API_ORIGIN = "https://api.agentrix.top";
/** 和 Rust `types::STAGING_API_ORIGIN` 一致；地址以 release 的答复为准。 */
export const STAGING_API_ORIGIN = "https://stg.agentrix.top";

export function hostApiTarget(scope: unknown = globalThis): HostApiTarget {
  try {
    return (scope as { __AGENTRIX_API_TARGET__?: unknown } | null)?.__AGENTRIX_API_TARGET__ === "staging"
      ? "staging"
      : "production";
  } catch {
    return "production";
  }
}

/** staging 目标下是 staging 的 API 源（不带 `/api`）；生产目标下是 null，调用方沿用原来的逻辑。 */
export function stagingApiOrigin(scope: unknown = globalThis): string | null {
  return hostApiTarget(scope) === "staging" ? STAGING_API_ORIGIN : null;
}

/**
 * 登录凭据在 localStorage / Tauri store 里的键。staging 用单独的键：
 * 生产的登录凭据不会发给 staging，反过来也一样。
 */
export function tokenStorageKey(scope: unknown = globalThis): string {
  return hostApiTarget(scope) === "staging" ? "agentrix_token_staging" : "agentrix_token";
}

export const TOKEN_STORAGE_KEY = tokenStorageKey();

// ── staging 门禁请求头（REQ-desktop-026，release 的答复）──────────────────────
//
// staging 的 `/api/**` 要带 `X-Agentrix-Staging-Key`。值只在 owner 的钥匙串里，由 Rust 读出来
// 交给 WebView 一次，放在内存里。只给 staging 主机的请求带；连生产时不问 Rust、不带。

export const STAGING_GATE_HEADER = "X-Agentrix-Staging-Key";
const STAGING_GATE_KEY = /^[\x21-\x7e]{16,256}$/;

export function isStagingApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "" && parsed.hostname.toLowerCase() === new URL(STAGING_API_ORIGIN).hostname;
  } catch {
    return false;
  }
}

let gateKeyPromise: Promise<string | null> | null = null;

/** staging 目标下 Rust 给的门禁值（只问一次）；生产目标下是 null，不调 Rust。 */
export function stagingGateKey(scope: unknown = globalThis): Promise<string | null> {
  if (hostApiTarget(scope) !== "staging") return Promise.resolve(null);
  if (!gateKeyPromise) {
    gateKeyPromise = (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const value = await invoke<unknown>("desktop_bridge_staging_gate_key");
        return typeof value === "string" && STAGING_GATE_KEY.test(value) ? value : null;
      } catch {
        return null;
      }
    })();
  }
  return gateKeyPromise;
}

/** 测试用。 */
export function resetStagingGateKeyForTests() {
  gateKeyPromise = null;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

/** staging 目标、staging 主机的请求加上门禁头；其余原样返回。 */
export async function withStagingGate(input: RequestInfo | URL, init?: RequestInit, scope: unknown = globalThis): Promise<RequestInit | undefined> {
  if (hostApiTarget(scope) !== "staging" || !isStagingApiUrl(urlOf(input))) return init;
  const key = await stagingGateKey(scope);
  if (!key) return init;
  const headers = new Headers(init?.headers ?? (typeof input === "object" && "headers" in input ? (input as Request).headers : undefined));
  headers.set(STAGING_GATE_HEADER, key);
  return { ...(init ?? {}), headers };
}

let fetchInstalled = false;

/**
 * 页面自己的 `fetch`（原生，不经过 Rust）也带上门禁头。只在 staging 目标下装，装一次。
 * 各窗口的入口（main.tsx、pet-main.tsx）在渲染前调用。
 */
export function installStagingGateFetch(scope: { fetch?: typeof fetch } & Record<string, unknown> = globalThis as never): boolean {
  if (fetchInstalled || hostApiTarget(scope) !== "staging" || typeof scope.fetch !== "function") return false;
  const original = scope.fetch.bind(scope);
  scope.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => original(input, await withStagingGate(input, init, scope))) as typeof fetch;
  fetchInstalled = true;
  return true;
}
