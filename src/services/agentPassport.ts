import { APP_URL } from "../config/env";
import {
  buildAgentPassportCard,
  buildPassportSharePath,
  formatPassportShareText,
  type AgentPassportCardModel,
} from "../../shared/types/agent-passport-card";
import type {
  AgentPassportCredentialsV1,
  AgentPassportProjectionV1,
} from "../../shared/types/agent-passport";
import type { HttpTransportV1 } from "../../shared/client";
import { getApiConfig } from "./api";
import { mobileV6HttpTransport } from "./mobileV6Runtime";
import type { MobileReadState } from "./mobileReadState";

/**
 * Agent Passport v4 on Mobile — the *secondary / view-only* renderer of the
 * cross-platform integration note
 * (`docs/alignment/agent-passport-v4-cross-platform-integration-2026-09-16.md`):
 *
 * - one projection (`GET /agent-accounts/:id/passport`), one card model
 *   (`buildAgentPassportCard` from `shared/types/agent-passport-card`), three
 *   renderers. Mobile passes only what it knows (the projection); calendar,
 *   devices, memory and recovery stay `null` / unset so the shared builder
 *   prints "unconfirmed" — never a claim Mobile cannot back.
 * - the share URL is `buildPassportSharePath(agentRef, card.share)` on top of
 *   the Web origin. The slug is the projection's `agentRef`; the account UUID
 *   never enters a public URL (§3.3, R7).
 * - Mobile does not write: persona draft / confirm, theme and grant minting
 *   are Web-only; editing hands off to `/workbench?panel=passport`.
 *
 * The contract files were taken verbatim from integration `6606e6da5` (via
 * T tip `e56c9edd6`) the same way the DRW client layer was (decision d-50):
 * Mobile only takes, never edits, `shared/types/agent-passport*.ts`.
 */

export const AGENT_PASSPORT_CAPABILITY = "agent_passport.projection_v1";

export function agentPassportPath(agentAccountId: string): string {
  return `/agent-accounts/${encodeURIComponent(agentAccountId)}/passport`;
}

type ProjectionRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ProjectionRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Backends before slice 3.1 omit the block; the card treats it as unavailable, never as zero. */
export function unavailablePassportCredentialsOwner(): AgentPassportCredentialsV1 {
  return {
    state: "unavailable",
    verifiedCount: 0,
    settlementCount: 0,
    fulfillmentCount: 0,
    anchoredCount: 0,
    verifiedBucket: 0,
    kinds: [],
    anchor: "not_anchored",
    latestOn: null,
  };
}

/**
 * Reads the owner projection out of the `{ success, data }` envelope (or a
 * bare object). Only the shape the shared card builder relies on is checked;
 * anything else is `null` so the screen says "unconfirmed" instead of
 * drawing a half-card from a foreign payload.
 */
export function normalizeAgentPassportProjection(
  payload: unknown,
): AgentPassportProjectionV1 | null {
  const record = isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
  if (!isRecord(record)) return null;
  if (record.schemaVersion !== 1) return null;
  if (!nonEmptyString(record.agentAccountId) || !nonEmptyString(record.agentRef)) return null;
  if (typeof record.name !== "string") return null;
  if (!isRecord(record.persona) || !isRecord(record.skills) || !isRecord(record.track) || !isRecord(record.authority)) {
    return null;
  }
  const persona = record.persona;
  const skills = record.skills;
  const track = record.track;
  const authority = record.authority;
  const projection: AgentPassportProjectionV1 = {
    schemaVersion: 1,
    agentAccountId: record.agentAccountId,
    agentRef: record.agentRef,
    name: record.name,
    issuedOn: typeof record.issuedOn === "string" ? record.issuedOn : null,
    description: typeof record.description === "string" ? record.description : null,
    persona: {
      status:
        persona.status === "confirmed" || persona.status === "draft" ? persona.status : "none",
      tagline: typeof persona.tagline === "string" ? persona.tagline : null,
      tags: Array.isArray(persona.tags)
        ? persona.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      source:
        persona.source === "ai" || persona.source === "template" || persona.source === "owner"
          ? persona.source
          : null,
    },
    skills: {
      state: skills.state === "available" ? "available" : "unavailable",
      items: Array.isArray(skills.items)
        ? skills.items.flatMap((item) =>
            isRecord(item) && typeof item.name === "string"
              ? [{ id: typeof item.id === "string" ? item.id : item.name, name: item.name }]
              : [],
          )
        : [],
      total: typeof skills.total === "number" && Number.isFinite(skills.total) ? skills.total : 0,
    },
    track: {
      state: track.state === "available" ? "available" : "unavailable",
      tasksCompleted: typeof track.tasksCompleted === "number" ? track.tasksCompleted : 0,
      partners: typeof track.partners === "number" ? track.partners : 0,
      since: typeof track.since === "string" ? track.since : null,
      tasksBucket: (typeof track.tasksBucket === "number" ? track.tasksBucket : 0) as AgentPassportProjectionV1["track"]["tasksBucket"],
      partnersBucket: (typeof track.partnersBucket === "number" ? track.partnersBucket : 0) as AgentPassportProjectionV1["track"]["partnersBucket"],
    },
    authority: {
      approvalRequired: authority.approvalRequired === true,
      limits: isRecord(authority.limits)
        ? {
            ...(typeof authority.limits.singleTx === "number" ? { singleTx: authority.limits.singleTx } : {}),
            ...(typeof authority.limits.daily === "number" ? { daily: authority.limits.daily } : {}),
            ...(typeof authority.limits.monthly === "number" ? { monthly: authority.limits.monthly } : {}),
            currency: typeof authority.limits.currency === "string" ? authority.limits.currency : "",
          }
        : null,
    },
    credentials: isRecord(record.credentials)
      ? (record.credentials as unknown as AgentPassportCredentialsV1)
      : unavailablePassportCredentialsOwner(),
  };
  return projection;
}

