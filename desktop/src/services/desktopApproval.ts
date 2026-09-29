/**
 * desktopApproval.ts — 桌面 D0：三条通道共用的一道审批。
 *
 * 原来放在 desktopAgentSync.ts 里，聊天工具通过动态 import 复用；现在单独成
 * 模块，由 desktopExecutionPort 统一调用，desktopAgentSync 只做转发。
 *
 * 与旧实现的区别：
 *   - 风险级别和"能否本次会话记住"由 fence 决定并传入，不再各通道自己算。
 *   - `requireLocalApproval`（L3）只接受这台电脑上的批准；backend 状态里的
 *     批准（可能来自手机）不能放行，但任何一端的拒绝都立即生效。
 *   - 急停拉下时，所有等待中的审批立即以 FenceDeniedError 结束。
 *
 * 桌面 D2 切片 6：审批卡合同 v1（`shared/types/approval-card.ts`，REQ-backend-019 + `044ce3ca`）。
 *   - 远程来源（agent-sync、remote-control）：只在后端读回 `approved` 之后放行；本机点击
 *     不能直接放行远程命令（不能借道本机批准）。L2 / L3 的批准要这台电脑的设备签名，
 *     E32（T5）之前签不了，所以直接失败，不建记录、不等待。
 *   - 本机来源（本机聊天里的工具）：以本机确认为准。L2 / L3（未知级别按 L3）只接受本机点击；
 *     后端记录只用于同步和审计：建不出来（例如没有 registry 绑定）就用只在本机的审批卡，
 *     回写失败只提示"未同步到服务端"。
 *   - 任何一端的拒绝、以及过期，都立即结束等待。本地等待不长于记录的 `expiresAt`。
 *   - 决定只走 `decideDesktopApproval` 一条路（聊天里的审批卡、事项 → 待审批、打字"批准"）。
 */
import {
  APPROVAL_DEFAULT_TTL_SECONDS,
  approvalResponseRequirementV1,
  normalizeApprovalRiskLevelV1,
} from "../../../shared/types/approval-card";
import {
  createDesktopApproval,
  DesktopApprovalHttpError,
  getDesktopRemoteApprovalId,
  normalizeDesktopRemoteApproval,
  respondDesktopApproval,
  type DesktopRemoteApproval,
} from "./desktopSync";
import type { FenceSource } from "./executionFence";
import {
  buildDesktopApprovalSessionKey,
  classifyDesktopRisk,
  getDesktopDeviceId,
  shouldRequireApproval,
  type ApprovalRiskLevel,
  type DesktopActionKind,
} from "./desktop";
import { killSwitchDenial, onKillSwitchChange } from "./executionFence";
import { noteApprovalsRejectedByEmergencyStop } from "./emergencyStopLog";

/** 本地等待上限：和服务端默认有效期一样；有 `expiresAt` 时取更早的那个。 */
const APPROVAL_WAIT_MS = APPROVAL_DEFAULT_TTL_SECONDS * 1000;

export class ApprovalRejectedError extends Error {}
export class ApprovalTimedOutError extends Error {}
/** 远程来源的 L2 / L3：这台电脑还不能做设备签名（E32 / T5），批准不可能生效。 */
export class ApprovalSignatureUnavailableError extends ApprovalRejectedError {}

/** 这台电脑能不能对审批做设备签名。E32（registry 绑定 + 钥匙串里的 P-256 密钥）之前一律不能。 */
export function canSignApprovalsLocally(): boolean {
  return false;
}

type ApprovalOrigin = "local" | "backend";
/** 审批的来源：本机聊天（本机确认为准）或远程（后端读回为准）。 */
export type ApprovalSource = "local" | "remote";

interface ApprovalWaiter {
  resolve: (approval: DesktopRemoteApproval) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  source: ApprovalSource;
  /** 只接受本机点击的批准（本机来源的 L2 / L3）。 */
  requireLocal: boolean;
}

let rememberedApprovalSessionKeys = new Set<string>();
let pendingApprovalRequests = new Map<string, Promise<DesktopRemoteApproval>>();
const approvalWaiters = new Map<string, ApprovalWaiter>();
let approvalResponseListenerAttached = false;

onKillSwitchChange((state) => {
  if (state.engaged) {
    // 桌面 D2：急停记录里写上这次驳回了几个等待中的审批。
    noteApprovalsRejectedByEmergencyStop(approvalWaiters.size);
    rejectAllPendingApprovals(killSwitchDenial());
    rememberedApprovalSessionKeys = new Set<string>();
  }
});

