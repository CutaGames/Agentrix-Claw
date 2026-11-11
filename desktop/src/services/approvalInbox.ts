/**
 * approvalInbox — 桌面 D2 切片 6b："事项 → 待审批"的数据。
 *
 * 来源（只投影，不是第二份真相）：
 * - 后端状态：desktopAgentSync 轮询后派发的 `agentrix:desktop-sync-state`，只取这台电脑的审批；
 * - 本机请求：`requireDesktopActionApproval` 派发的 `agentrix:approval-new`（含只在本机的卡）。
 * 决定一律走 `decideDesktopApproval`；按钮能不能出现见 `approvalInboxActions`。
 * 移植思路来自 09-15 DRH 分支 `e98f7092` / `f799dcdb` 的 approvalInbox.ts，按审批卡合同 v1 重写：
 * 本机来源的卡以本机确认为准，不要求后端读回。
 */
import { approvalActionAvailableV1, projectApprovalStatusV1, type ApprovalStatusV1 } from "../../../shared/types/approval-card";
import { canSignApprovalsLocally, getApprovalWaiterSource } from "./desktopApproval";
import { getDesktopDeviceId } from "./desktop";
import { getDesktopRemoteApprovalId, normalizeDesktopRemoteApproval, type DesktopRemoteApproval } from "./desktopSync";

export interface ApprovalInboxEntry {
  approval: DesktopRemoteApproval;
  from: "backend-state" | "local-request";
}

type Listener = () => void;

let entries = new Map<string, ApprovalInboxEntry>();
let snapshot: ApprovalInboxEntry[] = [];
const listeners = new Set<Listener>();
let attached = false;

function thisDevice(): string | null {
  try {
    return getDesktopDeviceId();
  } catch {
    return null;
  }
}

function publish() {
  snapshot = [...entries.values()].sort(
    (a, b) => (Date.parse(b.approval.requestedAt || "") || 0) - (Date.parse(a.approval.requestedAt || "") || 0),
  );
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* one listener must not block the others */
    }
  }
}

function isOpen(status: DesktopRemoteApproval["status"]): boolean {
  return status === "pending" || status === "expired";
}

/** 后端状态：这台电脑的 pending / expired 进来，其余拿掉；后端不再列出的后端记录也拿掉。 */
export function applyDesktopSyncStateToInbox(state: unknown) {
  const raw = (state as { approvals?: unknown } | null)?.approvals;
  const list = Array.isArray(raw) ? raw : [];
  const device = thisDevice();
  const seen = new Set<string>();
  for (const item of list) {
    const approval = normalizeDesktopRemoteApproval(item as DesktopRemoteApproval);
    if (!approval) continue;
    if (device && approval.deviceId && approval.deviceId !== device) continue;
    seen.add(approval.approvalId);
    if (isOpen(approval.status)) entries.set(approval.approvalId, { approval, from: "backend-state" });
    else entries.delete(approval.approvalId);
  }
  for (const [id, entry] of [...entries]) {
    if (!entry.approval.localOnly && !seen.has(id)) entries.delete(id);
  }
  publish();
}

function detailApproval(detail: unknown): DesktopRemoteApproval | null {
  const raw = detail && typeof detail === "object" && "approval" in (detail as Record<string, unknown>)
    ? (detail as { approval: unknown }).approval
    : detail;
  return normalizeDesktopRemoteApproval(raw as DesktopRemoteApproval);
}

export function attachApprovalInbox() {
  if (attached || typeof window === "undefined") return;
  attached = true;
  window.addEventListener("agentrix:desktop-sync-state", ((event: Event) => {
    applyDesktopSyncStateToInbox((event as CustomEvent).detail);
  }) as EventListener);
  window.addEventListener("agentrix:approval-new", ((event: Event) => {
    const approval = detailApproval((event as CustomEvent).detail);
    if (!approval || !isOpen(approval.status)) return;
    entries.set(approval.approvalId, { approval, from: "local-request" });
    publish();
  }) as EventListener);
  window.addEventListener("agentrix:approval-response-local", ((event: Event) => {
    const approval = detailApproval((event as CustomEvent).detail);
    if (!approval || isOpen(approval.status)) return;
    entries.delete(approval.approvalId);
    publish();
  }) as EventListener);
}

export function subscribeApprovalInbox(listener: Listener): () => void {
  attachApprovalInbox();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 当前要显示的卡。只在本机的卡只有在本机还在等它时才显示（等待结束或应用重启后就没有意义了）。
 */
export function getApprovalInboxSnapshot(): ApprovalInboxEntry[] {
  return snapshot.filter((entry) => !entry.approval.localOnly || getApprovalWaiterSource(entry.approval.approvalId) !== null);
}

export interface ApprovalInboxActions {
  status: ApprovalStatusV1;
  canApprove: boolean;
  canReject: boolean;
  /** 本机发起、本机正在等：本机确认为准。 */
  localConfirmation: boolean;
  /** 为什么不能批准（给界面写说明）；能批准时为 null。 */
  approveBlockedBy: "decided" | "expired" | "device_signature_required" | "other_device" | null;
}

/** 按审批卡合同 v1 决定按钮；本机来源的卡在这台电脑上总能批准和拒绝。 */
export function approvalInboxActions(approval: DesktopRemoteApproval): ApprovalInboxActions {
  // 显示时再投影一次：进列表时还没过期的卡，之后也会过期。
  const status: ApprovalStatusV1 = approval.status === "pending"
    ? projectApprovalStatusV1("pending", approval.expiresAt)
    : approval.status === "expired" || approval.status === "approved" || approval.status === "rejected"
      ? approval.status
      : "rejected";
  const device = thisDevice();
  const onRequestingDevice = Boolean(approval.localOnly || (device && approval.deviceId === device));
  const localConfirmation = status === "pending" && getApprovalWaiterSource(approval.approvalId) === "local";
  const input = { riskLevel: approval.riskLevel, status, onRequestingDevice, canSignLocally: canSignApprovalsLocally() };
  const contractApprove = approvalActionAvailableV1({ ...input, decision: "approved" });
  const contractReject = approvalActionAvailableV1({ ...input, decision: "rejected" });
  const canApprove = localConfirmation || (!approval.localOnly && contractApprove);
  const canReject = localConfirmation || (!approval.localOnly && contractReject);
  let approveBlockedBy: ApprovalInboxActions["approveBlockedBy"] = null;
  if (!canApprove) {
    if (status === "approved" || status === "rejected") approveBlockedBy = "decided";
    else if (status === "expired") approveBlockedBy = "expired";
    else if (!onRequestingDevice) approveBlockedBy = "other_device";
    else approveBlockedBy = "device_signature_required";
  }
  return { status, canApprove, canReject, localConfirmation, approveBlockedBy };
}

/** 测试用。 */
export function __resetApprovalInboxForTests() {
  entries = new Map();
  snapshot = [];
  publish();
}

export function approvalInboxEntryId(entry: ApprovalInboxEntry): string {
  return getDesktopRemoteApprovalId(entry.approval);
}
