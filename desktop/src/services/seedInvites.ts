/**
 * L6-11 limited seed invites on desktop (`shared/types/seed-invites.ts`). Off unless the build sets
 * VITE_SEED_INVITES_ENABLED=1; while the server switch is off the routes answer 404 and the panel shows nothing.
 */
import { parseApiErrorBodyV1 } from "../../../shared/types/api-error";
import {
  SEED_INVITES_ERROR_CODES_V0,
  decodeSeedInvitesViewV0,
  normalizeSeedInviteCodeV0,
  type SeedInvitesViewV0,
} from "../../../shared/types/seed-invites";

export function seedInvitesEnabled(env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>): boolean {
  return env.VITE_SEED_INVITES_ENABLED === "1";
}

export type DesktopSeedInvitesFailure = "closed" | "invalid_code" | "not_found" | "already_member" | "no_session" | "unreadable" | "unavailable";

export type DesktopSeedInvitesResult<T> = { ok: true; value: T } | { ok: false; failure: DesktopSeedInvitesFailure };

export interface DesktopSeedInvitesDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiBase: string;
  token: () => string | null | undefined;
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function failureOf(status: number, body: unknown): DesktopSeedInvitesFailure {
  const code = parseApiErrorBodyV1(body).code;
  if (status === 404) return code === SEED_INVITES_ERROR_CODES_V0.notFound ? "not_found" : "closed";
  if (code === SEED_INVITES_ERROR_CODES_V0.invalidCode) return "invalid_code";
  if (code === SEED_INVITES_ERROR_CODES_V0.alreadyMember) return "already_member";
  if (status === 401 || status === 403) return "no_session";
  return "unavailable";
}

export function createDesktopSeedInvitesClient(deps: DesktopSeedInvitesDeps) {
  const base = deps.apiBase.replace(/\/+$/, "");
  async function send(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; body: unknown } | DesktopSeedInvitesFailure> {
    const token = deps.token();
    if (!token) return "no_session";
    try {
      const response = await deps.fetch(`${base}${path}`, {
        method,
        headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await bodyOf(response) };
    } catch {
      return "unavailable";
    }
  }
  return {
    async mine(): Promise<DesktopSeedInvitesResult<SeedInvitesViewV0>> {
      const r = await send("GET", "/seed-invites");
      if (typeof r === "string") return { ok: false, failure: r };
      if (r.status !== 200) return { ok: false, failure: failureOf(r.status, r.body) };
      const view = decodeSeedInvitesViewV0(r.body);
      return view ? { ok: true, value: view } : { ok: false, failure: "unreadable" };
    },
    async redeem(raw: string): Promise<DesktopSeedInvitesResult<true>> {
      const code = normalizeSeedInviteCodeV0(raw);
      if (!code) return { ok: false, failure: "invalid_code" };
      const r = await send("POST", "/seed-invites/redeem", { code });
      if (typeof r === "string") return { ok: false, failure: r };
      if (r.status !== 200) return { ok: false, failure: failureOf(r.status, r.body) };
      return (r.body as { member?: unknown } | null)?.member === true ? { ok: true, value: true } : { ok: false, failure: "unreadable" };
    },
  };
}

export function seedInviteShareLink(code: string): string {
  return `https://agentrix.top/console/settings/profile?invite=${encodeURIComponent(code)}`;
}