export function settleApprovalRecord(
  rawApproval: DesktopRemoteApproval | undefined | null,
  origin: ApprovalOrigin = "backend",
) {
  const approval = normalizeDesktopRemoteApproval(rawApproval);
  if (!approval) {
    return;
  }

  if (approval.status === "pending") {
    return;
  }

  const approvalId = getDesktopRemoteApprovalId(approval);
  const waiter = approvalWaiters.get(approvalId);
  if (!waiter) {
    return;
  }

  if (approval.status === "approved") {
    // 远程来源：只认后端读回，本机点击不能借道放行（REQ-backend-019 / 044ce3ca）。
    if (waiter.source === "remote" && origin !== "backend") {
      return;
    }
    // 本机来源的 L2 / L3：只认本机点击，不接受来自后端状态（例如手机端）的批准。
    if (waiter.requireLocal && origin !== "local") {
      return;
    }
    // "本次会话记住"只给本机来源的 L1（合同：L2 / L3 不能记住）。
    if (waiter.source === "local" && !waiter.requireLocal && approval.rememberForSession && approval.sessionKey) {
      rememberedApprovalSessionKeys.add(approval.sessionKey);
    }
  }

  clearTimeout(waiter.timeoutId);
  approvalWaiters.delete(approvalId);

  if (approval.status === "approved") {
    waiter.resolve(approval);
    return;
  }
  if (approval.status === "expired") {
    waiter.reject(new ApprovalTimedOutError("Approval expired"));
    return;
  }
  waiter.reject(new ApprovalRejectedError("Command was rejected by the user"));
}

export function settleApprovalRecords(
  approvals: Array<DesktopRemoteApproval | undefined | null>,
  origin: ApprovalOrigin = "backend",
) {
  approvals.forEach((approval) => settleApprovalRecord(approval, origin));
}

/** 本地等待多久：不超过上限，也不超过记录的 `expiresAt`。 */
export function approvalWaitMs(expiresAt: string | undefined, now = Date.now()): number {
  const expiry = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!Number.isFinite(expiry)) return APPROVAL_WAIT_MS;
  return Math.max(0, Math.min(APPROVAL_WAIT_MS, expiry - now));
}

function waitForApproval(approvalId: string, options: { source: ApprovalSource; requireLocal: boolean; waitMs: number }) {
  const safeApprovalId = String(approvalId || "").trim();
  if (!safeApprovalId) {
    return Promise.reject(new Error("Approval response is missing approvalId"));
  }

  return new Promise<DesktopRemoteApproval>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      approvalWaiters.delete(safeApprovalId);
      reject(new ApprovalTimedOutError("Approval timed out"));
    }, options.waitMs);

    approvalWaiters.set(safeApprovalId, {
      resolve,
      reject,
      timeoutId,
      source: options.source,
      requireLocal: options.requireLocal,
    });
  });
}

/** 事项 → 待审批用：这张卡是不是本机正在等的、来源是什么。 */
export function getApprovalWaiterSource(approvalId: string): ApprovalSource | null {
  return approvalWaiters.get(String(approvalId || "").trim())?.source ?? null;
}

const settledCallbacks = new Set<() => void>();

export function attachApprovalResponseListener(onSettled?: () => void) {
  if (onSettled) settledCallbacks.add(onSettled);
  if (approvalResponseListenerAttached || typeof window === "undefined") return;
  approvalResponseListenerAttached = true;
  window.addEventListener("agentrix:approval-response-local", ((event: Event) => {
    const approval = (event as CustomEvent).detail as DesktopRemoteApproval | undefined;
    if (!approval) {
      return;
    }
    settleApprovalRecord(approval, "local");
    for (const callback of [...settledCallbacks]) {
      try {
        callback();
      } catch {
        /* ignore */
      }
    }
  }) as EventListener);
}

export interface DesktopActionApprovalRequest {
  token?: string | null;
  /** 规范化动作类型（fence 的 `kind`），旧调用方传 DesktopActionKind。 */
  kind: DesktopActionKind | string;
  title: string;
  description: string;
  payload?: Record<string, string>;
  taskId?: string;
  timelineEntryId?: string;
  sessionId?: string;
  /** 由 fence 决定；缺省时按旧的 classifyDesktopRisk 计算。 */
  riskLevel?: ApprovalRiskLevel;
  /** false 时不使用、也不产生"本次会话记住"。 */
  allowRemember?: boolean;
  sessionKey?: string;
  /** L3：只接受这台电脑上的批准。 */
  requireLocalApproval?: boolean;
  /** 哪条通道发起的。只有 `chat-tool` 算本机来源；缺省按远程处理（更严）。 */
  source?: FenceSource;
}

