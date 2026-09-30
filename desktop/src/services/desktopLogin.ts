/**
 * desktopLogin — 桌面登录的几件小事（E84 A；REQ-desktop-040 的桌面缓解）。
 *
 * - 配对会话编号用 128 位加密随机数（原来是 `Math.random()` 的 6 位 36 进制加时间戳）。
 *   扫码的会话编号会出现在屏幕上的二维码里。
 * - 在浏览器里登录：
 *   - 结果只从本机回调口（`http://127.0.0.1:<port>/auth-callback`）拿。本机回调口起不来就不打开登录页，
 *     也不再退回去轮询配对会话。
 *   - 每次用一个新的会话编号，不用二维码上那个。二维码可能被别人看到（投屏、截图），而旧的后端
 *     会把 OAuth 登录结果写进这个会话，谁知道编号谁就能取走（REQ-desktop-040）。
 * - E84 C 落地以后，这里改成：打开浏览器登录页，回调只带一次性 code，再用 POST 换 token。
 */

export const PAIR_SESSION_PREFIX = "desktop-";
const SESSION_ID = /^desktop-[0-9a-f]{32}$/;

export type BrowserProvider = "google" | "discord";

export function newPairSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${PAIR_SESSION_PREFIX}${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function isPairSessionId(value: string): boolean {
  return SESSION_ID.test(value);
}

/** 手机扫的二维码：站点上的 `/pair` 深链。 */
export function pairQrValue(input: { siteOrigin: string; sessionId: string; apiBase: string }): string {
  return `${input.siteOrigin}/pair?session=${encodeURIComponent(input.sessionId)}&platform=desktop&api=${encodeURIComponent(input.apiBase)}`;
}

/** 浏览器登录的地址。没有本机回调口就没有地址。 */
export function browserLoginUrl(input: {
  apiBase: string;
  provider: BrowserProvider;
  desktopSession: string;
  callbackPort: number | null | undefined;
}): string | null {
  const port = input.callbackPort;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (!isPairSessionId(input.desktopSession)) return null;
  const query = new URLSearchParams({ desktop_session: input.desktopSession, callback_port: String(port) });
  return `${input.apiBase}/auth/${input.provider}?${query.toString()}`;
}

export type BrowserLoginResult = { ok: true } | { ok: false; reason: "callback_unavailable" | "open_failed" };

/**
 * 在系统浏览器里登录：先起本机回调口，起不来就停；再用一个新的会话编号打开登录页。
 * 登录结果由本机回调口送回（Rust 发 `auth-token-received`）。
 */
export async function openBrowserLogin(input: {
  provider: BrowserProvider;
  apiBase: string;
  startCallbackServer: () => Promise<number>;
  open: (url: string) => Promise<void>;
}): Promise<BrowserLoginResult> {
  let port: number | null = null;
  try {
    port = await input.startCallbackServer();
  } catch {
    port = null;
  }
  const url = browserLoginUrl({ apiBase: input.apiBase, provider: input.provider, desktopSession: newPairSessionId(), callbackPort: port });
  if (!url) return { ok: false, reason: "callback_unavailable" };
  try {
    await input.open(url);
    return { ok: true };
  } catch {
    return { ok: false, reason: "open_failed" };
  }
}

export const BROWSER_LOGIN_ERROR_TEXT: Record<"callback_unavailable" | "open_failed", string> = {
  callback_unavailable: "没能在这台电脑上准备好登录回调，请重试，或者用手机扫码",
  open_failed: "没能打开系统浏览器，请重试，或者用手机扫码",
};
