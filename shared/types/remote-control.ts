/**
 * shared/types/remote-control — P-9 wave 10 cross-device control.
 *
 * Whitelist + payload schema lives in shared so backend gateway and
 * mobile client agree on the wire format. The whitelist is the only
 * thing that gates command execution server-side.
 */

export const REMOTE_CONTROL_WHITELIST = [
  'desktop.computer-use.start',
  'desktop.computer-use.stop',
  'desktop.pro-mode.toggle',
  'desktop.aira-work-mode.start',
  'speaker.tts.broadcast',
  'speaker.white-noise.start',
  'speaker.stop',
  'watch.notifications.silence',
  'device.status.query',
] as const;

export type RemoteControlCommand = (typeof REMOTE_CONTROL_WHITELIST)[number];

export const REMOTE_CONTROL_FORBIDDEN = [
  'device.shutdown',
  'app.data.clear',
  'wallet.config.modify',
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
  executeMode?: 'execute' | 'notify-only';
}

export interface RemoteControlAckPayload {
  requestId: string;
  targetDeviceId: string;
  command: string;
  success: boolean;
  message?: string;
  durationMs?: number;
}

export interface RemoteControlNackPayload {
  requestId: string;
  reason:
    | 'invalid-token'
    | 'expired-token'
    | 'command-not-allowed'
    | 'target-not-online'
    | 'forbidden-command'
    | 'rate-limited'
    | 'internal-error';
  details?: string;
}

export const REMOTE_CONTROL_EVENTS = {
  EXECUTE: 'remote-control:execute',
  RUN: 'remote-control:run',
  ACK: 'remote-control:ack',
  NACK: 'remote-control:nack',
} as const;
