export declare const REMOTE_CONTROL_WHITELIST: readonly ["desktop.computer-use.start", "desktop.computer-use.stop", "desktop.pro-mode.toggle", "desktop.aira-work-mode.start", "speaker.tts.broadcast", "speaker.white-noise.start", "speaker.stop", "watch.notifications.silence", "device.status.query"];
export type RemoteControlCommand = (typeof REMOTE_CONTROL_WHITELIST)[number];
export declare const REMOTE_CONTROL_FORBIDDEN: readonly ["device.shutdown", "app.data.clear", "wallet.config.modify"];
export interface RemoteControlExecutePayload {
    targetDeviceId: string;
    command: RemoteControlCommand | string;
    args?: Record<string, unknown>;
    token: string;
    requestId: string;
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
    reason: 'invalid-token' | 'expired-token' | 'command-not-allowed' | 'target-not-online' | 'forbidden-command' | 'rate-limited' | 'internal-error';
    details?: string;
}
export declare const REMOTE_CONTROL_EVENTS: {
    readonly EXECUTE: "remote-control:execute";
    readonly RUN: "remote-control:run";
    readonly ACK: "remote-control:ack";
    readonly NACK: "remote-control:nack";
};
