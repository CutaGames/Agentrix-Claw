/**
 * L8 3A E1 on desktop: the apps the owner signed in to with Agentrix (`shared/types/agentrix-oauth.ts`), what each may read,
 * and disconnect. Same routes and decoders as the web and the phone. Off unless the build sets VITE_AGENTRIX_OAUTH_ENABLED to
 * exactly 1; while the server switch is off the routes answer 404 and the panel shows nothing. Disconnecting only narrows
 * access: it takes effect at once with no preview digest. Allowing an app (the consent page) is web only.
 */
import { decodeAgentrixOauthConnectedAppV1, type AgentrixOauthConnectedAppV1 } from "../../../shared/types/agentrix-oauth";
import { pickFor } from "../i18n/pick";

export function agentrixOauthEnabled(env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>): boolean {
  return env.VITE_AGENTRIX_OAUTH_ENABLED === "1";
}

export type DesktopOauthAppsFailure = "closed" | "invalid" | "no_session" | "unreadable" | "unavailable";
export type DesktopOauthAppsResult<T> = { ok: true; value: T } | { ok: false; failure: DesktopOauthAppsFailure };

export interface DesktopOauthAppsDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiBase: string;
  token: () => string | null | undefined;
}

const PASS_ID = /^pass_[0-9a-f]{32}$/;

function failureOf(status: number): DesktopOauthAppsFailure {
  if (status === 404) return "closed";
  if (status === 400 || status === 409) return "invalid";
  if (status === 401) return "no_session";
  return "unavailable";
}

export function createDesktopOauthAppsClient(deps: DesktopOauthAppsDeps) {
  const base = deps.apiBase.replace(/\/+$/, "");
  async function call<T>(method: "GET" | "POST", path: string, decode: (body: unknown) => T | null, body?: unknown): Promise<DesktopOauthAppsResult<T>> {
    const token = deps.token();
    if (!token) return { ok: false, failure: "no_session" };
    let response: Response;
    try {
      response = await deps.fetch(`${base}${path}`, {
        method,
        headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      return { ok: false, failure: "unavailable" };
    }
    if (response.status !== 200 && response.status !== 201) return { ok: false, failure: failureOf(response.status) };
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    const value = decode(json);
    return value === null ? { ok: false, failure: "unreadable" } : { ok: true, value };
  }
  return {
    list: (): Promise<DesktopOauthAppsResult<AgentrixOauthConnectedAppV1[]>> =>
      call("GET", "/oauth/connected-apps", (body) => {
        const items = (body as { items?: unknown } | null)?.items;
        if (!Array.isArray(items)) return null;
        const out: AgentrixOauthConnectedAppV1[] = [];
        for (const item of items) {
          const decoded = decodeAgentrixOauthConnectedAppV1(item);
          if (decoded.ok === false) return null;
          out.push(decoded.value);
        }
        return out;
      }),
    revoke: async (passId: string): Promise<DesktopOauthAppsResult<{ revoked: true }>> => {
      if (typeof passId !== "string" || !PASS_ID.test(passId)) return { ok: false, failure: "invalid" };
      return call("POST", `/oauth/connected-apps/${passId}/revoke`, (body) => ((body as { revoked?: unknown } | null)?.revoked === true ? { revoked: true as const } : null), {});
    },
  };
}

/** [zh, en] per failure; `closed` says nothing. */
const FAILURE_TEXT: Readonly<Record<DesktopOauthAppsFailure, readonly [string, string]>> = {
  closed: ["", ""],
  invalid: ["没断开成功，请稍后再试。", "Could not disconnect. Try again later."],
  no_session: ["请先登录。", "Please sign in first."],
  unreadable: ["暂时读不到。", "Cannot be read right now."],
  unavailable: ["网络不稳，请稍后再试。", "Network trouble, try again."],
};

/** One language, the app's (`locale`; Chinese when none is given). */
export function desktopOauthAppsFailureText(failure: DesktopOauthAppsFailure, locale: string = "zh"): string {
  return pickFor(locale)(...FAILURE_TEXT[failure]);
}
