/**
 * crossDeviceToken — mobile client for /v1/cross-device/token + the
 * `/remote-control` socket namespace (P-9 wave 10).
 *
 * Public API:
 *   - mintCrossDeviceToken({ targetDeviceId, command, requestId? })
 *   - sendRemoteControl({ targetDeviceId, command, args, executeMode? })
 *     handles minting + socket connect + execute emit + 5s ack timeout
 */
import { apiFetch, getApiConfig } from './api';
import { addVoiceDiagnostic } from './voiceDiagnostics';
import { companionEvents } from './companionEvents.service';
import {
  REMOTE_CONTROL_EVENTS,
  type RemoteControlAckPayload,
  type RemoteControlExecutePayload,
  type RemoteControlNackPayload,
} from '../../shared/types/remote-control';

interface MintTokenResult {
  token: string;
  expiresAt: number;
}

export async function mintCrossDeviceToken(opts: {
  targetDeviceId: string;
  command: string;
  requestId?: string;
}): Promise<MintTokenResult & { requestId: string }> {
  const requestId = opts.requestId ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await apiFetch<MintTokenResult>('/v1/cross-device/token', {
    method: 'POST',
    body: JSON.stringify({
      targetDeviceId: opts.targetDeviceId,
      command: opts.command,
      requestId,
    }),
  });
  return { ...res, requestId };
}

export interface SendRemoteControlOpts {
  targetDeviceId: string;
  command: string;
  args?: Record<string, unknown>;
  executeMode?: 'execute' | 'notify-only';
  /** ACK timeout in ms; default 5000. */
  ackTimeoutMs?: number;
}

export interface SendRemoteControlResult {
  ok: boolean;
  requestId: string;
  ack?: RemoteControlAckPayload;
  nack?: RemoteControlNackPayload;
  reason?: 'no-token' | 'connect-failed' | 'ack-timeout' | 'nack' | 'unauthenticated';
}

let _socket: any = null;
let _socketDeviceId: string | null = null;
let _socketUserId: string | null = null;

async function getOrConnectSocket(deviceId: string): Promise<any> {
  if (_socket && _socketDeviceId === deviceId && _socket.connected) return _socket;
  let socketIoMod: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    socketIoMod = require('socket.io-client');
  } catch (err) {
    addVoiceDiagnostic('remote-control', 'socket-io-missing', { error: (err as Error).message });
    return null;
  }
  const io = socketIoMod.io ?? socketIoMod.default ?? socketIoMod;
  const cfg = getApiConfig();
  if (!cfg?.token) return null;

  const apiBase = cfg.baseUrl ?? 'https://api.agentrix.top/api';
  const wsUrl = apiBase.replace(/\/api\/?$/, '') + '/remote-control';

  const socket = io(wsUrl, {
    transports: ['websocket'],
    auth: { token: cfg.token, deviceId },
    reconnection: true,
    reconnectionDelayMax: 5000,
  });
  _socket = socket;
  _socketDeviceId = deviceId;

  await new Promise<void>((resolve) => {
    const onConnect = () => {
      socket.off('connect_error', onError);
      resolve();
    };
    const onError = () => {
      socket.off('connect', onConnect);
      resolve();
    };
    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
    setTimeout(() => resolve(), 4000);
  });

  return socket;
}

/**
 * Mints token + connects socket + emits execute + waits for ack.
 * Phase 1 logs a `remote-control-sent` event when emit fires and a
 * `remote-control-ack` (success or fail) when ack/nack returns or
 * timeout fires.
 */
export async function sendRemoteControl(opts: SendRemoteControlOpts & { originDeviceId: string }): Promise<SendRemoteControlResult> {
  let token: string;
  let requestId: string;
  try {
    const minted = await mintCrossDeviceToken({
      targetDeviceId: opts.targetDeviceId,
      command: opts.command,
    });
    token = minted.token;
    requestId = minted.requestId;
  } catch (err) {
    addVoiceDiagnostic('remote-control', 'mint-failed', {
      command: opts.command,
      error: (err as Error).message,
    });
    return { ok: false, requestId: '', reason: 'no-token' };
  }

  const socket = await getOrConnectSocket(opts.originDeviceId);
  if (!socket) {
    return { ok: false, requestId, reason: 'connect-failed' };
  }

  return new Promise<SendRemoteControlResult>((resolve) => {
    const ackTimeout = opts.ackTimeoutMs ?? 5_000;
    const handleAck = (payload: RemoteControlAckPayload) => {
      if (payload.requestId !== requestId) return;
      cleanup();
      companionEvents.emit({
        type: 'remote-control-ack',
        targetDeviceId: opts.targetDeviceId,
        command: opts.command,
        success: payload.success,
        durationMs: payload.durationMs,
      });
      resolve({ ok: payload.success, requestId, ack: payload });
    };
    const handleNack = (payload: RemoteControlNackPayload) => {
      if (payload.requestId !== requestId) return;
      cleanup();
      addVoiceDiagnostic('remote-control', 'nack', {
        reason: payload.reason,
        details: payload.details,
      });
      resolve({ ok: false, requestId, nack: payload, reason: 'nack' });
    };
    const timer = setTimeout(() => {
      cleanup();
      addVoiceDiagnostic('remote-control', 'ack-timeout', {
        command: opts.command,
        targetDeviceId: opts.targetDeviceId,
      });
      resolve({ ok: false, requestId, reason: 'ack-timeout' });
    }, ackTimeout);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(REMOTE_CONTROL_EVENTS.ACK, handleAck);
      socket.off(REMOTE_CONTROL_EVENTS.NACK, handleNack);
    };

    socket.on(REMOTE_CONTROL_EVENTS.ACK, handleAck);
    socket.on(REMOTE_CONTROL_EVENTS.NACK, handleNack);

    const payload: RemoteControlExecutePayload = {
      targetDeviceId: opts.targetDeviceId,
      command: opts.command,
      args: opts.args,
      token,
      requestId,
      executeMode: opts.executeMode ?? 'execute',
    };
    socket.emit(REMOTE_CONTROL_EVENTS.EXECUTE, payload);
    companionEvents.emit({
      type: 'remote-control-sent',
      targetDeviceId: opts.targetDeviceId,
      command: opts.command,
    });
    addVoiceDiagnostic('remote-control', 'execute-emitted', {
      command: opts.command,
      targetDeviceId: opts.targetDeviceId,
    });
  });
}

/** Disconnect any active socket — call on logout / disable. */
export function disconnectRemoteControl(): void {
  if (_socket) {
    try {
      _socket.disconnect();
    } catch {
      /* ignore */
    }
    _socket = null;
    _socketDeviceId = null;
    _socketUserId = null;
  }
}
