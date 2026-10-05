/**
 * The four L6 owner entries on desktop, with the same routes, shared decoders and rules as the phone
 * (src/services/trustLadder.ts, agentCollaboration.ts, sharePages.ts, ownerGoals.ts):
 * - L6-6 trust ladder (`shared/types/trust-ladder.ts`), VITE_TRUST_LADDER_ENABLED;
 * - L6-1 requests from other people's Agents (`agent-collaboration.ts`), VITE_AGENT_COLLABORATION_ENABLED;
 * - L6-2 share pages (`share-pages.ts`), VITE_SHARE_PAGES_ENABLED;
 * - L6-3 "In progress" (`owner-goals.ts`), VITE_OWNER_GOALS_ENABLED.
 * Each is off unless the build sets its switch to exactly 1; while the server switch is off the routes answer 404 and
 * the panel shows nothing. Desktop has no step-up sheet, so raising the trust ladder to commit (four limits and a
 * recent sign-in) stays on the web and the phone; lowering works here. Requests are shown as plain text and never
 * acted on; the owner only gives the counterpart a tier.
 */
import { parseApiErrorBodyV1 } from "../../../shared/types/api-error";
import { isRecentSignInRequiredErrorV1 } from "../../../shared/types/auth-step-up";
import {
  AGENT_COLLABORATION_KINDS_V0,
  isAgentCollaborationTierV0,
  normalizeAgentCollaborationIdentityV0,
  type AgentCollaborationIdentityV0,
  type AgentCollaborationKindV0,
  type AgentCollaborationRelationshipViewV0,
  type AgentCollaborationRequestViewV0,
  type AgentCollaborationTierV0,
} from "../../../shared/types/agent-collaboration";
import {
  OWNER_GOAL_STATUSES_V0,
  decodeOwnerGoalInputV0,
  type OwnerGoalInputV0,
  type OwnerGoalViewV0,
  type OwnerGoalsListV0,
} from "../../../shared/types/owner-goals";
import {
  SHARE_PAGE_TOKEN_PATTERN_V1,
  decodeSharePageCreateV1,
  decodeSharePagePublicViewV1,
  type SharePageCreateV1,
  type SharePageOwnerViewV1,
} from "../../../shared/types/share-pages";
import {
  TRUST_LADDER_ERROR_CODES_V0,
  decodeTrustLadderUpdateV0,
  decodeTrustLadderViewV0,
  type TrustLadderLevelV0,
  type TrustLadderViewV0,
} from "../../../shared/types/trust-ladder";

export const L6_DESKTOP_FLAGS = {
  trustLadder: "VITE_TRUST_LADDER_ENABLED",
  agentCollaboration: "VITE_AGENT_COLLABORATION_ENABLED",
  sharePages: "VITE_SHARE_PAGES_ENABLED",
  ownerGoals: "VITE_OWNER_GOALS_ENABLED",
} as const;

export type L6DesktopEntry = keyof typeof L6_DESKTOP_FLAGS;

export function l6EntryEnabled(entry: L6DesktopEntry, env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>): boolean {
  return env[L6_DESKTOP_FLAGS[entry]] === "1";
}

export type DesktopL6Failure =
  | "closed"
  | "step_up_required"
  | "stale"
  | "limits_required"
  | "invalid"
  | "not_found"
  | "no_session"
  | "unreadable"
  | "unavailable";

export type DesktopL6Result<T> = { ok: true; value: T } | { ok: false; failure: DesktopL6Failure };

export interface DesktopL6Deps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  apiBase: string;
  token: () => string | null | undefined;
}

