/**
 * L8 C1 background goals on desktop (`shared/types/standing-goal.ts`), same routes and decoders as the web and the phone:
 * the list with progress, pause, continue, end, and the one-key stop. Off unless the build sets VITE_STANDING_GOALS_ENABLED
 * to exactly 1; while the server switch is off the routes answer 404 and the panel shows nothing. Pausing, ending and
 * stopping only tighten; continuing a goal an emergency stop paused needs a recent sign-in (403 STEP_UP_REQUIRED).
 * Creating a goal and changing its boundary stay in the API.
 */
import { STANDING_GOAL_ERROR_CODES_V1, decodeStandingGoalListV1, decodeStandingGoalViewV1, type StandingGoalViewV1 } from "../../../shared/types/standing-goal";

export function standingGoalsEnabled(env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>): boolean {
  return env.VITE_STANDING_GOALS_ENABLED === "1";
}

/** `pass_invalid` (L8-8 L7): continuing a goal whose Pass was revoked, ran out or is gone (409 STANDING_GOAL_PASS_INVALID). */
export type DesktopGoalFailure = "closed" | "invalid" | "pass_invalid" | "sign_in_again" | "no_session" | "unreadable" | "unavailable";
export type DesktopGoalResult<T> = { ok: true; value: T } | { ok: false; failure: DesktopGoalFailure };

export interface DesktopGoalDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiBase: string;
  token: () => string | null | undefined;
}

const GOAL_REF = /^sgl_[0-9a-f]{32}$/;

function failureOf(status: number, body: unknown): DesktopGoalFailure {
  if (status === 404) return "closed";
  if (status === 403 && (body as { code?: unknown } | null)?.code === "STEP_UP_REQUIRED") return "sign_in_again";
  if (status === 409 && (body as { code?: unknown } | null)?.code === STANDING_GOAL_ERROR_CODES_V1.passInvalid) return "pass_invalid";
  if (status === 400 || status === 409) return "invalid";
  if (status === 401) return "no_session";
  return "unavailable";
}

export function createDesktopStandingGoalsClient(deps: DesktopGoalDeps) {
  const base = deps.apiBase.replace(/\/+$/, "");
  async function call<T>(method: "GET" | "POST", path: string, decode: (body: unknown) => T | null): Promise<DesktopGoalResult<T>> {
    const token = deps.token();
    if (!token) return { ok: false, failure: "no_session" };
    let response: Response;
    try {
      response = await deps.fetch(`${base}${path}`, { method, headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    } catch {
      return { ok: false, failure: "unavailable" };
    }
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (response.status !== 200 && response.status !== 201) return { ok: false, failure: failureOf(response.status, json) };
    const value = decode(json);
    return value === null ? { ok: false, failure: "unreadable" } : { ok: true, value };
  }
  const one = (action: "pause" | "resume" | "end") => async (goalRef: string): Promise<DesktopGoalResult<StandingGoalViewV1>> => {
    if (typeof goalRef !== "string" || !GOAL_REF.test(goalRef)) return { ok: false, failure: "invalid" };
    return call("POST", `/standing-goals/${goalRef}/${action}`, decodeStandingGoalViewV1);
  };
  return {
    list: (): Promise<DesktopGoalResult<StandingGoalViewV1[]>> => call("GET", "/standing-goals", (body) => decodeStandingGoalListV1(body)?.items ?? null),
    pause: one("pause"),
    resume: one("resume"),
    end: one("end"),
    emergencyStop: (): Promise<DesktopGoalResult<number>> =>
      call("POST", "/standing-goals/emergency-stop", (body) => {
        const stopped = (body as { stopped?: unknown } | null)?.stopped;
        return typeof stopped === "number" && Number.isInteger(stopped) && stopped >= 0 ? stopped : null;
      }),
  };
}

export const DESKTOP_GOAL_FAILURE_TEXT: Readonly<Record<DesktopGoalFailure, string>> = {
  closed: "",
  invalid: "That did not work. 没成功，请稍后再试。",
  pass_invalid:
    "The pass this goal uses was revoked, has expired or can no longer be found, so it cannot continue. End this goal and create it again with a valid pass. 这个目标用的通行证已经撤销、过期或找不到了，所以不能继续。可以结束这个目标，再用一张有效的通行证新建。",
  sign_in_again: "Please sign in again to continue. 请重新登录后再继续。",
  no_session: "Please sign in first. 请先登录。",
  unreadable: "Cannot be read right now. 暂时读不到。",
  unavailable: "Network trouble, try again. 网络不稳，请稍后再试。",
};
