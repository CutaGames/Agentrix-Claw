/**
 * desktopExecutionPort.ts — 桌面 D0：fence → 审批 → 再判一次 → 执行。
 *
 * 三条通道（desktopAgentSync、remoteControl、desktopToolCalling）都通过这里
 * 拿到执行许可，不再各自决定要不要审批、审批什么级别。
 *
 * 用法：
 *   const gate = openDesktopActionGate(request);   // 不允许时抛 FenceDeniedError
 *   ...需要时先展示状态...
 *   await gate.approve(title, description);        // 需要审批时等待；之后再判一次
 *   ...执行副作用...
 *
 * `approve()` 之后会重新判定：等审批期间急停被拉下、开关被关掉，照样拒绝。
 */
import { ApprovalRejectedError, requireDesktopActionApproval } from "./desktopApproval";
import {
  evaluateFence,
  FenceDeniedError,
  type FenceDecision,
  type FenceRequest,
} from "./executionFence";
import { getExecutionJournal } from "./executionJournal";

export interface DesktopActionContext {
  token?: string | null;
  sessionId?: string;
  taskId?: string;
  timelineEntryId?: string;
  /** 默认的审批标题和说明；`approve()` 可以传更具体的。 */
  title?: string;
  description?: string;
  /** 通道里的请求编号，写进本机执行日志；缺省用 taskId。 */
  requestRef?: string;
}

export interface DesktopActionGate {
  readonly decision: FenceDecision;
  readonly approved: boolean;
  /** 改动类操作在本机执行日志里的记录编号（审批开始时写入）。 */
  readonly journalRef: string | null;
  approve(title?: string, description?: string): Promise<FenceDecision>;
  /** 执行结束后写终态。没有日志记录时什么也不做。 */
  settle(outcome: "completed" | "failed", note?: string): void;
}

function stringPayload(payload?: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (typeof value === "string") {
      result[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = String(value);
    }
  }
  return result;
}

export function openDesktopActionGate(request: FenceRequest, context: DesktopActionContext = {}): DesktopActionGate {
  const decision = evaluateFence(request);
  if (!decision.allowed) {
    throw new FenceDeniedError(decision);
  }

  let approved = false;
  let approvalPromise: Promise<FenceDecision> | null = null;
  let journalRef: string | null = null;
  let settled = false;
  const journal = getExecutionJournal();

  const approve = (title?: string, description?: string) => {
    if (approvalPromise) return approvalPromise;
    approvalPromise = (async () => {
      // Desktop D2 — pre-write journal: side-effecting actions are recorded
      // before approval / execution. If the record cannot be persisted, the
      // action does not run (fail closed).
      if (decision.effect === "mutating") {
        journalRef = journal.reserve(
          {
            source: request.source,
            command: request.command,
            kind: decision.kind,
            riskLevel: decision.riskLevel,
            requestRef: context.requestRef ?? context.taskId,
            title: title || context.title || decision.kind,
          },
          decision.approval !== "none" ? "awaiting_approval" : "executing",
        );
        if (!journalRef) {
          throw new FenceDeniedError({ ...decision, allowed: false, reason: "journal_unavailable" });
        }
      }
      try {
        await approveInner(title, description);
      } catch (error) {
        if (journalRef) {
          const rejected = error instanceof ApprovalRejectedError || error instanceof FenceDeniedError;
          journal.transition(journalRef, rejected ? "rejected" : "failed", error instanceof Error ? error.message : String(error));
          settled = true;
        }
        throw error;
      }
      if (journalRef) journal.transition(journalRef, "executing");
      approved = true;
      return evaluateFence(request);
    })();
    return approvalPromise;
  };

  const approveInner = async (title?: string, description?: string) => {
    if (decision.approval !== "none") {
      await requireDesktopActionApproval({
        token: context.token,
        kind: decision.kind,
        title: title || context.title || decision.kind,
        description: description || context.description || title || context.title || decision.kind,
        payload: stringPayload(request.payload),
        taskId: context.taskId,
        timelineEntryId: context.timelineEntryId,
        sessionId: context.sessionId,
        riskLevel: decision.riskLevel,
        allowRemember: decision.allowRemember,
        sessionKey: decision.sessionKey,
        requireLocalApproval: decision.approval === "local",
        // 审批卡合同 v1：本机聊天以本机确认为准，远程来源以后端读回为准。
        source: request.source,
      });
    }
    const recheck = evaluateFence(request);
    if (!recheck.allowed) {
      throw new FenceDeniedError(recheck);
    }
  };

  const settle = (outcome: "completed" | "failed", note?: string) => {
    if (!journalRef || settled) return;
    settled = true;
    journal.transition(journalRef, outcome, note);
  };

  return {
    decision,
    get approved() {
      return approved;
    },
    get journalRef() {
      return journalRef;
    },
    approve,
    settle,
  };
}

/** 一步到位：判定 + 审批 + 执行。 */
export async function runFencedDesktopAction<T>(
  request: FenceRequest,
  context: DesktopActionContext,
  execute: (decision: FenceDecision) => Promise<T>,
): Promise<T> {
  const gate = openDesktopActionGate(request, context);
  const decision = await gate.approve();
  try {
    const result = await execute(decision);
    gate.settle("completed");
    return result;
  } catch (error) {
    gate.settle("failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
