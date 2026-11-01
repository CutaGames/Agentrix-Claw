/**
 * "我的数据"v0（L5 D1，backlog web 3；10-03）：在哪、导出、删除。
 *
 * - 在哪：按类列出本人在平台上的数据和条数（不含内容），每类写明存在哪、保留多久、怎么导出或删除。
 * - 导出：分身的 Soul Pack 走已有的主权导出（`soul-core-continuity` 的快照）；这里只给入口。
 * - 删除：提交"删除账号"申请（要打一句确认的话），平台人工核对后处理；处理前可以撤回。真正删除属于破坏数据，
 *   由运营按流程执行，不在这个接口里做。
 * - 开关 `MY_DATA_V0_ENABLED` 默认关（关着时路由一律 404）。
 */

export const MY_DATA_ROUTES_V0 = {
  summary: 'GET /api/my-data/summary',
  deletion: 'GET /api/my-data/deletion-request',
  requestDeletion: 'POST /api/my-data/deletion-request',
  withdrawDeletion: 'POST /api/my-data/deletion-request/withdraw',
} as const;

export const MY_DATA_CATEGORIES_V0 = [
  'agents',
  'terms_acceptances',
  'orders_as_buyer',
  'income_lines',
  'visitor_bookings',
  'device_declarations',
  'cloud_sandbox_runs',
] as const;
export type MyDataCategoryV0 = (typeof MY_DATA_CATEGORIES_V0)[number];

/** 删除账号前要原样打的一句话（中英都认）。 */
export const MY_DATA_DELETION_CONFIRMATIONS_V0 = ['删除我的账号', 'delete my account'] as const;

export const MY_DATA_DELETION_STATES_V0 = ['received', 'processing', 'done', 'withdrawn'] as const;
export type MyDataDeletionStateV0 = (typeof MY_DATA_DELETION_STATES_V0)[number];

export interface MyDataSummaryV0 {
  schemaVersion: 0;
  /** 每类的条数；这一类在当前环境读不到时为 null（不当作 0）。 */
  counts: Record<MyDataCategoryV0, number | null>;
}

export interface MyDataDeletionRequestViewV0 {
  requestRef: string;
  state: MyDataDeletionStateV0;
  createdAt: string;
  updatedAt: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
export const MY_DATA_REQUEST_REF_PATTERN_V0 = /^mdr_[0-9a-f]{32}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 服务端用：删除申请的确认语要原样（去掉首尾空白、英文不分大小写）。 */
export function isMyDataDeletionConfirmedV0(value: unknown): boolean {
  if (!isRecord(value) || typeof value.confirmation !== 'string') return false;
  const typed = value.confirmation.trim();
  return MY_DATA_DELETION_CONFIRMATIONS_V0.some((phrase) => phrase === typed || phrase === typed.toLowerCase());
}

export function decodeMyDataSummaryV0(value: unknown): MyDataSummaryV0 | null {
  if (!isRecord(value) || value.schemaVersion !== 0 || !isRecord(value.counts)) return null;
  const counts = {} as Record<MyDataCategoryV0, number | null>;
  for (const category of MY_DATA_CATEGORIES_V0) {
    const count = value.counts[category];
    if (count !== null && (!Number.isInteger(count) || (count as number) < 0)) return null;
    counts[category] = count as number | null;
  }
  return { schemaVersion: 0, counts };
}

export function decodeMyDataDeletionRequestV0(value: unknown): MyDataDeletionRequestViewV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.requestRef !== 'string' || !MY_DATA_REQUEST_REF_PATTERN_V0.test(value.requestRef)) return null;
  if (!(MY_DATA_DELETION_STATES_V0 as readonly unknown[]).includes(value.state)) return null;
  if (typeof value.createdAt !== 'string' || !ISO.test(value.createdAt) || typeof value.updatedAt !== 'string' || !ISO.test(value.updatedAt)) return null;
  return { requestRef: value.requestRef, state: value.state as MyDataDeletionStateV0, createdAt: value.createdAt, updatedAt: value.updatedAt };
}