export async function requireDesktopActionApproval(request: DesktopActionApprovalRequest) {
  const riskLevel = request.riskLevel ?? classifyDesktopRisk(request.kind as DesktopActionKind, request.payload);
  const source: ApprovalSource = request.source === "chat-tool" ? "local" : "remote";
  // 合同：未知级别按 L3；L2 / L3 只能在发起审批的这台电脑上批准，也不能"记住"。
  const contractRisk = normalizeApprovalRiskLevelV1(riskLevel);
  const highRisk = contractRisk === "L2" || contractRisk === "L3";
  const requireLocal = source === "local" && (highRisk || Boolean(request.requireLocalApproval));
  const sessionKey = request.allowRemember === false || highRisk || source === "remote" || request.requireLocalApproval
    ? undefined
    : request.sessionKey ?? buildDesktopApprovalSessionKey(request.kind as DesktopActionKind, request.payload);
  const sessionApproved = Boolean(sessionKey && rememberedApprovalSessionKeys.has(sessionKey));

  if (!shouldRequireApproval(riskLevel, sessionApproved)) {
    return;
  }

  if (source === "remote" && highRisk && !canSignApprovalsLocally()) {
    // 远程的 L2 / L3 只有这台电脑的设备签名才能批准；现在签不了，等下去只会过期。
    throw new ApprovalSignatureUnavailableError(
      "This remote action needs approval signed by this computer, which is not available yet (E32).",
    );
  }

  if (!request.token && source === "remote") {
    throw new Error("Sign in is required to approve this desktop action.");
  }

  attachApprovalResponseListener();

  if (sessionKey) {
    const pendingRequest = pendingApprovalRequests.get(sessionKey);
    if (pendingRequest) {
      await pendingRequest;
      return;
    }
  }

  const approvalRequest = (async () => {
    const taskId = String(request.taskId || `local-${request.sessionId || "global"}-${request.kind}-${Date.now()}`);
    const timelineEntryId = String(request.timelineEntryId || taskId);
    let approval: DesktopRemoteApproval | null = null;
    let syncError: string | null = null;
    if (request.token) {
      try {
        const { approval: rawApproval } = await createDesktopApproval(request.token, {
          taskId,
          timelineEntryId,
          title: request.title,
          description: request.description,
          riskLevel,
          sessionKey,
        });
        approval = normalizeDesktopRemoteApproval(rawApproval);
        if (!approval) syncError = "invalid_approval_record";
      } catch (error) {
        syncError = error instanceof DesktopApprovalHttpError ? error.code : "approval_create_failed";
      }
    } else {
      syncError = "signed_out";
    }

    if (!approval) {
      // 远程来源没有后端记录就没有读回，不能执行。
      if (source === "remote") {
        throw new Error(`Approval request could not be created on the server (${syncError}); not executed.`);
      }
      // 本机来源：只在本机的审批卡，本机确认为准，不回写。
      approval = {
        approvalId: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        deviceId: getDesktopDeviceId(),
        taskId,
        timelineEntryId,
        title: request.title,
        description: request.description,
        riskLevel,
        sessionKey,
        status: "pending",
        requestedAt: new Date().toISOString(),
        rememberForSession: false,
        localOnly: true,
      };
    }
    if (approval.status !== "pending") {
      throw new ApprovalTimedOutError(`Approval record is already ${approval.status}`);
    }

    const approvalPromise = waitForApproval(approval.approvalId, {
      source,
      requireLocal,
      waitMs: approvalWaitMs(approval.expiresAt),
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("agentrix:approval-new", {
        detail: request.sessionId
          ? { approval: { ...approval, requireLocalApproval: requireLocal }, sessionId: request.sessionId }
          : { ...approval, requireLocalApproval: requireLocal },
      }));
    }

    const resolvedApproval = await approvalPromise;
    if (source === "local" && !requireLocal && resolvedApproval.rememberForSession && resolvedApproval.sessionKey && sessionKey) {
      rememberedApprovalSessionKeys.add(resolvedApproval.sessionKey);
    }

    return resolvedApproval;
  })();

  if (sessionKey) {
    pendingApprovalRequests.set(sessionKey, approvalRequest);
  }

  try {
    await approvalRequest;
  } finally {
    if (sessionKey && pendingApprovalRequests.get(sessionKey) === approvalRequest) {
      pendingApprovalRequests.delete(sessionKey);
    }
  }
}

