/**
 * Read-only canonical ActionReceipt access for the Receipts zone (D-1.5,
 * DRH-R07). Desktop reads Backend receipts through
 * `GET /v1/soul-cores/:soulCoreId/actions` + `/actions/:taskId/receipt` and
 * validates them against the shared Action/Trust contract. Desktop never
 * writes, signs or synthesises a receipt; anything that fails validation is
 * shown as rejected, not as a receipt.
 *
 * Soul Core id resolution (DRW answer 2026-09-16 23:22 + Backend source):
 * `/v1/soul-cores/:id/actions` only accepts a stable `sc_` id, so an Agent
 * uuid is never a valid fallback (it 404s and reads as "no receipts"). The
 * id comes from `agent.metadata.soulCoreId` when it already is an `sc_` id,
 * otherwise from `GET /agent-accounts/:agentAccountId/soul-core-id`. When
 * neither yields one, Desktop says so instead of guessing.
 *
 * 桌面 D2 切片 5：移植自 09-15 DRH 分支（`e98f7092`、`44579322`，REQ-desktop-005 的
 * 取用项）。移植时加了两道检查：列表不是 `{ items: [] }` 形状时报 invalid_contract，
 * 不当成"没有回执"；回执里的 soulCoreId / taskId 必须和请求的一致，否则按不合规处理。
 */
import {
  validateTrustCoreActionReceiptV1,
  type TrustCoreActionReceiptV1,
} from "../../../shared/types/action-trust-handoff";
import type { ActionTaskListV1, ActionTaskV1 } from "../../../shared/types/action-runtime";
import { parseApiErrorBodyV1 } from "../../../shared/types/api-error";
import { API_BASE, apiFetch } from "./store";

export type ActionReceiptReadStatus =
  | "ready"
  | "no_agent"
  | "no_soul_core"
  | "unauthenticated"
  | "http_error"
  | "network_error"
  | "invalid_contract"
  | "disabled";

export interface ActionReceiptRow {
  taskId: string;
  actionType: string;
  toolName: string;
  lifecycle: string;
  receipt: TrustCoreActionReceiptV1 | null;
  /** Why no receipt is shown for this task (`null` when `receipt` is set). */
  receiptStatus: "ready" | "not_found" | "invalid_contract" | "disabled" | "http_error" | "pending";
  receiptErrors?: string[];
}

export interface ActionReceiptInventory {
  status: ActionReceiptReadStatus;
  soulCoreId: string | null;
  message?: string;
  rows: ActionReceiptRow[];
  capturedAt: string;
}

