/**
 * relationshipBook — 桌面：关系簿列表（L8 R4，`shared/types/relationship-book.ts`）。
 *
 * 你打过交道的人，只有你看得到；分身不会拿它去回答访客。只在 `VITE_RELATIONSHIP_BOOK_ENABLED=1` 的构建里出现；
 * 服务端开关没开时接口回 404，这里什么都不显示。列表不带联系方式，点开一个人才去取。全部用本人登录凭据，AI 调不到这些函数。
 */
import {
  RELATIONSHIPS_PATH_V1,
  decodeRelationshipContactViewV1,
  decodeRelationshipListV1,
  relationshipContactPathV1,
  type RelationshipContactSummaryV1,
  type RelationshipContactViewV1,
  type RelationshipTierV1,
} from "../../../shared/types/relationship-book";
import { API_BASE, apiFetch } from "./store";

export function relationshipBookEnabled(env: Record<string, string | undefined> = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}): boolean {
  return env.VITE_RELATIONSHIP_BOOK_ENABLED === "1";
}

export type RelationshipBookResult<T> = { ok: true; value: T } | { ok: false; reason: "signed_out" | "unavailable" | "unreadable" };
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function call<T>(
  token: string | null | undefined,
  method: "GET" | "PATCH",
  path: string,
  decode: (body: unknown) => T | null,
  body?: unknown,
  fetchImpl: Fetch = apiFetch,
): Promise<RelationshipBookResult<T>> {
  if (!token) return { ok: false, reason: "signed_out" };
  try {
    const response = await fetchImpl(`${API_BASE}${path}`, {
      method,
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response || response.status < 200 || response.status >= 300) return { ok: false, reason: "unavailable" };
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    const value = decode(parsed);
    return value === null ? { ok: false, reason: "unreadable" } : { ok: true, value };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export const listRelationships = (token: string | null | undefined, fetchImpl?: Fetch): Promise<RelationshipBookResult<RelationshipContactSummaryV1[]>> =>
  call(token, "GET", RELATIONSHIPS_PATH_V1, decodeRelationshipListV1, undefined, fetchImpl);

export const getRelationship = (token: string | null | undefined, contactRef: string, fetchImpl?: Fetch): Promise<RelationshipBookResult<RelationshipContactViewV1>> =>
  /^rel_[0-9a-f]{32}$/.test(contactRef) ? call(token, "GET", relationshipContactPathV1(contactRef), decodeRelationshipContactViewV1, undefined, fetchImpl) : Promise.resolve({ ok: false, reason: "unavailable" });

export const setRelationshipTier = (
  token: string | null | undefined,
  contactRef: string,
  tier: RelationshipTierV1 | null,
  fetchImpl?: Fetch,
): Promise<RelationshipBookResult<RelationshipContactViewV1>> =>
  /^rel_[0-9a-f]{32}$/.test(contactRef) ? call(token, "PATCH", relationshipContactPathV1(contactRef), decodeRelationshipContactViewV1, { tier }, fetchImpl) : Promise.resolve({ ok: false, reason: "unavailable" });
