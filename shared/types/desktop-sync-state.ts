/**
 * `GET /api/desktop-sync/state` 的一部分（合同 v0，REQ-desktop-047）。这一版只放 `orderDrafts`，其余字段以后再搬进来。
 *
 * `orderDrafts`：告诉桌面"有新付款的单还没草稿"，不带任何订单内容。
 * - `pendingCount`：这个用户名下所有 Agent 的订单里，状态 `paid`、还没有交付草稿的张数，最多算到
 *   `DESKTOP_SYNC_ORDER_DRAFTS_MAX`（20）；
 * - `changedAt`：这些单里最新的付款时间（ISO 8601 UTC），没有单时是 `null`。
 * - 订单总开关（`AGENTRIX_ORDERS_V0_ENABLED`）关着、或者服务端读不到时，没有这个字段。
 * 桌面看到 `pendingCount > 0` 且 `changedAt` 变新，才用运行时凭据调一次 `GET /api/order-escrow/runtime/orders`，
 * 那条路由只给这台电脑绑定的 Agent 的单（v0.11 的归属规则）。
 */
export const DESKTOP_SYNC_STATE_ROUTE = 'GET /api/desktop-sync/state' as const;
export const DESKTOP_SYNC_ORDER_DRAFTS_MAX = 20;

export interface DesktopSyncOrderDraftsV1 {
  pendingCount: number;
  changedAt: string | null;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 客户端用：解码 `orderDrafts`。`pendingCount` 不是 0–20 的整数就整个返回 null（不截断，桌面不会因为坏值去调列表）；
 * `changedAt` 认不出就当 `null`。
 */
export function decodeDesktopSyncOrderDraftsV1(value: unknown): DesktopSyncOrderDraftsV1 | null {
  if (!isRecord(value)) return null;
  const count = value.pendingCount;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > DESKTOP_SYNC_ORDER_DRAFTS_MAX) return null;
  const at = value.changedAt;
  const changedAt = typeof at === 'string' && ISO_UTC.test(at) && Number.isFinite(Date.parse(at)) ? at : null;
  return { pendingCount: count, changedAt };
}

/** 客户端用：从整个 state 响应里读 `orderDrafts`；没有这个字段（旧后端、开关关着）返回 null。 */
export function readDesktopSyncOrderDraftsV1(state: unknown): DesktopSyncOrderDraftsV1 | null {
  return isRecord(state) ? decodeDesktopSyncOrderDraftsV1(state.orderDrafts) : null;
}

/** 服务端用：由最多 20 条付款时间（新的在前）算出字段。 */
export function buildDesktopSyncOrderDraftsV1(paidAtNewestFirst: ReadonlyArray<Date | null>): DesktopSyncOrderDraftsV1 {
  const rows = paidAtNewestFirst.slice(0, DESKTOP_SYNC_ORDER_DRAFTS_MAX);
  const newest = rows.find((at): at is Date => at instanceof Date && Number.isFinite(at.getTime()));
  return { pendingCount: rows.length, changedAt: newest ? newest.toISOString() : null };
}
