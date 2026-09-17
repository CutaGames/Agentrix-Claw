/**
 * shared/types/remote-control — P-9 wave 10 cross-device control.
 *
 * Whitelist + payload schema lives in shared so backend gateway and
 * mobile client agree on the wire format. The whitelist is the only
 * thing that gates command execution server-side.
 */

export const REMOTE_CONTROL_WHITELIST = [
  "desktop.computer-use.start",
  "desktop.computer-use.stop",
  "desktop.pro-mode.toggle",
  "desktop.aira-work-mode.start",
  "speaker.tts.broadcast",
  "speaker.white-noise.start",
  "speaker.stop",
  "watch.notifications.silence",
  "device.status.query",
] as const;

export type RemoteControlCommand = (typeof REMOTE_CONTROL_WHITELIST)[number];

export const REMOTE_CONTROL_FORBIDDEN = [
  "device.shutdown",
  "app.data.clear",
  "wallet.config.modify",
] as const;

export interface RemoteControlExecutePayload {
  /** Target device receiving the command. */
  targetDeviceId: string;
  command: RemoteControlCommand | string;
  args?: Record<string, unknown>;
  /** Cross-Device Token (JWT signed by backend, originated by mobile). */
  token: string;
  /** Originator-generated request id used to correlate ack. */
  requestId: string;
  /** When form-variant=night, use 'notify-only' so target prompts user
   *  next morning instead of executing. */
  executeMode?: "execute" | "notify-only";
  bindingId?: string;
  bindingVersion?: number;
  commandDigest?: string;
}

export interface RemoteControlAckPayload {
  requestId: string;
  targetDeviceId: string;
  command: string;
  commandDigest?: string;
  success: boolean;
  message?: string;
  durationMs?: number;
}

export interface RemoteControlNackPayload {
  requestId: string;
  reason:
    | "invalid-token"
    | "expired-token"
    | "command-not-allowed"
    | "target-not-online"
    | "forbidden-command"
    | "rate-limited"
    | "internal-error"
    | "binding-unavailable"
    | "nonce-reused"
    | "ack-collision"
    | "origin-denied"
    | "stale-binding"
    | "digest-mismatch"
    | "expired";
  details?: string;
}

export function remoteControlOwnerDeviceRoom(input: {
  ownerUserId: string;
  tenantId?: string | null;
  deviceId: string;
}): string {
  const tenant =
    input.tenantId && input.tenantId.length > 0 ? input.tenantId : "_";
  return `owner:${input.ownerUserId}:tenant:${tenant}:device:${input.deviceId}`;
}

export const REMOTE_CONTROL_EVENTS = {
  EXECUTE: "remote-control:execute",
  RUN: "remote-control:run",
  ACK: "remote-control:ack",
  NACK: "remote-control:nack",
} as const;
