/**
 * spendApproval — 对话内的付款批准卡（L5 待办 5，D2，合同 `shared/types/spend-budget.ts`，E99）。默认关。
 *
 * 两条对话路径发同一种 `approval_required`：带 `approvalRef` 和 `spend` 的是付款批准，按这里的卡片显示；
 * 不带的是普通工具批准，照旧走原来的流程。字段坏了的一律不显示批准按钮（`decodeSpendApprovalEventV0` 返回 null）。
 * - 批准 / 拒绝只用本人登录凭据（服务端也只认 `type: 'user'`）；AI 调不到：fence 里没有这两个动作，只有卡片上的点击。
 * - 按钮由 `spendApprovalActionsV0` 决定：只有 `pending` 能批准；`pending` 或 `expired` 能拒绝。
 * - 要最近登录时（两种 403 都认），桌面没有就地确认，提示去手机或网页批准；不重试、不换 token。
 * - 同一个 `approvalRef` 只显示一张卡（三端按它去重）。
 */
import {
  SPEND_APPROVAL_ERROR_CODES_V0,
  SPEND_APPROVAL_REF_PATTERN_V0,
  decodeSpendApprovalEventV0,
  decodeSpendApprovalViewV0,
  spendApprovalActionsV0,
  type SpendApprovalEventV0,
  type SpendApprovalViewV0,
  type SpendPathV0,
} from "../../../shared/types/spend-budget";
import { isRecentSignInRequiredErrorV1 } from "../../../shared/types/auth-step-up";
import { parseApiErrorBodyV1 } from "../../../shared/types/api-error";
import { API_BASE, apiFetch, useAuthStore } from "./store";

export const SPEND_CARD_ENABLED_KEY = "agentrix_desktop_spend_card_enabled";

export function spendCardEnabled(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): boolean {
  try {
    return storage?.getItem(SPEND_CARD_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

/** What the chat stream gave us: a spend card, an ordinary tool approval, or nothing usable. */
export function classifyApprovalEvent(raw: unknown): { kind: "spend"; event: SpendApprovalEventV0 } | { kind: "tool" } | { kind: "invalid" } {
  const decoded = decodeSpendApprovalEventV0(raw);
  return decoded ?? { kind: "invalid" };
}

export type SpendActionError =
  | "sign_in_required"
  | "step_up_required"
  | "not_found"
  | "expired"
  | "args_changed"
  | "budget_exceeded"
  | "network"
  | "unknown";

export type SpendActionResult = { ok: true; view: SpendApprovalViewV0 } | { ok: false; error: SpendActionError };

function errorOf(status: number, body: unknown): SpendActionError {
  if (isRecentSignInRequiredErrorV1(status, body)) return "step_up_required";
  const code = parseApiErrorBodyV1(body).code ?? "";
  switch (code) {
    case SPEND_APPROVAL_ERROR_CODES_V0.stepUpRequired:
      return "step_up_required";
    case SPEND_APPROVAL_ERROR_CODES_V0.signInRequired:
      return "sign_in_required";
    case SPEND_APPROVAL_ERROR_CODES_V0.notFound:
      return "not_found";
    case SPEND_APPROVAL_ERROR_CODES_V0.expired:
      return "expired";
    case SPEND_APPROVAL_ERROR_CODES_V0.argsChanged:
      return "args_changed";
    case SPEND_APPROVAL_ERROR_CODES_V0.budgetExceeded:
      return "budget_exceeded";
  }
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "sign_in_required";
  return "unknown";
}

async function call(method: "GET" | "POST", path: string, nowMs: () => number): Promise<SpendActionResult> {
  // The owner's own sign-in token only (the server refuses agent / runtime credentials anyway).
  const token = useAuthStore.getState().token;
  if (!token) return { ok: false, error: "sign_in_required" };
  let response: Response;
  try {
    response = await apiFetch(`${API_BASE}${path}`, { method, headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
  } catch {
    return { ok: false, error: "network" };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) return { ok: false, error: errorOf(response.status, body) };
  const view = decodeSpendApprovalViewV0(body, nowMs());
  return view ? { ok: true, view } : { ok: false, error: "unknown" };
}

function refPath(ref: string, action?: "approve" | "reject"): string | null {
  if (!SPEND_APPROVAL_REF_PATTERN_V0.test(ref)) return null;
  // `SPEND_APPROVAL_ROUTES_V0`; API_BASE already ends in /api.
  return `/spend-approvals/${ref}${action ? `/${action}` : ""}`;
}

export async function readSpendApproval(ref: string, nowMs: () => number = Date.now): Promise<SpendActionResult> {
  const path = refPath(ref);
  return path ? call("GET", path, nowMs) : { ok: false, error: "not_found" };
}

/** Only from the owner's click on the card. The server repeats the first answer for a second click. */
export async function decideSpendApproval(ref: string, decision: "approve" | "reject", nowMs: () => number = Date.now): Promise<SpendActionResult> {
  const path = refPath(ref, decision);
  return path ? call("POST", path, nowMs) : { ok: false, error: "not_found" };
}

export { spendApprovalActionsV0 };

const PATH_TEXT: Record<SpendPathV0, string> = {
  x402: "按次付费（x402）",
  ucp_mandate: "授权代付",
  quickpay: "快捷付款",
  wallet_transfer: "钱包转账",
  skill_purchase: "买技能",
  commerce_purchase: "买东西",
  hire_escrow: "雇人（托管）",
  lsm: "LSM",
  platform_credit: "平台额度",
  device_rental: "租设备",
};
export function describeSpendPath(path: SpendPathV0): string {
  return PATH_TEXT[path];
}
/** `1234` → `$12.34`; the original currency, when there is one, is shown next to it ("约"). */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
/** The original amount in its own minor units (JPY has none, most have two); unknown codes fall back to "123 XYZ (minor)". */
export function formatOriginal(original: SpendApprovalEventV0["spend"]["original"]): string {
  if (!original) return "";
  try {
    const format = new Intl.NumberFormat("zh-CN", { style: "currency", currency: original.currency });
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
    return format.format(original.amountMinor / 10 ** digits);
  } catch {
    return `${original.amountMinor} ${original.currency}（最小单位）`;
  }
}
const ERROR_TEXT: Record<SpendActionError, string> = {
  sign_in_required: "要用你本人的登录才能批准，请重新登录",
  step_up_required: "这笔要最近登录过才能批准：请在手机或网页上批准",
  not_found: "找不到这笔批准，可能不是你的 Agent 的",
  expired: "已经过期，没有付款",
  args_changed: "付款内容和批准时不一样，没有执行",
  budget_exceeded: "预算在这期间不够了，没有执行",
  network: "连不上服务器，稍后再试",
  unknown: "没有完成",
};
export function describeSpendError(error: SpendActionError): string {
  return ERROR_TEXT[error];
}
const STATUS_TEXT: Record<SpendApprovalViewV0["status"], string> = {
  pending: "等你批准",
  approved: "已批准，正在执行",
  rejected: "已拒绝",
  expired: "已过期",
  executed: "已付款",
  failed: "执行失败",
};
export function describeSpendStatus(status: SpendApprovalViewV0["status"]): string {
  return STATUS_TEXT[status];
}