export function rejectAllPendingApprovals(error: Error) {
  for (const waiter of approvalWaiters.values()) {
    clearTimeout(waiter.timeoutId);
    waiter.reject(error);
  }
  approvalWaiters.clear();
  pendingApprovalRequests = new Map<string, Promise<DesktopRemoteApproval>>();
}

export function resetDesktopApprovals(reason = "Desktop sync stopped") {
  rejectAllPendingApprovals(new Error(reason));
  rememberedApprovalSessionKeys = new Set<string>();
}

/** 测试用：当前等待中的审批数量。 */
export function getPendingApprovalCount() {
  return approvalWaiters.size;
}

export interface DecideApprovalResult {
  /** 本机等待是否已按这个决定结束（远程来源的批准要等后端读回）。 */
  settledLocally: boolean;
  /** 后端是否确认了这个决定。 */
  synced: boolean;
  /** 没同步时的原因，例如 `local_only`、`device_signature_unavailable`、`REMOTE_APPROVAL_CONFIRMATION_REQUIRED`。 */
  reason?: string;
}

type RespondFn = (
  token: string,
  approvalId: string,
  payload: { decision: "approved" | "rejected"; rememberForSession?: boolean; requestDigest?: string; riskLevel?: string },
) => Promise<{ approval?: unknown }>;

/**
 * 审批决定的唯一入口（聊天里的审批卡、事项 → 待审批、打字"批准"都走这里）。
 * 1. 先发本机决定事件：本机来源的等待按本机点击结束；远程来源的等待只接受拒绝，批准要等读回。
 * 2. 再回写后端（只带 `requestDigest`，合同允许时带"记住"）：
 *    - 只在本机的审批卡、没登录：不回写；
 *    - L2 / L3 批准：这台电脑还签不了名（E32），不发必然失败的请求；
 *    - 后端确认后，把响应当作读回交给等待（远程来源的 L0 / L1 在这一步放行）。
 */
export async function decideDesktopApproval(input: {
  token: string | null | undefined;
  approval: DesktopRemoteApproval;
  decision: "approved" | "rejected";
  rememberForSession?: boolean;
  respond?: RespondFn;
}): Promise<DecideApprovalResult> {
  const approvalId = getDesktopRemoteApprovalId(input.approval);
  if (!approvalId) return { settledLocally: false, synced: false, reason: "missing_approval_id" };
  const requirement = approvalResponseRequirementV1(input.approval.riskLevel, input.decision);
  const remember = input.decision === "approved" && requirement.rememberAllowed && Boolean(input.rememberForSession && input.approval.sessionKey);
  const waiterSource = getApprovalWaiterSource(approvalId);

  attachApprovalResponseListener();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("agentrix:approval-response-local", {
      detail: { ...input.approval, approvalId, status: input.decision, rememberForSession: remember },
    }));
  }
  const settledLocally = waiterSource !== null && getApprovalWaiterSource(approvalId) === null;

  if (input.approval.localOnly) return { settledLocally, synced: false, reason: "local_only" };
  if (!input.token) return { settledLocally, synced: false, reason: "signed_out" };
  if (requirement.localConfirmation && !canSignApprovalsLocally()) {
    return { settledLocally, synced: false, reason: "device_signature_unavailable" };
  }

  const respond = input.respond ?? respondDesktopApproval;
  try {
    const result = await respond(input.token, approvalId, {
      decision: input.decision,
      requestDigest: input.approval.requestDigest,
      rememberForSession: remember,
      riskLevel: input.approval.riskLevel,
    });
    const readBack = normalizeDesktopRemoteApproval(result?.approval as DesktopRemoteApproval | undefined);
    if (!readBack || readBack.status !== input.decision) {
      return { settledLocally, synced: false, reason: "readback_mismatch" };
    }
    settleApprovalRecord(readBack, "backend");
    return { settledLocally: settledLocally || getApprovalWaiterSource(approvalId) === null, synced: true };
  } catch (error) {
    return {
      settledLocally,
      synced: false,
      reason: error instanceof DesktopApprovalHttpError ? error.code : error instanceof Error ? error.message : "writeback_failed",
    };
  }
}