export type AgentPassportReadState = MobileReadState<AgentPassportProjectionV1>;

export interface AgentPassportTransportInput {
  /** Absolute API base (`getApiConfig().baseUrl`) — injectable for tests. */
  baseUrl?: string;
  token?: string;
  transport?: HttpTransportV1;
  now?: () => string;
}

/**
 * `GET /agent-accounts/:id/passport` → read state. HTTP failures stay read
 * states (the screen keeps rendering the "unconfirmed" card underneath); the
 * status code decides the kind, so a 401 is never shown as a network error.
 */
export async function fetchAgentPassportProjection(
  agentAccountId: string,
  input: AgentPassportTransportInput = {},
): Promise<AgentPassportReadState> {
  if (!nonEmptyString(agentAccountId)) {
    return { kind: "unavailable", capability: AGENT_PASSPORT_CAPABILITY, reason: "agent_account_required" };
  }
  const config = getApiConfig();
  const baseUrl = (input.baseUrl ?? config.baseUrl ?? "").replace(/\/+$/, "");
  const token = input.token ?? config.token;
  if (!token) {
    return { kind: "unauthorized", reason: "authentication_required" };
  }
  const transport = input.transport ?? mobileV6HttpTransport;
  const now = input.now ?? (() => new Date().toISOString());
  let status: number;
  let body: unknown;
  try {
    const response = await transport.request({
      method: "GET",
      path: `${baseUrl}${agentPassportPath(agentAccountId)}`,
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Agentrix-Surface": "mobile",
      },
    });
    status = response.status;
    body = response.body;
  } catch {
    return { kind: "error", retryable: true, reason: "network" };
  }
  if (status === 401) return { kind: "unauthorized", reason: "authentication_required" };
  if (status === 403) return { kind: "forbidden", reason: "agent_not_owned" };
  if (status === 404) {
    return { kind: "unavailable", capability: AGENT_PASSPORT_CAPABILITY, reason: "not_found" };
  }
  if (status < 200 || status >= 300) {
    return { kind: "error", retryable: status >= 500, reason: `http_${status}` };
  }
  const projection = normalizeAgentPassportProjection(body);
  if (!projection) {
    return { kind: "unavailable", capability: AGENT_PASSPORT_CAPABILITY, reason: "projection_malformed" };
  }
  return { kind: "ready", data: projection, capturedAt: now() };
}

export interface MobileAgentPassportCardInput {
  /** Fallback name when the projection is not readable (directory display name). */
  name: string;
  agentAccountId: string | null;
  passport: AgentPassportProjectionV1 | null;
  /** ISO timestamp from the directory record, when known. */
  createdAt?: string | null;
}

/**
 * Mobile builds the card from the projection alone (integration note §3.2):
 * no Soul Core aggregate, no experience projection → calendar / devices are
 * `null`, memory / recovery / theme stay at the shared defaults. Same
 * projection ⇒ same six stamps, same `AGX-` number, same hero as Web.
 */
export function buildMobileAgentPassportCard(
  input: MobileAgentPassportCardInput,
): AgentPassportCardModel {
  return buildAgentPassportCard({
    name: input.passport?.name?.trim() || input.name,
    agentAccountId: input.passport?.agentAccountId ?? input.agentAccountId,
    passport: input.passport,
    calendarConnected: null,
    deviceCount: null,
    createdAt: input.createdAt ?? null,
  });
}

const ACCOUNT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public slug for the share path: the projection's `agentRef` (`AGT-…`).
 * An account UUID is refused (the public page would route it to the twin
 * section and print "not found" for the passport — note §3.3) and so is an
 * empty ref; both fall back to the neutral `card` segment.
 */
export function passportShareSlug(agentRef: string | null | undefined): string | null {
  if (!nonEmptyString(agentRef)) return null;
  const trimmed = agentRef.trim();
  if (ACCOUNT_UUID.test(trimmed)) return null;
  return trimmed;
}

function joinWebUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const rel = path.startsWith("/") ? path : `/${path}`;
  return `${base}${rel}`;
}

/** Absolute Web public-page URL for this card; rendered by Web, never by Mobile. */
export function getAgentPassportShareUrl(
  card: AgentPassportCardModel,
  agentRef: string | null | undefined,
  baseUrl: string = APP_URL,
): string {
  return joinWebUrl(baseUrl, buildPassportSharePath(passportShareSlug(agentRef), card.share));
}

/** Share-sheet text: the shared formatter, so Web / Mobile / Desktop say the same lines. */
export function getAgentPassportShareText(
  card: AgentPassportCardModel,
  language: "zh" | "en",
  href: string,
): string {
  return formatPassportShareText(card, language, href);
}