type Answer = { status: number; body: unknown };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RECORD_ID = /^[A-Za-z0-9_-]{1,64}$/;

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function sender(deps: DesktopL6Deps) {
  const base = deps.apiBase.replace(/\/+$/, "");
  return async (method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<Answer | DesktopL6Failure> => {
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
  };
}

function failed<T>(failure: DesktopL6Failure): DesktopL6Result<T> {
  return { ok: false, failure };
}

/** 404 on a list is a closed feature; on one record it is a record that is gone. */
function plainFailure(answer: Answer, on404: "closed" | "not_found" = "closed"): DesktopL6Failure {
  if (answer.status === 404) return on404;
  if (answer.status === 400 || answer.status === 409) return "invalid";
  if (answer.status === 401) return "no_session";
  return "unavailable";
}

function decoded<T>(answer: Answer | DesktopL6Failure, decode: (body: unknown) => T | null, on404: "closed" | "not_found" = "closed"): DesktopL6Result<T> {
  if (typeof answer === "string") return failed(answer);
  if (answer.status !== 200 && answer.status !== 201) return failed(plainFailure(answer, on404));
  const value = decode(answer.body);
  return value === null ? failed("unreadable") : { ok: true, value };
}

// --- L6-6 trust ladder ---------------------------------------------------------------------------------------------

function trustLadderFailure(answer: Answer): DesktopL6Failure {
  const raw = answer.body as Record<string, unknown> | null;
  const inner = raw && typeof raw === "object" && raw.data && typeof raw.data === "object" ? raw.data : raw;
  if (isRecentSignInRequiredErrorV1(answer.status, raw) || isRecentSignInRequiredErrorV1(answer.status, inner)) return "step_up_required";
  if (answer.status === 404) return "closed";
  if (answer.status === 409) return "stale";
  if (parseApiErrorBodyV1(answer.body).code === TRUST_LADDER_ERROR_CODES_V0.limitsRequired) return "limits_required";
  if (answer.status === 400) return "invalid";
  if (answer.status === 401) return "no_session";
  return "unavailable";
}

export function createDesktopTrustLadderClient(deps: DesktopL6Deps) {
  const send = sender(deps);
  const call = async (agentAccountId: string, update?: unknown): Promise<DesktopL6Result<TrustLadderViewV0>> => {
    if (typeof agentAccountId !== "string" || !UUID.test(agentAccountId)) return failed("closed");
    const answer = await send(update === undefined ? "GET" : "PUT", `/trust-ladder/${agentAccountId}`, update);
    if (typeof answer === "string") return failed(answer);
    if (answer.status !== 200) return failed(trustLadderFailure(answer));
    const view = decodeTrustLadderViewV0(answer.body);
    return view && view.agentAccountId.toLowerCase() === agentAccountId.toLowerCase() ? { ok: true, value: view } : failed("unreadable");
  };
  return {
    read: (agentAccountId: string) => call(agentAccountId),
    /** Look, suggest or prepare. Commit is refused here without a request: it needs limits and a step-up. */
    setLevel: async (agentAccountId: string, level: TrustLadderLevelV0, budgetRevision: number): Promise<DesktopL6Result<TrustLadderViewV0>> => {
      if (level === "commit") return failed("step_up_required");
      const checked = decodeTrustLadderUpdateV0({ level, budgetRevision });
      if (checked.ok === false) return failed("invalid");
      return call(agentAccountId, checked.update);
    },
  };
}

// --- L6-1 requests from other people's Agents ----------------------------------------------------------------------

const AUDIENCES = ["stranger", "client", "collaborator", "family"];
const isIso = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isTextOrNull = (v: unknown, max: number): v is string | null => v === null || (typeof v === "string" && v.length <= max);

function decodeRequest(value: unknown): AgentCollaborationRequestViewV0 | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const identity = normalizeAgentCollaborationIdentityV0(r.identity);
  const { receiptId, kind, audience, status, verification, receivedAt, counterpartName, message, proposedStartAt, amountMinor, currency, fileUrl } = r;
  if (typeof receiptId !== "string" || !identity || !(AGENT_COLLABORATION_KINDS_V0 as readonly unknown[]).includes(kind)) return null;
  if (!AUDIENCES.includes(audience as string) || status !== "pending_owner" || verification !== "unverified" || !isIso(receivedAt)) return null;
  if (typeof counterpartName !== "string" || counterpartName.length > 80 || typeof message !== "string" || message.length > 2000) return null;
  if (!(proposedStartAt === null || isIso(proposedStartAt)) || !(amountMinor === null || Number.isInteger(amountMinor))) return null;
  if (!isTextOrNull(currency, 3) || !isTextOrNull(fileUrl, 500)) return null;
  return {
    receiptId,
    kind: kind as AgentCollaborationKindV0,
    audience: audience as AgentCollaborationRequestViewV0["audience"],
    status: "pending_owner",
    verification: "unverified",
    receivedAt,
    counterpartName,
    identity,
    message,
    proposedStartAt: proposedStartAt as string | null,
    amountMinor: amountMinor as number | null,
    currency,
    fileUrl,
  };
}

