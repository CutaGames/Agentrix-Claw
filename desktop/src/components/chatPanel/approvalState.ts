import {
  getDesktopRemoteApprovalId,
  normalizeDesktopRemoteApproval,
  type DesktopRemoteApproval,
} from "../../services/desktopSync";

export function parseDesktopApprovalDecision(text: string): "approved" | "rejected" | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[\s.!?。！？，,;；]+$/g, "");
  if (!normalized) return null;

  if (/^(approve|approved|aprrove|aprroved|yes|y|ok|okay|confirm|confirmed|allow|allowed|go|continue|批准|同意|确认|允许|可以|执行|继续)$/.test(normalized)) {
    return "approved";
  }

  if (/^(reject|rejected|deny|denied|no|n|cancel|stop|拒绝|不同意|不允许|取消|停止|否)$/.test(normalized)) {
    return "rejected";
  }

  return null;
}

export function getDesktopApprovalId(approval: DesktopRemoteApproval | null | undefined): string {
  return getDesktopRemoteApprovalId(approval);
}

export function normalizeDesktopApproval(approval: DesktopRemoteApproval | null | undefined): DesktopRemoteApproval | null {
  return normalizeDesktopRemoteApproval(approval);
}

export function extractDesktopApprovalEventDetail(detail: unknown): {
  approval: DesktopRemoteApproval | null;
  sessionId?: string;
} {
  if (detail && typeof detail === "object" && "approval" in (detail as Record<string, unknown>)) {
    const payload = detail as { approval?: DesktopRemoteApproval | null; sessionId?: string };
    return {
      approval: normalizeDesktopApproval(payload.approval),
      sessionId: typeof payload.sessionId === "string" && payload.sessionId.trim()
        ? payload.sessionId.trim()
        : undefined,
    };
  }

  return {
    approval: normalizeDesktopApproval(detail as DesktopRemoteApproval | null | undefined),
  };
}