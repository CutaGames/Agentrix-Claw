/**
 * orderDesk — 桌面 D5 接单交付台，第 1 片（REQ-desktop-032）。
 *
 * 分身接到的付费问答 / 定金，主人在桌面上写回答、存草稿、看过以后交付。全部用本人的登录凭据
 * （桌面登录拿到的普通 sign-in JWT），走订单合同 v0.10 现有的接口，解码用 `order-escrow-view.ts`：
 * - 卖方编号是主 Agent 的外部编号 `agentUniqueId`，先用 `GET /agent-accounts/:id` 取；
 * - 列单：`GET /order-escrow/orders?as=seller&agentId=`；订单总开关关着（503 `orders_unavailable`）时
 *   交付台显示"还没开放"，不报错；
 * - 存草稿：`PUT /order-escrow/orders/:orderId/delivery-draft`（附件 `deliveryRefs` v0.7 只收空数组）；
 * - 交付：`POST /order-escrow/orders/:orderId/actions`，`deliver` 只带 `reviewedDeliveryDigest`，服务端交付
 *   它存着的那份草稿。摘要在这里对屏幕上的那份草稿重算（`reviewableDeliveryDraft`），和服务端给的一致、
 *   也和本人确认时看到的一致才发。草稿在确认之后变了，就不发，要本人再看一遍。
 *
 * 金额、状态、能做什么都以服务端为准；这里不算价格，也不猜结果。`unknown` 时什么按钮都不给。
 * AI 不能调这些函数：聊天工具和远程通道里都没有对应的命令，只有交付台上本人的点击。
 */
import {
  decodeOrderItems,
  decodeOrderSellerView,
  orderActionsFor,
  reviewableDeliveryDraft,
  type OrderSellerView,
} from "../../../shared/types/order-escrow-view";
import { ORDER_DELIVERY_ANSWER_MAX_CHARS } from "../../../shared/types/order-escrow";
import { API_BASE, apiFetch } from "./store";

export type OrderDeskLoad =
  | { state: "signed_out" }
  | { state: "unavailable" }
  | { state: "error"; reason: string }
  | { state: "ready"; sellerAgentId: string; orders: OrderSellerView[] };

