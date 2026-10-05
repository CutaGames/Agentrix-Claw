/**
 * mobileRemoteExecutionPolicy — M0 client-side fence for remote execution.
 *
 * The phone must never submit raw shell, file writes, arbitrary file reads,
 * URL opens or other side-effecting commands to a paired computer. Those only
 * run on the computer itself, behind its local fence and approval UI.
 *
 * What the phone may still send:
 *   - desktop-sync: read-only kinds that carry no body (context, active window,
 *     window list). Backend `remote-mutation-policy.ts` classifies these as
 *     `read_only`.
 *   - remote-control: exact safety-control commands (stop) and the read-only
 *     status query. Backend classifies these as `safety_control` / `read_only`,
 *     so they keep working while the mutation kill switch is off.
 *
 * This is defence in depth. The backend stays authoritative: it applies the
 * kill switch, binding checks and raw-payload refusal regardless of client.
 */

/** Desktop-sync command kinds the phone is allowed to queue. */
export const MOBILE_DESKTOP_COMMAND_ALLOWLIST = [
  'context',
  'active-window',
  'list-windows',
] as const;

export type MobileSubmittableDesktopCommandKind =
  (typeof MOBILE_DESKTOP_COMMAND_ALLOWLIST)[number];

/** Remote-control commands the phone is allowed to emit. */
export const MOBILE_REMOTE_CONTROL_ALLOWLIST = [
  'desktop.computer-use.stop',
  'speaker.stop',
  'device.status.query',
] as const;

export type MobileRemoteControlCommand =
  (typeof MOBILE_REMOTE_CONTROL_ALLOWLIST)[number];

/**
 * Payload keys that carry a raw command body. Mirrors backend
 * `remote-command-security.ts` RAW_BODY_KEYS; any of these present means the
 * request is trying to smuggle an executable/writable body.
 */
export const MOBILE_REMOTE_RAW_BODY_KEYS = [
  'command',
  'path',
  'content',
  'args',
  'script',
  'input',
  'body',
  'code',
  'diff',
  'prompt',
  'url',
  'expression',
  'selector',
  'text',
  'combo',
] as const;

export const MOBILE_REMOTE_EXECUTION_BLOCKED = 'MOBILE_REMOTE_EXECUTION_BLOCKED' as const;

export type MobileRemoteExecutionBlockReason =
  | 'kind_not_allowed_on_mobile'
  | 'raw_body_not_allowed_on_mobile'
  | 'args_not_allowed_on_mobile';

export class MobileRemoteExecutionBlockedError extends Error {
  readonly code = MOBILE_REMOTE_EXECUTION_BLOCKED;
  readonly reason: MobileRemoteExecutionBlockReason;
  readonly surface: 'desktop-sync' | 'remote-control';
  readonly commandKind: string;

  constructor(input: {
    surface: 'desktop-sync' | 'remote-control';
    commandKind: string;
    reason: MobileRemoteExecutionBlockReason;
  }) {
    super(
      `${MOBILE_REMOTE_EXECUTION_BLOCKED}: ${input.surface} "${input.commandKind}" (${input.reason})`,
    );
    this.name = 'MobileRemoteExecutionBlockedError';
    this.reason = input.reason;
    this.surface = input.surface;
    this.commandKind = input.commandKind;
  }
}

const DESKTOP_ALLOWED = new Set<string>(MOBILE_DESKTOP_COMMAND_ALLOWLIST);
const REMOTE_CONTROL_ALLOWED = new Set<string>(MOBILE_REMOTE_CONTROL_ALLOWLIST);

function exactString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Padded or empty kinds fail closed, same as the backend classifier.
  if (!value || value.trim() !== value) return null;
  return value;
}

export function hasMobileRawBody(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return MOBILE_REMOTE_RAW_BODY_KEYS.some((key) => record[key] != null);
}

export function isMobileSubmittableDesktopCommandKind(
  kind: unknown,
): kind is MobileSubmittableDesktopCommandKind {
  const exact = exactString(kind);
  return exact != null && DESKTOP_ALLOWED.has(exact);
}

export function isMobileAllowedRemoteControlCommand(
  command: unknown,
): command is MobileRemoteControlCommand {
  const exact = exactString(command);
  return exact != null && REMOTE_CONTROL_ALLOWED.has(exact);
}

/** Throws unless the phone may queue this desktop-sync command. */
export function assertMobileDesktopCommandAllowed(
  kind: unknown,
  payload?: unknown,
): asserts kind is MobileSubmittableDesktopCommandKind {
  const commandKind = typeof kind === 'string' ? kind : String(kind);
  if (!isMobileSubmittableDesktopCommandKind(kind)) {
    throw new MobileRemoteExecutionBlockedError({
      surface: 'desktop-sync',
      commandKind,
      reason: 'kind_not_allowed_on_mobile',
    });
  }
  if (hasMobileRawBody(payload)) {
    throw new MobileRemoteExecutionBlockedError({
      surface: 'desktop-sync',
      commandKind,
      reason: 'raw_body_not_allowed_on_mobile',
    });
  }
}

/** Throws unless the phone may emit this remote-control command. */
export function assertMobileRemoteControlAllowed(
  command: unknown,
  args?: unknown,
): asserts command is MobileRemoteControlCommand {
  const commandKind = typeof command === 'string' ? command : String(command);
  if (!isMobileAllowedRemoteControlCommand(command)) {
    throw new MobileRemoteExecutionBlockedError({
      surface: 'remote-control',
      commandKind,
      reason: 'kind_not_allowed_on_mobile',
    });
  }
  if (args != null && (typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length > 0)) {
    throw new MobileRemoteExecutionBlockedError({
      surface: 'remote-control',
      commandKind,
      reason: 'args_not_allowed_on_mobile',
    });
  }
}

export function isMobileRemoteExecutionBlockedError(
  error: unknown,
): error is MobileRemoteExecutionBlockedError {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === MOBILE_REMOTE_EXECUTION_BLOCKED
  );
}
