/**
 * L8 1b A5 Passes on desktop (`shared/types/agent-pass.ts`), same routes and decoders as the web and the phone:
 * the list, what each one allows, and revoke. Off unless the build sets VITE_AGENT_PASS_ENABLED to exactly 1; while the
 * server switch is off the routes answer 404 and the panel shows nothing. Revoking only narrows access, so it takes
 * effect at once with no preview digest. Issuing and widening stay on the web and the phone (they need a step-up).
 */
import { decodeAgentPassChangedV1, decodeAgentPassListV1, type AgentPassV1 } from "../../../shared/types/agent-pass";
import { pickFor } from "../i18n/pick";

export function agentPassEnabled(env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>): boolean {
  return env.VITE_AGENT_PASS_ENABLED === "1";
}

export type DesktopPassFailure = "closed" | "invalid" | "no_session" | "unreadable" | "unavailable";

export type DesktopPassResult<T> = { ok: true; value: T } | { ok: false; failure: DesktopPassFailure };

export interface DesktopPassDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiBase: string;
  token: () => string | null | undefined;
  /** Idempotency key for a revoke; injectable for tests. */
  newRequestId?: () => string;
}

const PASS_ID = /^pass_[0-9a-f]{32}$/;

function failureOf(status: number): DesktopPassFailure {
  if (status === 404) return "closed";
  if (status === 400 || status === 409) return "invalid";
  if (status === 401) return "no_session";
  return "unavailable";
}

export function createDesktopAgentPassClient(deps: DesktopPassDeps) {
  const base = deps.apiBase.replace(/\/+$/, "");
  const newRequestId = deps.newRequestId ?? (() => `pass-revoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  async function call<T>(method: "GET" | "POST", path: string, decode: (body: unknown) => T | null, body?: unknown): Promise<DesktopPassResult<T>> {
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
    list: (): Promise<DesktopPassResult<AgentPassV1[]>> => call("GET", "/agent-passes", decodeAgentPassListV1),
    revoke: async (passId: string): Promise<DesktopPassResult<AgentPassV1>> => {
      if (typeof passId !== "string" || !PASS_ID.test(passId)) return { ok: false, failure: "invalid" };
      return call("POST", `/agent-passes/${passId}/revoke`, decodeAgentPassChangedV1, { schemaVersion: 1, requestId: newRequestId(), passId });
    },
  };
}

/** [zh, en] per failure; `closed` says nothing. */
const FAILURE_TEXT: Readonly<Record<DesktopPassFailure, readonly [string, string]>> = {
  closed: ["", ""],
  invalid: ["没撤销成功，请稍后再试。", "Could not revoke. Try again later."],
  no_session: ["请先登录。", "Please sign in first."],
  unreadable: ["暂时读不到。", "Cannot be read right now."],
  unavailable: ["网络不稳，请稍后再试。", "Network trouble, try again."],
};

/** One language, the app's (`locale`; Chinese when none is given). */
export function desktopPassFailureText(failure: DesktopPassFailure, locale: string = "zh"): string {
  return pickFor(locale)(...FAILURE_TEXT[failure]);
}