export type OrderDeskResult = { ok: true; order: OrderSellerView } | { ok: false; reason: string };

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const SELLER_AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ORDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CODE = /^[A-Za-z0-9_]{1,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function authed(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** `{ success, data }` → data；裸对象原样。 */
function dataOf(body: unknown): unknown {
  return isRecord(body) && "data" in body && body.success !== false ? body.data : body;
}

/** 错误合同 v1 的 `code`（或嵌在 `error` / `message` 里的对象），不合格式时用 `http_<status>`。 */
function reasonOf(status: number, body: unknown): string {
  const candidates = [
    isRecord(body) ? body.code : undefined,
    isRecord(body) && isRecord(body.error) ? body.error.code : undefined,
    isRecord(body) && isRecord(body.message) ? body.message.code : undefined,
  ];
  const code = candidates.find((value): value is string => typeof value === "string" && CODE.test(value));
  return code ?? `http_${status}`;
}

/** 主 Agent 的外部编号（`agentUniqueId`）。拿不到就是 null。 */
export async function resolveSellerAgentId(input: { token: string; agentAccountId: string; fetchImpl?: Fetch }): Promise<string | null> {
  try {
    const response = await (input.fetchImpl ?? apiFetch)(`${API_BASE}/agent-accounts/${encodeURIComponent(input.agentAccountId)}`, authed(input.token));
    if (!response || response.status < 200 || response.status >= 300) return null;
    const data = dataOf(await readJson(response));
    const id = isRecord(data) ? data.agentUniqueId : null;
    return typeof id === "string" && SELLER_AGENT_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** 交付台的数据：主 Agent 接到的订单（服务端最多给 50 条，新的在前）。 */
export async function loadOrderDesk(input: {
  token: string | null | undefined;
  agentAccountId: string | null | undefined;
  fetchImpl?: Fetch;
}): Promise<OrderDeskLoad> {
  if (!input.token) return { state: "signed_out" };
  if (!input.agentAccountId) return { state: "error", reason: "no_agent" };
  const fetchImpl = input.fetchImpl ?? apiFetch;
  const sellerAgentId = await resolveSellerAgentId({ token: input.token, agentAccountId: input.agentAccountId, fetchImpl });
  if (!sellerAgentId) return { state: "error", reason: "agent_unresolved" };
  try {
    const response = await fetchImpl(
      `${API_BASE}/order-escrow/orders?as=seller&agentId=${encodeURIComponent(sellerAgentId)}`,
      authed(input.token),
    );
    if (!response) return { state: "error", reason: "network" };
    const body = await readJson(response);
    if (response.status === 503) return { state: "unavailable" };
    if (response.status < 200 || response.status >= 300) return { state: "error", reason: reasonOf(response.status, body) };
    const orders = decodeOrderItems(dataOf(body), decodeOrderSellerView);
    if (!orders) return { state: "error", reason: "invalid_response" };
    return { state: "ready", sellerAgentId, orders };
  } catch {
    return { state: "error", reason: "network" };
  }
}

/** 这张单现在能不能写回答、交付（`paid`，而且服务端的状态机允许 `deliver`）。 */
export function canDeliver(order: OrderSellerView, nowMs: number = Date.now()): boolean {
  return orderActionsFor(order, "seller_owner", nowMs).includes("deliver");
}

export function validateAnswer(answerText: string): string | null {
  const length = [...answerText].length;
  if (!answerText.trim()) return "answer_empty";
  if (length > ORDER_DELIVERY_ANSWER_MAX_CHARS) return "answer_too_long";
  return null;
}

async function sendForOrder(
  input: { token: string; order: OrderSellerView; fetchImpl?: Fetch },
  path: string,
  method: "PUT" | "POST",
  body: Record<string, unknown>,
): Promise<OrderDeskResult> {
  if (!ORDER_ID.test(input.order.orderId)) return { ok: false, reason: "order_id_invalid" };
  try {
    const response = await (input.fetchImpl ?? apiFetch)(
      `${API_BASE}/order-escrow/orders/${encodeURIComponent(input.order.orderId)}/${path}`,
      authed(input.token, { method, body: JSON.stringify(body) }),
    );
    if (!response) return { ok: false, reason: "network" };
    const payload = await readJson(response);
    if (response.status < 200 || response.status >= 300) return { ok: false, reason: reasonOf(response.status, payload) };
    const order = decodeOrderSellerView(dataOf(payload));
    if (!order || order.orderId !== input.order.orderId) return { ok: false, reason: "invalid_response" };
    return { ok: true, order };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/** 存草稿（写一次 `version` +1）。只在能交付的单上写。 */
export async function saveDeliveryDraft(input: { token: string; order: OrderSellerView; answerText: string; fetchImpl?: Fetch }): Promise<OrderDeskResult> {
  if (!canDeliver(input.order)) return { ok: false, reason: "not_deliverable" };
  const invalid = validateAnswer(input.answerText);
  if (invalid) return { ok: false, reason: invalid };
  return sendForOrder(input, "delivery-draft", "PUT", {
    expectedVersion: input.order.version,
    answerText: input.answerText,
    deliveryRefs: [],
  });
}

/**
 * 交付本人看过的那份草稿。`reviewedDigest` 是本人点"我看过了"时屏幕上那份草稿的摘要：
 * 和现在的草稿（服务端给的摘要、客户端重算的摘要）三者一致才发。
 */
export async function deliverReviewedDraft(input: { token: string; order: OrderSellerView; reviewedDigest: string; fetchImpl?: Fetch }): Promise<OrderDeskResult> {
  const reviewable = reviewableDeliveryDraft(input.order);
  if (!reviewable) return { ok: false, reason: "draft_not_reviewable" };
  if (reviewable.digest !== input.reviewedDigest) return { ok: false, reason: "draft_changed" };
  return sendForOrder(input, "actions", "POST", {
    action: "deliver",
    expectedVersion: input.order.version,
    // One key per order version: a retry of the same click is the same request.
    idempotencyKey: `desktop-deliver-${input.order.orderId}-v${input.order.version}`,
    reviewedDeliveryDigest: reviewable.digest,
  });
}

const REASON_TEXT: Record<string, string> = {
  signed_out: "请先登录",
  no_agent: "没有找到你的主 Agent",
  agent_unresolved: "读不到主 Agent 的编号",
  network: "连不上服务器，稍后再试",
  invalid_response: "服务器返回的格式无法识别，没有改动",
  order_id_invalid: "订单编号不对",
  not_deliverable: "这张单现在不能交付",
  answer_empty: "回答不能是空的",
  answer_too_long: `回答不能超过 ${ORDER_DELIVERY_ANSWER_MAX_CHARS} 个字`,
  draft_not_reviewable: "草稿和服务器上的对不上，请重新保存后再看一遍",
  draft_changed: "你看过之后草稿又变了，请再看一遍",
  order_version_conflict: "这张单刚刚有变化，已经重新读取，请再看一遍",
  delivery_digest_mismatch: "交付的内容和你看过的不一致，没有交付",
  owner_review_required: "要先看过交付内容",
  action_not_allowed_in_status: "这张单现在的状态不能交付",
  actor_not_allowed: "只有主人本人能交付",
  order_delivery_draft_missing: "还没有草稿",
  sign_in_required: "需要用你本人的登录交付（重新登录后再试）",
  order_not_found: "找不到这张单",
  orders_unavailable: "接单还没有开放",
  rate_limited: "操作太频繁，稍后再试",
};

export function describeOrderDeskReason(reason: string | undefined): string {
  if (!reason) return "";
  return REASON_TEXT[reason] ?? `没有完成（${reason}）`;
}