function decodeRelationship(value: unknown): AgentCollaborationRelationshipViewV0 | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const identity = normalizeAgentCollaborationIdentityV0(r.identity);
  return identity && isAgentCollaborationTierV0(r.tier) && isIso(r.updatedAt) ? { identity, tier: r.tier, updatedAt: r.updatedAt } : null;
}

function listOf<T>(decode: (v: unknown) => T | null) {
  return (body: unknown): T[] | null => {
    if (!Array.isArray(body)) return null;
    const items = body.map(decode);
    return items.every((item): item is T => item !== null) ? items : null;
  };
}

export function createDesktopAgentCollaborationClient(deps: DesktopL6Deps) {
  const send = sender(deps);
  return {
    requests: async () => decoded(await send("GET", "/agent-collaboration/requests"), listOf(decodeRequest)),
    relationships: async () => decoded(await send("GET", "/agent-collaboration/relationships"), listOf(decodeRelationship)),
    /** null puts the counterpart back to stranger. */
    setTier: async (identity: AgentCollaborationIdentityV0, tier: AgentCollaborationTierV0 | null): Promise<DesktopL6Result<true>> => {
      const checked = normalizeAgentCollaborationIdentityV0(identity);
      if (!checked || !(tier === null || isAgentCollaborationTierV0(tier))) return failed("invalid");
      return decoded(await send("PUT", "/agent-collaboration/relationships", { identity: checked, tier }), () => true as const);
    },
  };
}

/** The counterpart's tier, stranger when the owner has not given one. */
export function counterpartTier(
  relationships: readonly AgentCollaborationRelationshipViewV0[],
  identity: AgentCollaborationIdentityV0,
): AgentCollaborationTierV0 | "stranger" {
  return relationships.find((r) => r.identity.kind === identity.kind && r.identity.value === identity.value)?.tier ?? "stranger";
}

// --- L6-2 share pages ----------------------------------------------------------------------------------------------

function decodeSharePage(value: unknown): SharePageOwnerViewV1 | null {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const pub = decodeSharePagePublicViewV1(r);
  const { shareId, token, status, replyCount, createdAt, expiresAt } = r;
  if (!pub || typeof shareId !== "string" || typeof token !== "string" || !SHARE_PAGE_TOKEN_PATTERN_V1.test(token)) return null;
  if ((status !== "active" && status !== "revoked") || typeof replyCount !== "number" || !Number.isInteger(replyCount) || typeof createdAt !== "string") return null;
  if (expiresAt !== null && typeof expiresAt !== "string") return null;
  return { ...pub, shareId, token, status, expiresAt: expiresAt as string | null, createdAt, replyCount };
}

export function createDesktopSharePagesClient(deps: DesktopL6Deps) {
  const send = sender(deps);
  return {
    mine: async () => decoded(await send("GET", "/share-pages"), listOf(decodeSharePage)),
    create: async (input: SharePageCreateV1): Promise<DesktopL6Result<SharePageOwnerViewV1>> => {
      const checked = decodeSharePageCreateV1(input);
      if (!checked) return failed("invalid");
      return decoded(await send("POST", "/share-pages", checked), decodeSharePage);
    },
    revoke: async (shareId: string): Promise<DesktopL6Result<SharePageOwnerViewV1>> => {
      if (typeof shareId !== "string" || !RECORD_ID.test(shareId)) return failed("not_found");
      return decoded(await send("POST", `/share-pages/${encodeURIComponent(shareId)}/revoke`), decodeSharePage, "not_found");
    },
  };
}

/** The public page lives on the web; desktop only copies the link. */
export function sharePagePublicLink(token: string): string {
  return `https://agentrix.top/s/${encodeURIComponent(token)}`;
}

// --- L6-3 "In progress" --------------------------------------------------------------------------------------------

const isIsoOrNull = (v: unknown) => v === null || (typeof v === "string" && !Number.isNaN(Date.parse(v)));

