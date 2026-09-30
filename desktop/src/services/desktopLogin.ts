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
 * - E86：显示哪些方式按 `GET /api/auth/providers` 来（`desktopLoginOptions`）。扫码是桌面自己的主入口，一直在。
 */
import {
  decodeAuthProvidersResponseV1,
  splitAuthProvidersV1,
  type AuthProvidersResponseV1,
} from "../../../shared/types/auth-providers";

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

// ── E86：按服务端的 `GET /api/auth/providers` 决定显示哪些登录方式 ──────────────────

/**
 * 桌面现在能走本机回调登录的服务商（旧的 `desktop_session` + `callback_port` 路子，只有 Google、Discord 接了）。
 * E84 C 落地以后加 Apple、X（`handoff_client=desktop`）。顺序即显示顺序。
 */
export const DESKTOP_BROWSER_PROVIDERS: readonly BrowserProvider[] = ["google", "discord"];

export const BROWSER_PROVIDER_LABEL: Record<BrowserProvider, string> = {
  google: "用 Google 登录",
  discord: "用 Discord 登录",
};

export interface DesktopLoginOptions {
  /** "在浏览器里登录"里直接列出的（主入口里有的）。 */
  browserPrimary: BrowserProvider[];
  /** 放进"更多方式"的。 */
  browserMore: BrowserProvider[];
  /** 邮箱验证码能不能用（发信、共享的验证码存储都好，而且没被关掉）。 */
  emailCode: boolean;
}

/**
 * 服务端说能用的，才显示。主入口和"更多方式"的划分只用 shared 的 `splitAuthProvidersV1`，三端一致；
 * 读不到时也交给它（现在是只剩 `password`，桌面没有密码登录，所以只剩扫码）。
 */
export function desktopLoginOptions(response: AuthProvidersResponseV1 | null): DesktopLoginOptions {
  const { primary, more } = splitAuthProvidersV1(response);
  const redirects = (id: BrowserProvider) =>
    response ? response.providers.some((p) => p.id === id && p.available && p.browserRedirect) : true;
  const pick = (ids: readonly string[]) =>
    DESKTOP_BROWSER_PROVIDERS.filter((id) => ids.includes(id) && redirects(id));
  return {
    browserPrimary: pick(primary),
    browserMore: pick(more),
    emailCode: primary.includes("email_code") || more.includes("email_code"),
  };
}

export const AUTH_PROVIDERS_TIMEOUT_MS = 5_000;

/** 读 `GET <apiBase>/auth/providers`（不用登录）。读不到、超时、格式不对都是 null。 */
export async function loadAuthProviders(input: {
  apiBase: string;
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}): Promise<AuthProvidersResponseV1 | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), input.timeoutMs ?? AUTH_PROVIDERS_TIMEOUT_MS);
  });
  const read = (async () => {
    try {
      const response = await input.fetchImpl(`${input.apiBase}/auth/providers`, { method: "GET", headers: { Accept: "application/json" } });
      if (!response || response.status < 200 || response.status >= 300) return null;
      const body: unknown = await response.json();
      const data =
        body && typeof body === "object" && !Array.isArray(body) && "data" in body && (body as { success?: unknown }).success !== false
          ? (body as { data: unknown }).data
          : body;
      return decodeAuthProvidersResponseV1(data);
    } catch {
      return null;
    }
  })();
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