function headers(token: string) {
  return { Accept: "application/json", Authorization: `Bearer ${token}` };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function unwrapData(body: unknown): unknown {
  if (body && typeof body === "object" && "data" in (body as Record<string, unknown>)) {
    return (body as { data: unknown }).data;
  }
  return body;
}

// ─── Soul Core id resolution ────────────────────────────────────────────────

/** Backend stable Soul Core id: `sc_` + 32 lowercase hex (`SoulCoreIdentityService.isValidSoulCoreId`). */
const SOUL_CORE_ID_PATTERN = /^sc_[0-9a-f]{32}$/;

export function isSoulCoreId(value: unknown): value is string {
  return typeof value === "string" && SOUL_CORE_ID_PATTERN.test(value.trim());
}

/** The slice of a presence Agent the Receipts zone needs. */
export interface ReceiptAgentRef {
  id: string;
  metadata?: Record<string, unknown> | null;
}

export type SoulCoreResolutionSource = "metadata.soulCoreId" | "agent-accounts.soul-core-id";

export type SoulCoreResolution =
  | { status: "resolved"; soulCoreId: string; agentAccountId: string; source: SoulCoreResolutionSource }
  | { status: "no_agent"; soulCoreId: null; agentAccountId: null; message: string }
  | { status: "unauthenticated"; soulCoreId: null; agentAccountId: string; message: string }
  /** Backend has no `sc_` id for this AgentAccount (or refused the read). Not an error to paper over. */
  | { status: "unmapped"; soulCoreId: null; agentAccountId: string; httpStatus: number; message: string }
  | { status: "network_error"; soulCoreId: null; agentAccountId: string; message: string };

/**
 * AgentAccount id Desktop knows for a presence Agent — same convention as
 * `AgentEconomyPanel` / `ChatPanelImpl`: `metadata.agentAccountId`, else the
 * Agent's own id. This is the id for `/agent-accounts/:id/*`, never a Soul Core id.
 */
export function agentAccountIdOf(agent: ReceiptAgentRef): string {
  const fromMetadata = agent.metadata?.agentAccountId;
  return typeof fromMetadata === "string" && fromMetadata.trim() ? fromMetadata.trim() : agent.id;
}

export async function resolveSoulCoreId(
  token: string | null,
  agent: ReceiptAgentRef | undefined,
): Promise<SoulCoreResolution> {
  if (!agent) {
    return {
      status: "no_agent",
      soulCoreId: null,
      agentAccountId: null,
      message: "没有活跃 Agent；Receipts 只读 Backend 对该 Agent 签发的 ActionReceipt。",
    };
  }
  const agentAccountId = agentAccountIdOf(agent);
  const fromMetadata = agent.metadata?.soulCoreId;
  if (isSoulCoreId(fromMetadata)) {
    return { status: "resolved", soulCoreId: fromMetadata.trim(), agentAccountId, source: "metadata.soulCoreId" };
  }
  if (!token) {
    return { status: "unauthenticated", soulCoreId: null, agentAccountId, message: "登录后可解析当前 Agent 的 Soul Core id。" };
  }
  try {
    const response = await apiFetch(
      `${API_BASE}/agent-accounts/${encodeURIComponent(agentAccountId)}/soul-core-id`,
      { method: "GET", headers: headers(token) },
    );
    if (!response.ok) {
      return {
        status: "unmapped",
        soulCoreId: null,
        agentAccountId,
        httpStatus: response.status,
        message: `Backend 没有该 Agent 的 Soul Core 映射（HTTP ${response.status}）；Desktop 不用 Agent id 冒充 Soul Core id。`,
      };
    }
    const data = unwrapData(await readJson(response)) as { soulCoreId?: unknown } | null;
    const soulCoreId = data?.soulCoreId;
    if (!isSoulCoreId(soulCoreId)) {
      return {
        status: "unmapped",
        soulCoreId: null,
        agentAccountId,
        httpStatus: response.status,
        message: "Backend 返回的 Soul Core id 不合 `sc_` 合同；Desktop 不猜。",
      };
    }
    return { status: "resolved", soulCoreId: soulCoreId.trim(), agentAccountId, source: "agent-accounts.soul-core-id" };
  } catch {
    return {
      status: "network_error",
      soulCoreId: null,
      agentAccountId,
      message: "无法连接 Backend 解析 Soul Core id；本地不缓存、不猜。",
    };
  }
}

/** Resolve the Soul Core id for `agent`, then read its receipts. The inventory never carries a guessed id. */
export async function loadActionReceiptsForAgent(
  token: string | null,
  agent: ReceiptAgentRef | undefined,
  limit = 20,
): Promise<{ resolution: SoulCoreResolution; inventory: ActionReceiptInventory }> {
  const resolution = await resolveSoulCoreId(token, agent);
  if (resolution.status === "resolved") {
    return { resolution, inventory: await fetchActionReceiptInventory(token, resolution.soulCoreId, limit) };
  }
  const capturedAt = new Date().toISOString();
  const status: ActionReceiptReadStatus = resolution.status === "unmapped" ? "no_soul_core" : resolution.status;
  return { resolution, inventory: { status, soulCoreId: null, rows: [], capturedAt, message: resolution.message } };
}

// ─── Receipt inventory ──────────────────────────────────────────────────────

export async function fetchActionReceiptInventory(
  token: string | null,
  soulCoreId: string | null,
  limit = 20,
): Promise<ActionReceiptInventory> {
  const capturedAt = new Date().toISOString();
  if (!token) {
    return { status: "unauthenticated", soulCoreId, rows: [], capturedAt, message: "登录后可读取当前 Agent 的 ActionReceipt。" };
  }
  if (!soulCoreId) {
    return { status: "no_agent", soulCoreId: null, rows: [], capturedAt, message: "没有活跃 Agent；Receipts 只读 Backend 对该 Agent 签发的 ActionReceipt。" };
  }

  let listBody: unknown;
  try {
    const response = await apiFetch(
      `${API_BASE}/v1/soul-cores/${encodeURIComponent(soulCoreId)}/actions?limit=${limit}`,
      { method: "GET", headers: headers(token) },
    );
    if (!response.ok) {
      return {
        status: "http_error",
        soulCoreId,
        rows: [],
        capturedAt,
        message: `Backend Action 列表不可用（HTTP ${response.status}）。Desktop 不会伪造任何回执。`,
      };
    }
    listBody = unwrapData(await readJson(response));
  } catch {
    return { status: "network_error", soulCoreId, rows: [], capturedAt, message: "无法连接 Backend；本地不缓存、不生成 ActionReceipt。" };
  }

  const list = listBody as Partial<ActionTaskListV1> | null;
  if (!list || typeof list !== "object" || !Array.isArray(list.items)) {
    // 看不懂的列表不是"没有回执"。
    return {
      status: "invalid_contract",
      soulCoreId,
      rows: [],
      capturedAt,
      message: "Backend 返回的 Action 列表格式无法识别；Desktop 不会当成没有回执。",
    };
  }
  const items: ActionTaskV1[] = list.items as ActionTaskV1[];

  const rows = await Promise.all(
    items.map(async (item): Promise<ActionReceiptRow> => {
      const taskId = item?.authorization?.taskId || "";
      const base = {
        taskId,
        actionType: String(item?.actionType ?? "unknown"),
        toolName: String(item?.toolName ?? "unknown"),
        lifecycle: String(item?.lifecycle ?? "unknown"),
      };
      if (!taskId) {
        return { ...base, receipt: null, receiptStatus: "invalid_contract", receiptErrors: ["task without taskId"] };
      }
      if (!item.outcome) {
        return { ...base, receipt: null, receiptStatus: "pending" };
      }
      try {
        const response = await apiFetch(
          `${API_BASE}/v1/soul-cores/${encodeURIComponent(soulCoreId)}/actions/${encodeURIComponent(taskId)}/receipt`,
          { method: "GET", headers: headers(token) },
        );
        const body = await readJson(response);
        if (response.status === 404) {
          // 错误合同 v1：看 `code`。
          const { code } = parseApiErrorBodyV1(body);
          return { ...base, receipt: null, receiptStatus: code === "ACTION_RECEIPT_DISABLED" ? "disabled" : "not_found" };
        }
        if (!response.ok) {
          return { ...base, receipt: null, receiptStatus: "http_error", receiptErrors: [`HTTP ${response.status}`] };
        }
        const candidate = unwrapData(body);
        const validation = validateTrustCoreActionReceiptV1(candidate);
        if (!validation.valid) {
          return { ...base, receipt: null, receiptStatus: "invalid_contract", receiptErrors: validation.errors };
        }
        const receipt = candidate as TrustCoreActionReceiptV1;
        if (receipt.taskId !== taskId || receipt.soulCoreId !== soulCoreId) {
          // 合规但不是这件事的回执：不能挂到这一行上。
          return {
            ...base,
            receipt: null,
            receiptStatus: "invalid_contract",
            receiptErrors: ["receipt does not belong to this task / Soul Core"],
          };
        }
        return { ...base, receipt, receiptStatus: "ready" };
      } catch (error) {
        return {
          ...base,
          receipt: null,
          receiptStatus: "http_error",
          receiptErrors: [error instanceof Error ? error.message : String(error)],
        };
      }
    }),
  );

  return { status: "ready", soulCoreId, rows, capturedAt };
}
