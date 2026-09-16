import { apiFetch } from './api';

/**
 * Kinds Mobile is still allowed to construct (MTR-R01.2). Read-only control
 * plane only — nothing here mutates the desktop.
 */
export const MOBILE_ALLOWED_DESKTOP_COMMAND_KINDS = [
  'context',
  'active-window',
  'list-windows',
] as const;

export type MobileAllowedDesktopCommandKind =
  (typeof MOBILE_ALLOWED_DESKTOP_COMMAND_KINDS)[number];

/**
 * Kinds withdrawn from the Mobile client by MTR-R01.1. They stay in the union
 * so historical rows returned by `/desktop-sync/state` still render, but the
 * client can no longer build or submit one.
 */
export const RETIRED_MOBILE_DESKTOP_COMMAND_KINDS = [
  'run-command',
  'write-file',
  'read-file',
  'open-browser',
] as const;

export type RetiredMobileDesktopCommandKind =
  (typeof RETIRED_MOBILE_DESKTOP_COMMAND_KINDS)[number];

export type DesktopCommandKind =
  | MobileAllowedDesktopCommandKind
  | RetiredMobileDesktopCommandKind;

export class MobileDesktopCommandKindNotAllowedError extends Error {
  readonly code = 'mobile_remote_mutation_removed';

  readonly kind: string;

  constructor(kind: string) {
    super(`Desktop command kind "${kind}" is not available on Mobile.`);
    this.name = 'MobileDesktopCommandKindNotAllowedError';
    this.kind = kind;
  }
}

export function isMobileAllowedDesktopCommandKind(
  kind: unknown,
): kind is MobileAllowedDesktopCommandKind {
  return (
    typeof kind === 'string'
    && (MOBILE_ALLOWED_DESKTOP_COMMAND_KINDS as readonly string[]).includes(kind)
  );
}

/**
 * Fail closed: anything outside the read-only allow-list — retired kinds and
 * unknown strings alike — throws before a request is built.
 */
export function assertMobileDesktopCommandKindAllowed(
  kind: unknown,
): MobileAllowedDesktopCommandKind {
  if (!isMobileAllowedDesktopCommandKind(kind)) {
    throw new MobileDesktopCommandKindNotAllowedError(String(kind));
  }
  return kind;
}

export type DesktopCommandStatus = 'pending' | 'claimed' | 'completed' | 'failed' | 'rejected';

export interface MobileDesktopApproval {
  approvalId: string;
  deviceId: string;
  taskId: string;
  timelineEntryId?: string;
  title: string;
  description: string;
  riskLevel: 'L0' | 'L1' | 'L2' | 'L3';
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  respondedAt?: string;
}

export type MobileDesktopApprovalLike = Partial<MobileDesktopApproval> & {
  id?: string;
  approval_id?: string;
};

export function getMobileDesktopApprovalId(approval: MobileDesktopApprovalLike | null | undefined): string {
  return String(approval?.approvalId || approval?.approval_id || approval?.id || '').trim();
}

export function normalizeMobileDesktopApproval(
  approval: MobileDesktopApproval | MobileDesktopApprovalLike | null | undefined,
): MobileDesktopApproval | null {
  const approvalId = getMobileDesktopApprovalId(approval);
  if (!approvalId || !approval) return null;
  return { ...(approval as MobileDesktopApproval), approvalId };
}

export interface MobileDesktopCommand {
  commandId: string;
  title: string;
  kind: DesktopCommandKind;
  status: DesktopCommandStatus;
  targetDeviceId?: string;
  requesterDeviceId?: string;
  sessionId?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface MobileDesktopState {
  devices: Array<{
    deviceId: string;
    platform: string;
    appVersion?: string;
    context?: {
      activeWindowTitle?: string;
      processName?: string;
      workspaceHint?: string;
      fileHint?: string;
      clipboardTextPreview?: string;
    };
    lastSeenAt: string;
  }>;
  tasks: Array<any>;
  approvals: MobileDesktopApproval[];
  sessions: Array<{
    sessionId: string;
    title: string;
    messageCount: number;
    updatedAt: number;
    deviceId: string;
    deviceType: 'desktop' | 'mobile' | 'web';
  }>;
  commands: MobileDesktopCommand[];
  pendingApprovalCount: number;
  serverTime: string;
}

export interface MobileDesktopClipboardSnapshot {
  deviceId: string;
  platform: string;
  text: string;
  lastSeenAt: string;
}

export async function fetchDesktopState(): Promise<MobileDesktopState> {
  return apiFetch('/desktop-sync/state');
}

export async function fetchLatestDesktopClipboard(): Promise<MobileDesktopClipboardSnapshot | null> {
  const state = await fetchDesktopState();
  const candidates = (state.devices || [])
    .filter((device) => typeof device.context?.clipboardTextPreview === 'string' && device.context.clipboardTextPreview.trim().length > 0)
    .sort((left, right) => new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime());

  const latest = candidates[0];
  if (!latest) {
    return null;
  }

  return {
    deviceId: latest.deviceId,
    platform: latest.platform,
    text: latest.context?.clipboardTextPreview?.trim() || '',
    lastSeenAt: latest.lastSeenAt,
  };
}

export async function createRemoteDesktopCommand(payload: {
  title: string;
  kind: MobileAllowedDesktopCommandKind;
  targetDeviceId?: string;
  requesterDeviceId?: string;
  sessionId?: string;
  payload?: Record<string, unknown>;
}) {
  assertMobileDesktopCommandKindAllowed(payload?.kind);
  return apiFetch<{ ok: boolean; command: MobileDesktopCommand }>('/desktop-sync/commands', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function respondToDesktopApproval(
  approvalId: string,
  payload: { decision: 'approved' | 'rejected'; rememberForSession?: boolean },
) {
  const safeApprovalId = String(approvalId || '').trim();
  if (!safeApprovalId) {
    throw new Error('approvalId is required to respond to a desktop approval');
  }
  return apiFetch<{ ok: boolean; approval: MobileDesktopApproval }>(`/desktop-sync/approvals/${encodeURIComponent(safeApprovalId)}/respond`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchDesktopSession(sessionId: string) {
  return apiFetch<{ sessionId: string; messages: Array<any>; meta: Record<string, unknown> }>(`/desktop-sync/sessions/${encodeURIComponent(sessionId)}`);
}