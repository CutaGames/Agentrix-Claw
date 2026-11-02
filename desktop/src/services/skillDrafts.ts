/**
 * skillDrafts — 桌面：从经验长出的技能草稿（L8 C2，`shared/types/skill-draft.ts`）。
 *
 * 同一个自动化成功跑了好几次以后，可以提炼成一份技能草稿。草稿只是几行文字，本人确认以后才启用；
 * 找新草稿要用平台的模型额度，每人每天有次数上限。只在 `VITE_SKILL_DISTILL_ENABLED=1` 的构建里出现；
 * 服务端开关没开时接口回 404，这里什么都不显示。全部用本人登录凭据，AI 调不到这些函数。
 */
import {
  SKILL_DRAFTS_SCAN_PATH_V1,
  decodeSkillDraftListV1,
  decodeSkillDraftResponseV1,
  decodeSkillDraftScanV1,
  skillDraftDecisionPathV1,
  skillDraftListPathV1,
  type SkillDraftDecisionV1,
  type SkillDraftScanV1,
  type SkillDraftViewV1,
} from "../../../shared/types/skill-draft";
import { API_BASE, apiFetch } from "./store";

export function skillDraftsEnabled(env: Record<string, string | undefined> = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}): boolean {
  return env.VITE_SKILL_DISTILL_ENABLED === "1";
}

export type SkillDraftsResult<T> = { ok: true; value: T } | { ok: false; reason: "signed_out" | "unavailable" | "unreadable" };

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function call<T>(
  token: string | null | undefined,
  method: "GET" | "POST",
  path: string,
  decode: (body: unknown) => T | null,
  body?: unknown,
  fetchImpl: Fetch = apiFetch,
): Promise<SkillDraftsResult<T>> {
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

export const listSkillDrafts = (token: string | null | undefined, fetchImpl?: Fetch): Promise<SkillDraftsResult<SkillDraftViewV1[]>> =>
  call(token, "GET", skillDraftListPathV1(), decodeSkillDraftListV1, undefined, fetchImpl);

export const scanSkillDrafts = (token: string | null | undefined, fetchImpl?: Fetch): Promise<SkillDraftsResult<SkillDraftScanV1>> =>
  call(token, "POST", SKILL_DRAFTS_SCAN_PATH_V1, decodeSkillDraftScanV1, {}, fetchImpl);

export const decideSkillDraft = (
  token: string | null | undefined,
  draftRef: string,
  decision: SkillDraftDecisionV1,
  fetchImpl?: Fetch,
): Promise<SkillDraftsResult<SkillDraftViewV1>> => call(token, "POST", skillDraftDecisionPathV1(draftRef), decodeSkillDraftResponseV1, { decision }, fetchImpl);