function decodeGoal(value: unknown): OwnerGoalViewV0 | null {
  if (!value || typeof value !== "object") return null;
  const g = value as Record<string, unknown>;
  const { goalId, title, note, status, checkInAt, createdAt, updatedAt } = g;
  if (typeof goalId !== "string" || typeof title !== "string" || !(note === null || typeof note === "string")) return null;
  if (!(OWNER_GOAL_STATUSES_V0 as readonly unknown[]).includes(status) || !isIsoOrNull(checkInAt) || typeof createdAt !== "string" || typeof updatedAt !== "string") return null;
  return { goalId, title, note: note as string | null, status: status as OwnerGoalViewV0["status"], checkInAt: checkInAt as string | null, createdAt, updatedAt };
}

function decodeGoals(value: unknown): OwnerGoalsListV0 | null {
  if (!value || typeof value !== "object") return null;
  const { goals, cards, quietNow } = value as Record<string, unknown>;
  if (!Array.isArray(goals) || !Array.isArray(cards) || typeof quietNow !== "boolean") return null;
  const list = listOf(decodeGoal)(goals);
  const kept = cards.filter((c): c is OwnerGoalsListV0["cards"][number] => {
    const card = c as Record<string, unknown> | null;
    return !!card && card.kind === "goal_check_in" && typeof card.cardId === "string" && typeof card.goalId === "string" && typeof card.title === "string" && typeof card.dueAt === "string";
  });
  return list && kept.length === cards.length ? { goals: list, cards: kept, quietNow } : null;
}

export function createDesktopOwnerGoalsClient(deps: DesktopL6Deps) {
  const send = sender(deps);
  return {
    list: async () => decoded(await send("GET", "/owner-goals"), decodeGoals),
    create: async (input: OwnerGoalInputV0): Promise<DesktopL6Result<OwnerGoalViewV0>> => {
      const checked = decodeOwnerGoalInputV0(input, "create");
      if (!checked) return failed("invalid");
      return decoded(await send("POST", "/owner-goals", checked), decodeGoal);
    },
    update: async (goalId: string, input: OwnerGoalInputV0): Promise<DesktopL6Result<OwnerGoalViewV0>> => {
      const checked = decodeOwnerGoalInputV0(input, "update");
      if (!checked || typeof goalId !== "string" || !RECORD_ID.test(goalId)) return failed("invalid");
      return decoded(await send("PUT", `/owner-goals/${encodeURIComponent(goalId)}`, checked), decodeGoal, "not_found");
    },
  };
}

// --- Words ---------------------------------------------------------------------------------------------------------

export const L6_DESKTOP_FAILURE_TEXT: Readonly<Record<DesktopL6Failure, string>> = {
  closed: "",
  step_up_required: "Raising it to Commit needs four limits and a fresh sign-in; do it on the web or the phone. 提到「承诺」要填四个限额并重新确认身份，请在网页或手机上操作。",
  stale: "It was just changed elsewhere; the current setting is shown. 刚在别处改过，下面是现在的设置。",
  limits_required: "Commit needs all four limits. 「承诺」要填好四个限额。",
  invalid: "That was not saved; check what you entered. 没保存成功，请检查填写的内容。",
  not_found: "It no longer exists. 已经不在了。",
  no_session: "Please sign in first. 请先登录。",
  unreadable: "Cannot be read right now. 暂时读不到。",
  unavailable: "Network trouble, try again. 网络不稳，请稍后再试。",
};

export const TRUST_LADDER_LEVEL_TEXT: Readonly<Record<TrustLadderLevelV0, string>> = {
  look: "Look · 查 — looks things up only. 只查资料，不拟草稿、不花钱。",
  suggest: "Suggest · 建议 — asks before drafting. 给建议；拟草稿前先问你。",
  prepare: "Prepare · 准备 — drafts; asks before paying, booking or sending. 可以拟草稿；付款、预约、发送都先问你。",
  commit: "Commit · 承诺 — pays, books and sends within your limits. 在你设的限额内直接付款、预约、发送。",
};

export const AGENT_COLLABORATION_TIER_TEXT: Readonly<Record<AgentCollaborationTierV0 | "stranger", string>> = {
  stranger: "Stranger · 陌生人",
  client: "Client · 客户",
  collaborator: "Collaborator · 合作者",
  family: "Family · 家人",
};

export const AGENT_COLLABORATION_KIND_TEXT: Readonly<Record<AgentCollaborationKindV0, string>> = {
  ask: "Question · 提问",
  book: "Booking · 约时间",
  deposit_intent: "Deposit intent · 定金意向",
  file_offer: "File offer · 发文件",
};
